import { pipeline, FeatureExtractionPipeline } from '@huggingface/transformers';
import {
  getSettings,
  getTriggerData,
  saveTriggerData,
  getOverrides,
  setOverride,
} from '../shared/storage';
import { TriggerData, ScoreBatchResponse, GetStatusResponse } from '../shared/types';
import { computeHybridScoreFromEmbedding, unpackEmbeddings } from '../shared/scoring';

// ---- Singleton model state ----
let embedder: FeatureExtractionPipeline | null = null;
let modelReady = false;
let modelLoading = false;
let loadProgress = 0;

async function initModel() {
  if (modelReady || modelLoading) return;
  modelLoading = true;
  loadProgress = 0;

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    embedder = await (pipeline as any)('feature-extraction', 'Xenova/all-MiniLM-L6-v2', {
      dtype: 'q8',
      progress_callback: (info: { status: string; progress?: number }) => {
        if (info.status === 'progress' && info.progress !== undefined) {
          loadProgress = Math.round(info.progress);
          broadcastToPopup({ type: 'MODEL_PROGRESS', progress: loadProgress, status: 'downloading' });
        }
        if (info.status === 'done') {
          broadcastToPopup({ type: 'MODEL_PROGRESS', progress: 100, status: 'done' });
        }
      },
    });
    modelReady = true;
    modelLoading = false;
    loadProgress = 100;
    broadcastToPopup({ type: 'MODEL_PROGRESS', progress: 100, status: 'ready' });
  } catch (err) {
    modelLoading = false;
    console.error('[PSM] Model init failed:', err);
  }
}

async function embedText(text: string): Promise<number[]> {
  if (!embedder) throw new Error('Embedder not ready');
  const output = await embedder(text, { pooling: 'mean', normalize: true });
  // output.data is Float32Array
  return Array.from(output.data as Float32Array);
}

function broadcastToPopup(message: object) {
  chrome.runtime.sendMessage(message).catch(() => {
    // Popup may not be open — ignore
  });
}

async function broadcastToRedditTabs(message: object) {
  const tabs = await chrome.tabs.query({ url: 'https://www.reddit.com/*' });
  for (const tab of tabs) {
    if (tab.id !== undefined) {
      chrome.tabs.sendMessage(tab.id, message).catch(() => {
        // Tab may not have content script — ignore
      });
    }
  }
}

// ---- SAVE_TRIGGER ----

async function callHyDE(triggerText: string, apiKey: string): Promise<{
  examples: string[];
  keywords: string[];
  exclusions: string[];
}> {
  const prompt = `You are helping build a content moderation filter. The user wants to avoid content related to: "${triggerText}"

Generate a JSON response with:
- "examples": 4 short example sentences (1-2 sentences each) that would match this trigger
- "keywords": 8-12 specific keywords associated with this topic
- "exclusions": 3-5 terms that should NOT trigger this filter (false positive prevention)

Respond with only valid JSON, no markdown fences.`;

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-request-only': 'true',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1024,
      messages: [{ role: 'user', content: prompt }],
    }),
  });

  if (!response.ok) {
    throw new Error(`Anthropic API error: ${response.status}`);
  }

  const data = await response.json();
  let text: string = data.content?.[0]?.text ?? '';

  // Strip markdown fences if present
  text = text.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();

  const parsed = JSON.parse(text);
  return {
    examples: Array.isArray(parsed.examples) ? parsed.examples : [],
    keywords: Array.isArray(parsed.keywords) ? parsed.keywords : [],
    exclusions: Array.isArray(parsed.exclusions) ? parsed.exclusions : [],
  };
}

async function handleSaveTrigger(
  triggerText: string,
  apiKey: string,
  _threshold: number,
): Promise<{ success: boolean; error?: string }> {
  if (!modelReady || !embedder) {
    return { success: false, error: 'Model not ready yet' };
  }

  try {
    let examples: string[] = [triggerText];
    let keywords: string[] = [];
    let exclusionTerms: string[] = [];

    if (apiKey.trim()) {
      try {
        const hydeResult = await callHyDE(triggerText, apiKey.trim());
        examples = hydeResult.examples.length > 0 ? hydeResult.examples : [triggerText];
        keywords = hydeResult.keywords;
        exclusionTerms = hydeResult.exclusions;
      } catch (err) {
        console.warn('[PSM] HyDE expansion failed, falling back:', err);
        examples = [triggerText];
      }
    }

    // Embed trigger text
    const triggerEmbedding = await embedText(triggerText);

    // Embed all hypothetical examples
    const hypotheticalEmbeddings: number[][] = [];
    for (const ex of examples) {
      const emb = await embedText(ex);
      hypotheticalEmbeddings.push(emb);
    }

    // Flatten embeddings for storage
    const triggerEmbeddingFlat = triggerEmbedding;
    const hypotheticalEmbeddingsFlat = hypotheticalEmbeddings.flat();

    const { pipelineVersion } = await getSettings();

    const triggerData: TriggerData = {
      rawText: triggerText,
      hypotheticalExamples: examples,
      keywords,
      exclusionTerms,
      triggerEmbeddingFlat,
      hypotheticalEmbeddingsFlat,
      embeddingCount: hypotheticalEmbeddings.length,
      pipelineVersion,
    };

    await saveTriggerData(triggerData);
    await broadcastToRedditTabs({ type: 'SETTINGS_UPDATED' });

    return { success: true };
  } catch (err) {
    console.error('[PSM] Save trigger error:', err);
    return { success: false, error: String(err) };
  }
}

// ---- SCORE_BATCH ----

async function handleScoreBatch(
  posts: Array<{ elementId: string; text: string; subreddit?: string }>,
): Promise<ScoreBatchResponse> {
  if (!modelReady || !embedder) {
    return { results: [], pending: true };
  }

  const triggerData = await getTriggerData();
  if (!triggerData) {
    return { results: [], pending: false };
  }

  const settings = await getSettings();
  const overrides = await getOverrides();

  const hypEmbs = unpackEmbeddings(
    triggerData.hypotheticalEmbeddingsFlat,
    triggerData.embeddingCount,
  );

  const results = [];
  for (const post of posts) {
    // Check user override first
    const overrideKey = post.elementId;
    if (overrideKey in overrides) {
      results.push({
        elementId: post.elementId,
        score: overrides[overrideKey] ? 1.0 : 0.0,
        isSensitive: overrides[overrideKey],
      });
      continue;
    }

    try {
      const contentEmbedding = await embedText(post.text);
      const result = computeHybridScoreFromEmbedding(
        contentEmbedding,
        triggerData.triggerEmbeddingFlat,
        hypEmbs,
        triggerData.keywords,
        triggerData.exclusionTerms,
        post.text,
        post.subreddit,
        settings.threshold,
      );
      results.push({
        elementId: post.elementId,
        score: result.score,
        isSensitive: result.isSensitive,
      });
    } catch (err) {
      console.error('[PSM] Scoring error for', post.elementId, err);
      results.push({ elementId: post.elementId, score: 0, isSensitive: false });
    }
  }

  return { results };
}

// ---- Message listener ----

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  const msg = message as { type: string; [key: string]: unknown };

  if (msg.type === 'GET_STATUS') {
    const triggerDataPromise = getTriggerData();
    triggerDataPromise.then((td) => {
      const response: GetStatusResponse = {
        modelReady,
        modelLoading,
        loadProgress,
        triggerReady: td !== null,
      };
      sendResponse(response);
    });
    return true; // async
  }

  if (msg.type === 'SAVE_TRIGGER') {
    handleSaveTrigger(
      msg.triggerText as string,
      msg.anthropicApiKey as string,
      msg.threshold as number,
    ).then(sendResponse);
    return true;
  }

  if (msg.type === 'SCORE_BATCH') {
    handleScoreBatch(
      msg.posts as Array<{ elementId: string; text: string; subreddit?: string }>,
    ).then(sendResponse);
    return true;
  }

  if (msg.type === 'SET_OVERRIDE') {
    setOverride(msg.elementId as string, msg.isSensitive as boolean).then(() => {
      sendResponse({ success: true });
    });
    return true;
  }

  return false;
});

// Start model loading immediately on service worker startup
initModel();

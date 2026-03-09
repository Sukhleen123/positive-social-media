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
import { PREDEFINED_TOPICS } from '../shared/topics';

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

const STOPWORDS = new Set([
  'a', 'an', 'the', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with',
  'is', 'are', 'was', 'were', 'be', 'have', 'has', 'do', 'does', 'did', 'will', 'would',
  'could', 'should', 'may', 'might', 'i', 'you', 'he', 'she', 'it', 'we', 'they',
  'my', 'your', 'his', 'her', 'its', 'our', 'their', 'that', 'this', 'which', 'who',
]);

function extractBasicKeywords(text: string): string[] {
  const words = text.toLowerCase().split(/[^a-z0-9]+/);
  const seen = new Set<string>();
  const result: string[] = [];
  for (const word of words) {
    if (word.length >= 3 && !STOPWORDS.has(word) && !seen.has(word)) {
      seen.add(word);
      result.push(word);
      if (result.length >= 15) break;
    }
  }
  return result;
}

async function callHyDE(triggerText: string, apiKey: string, topicLabels?: string[]): Promise<{
  examples: string[];
  keywords: string[];
  exclusions: string[];
}> {
  const topicsClause = topicLabels && topicLabels.length > 0
    ? `\nThe user also wants to filter these broad topics: ${topicLabels.join(', ')}.`
    : '';

  const prompt = `You are helping build a content moderation filter. The user wants to avoid content related to: "${triggerText}"${topicsClause}

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
  selectedTopics: string[] = [],
): Promise<{ success: boolean; error?: string }> {
  if (!modelReady || !embedder) {
    return { success: false, error: 'Model not ready yet' };
  }

  try {
    let examples: string[] = [triggerText];
    let keywords: string[] = [];
    let exclusionTerms: string[] = [];

    // Resolve selected predefined topics
    const topicObjects = PREDEFINED_TOPICS.filter((t) => selectedTopics.includes(t.id));
    const topicKeywords = topicObjects.flatMap((t) => t.keywords);
    const topicDescriptions = topicObjects.map((t) => t.description);
    const topicLabels = topicObjects.map((t) => t.label);

    if (apiKey.trim()) {
      try {
        const hydeResult = await callHyDE(triggerText, apiKey.trim(), topicLabels);
        examples = hydeResult.examples.length > 0 ? hydeResult.examples : [triggerText];
        keywords = hydeResult.keywords;
        exclusionTerms = hydeResult.exclusions;
      } catch (err) {
        console.warn('[PSM] HyDE expansion failed, falling back:', err);
        examples = [triggerText];
        keywords = extractBasicKeywords(triggerText);
      }
    } else {
      keywords = extractBasicKeywords(triggerText);
    }

    // Merge topic keywords (deduplicated)
    const allKeywords = Array.from(new Set([...keywords, ...topicKeywords]));
    keywords = allKeywords;

    // Merge topic descriptions as additional hypothetical examples
    const allExamples = [...examples, ...topicDescriptions];

    // Embed trigger text
    const triggerEmbedding = await embedText(triggerText);

    // Embed all hypothetical examples
    const hypotheticalEmbeddings: number[][] = [];
    for (const ex of allExamples) {
      const emb = await embedText(ex);
      hypotheticalEmbeddings.push(emb);
    }

    // Flatten embeddings for storage
    const triggerEmbeddingFlat = triggerEmbedding;
    const hypotheticalEmbeddingsFlat = hypotheticalEmbeddings.flat();

    const { pipelineVersion } = await getSettings();

    const triggerData: TriggerData = {
      rawText: triggerText,
      hypotheticalExamples: allExamples,
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
      msg.selectedTopics as string[],
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

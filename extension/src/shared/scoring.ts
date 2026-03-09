// TypeScript port of backend/app/pipeline/scoring.py::compute_hybrid_score()
// Constants match exactly

const HIGH_RISK_SUBS = new Set(['news', 'worldnews', 'politics', 'morbidreality']);
const LEXICAL_WEIGHT = 0.30;
const DENSE_WEIGHT = 0.70;
const SAFETY_BUFFER = 1.0;

export interface HybridScoreInput {
  contentText: string;
  triggerEmbedding: number[];
  hypotheticalEmbeddings: number[][];
  keywords: string[];
  exclusionTerms: string[];
  subreddit?: string;
  threshold: number;
}

export interface ScoreResult {
  score: number;
  isSensitive: boolean;
  denseScore: number;
  lexicalScore: number;
}

function dotProduct(a: number[], b: number[]): number {
  let sum = 0;
  for (let i = 0; i < a.length; i++) {
    sum += a[i] * b[i];
  }
  return sum;
}

function computeLexicalScore(text: string, keywords: string[], exclusionTerms: string[]): number {
  const lower = text.toLowerCase();

  // Check exclusions first
  for (const excl of exclusionTerms) {
    if (lower.includes(excl.toLowerCase())) {
      return -0.15;
    }
  }

  if (keywords.length === 0) return 0;

  let hits = 0;
  for (const kw of keywords) {
    if (lower.includes(kw.toLowerCase())) {
      hits++;
    }
  }
  return hits / keywords.length;
}

export function computeHybridScore(input: HybridScoreInput): ScoreResult {
  const {
    contentText,
    triggerEmbedding,
    hypotheticalEmbeddings,
    keywords,
    exclusionTerms,
    subreddit,
    threshold,
  } = input;

  // Dense: max cosine similarity across [hypotheticalEmbeddings..., triggerEmbedding]
  const allEmbeddings = [...hypotheticalEmbeddings, triggerEmbedding];
  let denseScore = 0;
  for (const emb of allEmbeddings) {
    const sim = dotProduct(contentText as unknown as number[], emb);
    if (sim > denseScore) denseScore = sim;
  }

  // Lexical
  const lexicalScore = computeLexicalScore(contentText, keywords, exclusionTerms);

  // Context bias
  const contextBias = subreddit && HIGH_RISK_SUBS.has(subreddit.toLowerCase()) ? 0.04 : 0;

  // Combined
  const score = DENSE_WEIGHT * denseScore + LEXICAL_WEIGHT * lexicalScore + contextBias;
  const isSensitive = score >= threshold * SAFETY_BUFFER;

  return { score, isSensitive, denseScore, lexicalScore };
}

// Version that accepts pre-embedded content vector (from background worker)
export function computeHybridScoreFromEmbedding(
  contentEmbedding: number[],
  triggerEmbedding: number[],
  hypotheticalEmbeddings: number[][],
  keywords: string[],
  exclusionTerms: string[],
  contentText: string,
  subreddit: string | undefined,
  threshold: number,
): ScoreResult {
  // Dense: max dot-product (embeddings are L2-normalized → dot = cosine)
  const allEmbeddings = [...hypotheticalEmbeddings, triggerEmbedding];
  let denseScore = 0;
  for (const emb of allEmbeddings) {
    const sim = dotProduct(contentEmbedding, emb);
    if (sim > denseScore) denseScore = sim;
  }

  const lexicalScore = computeLexicalScore(contentText, keywords, exclusionTerms);
  const contextBias = subreddit && HIGH_RISK_SUBS.has(subreddit.toLowerCase()) ? 0.04 : 0;

  const score = DENSE_WEIGHT * denseScore + LEXICAL_WEIGHT * lexicalScore + contextBias;
  const isSensitive = score >= threshold * SAFETY_BUFFER;

  return { score, isSensitive, denseScore, lexicalScore };
}

export function unpackEmbeddings(flat: number[], count: number): number[][] {
  if (count === 0 || flat.length === 0) return [];
  const dim = flat.length / count;
  const result: number[][] = [];
  for (let i = 0; i < count; i++) {
    result.push(flat.slice(i * dim, (i + 1) * dim));
  }
  return result;
}

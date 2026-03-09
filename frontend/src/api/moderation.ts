import axios from "axios";
import { API_BASE } from "./config";
import type { ScoreResult } from "../types";

export async function submitFeedback(
  userId: string,
  contentId: string,
  isSensitive: boolean
): Promise<void> {
  await axios.post(`${API_BASE}/api/v1/moderate/feedback`, {
    user_id: userId,
    content_id: contentId,
    is_sensitive: isSensitive,
  });
}

export async function moderateBatch(
  userId: string,
  contentIds: string[]
): Promise<ScoreResult[]> {
  const res = await axios.post<{ results: ScoreResult[] }>(
    `${API_BASE}/api/v1/moderate/batch`,
    { user_id: userId, content_ids: contentIds }
  );
  return res.data.results;
}

export function openModerationStream(
  userId: string,
  contentIds: string[],
  onScore: (result: ScoreResult) => void,
  onDone?: () => void,
  onError?: (err: Event) => void
): EventSource {
  const params = new URLSearchParams({
    user_id: userId,
    content_ids: contentIds.join(","),
  });
  const url = `${API_BASE}/api/v1/moderate/stream?${params}`;
  const es = new EventSource(url);

  es.onmessage = (e) => {
    try {
      const result: ScoreResult = JSON.parse(e.data);
      onScore(result);
    } catch {
      // ignore parse errors
    }
  };

  es.onerror = (e) => {
    onError?.(e);
    es.close();
    onDone?.();
  };

  return es;
}

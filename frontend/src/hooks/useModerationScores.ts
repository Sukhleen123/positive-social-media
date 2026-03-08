import { useEffect, useRef } from "react";
import { openModerationStream } from "../api/moderation";
import { useModerationStore } from "../store/moderationStore";
import { useUserStore } from "../store/userStore";
import type { ContentItem } from "../types";

export function useModerationScores(items: ContentItem[]) {
  const { setScore } = useModerationStore();
  const { userId, triggerId } = useUserStore();
  const esRef = useRef<EventSource | null>(null);

  useEffect(() => {
    // Close any existing stream before opening a new one
    if (esRef.current) {
      esRef.current.close();
      esRef.current = null;
    }

    if (!userId || items.length === 0) return;

    const contentIds = items.map((i) => i.id);

    const es = openModerationStream(
      userId,
      contentIds,
      (result) => {
        setScore(result.content_id, {
          status: result.is_sensitive ? "sensitive" : "safe",
          cosine_score: result.cosine_score,
        });
      },
      undefined,
      (err) => {
        console.error("[useModerationScores] SSE error", err);
        // Mark all still-pending as safe on stream failure
        const { scores } = useModerationStore.getState();
        for (const id of contentIds) {
          if (scores[id]?.status === "pending") {
            setScore(id, { status: "safe", cosine_score: 0 });
          }
        }
      }
    );

    esRef.current = es;

    return () => {
      es.close();
      esRef.current = null;
    };
  }, [userId, triggerId, items, setScore]);
}

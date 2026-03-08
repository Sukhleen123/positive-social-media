import { useEffect } from "react";
import { fetchContentFeed } from "../api/content";
import { useFeedStore } from "../store/feedStore";
import { useModerationStore } from "../store/moderationStore";

export function useContentFeed() {
  const { setItems, setLoading, setError } = useFeedStore();
  const { initPending } = useModerationStore();

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);
      try {
        const items = await fetchContentFeed({ limit: 50 });
        if (!cancelled) {
          setItems(items);
          initPending(items.map((i) => i.id));
        }
      } catch (e) {
        if (!cancelled) setError(String(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => { cancelled = true; };
  }, [setItems, setLoading, setError, initPending]);
}

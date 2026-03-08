import { create } from "zustand";
import type { ContentItem } from "../types";

interface FeedState {
  items: ContentItem[];
  loading: boolean;
  error: string | null;
  setItems: (items: ContentItem[]) => void;
  setLoading: (v: boolean) => void;
  setError: (msg: string | null) => void;
}

export const useFeedStore = create<FeedState>()((set) => ({
  items: [],
  loading: false,
  error: null,
  setItems: (items) => set({ items }),
  setLoading: (loading) => set({ loading }),
  setError: (error) => set({ error }),
}));

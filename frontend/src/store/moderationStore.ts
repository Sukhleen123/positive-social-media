import { create } from "zustand";
import type { ModerationStatus, ModerationState } from "../types";

interface ModerationStoreState {
  scores: Record<string, ModerationState>;
  setScore: (contentId: string, score: ModerationState) => void;
  getStatus: (contentId: string) => ModerationStatus;
  initPending: (contentIds: string[]) => void;
  reset: () => void;
}

export const useModerationStore = create<ModerationStoreState>()((set, get) => ({
  scores: {},

  setScore: (contentId, score) =>
    set((state) => ({
      scores: { ...state.scores, [contentId]: score },
    })),

  getStatus: (contentId) => get().scores[contentId]?.status ?? "pending",

  initPending: (contentIds) => {
    const pending: Record<string, ModerationState> = {};
    for (const id of contentIds) {
      if (!get().scores[id]) {
        pending[id] = { status: "pending" };
      }
    }
    set((state) => ({ scores: { ...state.scores, ...pending } }));
  },

  reset: () => set({ scores: {} }),
}));

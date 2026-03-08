import { create } from "zustand";
import { persist } from "zustand/middleware";
import { createUser } from "../api/users";

interface UserState {
  userId: string | null;
  triggerText: string;
  triggerId: string | null;
  setUserId: (id: string) => void;
  setTriggerText: (text: string) => void;
  setTriggerId: (id: string | null) => void;
  ensureUser: () => Promise<string>;
}

export const useUserStore = create<UserState>()(
  persist(
    (set, get) => ({
      userId: null,
      triggerText: "",
      triggerId: null,

      setUserId: (id) => set({ userId: id }),
      setTriggerText: (text) => set({ triggerText: text }),
      setTriggerId: (id) => set({ triggerId: id }),

      ensureUser: async () => {
        const { userId } = get();
        if (userId) return userId;
        const user = await createUser();
        set({ userId: user.id });
        return user.id;
      },
    }),
    { name: "user-store" }
  )
);

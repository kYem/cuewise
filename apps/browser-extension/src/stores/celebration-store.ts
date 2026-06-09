import { create } from 'zustand';

export type CelebrationType = 'pomodoro' | 'allGoals';

interface CelebrationStore {
  active: CelebrationType | null;
  celebrate: (type: CelebrationType) => void;
  dismiss: () => void;
}

export const useCelebrationStore = create<CelebrationStore>((set, get) => ({
  active: null,

  celebrate: (type: CelebrationType) => {
    // Guard: ignore new triggers while a celebration is already showing,
    // so one action satisfying two triggers fires only once.
    if (get().active !== null) {
      return;
    }
    set({ active: type });
  },

  dismiss: () => {
    set({ active: null });
  },
}));

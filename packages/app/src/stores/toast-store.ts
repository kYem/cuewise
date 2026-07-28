import type { Toast, ToastType } from '@cuewise/ui';
import { create } from 'zustand';

interface ToastStore {
  toasts: Toast[];

  // Actions
  addToast: (type: ToastType, message: string, duration?: number) => void;
  removeToast: (id: string) => void;
  clearAll: () => void;

  // Convenience methods
  success: (message: string, duration?: number) => void;
  error: (message: string, duration?: number) => void;
  warning: (message: string, duration?: number) => void;
  info: (message: string, duration?: number) => void;
}

const DEFAULT_DURATION = 5000; // 5 seconds

export const useToastStore = create<ToastStore>((set) => ({
  toasts: [],

  addToast: (type: ToastType, message: string, duration = DEFAULT_DURATION) => {
    const id = `toast-${Date.now()}-${Math.random()}`;
    const toast: Toast = { id, type, message, duration };

    set((state) => {
      // A failure under an interval (quote refresh, reminder sweep) reports the same thing on
      // every tick; stacking identical copies buries the rest of the screen without adding news.
      if (state.toasts.some((t) => t.type === type && t.message === message)) {
        return state;
      }
      return { toasts: [...state.toasts, toast] };
    });
  },

  removeToast: (id: string) => {
    set((state) => ({
      toasts: state.toasts.filter((toast) => toast.id !== id),
    }));
  },

  clearAll: () => {
    set({ toasts: [] });
  },

  success: (message: string, duration = DEFAULT_DURATION) => {
    useToastStore.getState().addToast('success', message, duration);
  },

  error: (message: string, duration = DEFAULT_DURATION) => {
    useToastStore.getState().addToast('error', message, duration);
  },

  warning: (message: string, duration = DEFAULT_DURATION) => {
    useToastStore.getState().addToast('warning', message, duration);
  },

  info: (message: string, duration = DEFAULT_DURATION) => {
    useToastStore.getState().addToast('info', message, duration);
  },
}));

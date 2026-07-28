import { logger } from '@cuewise/shared';
import type { Toast, ToastType } from '@cuewise/ui';
import { create } from 'zustand';

/** Opt-in per call site: only a message an interval can repeat forever asks to be collapsed. */
export interface ToastOptions {
  duration?: number;
  collapseRepeats?: boolean;
}

interface ToastStore {
  toasts: Toast[];

  // Actions
  addToast: (type: ToastType, message: string, options?: ToastOptions) => void;
  removeToast: (id: string) => void;
  clearAll: () => void;

  // Convenience methods
  success: (message: string, options?: ToastOptions) => void;
  error: (message: string, options?: ToastOptions) => void;
  warning: (message: string, options?: ToastOptions) => void;
  info: (message: string, options?: ToastOptions) => void;
}

const DEFAULT_DURATION = 5000; // 5 seconds

export const useToastStore = create<ToastStore>((set) => ({
  toasts: [],

  addToast: (type: ToastType, message: string, options: ToastOptions = {}) => {
    const duration = options.duration ?? DEFAULT_DURATION;
    const id = `toast-${Date.now()}-${Math.random()}`;
    const toast: Toast = { id, type, message, duration };

    set((state) => {
      if (options.collapseRepeats !== true) {
        return { toasts: [...state.toasts, toast] };
      }
      const existing = state.toasts.find((t) => t.type === type && t.message === message);
      if (existing === undefined) {
        return { toasts: [...state.toasts, toast] };
      }
      // Restarted, not dropped: a retry that failed again has to look different from one that
      // worked, and the log keeps the count of what the screen collapsed.
      logger.warn('Collapsed a repeated toast into the one on screen', { type, message });
      return {
        toasts: state.toasts.map((t) =>
          t.id === existing.id ? { ...t, duration, repeatedAt: Date.now() } : t
        ),
      };
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

  success: (message: string, options?: ToastOptions) => {
    useToastStore.getState().addToast('success', message, options);
  },

  error: (message: string, options?: ToastOptions) => {
    useToastStore.getState().addToast('error', message, options);
  },

  warning: (message: string, options?: ToastOptions) => {
    useToastStore.getState().addToast('warning', message, options);
  },

  info: (message: string, options?: ToastOptions) => {
    useToastStore.getState().addToast('info', message, options);
  },
}));

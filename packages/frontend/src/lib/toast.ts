/**
 * Toast wrapper around sonner.
 * Also provides a global confirm() API via Zustand store.
 */

import { toast as sonner } from "sonner";
import { create } from "zustand";

export const toast = {
  error: (msg: string) => sonner.error(msg, { duration: 4000 }),
  success: (msg: string) => sonner.success(msg, { duration: 2500 }),
  warning: (msg: string) => sonner.warning(msg, { duration: 3500 }),
  info: (msg: string) => sonner.info(msg, { duration: 3000 }),
};

// ── Global confirm ─────────────────────────────────────

interface ConfirmState {
  open: boolean;
  title: string;
  description: string;
  confirmLabel: string;
  variant: "danger" | "default";
  resolve: ((v: boolean) => void) | null;

  confirm: (opts: {
    title: string;
    description?: string;
    confirmLabel?: string;
    variant?: "danger" | "default";
  }) => Promise<boolean>;

  setOpen: (open: boolean) => void;
  handleConfirm: () => void;
}

export const useConfirmStore = create<ConfirmState>((set, get) => ({
  open: false,
  title: "",
  description: "",
  confirmLabel: "Confirm",
  variant: "default",
  resolve: null,

  confirm: (opts) =>
    new Promise<boolean>((resolve) => {
      set({
        open: true,
        title: opts.title,
        description: opts.description || "",
        confirmLabel: opts.confirmLabel || "Confirm",
        variant: opts.variant || "default",
        resolve,
      });
    }),

  setOpen: (open) => {
    if (!open) {
      const r = get().resolve;
      if (r) r(false);
      set({ open: false, resolve: null });
    } else {
      set({ open });
    }
  },

  handleConfirm: () => {
    const r = get().resolve;
    if (r) r(true);
    set({ open: false, resolve: null });
  },
}));

/** Call from anywhere (stores, hooks, etc.) — returns true if user confirmed */
export function confirm(opts: {
  title: string;
  description?: string;
  confirmLabel?: string;
  variant?: "danger" | "default";
}): Promise<boolean> {
  return useConfirmStore.getState().confirm(opts);
}

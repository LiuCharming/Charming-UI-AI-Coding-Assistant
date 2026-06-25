/**
 * Permission store — tracks pending permission requests.
 */

import { create } from "zustand";
import type { PermissionRequestPayload } from "@cgui/shared";

interface PendingRequest {
  requestId: string;
  toolName: string;
  toolInput: Record<string, unknown>;
  reason: string;
  timestamp: number;
}

interface PermissionState {
  pending: PendingRequest[];
  showDialog: boolean;

  addRequest: (req: PermissionRequestPayload) => void;
  removeRequest: (requestId: string) => void;
  setShowDialog: (show: boolean) => void;
  clearAll: () => void;
}

export const usePermissionStore = create<PermissionState>((set) => ({
  pending: [],
  showDialog: false,

  addRequest: (req) =>
    set((s) => ({
      pending: [
        ...s.pending,
        {
          requestId: req.requestId,
          toolName: req.toolName,
          toolInput: req.toolInput,
          reason: req.reason,
          timestamp: Date.now(),
        },
      ],
      showDialog: true,
    })),

  removeRequest: (requestId) =>
    set((s) => ({
      pending: s.pending.filter((r) => r.requestId !== requestId),
      showDialog: s.pending.length > 1,
    })),

  setShowDialog: (show) => set({ showDialog: show }),

  clearAll: () => set({ pending: [], showDialog: false }),
}));

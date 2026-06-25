/**
 * Tool call store — tracks in-flight tool executions.
 */

import { create } from "zustand";
import type { ToolCall } from "@cgui/shared";

interface ToolCallState {
  pendingCalls: Map<string, ToolCall>;
  recentCalls: ToolCall[];

  addPending: (toolUseId: string, toolName: string, input: Record<string, unknown>) => void;
  complete: (toolUseId: string, output: string, isError: boolean, durationMs: number) => void;
  interruptAll: () => void;
  clear: () => void;
}

export const useToolCallStore = create<ToolCallState>((set) => ({
  pendingCalls: new Map(),
  recentCalls: [],

  addPending: (toolUseId, toolName, input) =>
    set((s) => {
      const pending = new Map(s.pendingCalls);
      pending.set(toolUseId, {
        toolUseId,
        toolName,
        input,
        status: "running",
        isError: false,
        startedAt: Date.now(),
      });
      return { pendingCalls: pending };
    }),

  complete: (toolUseId, output, isError, durationMs) =>
    set((s) => {
      const pending = new Map(s.pendingCalls);
      const call = pending.get(toolUseId);
      pending.delete(toolUseId);

      const completed: ToolCall = {
        toolUseId,
        toolName: call?.toolName || "unknown",
        input: call?.input || {},
        output,
        isError,
        status: isError ? "error" : "complete",
        durationMs,
        startedAt: call?.startedAt,
      };

      return {
        pendingCalls: pending,
        recentCalls: [completed, ...s.recentCalls].slice(0, 50),
      };
    }),

  interruptAll: () =>
    set((s) => {
      const pending = new Map(s.pendingCalls);
      const interrupted: ToolCall[] = [];
      pending.forEach((call) => {
        interrupted.push({
          ...call,
          status: "error",
          isError: false,
          output: "Interrupted by user",
          durationMs: Date.now() - (call.startedAt || Date.now()),
        });
      });
      pending.clear();
      return {
        pendingCalls: pending,
        recentCalls: [...interrupted, ...s.recentCalls].slice(0, 50),
      };
    }),

  clear: () => set({ pendingCalls: new Map(), recentCalls: [] }),
}));

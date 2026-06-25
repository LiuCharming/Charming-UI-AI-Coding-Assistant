/**
 * Chat store — manages the current conversation's messages and streaming state.
 */

import { create } from "zustand";
import type { ChatMessage, ToolCall } from "@cgui/shared";

interface ChatState {
  messages: ChatMessage[];
  isStreaming: boolean;
  currentThinking: string;
  showThinking: boolean;
  streamingStartedAt: number | null;
  /** Accumulated output chars during streaming (for real-time token estimate) */
  streamingOutputChars: number;

  // Actions
  addMessage: (msg: ChatMessage) => void;
  appendToLastMessage: (text: string) => void;
  appendThinking: (text: string) => void;
  startThinking: () => void;
  endThinking: () => void;
  startStreaming: () => void;
  stopStreaming: () => void;
  addToolCall: (toolCall: ToolCall) => void;
  updateToolCall: (toolUseId: string, updates: Partial<ToolCall>) => void;
  setMessages: (msgs: ChatMessage[]) => void;
  removeLastAssistant: () => void;
  interruptToolCalls: () => void;
  clearMessages: () => void;
}

export const useChatStore = create<ChatState>((set, get) => ({
  messages: [],
  isStreaming: false,
  currentThinking: "",
  showThinking: true,
  streamingStartedAt: null,
  streamingOutputChars: 0,

  addMessage: (msg) =>
    set((s) => ({
      messages: [...s.messages, msg],
    })),

  appendToLastMessage: (text) =>
    set((s) => {
      const msgs = [...s.messages];
      const last = msgs[msgs.length - 1];
      if (last && last.role === "assistant") {
        msgs[msgs.length - 1] = {
          ...last,
          content: last.content + text,
          isStreaming: true,
        };
      } else {
        // Create a new assistant message
        msgs.push({
          id: `msg_${Date.now()}`,
          role: "assistant",
          content: text,
          isStreaming: true,
          timestamp: Date.now(),
        });
      }
      return {
        messages: msgs,
        streamingOutputChars: s.streamingOutputChars + text.length,
      };
    }),

  appendThinking: (text) =>
    set((s) => ({
      currentThinking: s.currentThinking + text,
    })),

  startThinking: () =>
    set({ currentThinking: "", showThinking: true }),

  endThinking: () =>
    set((s) => {
      const msgs = [...s.messages];
      const last = msgs[msgs.length - 1];
      if (last && last.role === "assistant" && s.currentThinking) {
        msgs[msgs.length - 1] = {
          ...last,
          thinking: s.currentThinking,
        };
      } else if (s.currentThinking) {
        // Thinking ended before any text/tool — create the assistant message now
        msgs.push({
          id: `msg_${Date.now()}`,
          role: "assistant",
          content: "",
          isStreaming: true,
          timestamp: Date.now(),
          thinking: s.currentThinking,
        });
      }
      return { currentThinking: "", messages: msgs };
    }),

  startStreaming: () => set({ isStreaming: true, streamingStartedAt: Date.now(), streamingOutputChars: 0 }),
  stopStreaming: () =>
    set((s) => {
      const msgs = [...s.messages];
      const last = msgs[msgs.length - 1];
      if (last && last.role === "assistant") {
        msgs[msgs.length - 1] = { ...last, isStreaming: false };
      }
      return { isStreaming: false, streamingStartedAt: null, messages: msgs };
    }),

  addToolCall: (toolCall) =>
    set((s) => {
      const msgs = [...s.messages];
      const last = msgs[msgs.length - 1];
      if (last && last.role === "assistant") {
        const existing = last.toolCalls || [];
        msgs[msgs.length - 1] = {
          ...last,
          toolCalls: [...existing, toolCall],
        };
      } else {
        // Tool call arrived before any text delta — create the assistant message now
        msgs.push({
          id: `msg_${Date.now()}`,
          role: "assistant",
          content: "",
          isStreaming: true,
          timestamp: Date.now(),
          toolCalls: [toolCall],
        });
      }
      return { messages: msgs };
    }),

  updateToolCall: (toolUseId, updates) =>
    set((s) => {
      const msgs = [...s.messages];
      for (let i = msgs.length - 1; i >= 0; i--) {
        if (msgs[i].role === "assistant" && msgs[i].toolCalls) {
          const idx = msgs[i].toolCalls!.findIndex(
            (tc) => tc.toolUseId === toolUseId
          );
          if (idx !== -1) {
            const updated = [...msgs[i].toolCalls!];
            updated[idx] = { ...updated[idx], ...updates };
            msgs[i] = { ...msgs[i], toolCalls: updated };
            break;
          }
        }
      }
      return { messages: msgs };
    }),

  setMessages: (msgs) => set({ messages: msgs }),
  removeLastAssistant: () =>
    set((s) => {
      const msgs = [...s.messages];
      if (msgs.length > 0 && msgs[msgs.length - 1].role === "assistant") {
        msgs.pop();
      }
      return { messages: msgs };
    }),
  interruptToolCalls: () =>
    set((s) => {
      const msgs = [...s.messages];
      for (let i = msgs.length - 1; i >= 0; i--) {
        if (msgs[i].role === "assistant" && msgs[i].toolCalls) {
          const updated = msgs[i].toolCalls!.map((tc) =>
            tc.status === "running"
              ? { ...tc, status: "error" as const, isError: false, output: "Interrupted by user", durationMs: Date.now() - (tc.startedAt || Date.now()) }
              : tc
          );
          msgs[i] = { ...msgs[i], toolCalls: updated };
        }
      }
      return { messages: msgs };
    }),
  clearMessages: () => set({ messages: [], isStreaming: false, currentThinking: "", streamingOutputChars: 0 }),
}));

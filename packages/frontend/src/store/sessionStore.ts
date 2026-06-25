/**
 * Session store — manages the session list and active session.
 */

import { create } from "zustand";
import type { SessionMeta, SessionDetail } from "@cgui/shared";
import { rest } from "../api/restClient";
import { useChatStore } from "./chatStore";
import { toast } from "../lib/toast";

interface SessionState {
  sessions: SessionMeta[];
  activeSessionId: string | null;
  isLoading: boolean;
  // Current turn token tracking
  lastTurnTokens: { input: number; output: number; cost: number } | null;
  /** Real-time usage reported during streaming (before turn completes) */
  interimUsage: { input: number; output: number; cost: number } | null;
  sessionTotalCost: number;

  // Actions
  loadSessions: () => Promise<void>;
  setActiveSession: (id: string | null) => void;
  openSession: (id: string) => Promise<void>;
  createSession: (title?: string) => Promise<SessionMeta>;
  deleteSession: (id: string) => Promise<void>;
  renameSession: (id: string, title: string) => Promise<void>;
  setSdkSessionId: (id: string, sdkSessionId: string) => void;
  updateSessionCost: (id: string, cost: { input: number; output: number; costUSD?: number }) => void;
  setLastTurnTokens: (tokens: { input: number; output: number; cost: number } | null) => void;
  setInterimUsage: (usage: { input: number; output: number; cost: number } | null) => void;
}

export const useSessionStore = create<SessionState>((set, get) => ({
  sessions: [],
  activeSessionId: null,
  isLoading: false,
  lastTurnTokens: null,
  interimUsage: null,
  sessionTotalCost: 0,

  loadSessions: async () => {
    set({ isLoading: true });
    try {
      const data = await rest.get<{ sessions: SessionMeta[] }>("/sessions");
      set({ sessions: data.sessions });

      // Restore the last active session from localStorage
      const savedSid = localStorage.getItem("charming-active-session");
      const { activeSessionId } = get();
      const targetSid = activeSessionId || savedSid || data.sessions[0]?.id;

      if (targetSid && targetSid !== activeSessionId) {
        set({ activeSessionId: targetSid });
      }

      // Load messages for the active session
      if (targetSid) {
        try {
          const session = await rest.get<SessionDetail>(`/sessions/${targetSid}`);
          if (session.messages && session.messages.length > 0) {
            // Check if the last message is a streaming draft (session was active when page refreshed)
            const msgs = session.messages;
            const lastMsg = msgs[msgs.length - 1];
            if (lastMsg?.isStreaming) {
              // Mark as not streaming (we lost the live connection) but keep the content
              lastMsg.isStreaming = false;
              // Append a note so the user knows the response was interrupted
              if (lastMsg.content && !lastMsg.content.endsWith("…")) {
                lastMsg.content = lastMsg.content + "\n\n*[Stream interrupted — response may be incomplete]*";
              }
            }
            useChatStore.getState().setMessages(msgs);
          }
          if (session.sdkSessionId) {
            get().setSdkSessionId(targetSid, session.sdkSessionId);
          }
          set({ sessionTotalCost: session.totalCostUSD || 0 });
        } catch {
          // Session may not exist yet on backend
        }
      }
    } catch (err) {
      toast.error("Failed to load sessions");
    } finally {
      set({ isLoading: false });
    }
  },

  setActiveSession: (id) => {
    if (id) localStorage.setItem("charming-active-session", id);
    else localStorage.removeItem("charming-active-session");
    set({ activeSessionId: id });
  },

  openSession: async (id) => {
    set({ activeSessionId: id, lastTurnTokens: null });
    try {
      const session = await rest.get<SessionDetail>(`/sessions/${id}`);
      if (session.messages && session.messages.length > 0) {
        useChatStore.getState().setMessages(session.messages);
      } else {
        useChatStore.getState().clearMessages();
      }
      // Sync sdkSessionId from the full session detail into the Zustand list
      if (session.sdkSessionId) {
        get().setSdkSessionId(id, session.sdkSessionId);
      }
      set({ sessionTotalCost: session.totalCostUSD || 0 });
    } catch (err) {
      toast.error("Failed to open session");
      useChatStore.getState().clearMessages();
    }
  },

  createSession: async (title) => {
    try {
      const session = await rest.post<SessionDetail>("/sessions", {
        title: title || "New Chat",
        cwd: "",
      });
      set((s) => ({ sessions: [session, ...s.sessions] }));
      return session;
    } catch {
      // Fallback: create locally if backend unavailable
      const session: SessionMeta = {
        id: `session_${Date.now()}`,
        title: title || "New Chat",
        cwd: "",
        createdAt: Date.now(),
        lastActiveAt: Date.now(),
        messageCount: 0,
      };
      set((s) => ({ sessions: [session, ...s.sessions] }));
      return session;
    }
  },

  deleteSession: async (id) => {
    try {
      await rest.delete(`/sessions/${id}`);
    } catch {
      // Session might not exist on backend yet
    }
    set((s) => {
      const isActive = s.activeSessionId === id;
      if (isActive) {
        // Clear chat when deleting the active session
        useChatStore.getState().clearMessages();
        localStorage.removeItem("charming-active-session");
      }
      return {
        sessions: s.sessions.filter((sess) => sess.id !== id),
        activeSessionId: isActive ? null : s.activeSessionId,
      };
    });
  },

  renameSession: async (id, title) => {
    try {
      await rest.patch(`/sessions/${id}`, { title });
    } catch {
      // Fallback: update locally
    }
    set((s) => ({
      sessions: s.sessions.map((sess) =>
        sess.id === id ? { ...sess, title } : sess
      ),
    }));
  },

  setSdkSessionId: (id, sdkSessionId) =>
    set((s) => ({
      sessions: s.sessions.map((sess) =>
        sess.id === id ? { ...sess, sdkSessionId } : sess
      ),
    })),

  updateSessionCost: (id, cost) =>
    set((s) => ({
      sessions: s.sessions.map((sess) =>
        sess.id === id
          ? {
              ...sess,
              totalTokens: (sess.totalTokens || 0) + cost.input + cost.output,
              totalCostUSD: (sess.totalCostUSD || 0) + (cost.costUSD || 0),
            }
          : sess
      ),
      sessionTotalCost: s.sessionTotalCost + (cost.costUSD || 0),
    })),

  setLastTurnTokens: (tokens) => set({ lastTurnTokens: tokens }),

  setInterimUsage: (usage) => set({ interimUsage: usage }),
}));

/**
 * Hook for session CRUD operations.
 */

import { useCallback } from "react";
import { useSessionStore } from "../store/sessionStore";
import { useChatStore } from "../store/chatStore";
import { useProjectStore } from "../store/projectStore";

export function useSessions() {
  const {
    sessions,
    activeSessionId,
    isLoading,
    loadSessions,
    setActiveSession,
    createSession,
    deleteSession,
    renameSession,
    openSession,
  } = useSessionStore();

  const newChat = useCallback(async () => {
    useChatStore.getState().clearMessages();
    const projectId = useProjectStore.getState().activeProjectId;
    const session = await createSession("New Chat", projectId || undefined);
    setActiveSession(session.id);
    return session;
  }, [createSession, setActiveSession]);

  return {
    sessions,
    activeSessionId,
    isLoading,
    loadSessions,
    setActiveSession,
    openSession,
    newChat,
    deleteSession,
    renameSession,
  };
}

/**
 * Chat hooks — WS message handling and prompt actions.
 *
 * IMPORTANT: useWsMessages() must be called exactly ONCE (in ChatPage).
 * useChatActions() can be called from any component that needs send/interrupt/respond.
 */

import { useEffect, useCallback } from "react";
import type { ClientMessage, ServerMessage, AttachedFile, AttachedImage } from "@cgui/shared";
import { wsClient } from "../api/wsClient";
import { useChatStore } from "../store/chatStore";
import { useToolCallStore } from "../store/toolCallStore";
import { usePermissionStore } from "../store/permissionStore";
import { useSessionStore } from "../store/sessionStore";
import { useProjectStore } from "../store/projectStore";
import { toast } from "../lib/toast";
import type { LocalAttachment } from "../components/input/types";

// ── Top-level WS message handler (call ONCE in ChatPage) ────

export function useWsMessages() {
  const { addMessage, appendToLastMessage, appendThinking, startThinking, endThinking,
    startStreaming, stopStreaming, addToolCall, updateToolCall } = useChatStore();
  const { addPending, complete } = useToolCallStore();
  const { addRequest, removeRequest } = usePermissionStore();
  const { updateSessionCost, activeSessionId } = useSessionStore();

  useEffect(() => {
    wsClient.connect();

    const unsub = wsClient.onMessage((msg: ServerMessage) => {
      switch (msg.type) {
        case "turn_start":
          startStreaming();
          useSessionStore.getState().setInterimUsage(null);
          break;

        case "text_delta":
          appendToLastMessage(msg.payload.text);
          break;

        case "thinking_start":
          startThinking();
          break;

        case "thinking_delta":
          appendThinking(msg.payload.text);
          break;

        case "thinking_end":
          endThinking();
          break;

        case "tool_start":
          addPending(
            msg.payload.toolUseId,
            msg.payload.toolName,
            msg.payload.input
          );
          addToolCall({
            toolUseId: msg.payload.toolUseId,
            toolName: msg.payload.toolName,
            input: msg.payload.input,
            status: "running",
            isError: false,
            startedAt: Date.now(),
          });
          break;

        case "tool_result":
          complete(
            msg.payload.toolUseId,
            msg.payload.output,
            msg.payload.isError,
            msg.payload.durationMs
          );
          updateToolCall(msg.payload.toolUseId, {
            output: msg.payload.output,
            status: msg.payload.isError ? "error" : "complete",
            isError: msg.payload.isError,
            durationMs: msg.payload.durationMs,
          });
          break;

        case "permission_request":
          addRequest(msg.payload);
          break;

        case "assistant_complete":
          stopStreaming();
          break;

        case "turn_result":
          stopStreaming();
          {
            const sid = useSessionStore.getState().activeSessionId;
            if (sid) {
              const r = msg.payload.result;
              updateSessionCost(sid, {
                input: r.inputTokens,
                output: r.outputTokens,
                costUSD: r.costUSD,
              });
              if (r.inputTokens > 0 || r.outputTokens > 0) {
                useSessionStore.getState().setLastTurnTokens({
                  input: r.inputTokens,
                  output: r.outputTokens,
                  cost: r.costUSD,
                });
              }
            }
          }
          break;

        case "error":
          toast.error(msg.payload.message || "Server error");
          stopStreaming();
          break;

        case "sdk_session_init":
          {
            const sid = useSessionStore.getState().activeSessionId;
            if (sid && msg.payload.sdkSessionId) {
              // Persist SDK session ID for multi-turn resume
              useSessionStore.getState().setSdkSessionId(sid, msg.payload.sdkSessionId);
            }
          }
          break;

        case "fork_complete":
          {
            // Switch to the newly forked session
            const { newSessionId } = msg.payload;
            toast.success("Conversation forked — switched to new branch. Look for the ↱ icon in the sidebar.");
            // Load sessions to pick up the new one, then open it
            useSessionStore.getState().loadSessions().then(() => {
              useSessionStore.getState().openSession(newSessionId);
            });
          }
          break;

        case "session_update":
          {
            const cost = msg.payload.cost;
            if (cost) {
              // Show real-time usage during streaming (turn_result handles final accumulation)
              useSessionStore.getState().setInterimUsage({
                input: cost.input || 0,
                output: cost.output || 0,
                cost: cost.costUSD || 0,
              });
            }
          }
          break;

        default:
          break;
      }
    });

    return () => {
      unsub();
    };
  }, []);
}

// ── Chat actions (can be used in multiple components) ──────

export function useChatActions() {
  const { addMessage, stopStreaming } = useChatStore();
  const { removeRequest } = usePermissionStore();
  const { activeProjectId, projects } = useProjectStore();

  const sendPrompt = useCallback(
    (text: string, sessionId?: string, attachments?: LocalAttachment[], editFromMessageId?: string) => {
      if (!text.trim() && !attachments?.length) return;

      const activeProject = projects.find((p) => p.id === activeProjectId);
      const activeProvider = localStorage.getItem("charming-provider") || "anthropic";
      const activeModel = localStorage.getItem("charming-model") || undefined;
      const activeSessionId = useSessionStore.getState().activeSessionId;

      const sid = sessionId || activeSessionId || `session_${Date.now()}`;

      // If this is a new session (no active session was set), register it
      // so subsequent messages in the same conversation use the same session.
      if (!sessionId && !activeSessionId) {
        useSessionStore.getState().setActiveSession(sid);
      }

      // Convert LocalAttachment[] to attachedFiles / images
      const attachedFiles: AttachedFile[] = [];
      const images: AttachedImage[] = [];
      if (attachments) {
        for (const att of attachments) {
          if (att.isImage) {
            images.push({ data: att.content, mediaType: att.mimeType });
          } else {
            attachedFiles.push({ path: att.name, content: att.content });
          }
        }
      }

      const msg: ClientMessage = {
        type: "prompt",
        payload: {
          text,
          sessionId: sid,
          cwd: activeProject?.path,
          providerId: activeProvider,
          modelId: activeModel,
          attachedFiles: attachedFiles.length > 0 ? attachedFiles : undefined,
          images: images.length > 0 ? images : undefined,
          editFromMessageId,
        },
      };

      addMessage({
        id: `msg_${Date.now()}`,
        role: "user",
        content: text || "(attached files)",
        isStreaming: false,
        timestamp: Date.now(),
      });

      wsClient.send(msg);
    },
    [addMessage, activeProjectId, projects]
  );

  const regenerate = useCallback(() => {
    const sid = useSessionStore.getState().activeSessionId;
    if (!sid) return;
    // Optimistically remove last assistant message from the UI
    useChatStore.getState().removeLastAssistant();
    const msg: ClientMessage = { type: "regenerate", payload: { sessionId: sid } };
    wsClient.send(msg);
  }, []);

  const forkSession = useCallback((sessionId: string, messageId: string) => {
    const msg: ClientMessage = {
      type: "fork_session",
      payload: { sessionId, messageId },
    };
    wsClient.send(msg);
  }, []);

  const interrupt = useCallback(() => {
    const msg: ClientMessage = { type: "interrupt" };
    wsClient.send(msg);
    stopStreaming();
    // Immediately mark all running tool calls as interrupted
    useChatStore.getState().interruptToolCalls();
    useToolCallStore.getState().interruptAll();
  }, [stopStreaming]);

  const respondToPermission = useCallback(
    (requestId: string, approved: boolean) => {
      const msg: ClientMessage = {
        type: "permission_response",
        payload: { requestId, approved },
      };
      wsClient.send(msg);
      removeRequest(requestId);
    },
    [removeRequest]
  );

  return {
    sendPrompt,
    interrupt,
    regenerate,
    forkSession,
    respondToPermission,
    isConnected: wsClient.status === "connected",
    status: wsClient.status,
  };
}

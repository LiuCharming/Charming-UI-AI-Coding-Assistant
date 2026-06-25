/**
 * Routes incoming WebSocket messages to the appropriate handlers.
 * Supports multiple LLM providers: Anthropic (Claude Agent SDK) and OpenAI-compatible.
 */

import type { WebSocket } from "ws";
import type { ClientMessage, ServerMessage, ProviderModel, ChatMessage, UserSettings } from "@cgui/shared";
import { createLogger } from "../utils/logger";
import { runAgent, resolvePermission, interruptSession } from "../sdk/agent";
import { runOpenAIAgent, resolveOpenAIPermission } from "../sdk/openaiProvider";
import { sendMessage } from "./wsServer";
import { config } from "../utils/config";
import { readFileSync, existsSync } from "fs";
import { resolve } from "path";
import { getSession, createSession, saveSession } from "../storage/sessionStore";
import {
  startTerminal,
  writeToTerminal,
  resizeTerminal,
  stopTerminal,
} from "../terminal/terminalManager";

const log = createLogger("router");

// Track active sessions per connection
const connectionSessions = new Map<WebSocket, string>();

// ─── Settings helper ───────────────────────────────────────

function loadSettings(): UserSettings {
  const settingsFile = resolve(config.cguiHome, "settings.json");
  try {
    if (existsSync(settingsFile)) {
      return JSON.parse(readFileSync(settingsFile, "utf-8")) as UserSettings;
    }
  } catch {}
  // Return minimal defaults
  return {
    theme: "dark",
    defaultModel: "claude-sonnet-4-5-20250929",
    defaultProvider: "anthropic",
    defaultPermissionMode: "default",
    defaultEffort: "medium",
    providers: [],
    mcpServers: {},
    permissionRules: [],
    spendingLimitUSD: null,
    systemPrompt: "",
    autoApproveTools: [],
    fontSize: 14,
    sendWithEnter: true,
    showThinking: true,
    compressionEnabled: true,
    compressionContextWindow: 128000,
    compressionThreshold: 75,
    compressionKeepRecent: 8,
  };
}

function getProviderModel(providerId?: string, modelId?: string): {
  provider: { id: string; type: string; apiKey: string; baseUrl: string };
  model: ProviderModel | null;
} {
  const settings = loadSettings();
  const providers = settings.providers || [];

  // Default to Anthropic if not specified
  const pid = providerId || "anthropic";
  const provider = providers.find((p) => p.id === pid);

  if (!provider) {
    return {
      provider: { id: "anthropic", type: "anthropic", apiKey: config.anthropicApiKey, baseUrl: "https://api.anthropic.com" },
      model: null,
    };
  }

  const models = provider.models || [];
  const model = modelId
    ? models.find((m) => m.id === modelId) || models[0]
    : models[0];

  return {
    provider: {
      id: provider.id,
      type: provider.type,
      apiKey: provider.apiKey || (pid === "anthropic" ? config.anthropicApiKey : ""),
      baseUrl: provider.baseUrl || "https://api.anthropic.com",
    },
    model: model || null,
  };
}

// ─── Message router ────────────────────────────────────────

function send(ws: WebSocket, msg: ServerMessage): void {
  sendMessage(ws, msg);
}

export async function handleMessage(
  ws: WebSocket,
  msg: ClientMessage
): Promise<void> {
  switch (msg.type) {
    case "prompt": {
      const { text, sessionId, cwd, projectId, providerId, modelId, attachedFiles, images, editFromMessageId } =
        msg.payload;

      const settings = loadSettings();
      const { provider, model } = getProviderModel(providerId, modelId);

      log.info(
        { sessionId, provider: provider.id, model: model?.id, cwd, textLength: text.length, editFromMessageId },
        "Handling prompt request"
      );

      if (sessionId) {
        connectionSessions.set(ws, sessionId);
      }

      const sessionIdStr = sessionId || `session_${Date.now()}`;
      const sessionCwd = cwd || process.cwd();

      // ── Persist session (non-critical — never block the agent) ──
      let session;
      try {
        session = getSession(sessionIdStr);
        console.log(`[messageRouter] prompt handler: sessionId=${sessionIdStr}, existing session=${session ? 'FOUND' : 'NOT FOUND'}, sdkSessionId=${session?.sdkSessionId || 'NONE'}`);
        if (!session) {
          session = createSession({
            id: sessionIdStr,
            title: text.substring(0, 60).replace(/\n/g, " "),
            cwd: sessionCwd,
            projectId: projectId,
          });
        }

        // If editing a previous message, truncate from that point
        if (editFromMessageId && session.messages) {
          const editIdx = session.messages.findIndex(
            (m) => m.id === editFromMessageId
          );
          if (editIdx !== -1) {
            session.messages = session.messages.slice(0, editIdx);
            // Clear SDK session ID so a fresh SDK session starts from the truncated point
            session.sdkSessionId = undefined;
          }
        }

        // Save user message to session
        const userMsg: ChatMessage = {
          id: `msg_${Date.now()}_user`,
          role: "user",
          content: text,
          isStreaming: false,
          timestamp: Date.now(),
        };
        if (!session.messages) session.messages = [];
        session.messages.push(userMsg);
        session.lastActiveAt = Date.now();
        session.messageCount = session.messages.filter((m) => m.role === "user" || m.role === "assistant").length;
        saveSession(session);
      } catch (err) {
        log.error({ err, sessionId: sessionIdStr }, "Session persistence error (non-fatal)");
      }
      // ─────────────────────────────────────────────────

      // Wrap sender to intercept sdk_session_init for persistence
      const sendMsg = (serverMsg: ServerMessage) => {
        if (serverMsg.type === "sdk_session_init") {
          console.log(`[messageRouter] sdk_session_init intercepted! payload=`, JSON.stringify(serverMsg.payload));
          try {
            const s = getSession(sessionIdStr);
            console.log(`[messageRouter] getSession(${sessionIdStr}) returned:`, s ? 'FOUND' : 'NULL');
            if (s) {
              s.sdkSessionId = serverMsg.payload.sdkSessionId;
              saveSession(s);
              console.log(`[messageRouter] sdkSessionId persisted: ${s.sdkSessionId}`);
            }
          } catch (err) {
            log.error({ err, sessionId: sessionIdStr }, "Failed to persist SDK session ID");
          }
        }
        send(ws, serverMsg);
      };

      try {
        if (provider.type === "anthropic") {
          // Use Claude Agent SDK
          if (!provider.apiKey && !config.anthropicApiKey) {
            send(ws, {
              type: "error",
              payload: {
                sessionId: sessionIdStr,
                message: `No API key configured for Anthropic. Set it in Settings or the ANTHROPIC_API_KEY env var.`,
                code: "NO_API_KEY",
              },
            });
            return;
          }
          await runAgent(text, sendMsg, {
            sessionId: sessionIdStr,
            cwd: cwd || process.cwd(),
            model: model?.id,
            apiKey: provider.apiKey,
            attachedFiles,
            images,
            sdkSessionId: session?.sdkSessionId,
            systemPrompt: settings.systemPrompt || undefined,
            maxBudgetUsd: settings.spendingLimitUSD ?? undefined,
          });
        } else if (provider.type === "openai_compatible") {
          // Use OpenAI-compatible API
          if (!provider.apiKey) {
            send(ws, {
              type: "error",
              payload: {
                sessionId: sessionIdStr,
                message: `No API key configured for provider "${provider.id}". Set it in Settings.`,
                code: "NO_API_KEY",
              },
            });
            return;
          }
          if (!model) {
            send(ws, {
              type: "error",
              payload: {
                sessionId: sessionIdStr,
                message: `No model configured for provider "${provider.id}".`,
                code: "NO_MODEL",
              },
            });
            return;
          }
          await runOpenAIAgent(text, sendMsg, {
            sessionId: sessionIdStr,
            model,
            apiKey: provider.apiKey,
            baseUrl: provider.baseUrl,
            cwd: cwd || process.cwd(),
            sdkSessionId: session?.sdkSessionId,
            systemPrompt: settings.systemPrompt || undefined,
            maxBudgetUsd: settings.spendingLimitUSD ?? undefined,
            permissionMode: settings.defaultPermissionMode || "default",
            autoApproveTools: settings.autoApproveTools || [],
            compressionEnabled: settings.compressionEnabled,
            compressionContextWindow: settings.compressionContextWindow,
            compressionThreshold: settings.compressionThreshold,
            compressionKeepRecent: settings.compressionKeepRecent,
          });
        } else {
          send(ws, {
            type: "error",
            payload: {
              sessionId: sessionIdStr,
              message: `Unknown provider type: ${provider.type}`,
              code: "UNKNOWN_PROVIDER",
            },
          });
        }
      } catch (error) {
        log.error({ error }, "Agent execution failed");
        send(ws, {
          type: "error",
          payload: {
            sessionId: sessionIdStr,
            message: error instanceof Error ? error.message : "Unknown error",
            code: "AGENT_ERROR",
          },
        });
      }
      break;
    }

    case "regenerate": {
      const { sessionId: regenSid } = msg.payload;
      log.info({ sessionId: regenSid }, "Regenerate requested");

      // Interrupt if currently streaming (no-op if not active)
      await interruptSession(regenSid);

      const regenSession = getSession(regenSid);
      if (!regenSession?.messages?.length) {
        send(ws, {
          type: "error",
          payload: { sessionId: regenSid, message: "No messages to regenerate", code: "NO_MESSAGES" },
        });
        break;
      }

      // Pop the last assistant message
      const lastIdx = regenSession.messages.length - 1;
      if (regenSession.messages[lastIdx]?.role === "assistant") {
        regenSession.messages.pop();
      }

      // Find the last user message to re-use
      const lastUser = [...regenSession.messages].reverse().find((m) => m.role === "user");
      if (!lastUser) {
        send(ws, {
          type: "error",
          payload: { sessionId: regenSid, message: "No user message to regenerate from", code: "NO_USER_MSG" },
        });
        break;
      }

      saveSession(regenSession);

      // Re-trigger the last user prompt
      const regenSettings = loadSettings();
      const regenPM = getProviderModel();
      const regenProvider = regenPM.provider;

      const regenSendMsg = (serverMsg: ServerMessage) => {
        if (serverMsg.type === "sdk_session_init") {
          try {
            const s = getSession(regenSid);
            if (s) {
              s.sdkSessionId = serverMsg.payload.sdkSessionId;
              saveSession(s);
            }
          } catch (err) {
            log.error({ err, sessionId: regenSid }, "Failed to persist SDK session ID");
          }
        }
        send(ws, serverMsg);
      };

      try {
        if (regenProvider.type === "anthropic") {
          await runAgent(lastUser.content, regenSendMsg, {
            sessionId: regenSid,
            cwd: regenSession.cwd || process.cwd(),
            model: regenPM.model?.id,
            apiKey: regenProvider.apiKey,
            sdkSessionId: regenSession.sdkSessionId,
            systemPrompt: regenSettings.systemPrompt || undefined,
            maxBudgetUsd: regenSettings.spendingLimitUSD ?? undefined,
          });
        } else {
          await runOpenAIAgent(lastUser.content, regenSendMsg, {
            sessionId: regenSid,
            model: regenPM.model!,
            apiKey: regenProvider.apiKey,
            baseUrl: regenProvider.baseUrl,
            cwd: regenSession.cwd || process.cwd(),
            sdkSessionId: regenSession.sdkSessionId,
            systemPrompt: regenSettings.systemPrompt || undefined,
            maxBudgetUsd: regenSettings.spendingLimitUSD ?? undefined,
            permissionMode: regenSettings.defaultPermissionMode || "default",
            autoApproveTools: regenSettings.autoApproveTools || [],
            compressionEnabled: regenSettings.compressionEnabled,
            compressionContextWindow: regenSettings.compressionContextWindow,
            compressionThreshold: regenSettings.compressionThreshold,
            compressionKeepRecent: regenSettings.compressionKeepRecent,
          });
        }
      } catch (error) {
        log.error({ error }, "Regenerate agent execution failed");
        send(ws, {
          type: "error",
          payload: {
            sessionId: regenSid,
            message: error instanceof Error ? error.message : "Unknown error",
            code: "AGENT_ERROR",
          },
        });
      }
      break;
    }

    case "fork_session": {
      const { sessionId: forkSid, messageId: forkMsgId } = msg.payload;
      log.info({ sessionId: forkSid, messageId: forkMsgId }, "Fork session requested");

      const sourceSession = getSession(forkSid);
      if (!sourceSession) {
        send(ws, {
          type: "error",
          payload: { sessionId: forkSid, message: "Source session not found", code: "SESSION_NOT_FOUND" },
        });
        break;
      }

      const messages = sourceSession.messages || [];
      const forkIdx = messages.findIndex((m) => m.id === forkMsgId);
      if (forkIdx === -1) {
        send(ws, {
          type: "error",
          payload: { sessionId: forkSid, message: "Fork point message not found", code: "MESSAGE_NOT_FOUND" },
        });
        break;
      }

      // Include messages up to and including the fork point
      const forkedMessages = messages.slice(0, forkIdx + 1);

      // Generate unique session IDs until we find a free one
      let newSessionId: string;
      let attempt = 0;
      do {
        newSessionId = `session_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
        attempt++;
      } while (getSession(newSessionId) && attempt < 10);

      const newSession = createSession({
        id: newSessionId,
        title: `${sourceSession.title || "Chat"}`,
        cwd: sourceSession.cwd || process.cwd(),
        projectId: sourceSession.projectId,
        forkedFrom: forkSid,
      });

      newSession.messages = forkedMessages;
      newSession.messageCount = forkedMessages.filter(
        (m) => m.role === "user" || m.role === "assistant"
      ).length;
      newSession.lastActiveAt = Date.now();
      // Do NOT copy sdkSessionId — the fork starts a fresh SDK conversation
      saveSession(newSession);

      log.info({ originalSessionId: forkSid, newSessionId, messageCount: forkedMessages.length }, "Session forked");

      send(ws, {
        type: "fork_complete",
        payload: { originalSessionId: forkSid, newSessionId },
      });
      break;
    }

    case "permission_response": {
      const { requestId, approved } = msg.payload;
      log.info({ requestId, approved }, "Permission response received");
      // Try both permission resolvers (Anthropic and OpenAI)
      if (!resolvePermission(requestId, approved)) {
        resolveOpenAIPermission(requestId, approved);
      }
      break;
    }

    case "interrupt": {
      const sid = connectionSessions.get(ws);
      log.info({ sessionId: sid }, "Interrupt requested");
      if (sid) {
        const interrupted = await interruptSession(sid);
        send(ws, {
          type: "system",
          payload: {
            sessionId: sid,
            message: interrupted ? "Interrupt signal sent" : "No active session to interrupt",
          },
        });
      }
      break;
    }

    case "set_model": {
      // Model changes take effect on next prompt
      send(ws, {
        type: "system",
        payload: {
          sessionId: "",
          message: `Model will be applied on next message`,
        },
      });
      break;
    }

    case "set_permission_mode": {
      send(ws, {
        type: "system",
        payload: {
          sessionId: "",
          message: `Permission mode updated`,
        },
      });
      break;
    }

    case "terminal_start": {
      const { cwd, shell, condaEnv } = msg.payload;
      log.info({ cwd, shell, condaEnv }, "Terminal start requested");
      startTerminal(ws, cwd, shell, condaEnv);
      break;
    }

    case "terminal_stop": {
      log.info("Terminal stop requested");
      stopTerminal(ws);
      break;
    }

    case "terminal_input": {
      writeToTerminal(ws, msg.payload.data);
      break;
    }

    case "terminal_resize": {
      resizeTerminal(ws, msg.payload.cols, msg.payload.rows);
      break;
    }

    default:
      log.warn({ msgType: (msg as ClientMessage).type }, "Unknown message type");
      send(ws, {
        type: "error",
        payload: {
          message: `Unknown message type: ${(msg as ClientMessage).type}`,
          code: "UNKNOWN_TYPE",
        },
      });
  }
}

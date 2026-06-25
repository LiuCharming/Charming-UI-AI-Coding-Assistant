/**
 * Core Claude Agent SDK wrapper.
 * Maps SDK query() events to our WebSocket protocol messages.
 */

import type { ServerMessage, ChatMessage, ToolCall } from "@cgui/shared";
import { createLogger } from "../utils/logger";
import { config } from "../utils/config";
import { getSession, saveSession } from "../storage/sessionStore";

const log = createLogger("agent");

// ─── Types ─────────────────────────────────────────────────

export interface AgentOptions {
  sessionId?: string;
  cwd?: string;
  model?: string;
  apiKey?: string;
  permissionMode?: "default" | "acceptEdits" | "bypassPermissions" | "plan";
  allowedTools?: string[];
  maxThinkingTokens?: number;
  effort?: "low" | "medium" | "high";
  mcpServers?: Record<string, McpServerConfig>;
  attachedFiles?: { path: string; content?: string }[];
  images?: { data: string; mediaType: string }[];
  systemPrompt?: string;
  /** Resume a previous SDK session (multi-turn context) */
  sdkSessionId?: string;
  /** Maximum budget in USD for this query */
  maxBudgetUsd?: number;
}

export interface McpServerConfig {
  command?: string;
  args?: string[];
  url?: string;
  env?: Record<string, string>;
  headers?: Record<string, string>;
  transport?: "stdio" | "http" | "sse";
}

export type SendMessage = (msg: ServerMessage) => void;

// ─── Permission handling ───────────────────────────────────

interface PendingPermission {
  requestId: string;
  toolName: string;
  resolve: (result: PermissionResult) => void;
  timer: NodeJS.Timeout;
}

interface PermissionResult {
  behavior: "allow" | "deny";
  updatedPermissions?: Array<{
    toolName: string;
    behavior: "allow" | "deny";
    destination?: "session" | "project" | "user";
  }>;
}

const pendingPermissions = new Map<string, PendingPermission>();
const PERMISSION_TIMEOUT_MS = 120_000; // 2 minutes

export function resolvePermission(
  requestId: string,
  approved: boolean
): boolean {
  const pending = pendingPermissions.get(requestId);
  if (!pending) return false;
  clearTimeout(pending.timer);
  pendingPermissions.delete(requestId);
  pending.resolve({
    behavior: approved ? "allow" : "deny",
    updatedPermissions: [],
  });
  return true;
}

// ─── Active queries (for interruption) ──────────────────────

interface ActiveQuery {
  interrupt: () => Promise<void>;
}
const activeQueries = new Map<string, ActiveQuery>();

export async function interruptSession(sessionId: string): Promise<boolean> {
  const aq = activeQueries.get(sessionId);
  if (aq) {
    log.info({ sessionId }, "Interrupting session");
    try {
      await aq.interrupt();
      // Some tool subprocesses may not respond immediately to the first interrupt.
      // Fire a second interrupt after a short delay to ensure stubborn tools stop.
      setTimeout(async () => {
        try {
          if (activeQueries.has(sessionId)) {
            await aq.interrupt();
            log.info({ sessionId }, "Second interrupt fired");
          }
        } catch {
          // ignore
        }
      }, 500);
      return true;
    } catch (err) {
      log.error({ sessionId, err }, "Interrupt failed");
    }
  }
  return false;
}

// ─── Types for SDK messages (subset we handle) ──────────────

interface SdkStreamEvent {
  type: "stream_event";
  event: {
    type: string;
    delta?: {
      type: string;
      text?: string;
      thinking?: string;
      partial_json?: string;
    };
    content_block?: {
      type: string;
      name?: string;
      id?: string;
      input?: Record<string, unknown>;
    };
    usage?: { input_tokens: number; output_tokens: number };
  };
  session_id: string;
}

interface SdkAssistantMessage {
  type: "assistant";
  message: {
    content: Array<{
      type: string;
      text?: string;
      name?: string;
      id?: string;
      input?: Record<string, unknown>;
      thinking?: string;
    }>;
    usage?: { input_tokens: number; output_tokens: number };
  };
  session_id: string;
}

interface SdkResultMessage {
  type: "result";
  subtype: string;
  duration_ms: number;
  num_turns: number;
  total_cost_usd: number;
  usage: {
    input_tokens: number;
    output_tokens: number;
    cache_creation_input_tokens?: number;
    cache_read_input_tokens?: number;
  };
  permission_denials: Array<{ tool_name: string; tool_use_id: string }>;
  session_id: string;
}

interface SdkUserMessage {
  type: "user";
  message: {
    role: "user";
    content: Array<Record<string, unknown>>;
  };
  session_id: string;
}

interface SdkSystemMessage {
  type: "system";
  subtype: string;
  session_id: string;
  [key: string]: unknown;
}

type SdkMessage =
  | SdkStreamEvent
  | SdkAssistantMessage
  | SdkResultMessage
  | SdkUserMessage
  | SdkSystemMessage
  | { type: string; [key: string]: unknown };

// ─── Main query wrapper ────────────────────────────────────

export async function runAgent(
  prompt: string,
  send: SendMessage,
  options: AgentOptions = {}
): Promise<void> {
  const sessionId = options.sessionId || `session_${Date.now()}`;

  log.info({ sessionId, promptLength: prompt.length }, "Starting agent query");

  // ── Phase 1: SDK initialization (fatal on failure) ──────
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let queryInstance: any;
  try {
    // Dynamically import the SDK
    const sdk = await import("@anthropic-ai/claude-agent-sdk");

    // Build the SDK options
    const sdkOptions: Record<string, unknown> = {
      allowedTools: options.allowedTools || [
        "Read",
        "Write",
        "Edit",
        "Bash",
        "Glob",
        "Grep",
        "WebSearch",
        "WebFetch",
      ],
      permissionMode: options.permissionMode || "default",
      includePartialMessages: true,
      cwd: options.cwd || process.cwd(),
    };

    if (options.model) {
      sdkOptions.model = options.model;
    }
    if (options.maxThinkingTokens) {
      sdkOptions.maxThinkingTokens = options.maxThinkingTokens;
    }
    if (options.effort) {
      sdkOptions.effort = options.effort;
    }
    if (options.mcpServers && Object.keys(options.mcpServers).length > 0) {
      sdkOptions.mcpServers = options.mcpServers;
    }
    if (options.systemPrompt) {
      sdkOptions.systemPrompt = options.systemPrompt;
    }

    // Resume previous SDK session for multi-turn context
    if (options.sdkSessionId) {
      sdkOptions.resume = options.sdkSessionId;
    }

    // Spending limit enforcement
    if (options.maxBudgetUsd != null) {
      sdkOptions.maxBudgetUsd = options.maxBudgetUsd;
    }

    // Set API key — prefer passed apiKey, then env var
    const apiKey = options.apiKey || config.anthropicApiKey;
    if (apiKey) {
      process.env.ANTHROPIC_API_KEY = apiKey;
    }

    // Set up permission handler
    let permCounter = 0;
    sdkOptions.canUseTool = async (
      toolName: string,
      input: Record<string, unknown>,
      ctx: { signal: AbortSignal; decisionReason?: string; title?: string }
    ) => {
      const requestId = `perm_${sessionId}_${++permCounter}`;
      log.info({ requestId, toolName }, "Permission requested");

      send({
        type: "permission_request",
        payload: {
          sessionId,
          requestId,
          toolName,
          toolInput: input,
          reason: ctx.decisionReason || ctx.title || `Claude wants to use ${toolName}`,
        },
      });

      // Wait for user response
      return new Promise<{ behavior: "allow" | "deny"; updatedPermissions?: Array<{ toolName: string; behavior: "allow" | "deny" }> }>(
        (resolve) => {
          const timer = setTimeout(() => {
            pendingPermissions.delete(requestId);
            resolve({ behavior: "deny" });
          }, PERMISSION_TIMEOUT_MS);

          pendingPermissions.set(requestId, {
            requestId,
            toolName,
            resolve: (result) => {
              clearTimeout(timer);
              resolve(result);
            },
            timer,
          });
        }
      );
    };

    // Create a streaming input generator
    async function* promptGenerator(): AsyncGenerator<{
      type: "user";
      message: { role: "user"; content: unknown[] };
      parent_tool_use_id: string | null;
    }> {
      const content: unknown[] = [{ type: "text", text: prompt }];

      // Add attached files
      if (options.attachedFiles) {
        for (const file of options.attachedFiles) {
          content.push({
            type: "text",
            text: `\n<attached_file path="${file.path}">\n${file.content || "(binary file)"}\n</attached_file>`,
          });
        }
      }

      // Add attached images
      if (options.images) {
        for (const img of options.images) {
          content.push({
            type: "image",
            source: {
              type: "base64",
              media_type: img.mediaType,
              data: img.data,
            },
          });
        }
      }

      yield {
        type: "user",
        message: { role: "user", content },
        parent_tool_use_id: null,
      };
    }

    send({
      type: "turn_start",
      payload: { sessionId },
    });

    // Call the SDK query function
    queryInstance = sdk.query({
      prompt: promptGenerator(),
      options: sdkOptions,
    });

    activeQueries.set(sessionId, {
      interrupt: () => queryInstance.interrupt(),
    });
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : String(error);
    log.error({ sessionId, error: errorMessage }, "SDK initialization failed");

    send({
      type: "error",
      payload: {
        sessionId,
        message: `SDK init failed: ${errorMessage}`,
        code: "SDK_INIT_ERROR",
      },
    });
    send({
      type: "turn_result",
      payload: {
        sessionId,
        result: {
          subtype: "error",
          durationMs: 0,
          totalTokens: 0,
          inputTokens: 0,
          outputTokens: 0,
          costUSD: 0,
        },
      },
    });
    return;
  }

  // ── Helper: periodically save streaming draft to session ─────
  const DRAFT_SAVE_INTERVAL_MS = 2000;
  let draftSaveTimer: ReturnType<typeof setInterval> | null = null;

  const saveStreamingDraft = () => {
    try {
      const s = getSession(sessionId);
      if (!s) return;
      // Remove any previous draft
      s.messages = s.messages.filter((m) => m.id !== `__draft__${sessionId}`);
      // Only save if there's actual content
      if (assistantTextBuffer.trim() || turnToolCalls.length > 0) {
        const draftMsg: ChatMessage = {
          id: `__draft__${sessionId}`,
          role: "assistant",
          content: assistantTextBuffer.trim(),
          isStreaming: true,
          timestamp: Date.now(),
        };
        if (thinkingBuffer.trim()) draftMsg.thinking = thinkingBuffer.trim();
        if (turnToolCalls.length > 0) draftMsg.toolCalls = [...turnToolCalls];
        s.messages.push(draftMsg);
      }
      saveSession(s);
    } catch {
      // Non-critical
    }
  };

  // ── Phase 2: Stream processing (partial recovery on failure) ──
  let currentToolUseId = "";
  let toolStartTime = 0;
  let thinkingActive = false;
  let thinkingBuffer = "";
  let assistantTextBuffer = "";
  const turnToolCalls: ToolCall[] = [];

  // Start periodic draft saving
  draftSaveTimer = setInterval(saveStreamingDraft, DRAFT_SAVE_INTERVAL_MS);

  try {
    for await (const msg of queryInstance) {
      const sdkMsg = msg as SdkMessage;

      switch (sdkMsg.type) {
        case "stream_event": {
          const event = sdkMsg.event;
          if (!event) break;

          switch (event.type) {
            case "content_block_delta": {
              const delta = event.delta;
              if (!delta) break;

              if (delta.type === "text_delta" && delta.text) {
                assistantTextBuffer += delta.text;
                send({
                  type: "text_delta",
                  payload: { sessionId, text: delta.text },
                });
              } else if (delta.type === "thinking_delta" && delta.thinking) {
                thinkingBuffer += delta.thinking;
                send({
                  type: "thinking_delta",
                  payload: { sessionId, text: delta.thinking },
                });
              } else if (delta.type === "input_json_delta" && delta.partial_json) {
                // Tool input streaming — accumulate silently
              }
              break;
            }

            case "content_block_start": {
              const block = event.content_block;
              if (!block) break;

              if (block.type === "tool_use") {
                currentToolUseId = block.id || `tool_${Date.now()}`;
                toolStartTime = Date.now();
                turnToolCalls.push({
                  toolUseId: currentToolUseId,
                  toolName: block.name || "unknown",
                  input: block.input || {},
                  status: "running",
                  isError: false,
                  startedAt: Date.now(),
                });
                send({
                  type: "tool_start",
                  payload: {
                    sessionId,
                    toolName: block.name || "unknown",
                    toolUseId: currentToolUseId,
                    input: block.input || {},
                  },
                });
              } else if (block.type === "thinking") {
                thinkingActive = true;
                send({
                  type: "thinking_start",
                  payload: { sessionId },
                });
              }
              break;
            }

            case "content_block_stop": {
              if (thinkingActive) {
                thinkingActive = false;
                send({
                  type: "thinking_end",
                  payload: { sessionId },
                });
              }
              break;
            }
          }
          break;
        }

        case "assistant": {
          const assistantMsg = msg as SdkAssistantMessage;
          const content = assistantMsg.message.content;

          // Extract text content
          let textContent = "";
          for (const block of content) {
            if (block.type === "text" && block.text) {
              textContent += block.text + "\n";
            }
          }

          if (textContent.trim()) {
            // Also accumulate for session persistence
            assistantTextBuffer = textContent.trim();

            send({
              type: "assistant_complete",
              payload: {
                sessionId,
                message: {
                  id: `msg_${Date.now()}`,
                  role: "assistant",
                  content: textContent.trim(),
                  isStreaming: false,
                  timestamp: Date.now(),
                },
              },
            });
          }
          break;
        }

        case "user": {
          const userMsg = msg as SdkUserMessage;
          // User messages contain tool_result blocks internally
          // Process them to emit tool_result events
          for (const block of userMsg.message.content) {
            if (block.type === "tool_result") {
              const b = block as {
                type: "tool_result";
                tool_use_id: string;
                content?: string | Array<{ type: string; text?: string }>;
                is_error?: boolean;
              };

              const output =
                typeof b.content === "string"
                  ? b.content
                  : Array.isArray(b.content)
                    ? b.content
                        .filter((c) => c.type === "text")
                        .map((c) => c.text || "")
                        .join("\n")
                    : JSON.stringify(b.content || "");

              const durationMs = Date.now() - toolStartTime;

              // Update tool call in turnToolCalls
              const tc = turnToolCalls.find(
                (t) => t.toolUseId === (b.tool_use_id || currentToolUseId)
              );
              if (tc) {
                tc.output = output;
                tc.status = b.is_error ? "error" : "complete";
                tc.isError = b.is_error || false;
                tc.durationMs = durationMs;
              }

              send({
                type: "tool_result",
                payload: {
                  sessionId,
                  toolUseId: b.tool_use_id || currentToolUseId,
                  output,
                  outputType: detectOutputType(b.tool_use_id, output),
                  isError: b.is_error || false,
                  durationMs,
                },
              });
            }
          }
          break;
        }

        case "result": {
          const resultMsg = msg as SdkResultMessage;
          const usage = resultMsg.usage || { input_tokens: 0, output_tokens: 0 };

          // Build ONE assistant message with both text and tool calls
          const assistantMsg: ChatMessage = {
            id: `msg_${Date.now()}_assistant`,
            role: "assistant",
            content: assistantTextBuffer.trim(),
            isStreaming: false,
            timestamp: Date.now(),
          };
          if (thinkingBuffer.trim()) {
            assistantMsg.thinking = thinkingBuffer.trim();
          }
          if (turnToolCalls.length > 0) {
            assistantMsg.toolCalls = turnToolCalls;
          }

          send({
            type: "turn_result",
            payload: {
              sessionId,
              result: {
                subtype: resultMsg.subtype || "success",
                durationMs: resultMsg.duration_ms || 0,
                totalTokens: usage.input_tokens + usage.output_tokens,
                inputTokens: usage.input_tokens,
                outputTokens: usage.output_tokens,
                cacheCreationInputTokens: usage.cache_creation_input_tokens,
                cacheReadInputTokens: usage.cache_read_input_tokens,
                costUSD: resultMsg.total_cost_usd || 0,
              },
            },
          });

          // Update session cost
          send({
            type: "session_update",
            payload: {
              sessionId,
              cost: {
                input: usage.input_tokens,
                output: usage.output_tokens,
                total: usage.input_tokens + usage.output_tokens,
              },
            },
          });

          // ── Persist session to disk (non-critical) ─
          // Stop draft saves BEFORE saving the final message
          if (draftSaveTimer) { clearInterval(draftSaveTimer); draftSaveTimer = null; }
          try {
            const s = getSession(sessionId);
            if (s) {
              // Remove any streaming draft
              s.messages = s.messages.filter((m) => m.id !== `__draft__${sessionId}`);
              // Append assistant message (with tool calls) to session
              s.messages.push(assistantMsg);
              // Update title from first user message if still default
              if (!s.title || s.title === "New Chat") {
                const firstUserMsg = s.messages.find((m) => m.role === "user");
                if (firstUserMsg) {
                  s.title = firstUserMsg.content.substring(0, 60).replace(/\n/g, " ");
                }
              }
              s.lastActiveAt = Date.now();
              s.messageCount = s.messages.filter((m) => m.role === "user" || m.role === "assistant").length;
              s.totalTokens = (s.totalTokens || 0) + usage.input_tokens + usage.output_tokens;
              s.totalCostUSD = (s.totalCostUSD || 0) + (resultMsg.total_cost_usd || 0);
              saveSession(s);
            }
          } catch (err) {
            log.error({ err, sessionId }, "Session save error (non-fatal)");
          }
          // ───────────────────────────────────────────
          break;
        }

        case "system": {
          const sysMsg = msg as SdkSystemMessage;
          console.log(`[agent.ts] system message, subtype=${sysMsg.subtype}, session_id=${(sysMsg as any).session_id}`);
          if (sysMsg.subtype === "init") {
            const sdkSid = sysMsg.session_id || sessionId;
            console.log(`[agent.ts] sdk_session_init FIRED! sdkSid=${sdkSid}, cguiSessionId=${sessionId}`);
            // Emit SDK session ID so the router can persist it for future resume
            send({
              type: "sdk_session_init",
              payload: {
                sessionId,
                sdkSessionId: sdkSid,
              },
            } as ServerMessage);
            send({
              type: "system",
              payload: {
                sessionId: sdkSid,
                message: "Session initialized",
              },
            });
          }
          break;
        }

        default:
          console.log(`[agent.ts] Unhandled SDK message type: ${sdkMsg.type}, subtype=${(sdkMsg as any).subtype || 'none'}`);
          log.debug({ msgType: sdkMsg.type }, "Unhandled SDK message type");
      }
    }

    if (draftSaveTimer) { clearInterval(draftSaveTimer); draftSaveTimer = null; }
    activeQueries.delete(sessionId);
    log.info({ sessionId }, "Agent query completed");
  } catch (error) {
    if (draftSaveTimer) { clearInterval(draftSaveTimer); draftSaveTimer = null; }
    activeQueries.delete(sessionId);

    const errorMessage =
      error instanceof Error ? error.message : String(error);

    // Don't report abort errors as failures
    if (
      errorMessage.includes("abort") ||
      errorMessage.includes("AbortError")
    ) {
      log.info({ sessionId }, "Query aborted");
      return;
    }

    log.error({ sessionId, error: errorMessage }, "Stream processing failed");

    // ── Partial recovery: save accumulated messages ─────
    try {
      if (assistantTextBuffer.trim() || turnToolCalls.length > 0) {
        const partialMsg: ChatMessage = {
          id: `msg_${Date.now()}_partial`,
          role: "assistant",
          content: assistantTextBuffer.trim(),
          isStreaming: false,
          timestamp: Date.now(),
        };
        if (thinkingBuffer.trim()) partialMsg.thinking = thinkingBuffer.trim();
        if (turnToolCalls.length > 0) partialMsg.toolCalls = turnToolCalls;

        const s = getSession(sessionId);
        if (s) {
          s.messages = s.messages.filter((m) => m.id !== `__draft__${sessionId}`);
          s.messages.push(partialMsg);
          if (!s.title || s.title === "New Chat") {
            const firstUser = s.messages.find((m) => m.role === "user");
            if (firstUser) s.title = firstUser.content.substring(0, 60).replace(/\n/g, " ");
          }
          s.lastActiveAt = Date.now();
          s.messageCount = s.messages.filter((m) => m.role === "user" || m.role === "assistant").length;
          saveSession(s);
          log.info({ sessionId }, "Partial results saved to session");
        }
      }
    } catch (saveErr) {
      log.error({ saveErr, sessionId }, "Failed to save partial results");
    }
    // ─────────────────────────────────────────────────────

    send({
      type: "error",
      payload: {
        sessionId,
        message: errorMessage,
        code: "AGENT_ERROR",
      },
    });

    send({
      type: "turn_result",
      payload: {
        sessionId,
        result: {
          subtype: "error",
          durationMs: 0,
          totalTokens: 0,
          inputTokens: 0,
          outputTokens: 0,
          costUSD: 0,
        },
      },
    });
  }
}

// ─── Helpers ───────────────────────────────────────────────

function detectOutputType(
  toolName: string,
  output: string
): "text" | "diff" | "file" | "terminal" | "json" {
  if (toolName === "Bash") return "terminal";
  if (toolName === "Edit" || toolName === "Write") return "diff";
  if (toolName === "Read") return "file";

  if (output.trim().startsWith("{") || output.trim().startsWith("[")) {
    return "json";
  }

  return "text";
}

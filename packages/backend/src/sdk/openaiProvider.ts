/**
 * OpenAI-compatible provider.
 * Supports OpenAI, Azure, OpenRouter, DeepSeek, and any OpenAI-compatible API.
 * Implements a simple tool-calling loop with streaming output.
 */

import type { ServerMessage, ChatMessage } from "@cgui/shared";
import type { ProviderModel } from "@cgui/shared";
import { createLogger } from "../utils/logger";
import { getSession, saveSession } from "../storage/sessionStore";

const log = createLogger("openai");

export interface OpenAIOptions {
  sessionId: string;
  model: ProviderModel;
  apiKey: string;
  baseUrl: string;
  cwd?: string;
  sdkSessionId?: string;
  systemPrompt?: string;
  maxBudgetUsd?: number;
  permissionMode?: "default" | "acceptEdits" | "bypassPermissions" | "plan";
  autoApproveTools?: string[];
  // Context compression
  compressionEnabled?: boolean;       // enable/disable auto compression
  compressionContextWindow?: number;  // override context window in tokens (0 = use model default)
  compressionThreshold?: number;      // percentage of context window (e.g. 75 = 75%)
  compressionKeepRecent?: number;     // keep N most recent messages uncompressed

  // Agent loop / timeout limits
  maxTurns?: number;
  apiTimeoutMs?: number;
  streamTimeoutMs?: number;
  streamChunkTimeoutMs?: number;
  permissionTimeoutMs?: number;
}

type SendFn = (msg: ServerMessage) => void;

// ─── Permission helper ───────────────────────────────────────
// Shared with agent.ts via pendingPermissions

interface PendingPermission {
  requestId: string;
  toolName: string;
  resolve: (result: { behavior: "allow" | "deny" }) => void;
  timer: NodeJS.Timeout;
}

const pendingPermissions = new Map<string, PendingPermission>();
const DEFAULT_PERMISSION_TIMEOUT_MS = 120_000;
let permCounter = 0;

export function resolveOpenAIPermission(requestId: string, approved: boolean): boolean {
  const pending = pendingPermissions.get(requestId);
  if (!pending) return false;
  clearTimeout(pending.timer);
  pendingPermissions.delete(requestId);
  pending.resolve({ behavior: approved ? "allow" : "deny" });
  return true;
}

function shouldAutoApprove(
  toolName: string,
  mode: OpenAIOptions["permissionMode"],
  autoApproveTools: string[]
): boolean {
  if (mode === "bypassPermissions") return true;
  if (autoApproveTools.includes(toolName)) return true;
  // Read-only tools are always safe
  const safeTools = ["read_file", "list_directory", "search_files", "search_content"];
  if (mode === "plan" && safeTools.includes(toolName)) return true;
  return false;
}

async function checkPermission(
  toolName: string,
  input: Record<string, unknown>,
  sessionId: string,
  send: SendFn,
  options: OpenAIOptions
): Promise<{ behavior: "allow" | "deny" }> {
  const mode = options.permissionMode || "default";
  const autoApprove = options.autoApproveTools || [];

  if (shouldAutoApprove(toolName, mode, autoApprove)) {
    return { behavior: "allow" };
  }

  // Need user confirmation
  const requestId = `perm_openai_${sessionId}_${++permCounter}`;

  send({
    type: "permission_request",
    payload: {
      sessionId,
      requestId,
      toolName,
      toolInput: input,
      reason: `Allow ${toolName}?`,
    },
  });

  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      pendingPermissions.delete(requestId);
      resolve({ behavior: "deny" });
    }, options.permissionTimeoutMs ?? DEFAULT_PERMISSION_TIMEOUT_MS);

    pendingPermissions.set(requestId, {
      requestId,
      toolName,
      resolve,
      timer,
    });
  });
}

// ─── Tool definitions (subset of Claude Code tools) ────────

const BUILTIN_TOOLS = [
  {
    type: "function" as const,
    function: {
      name: "read_file",
      description: "Read the contents of a file",
      parameters: {
        type: "object",
        properties: {
          path: { type: "string", description: "Absolute path to the file" },
        },
        required: ["path"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "write_file",
      description: "Create or overwrite a file",
      parameters: {
        type: "object",
        properties: {
          path: { type: "string", description: "Absolute path to the file" },
          content: { type: "string", description: "The content to write" },
        },
        required: ["path", "content"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "list_directory",
      description: "List files and directories in a given path",
      parameters: {
        type: "object",
        properties: {
          path: { type: "string", description: "Absolute directory path" },
        },
        required: ["path"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "run_command",
      description: "Execute a shell command and return its output",
      parameters: {
        type: "object",
        properties: {
          command: { type: "string", description: "The shell command to run" },
          cwd: { type: "string", description: "Working directory" },
        },
        required: ["command"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "search_files",
      description: "Search for files matching a glob pattern",
      parameters: {
        type: "object",
        properties: {
          pattern: { type: "string", description: "Glob pattern (e.g. **/*.ts)" },
          path: { type: "string", description: "Directory to search in" },
        },
        required: ["pattern"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "search_content",
      description: "Search for text/pattern in files",
      parameters: {
        type: "object",
        properties: {
          pattern: { type: "string", description: "Text or regex pattern" },
          path: { type: "string", description: "Directory to search in" },
        },
        required: ["pattern"],
      },
    },
  },
];

// ─── Native glob ────────────────────────────────────────────

function nativeGlob(pattern: string, cwd: string): string[] {
  const results: string[] = [];
  const parts = pattern.replace(/\\/g, "/").split("/");

  function walk(dir: string, depth: number): void {
    if (depth >= parts.length) {
      try {
        const rel = relative(cwd, dir).replace(/\\/g, "/");
        if (rel) results.push(rel);
      } catch {}
      return;
    }

    const segment = parts[depth];

    if (segment === "**") {
      try {
        const entries = readdirSync(dir, { withFileTypes: true });
        for (const entry of entries) {
          if (entry.isDirectory()) {
            const fullPath = join(dir, entry.name);
            walk(fullPath, depth + 1);
            walk(fullPath, depth);
          }
        }
        walk(dir, depth + 1);
      } catch {}
      return;
    }

    try {
      const entries = readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        if (matchSegment(entry.name, segment)) {
          const fullPath = join(dir, entry.name);
          if (depth === parts.length - 1) {
            if (entry.isFile()) {
              const rel = relative(cwd, fullPath).replace(/\\/g, "/");
              results.push(rel);
            }
          } else if (entry.isDirectory()) {
            walk(fullPath, depth + 1);
          }
        }
      }
    } catch {}
  }

  walk(cwd, 0);
  return results;
}

function matchSegment(name: string, pattern: string): boolean {
  const regex = new RegExp(
    "^" + pattern.replace(/\./g, "\\.").replace(/\*/g, ".*").replace(/\?/g, ".") + "$"
  );
  return regex.test(name);
}

// ─── Context compression helpers ─────────────────────────────

function estimateTokens(text: string): number {
  let chinese = 0;
  let other = 0;
  for (const ch of text) {
    if (/[一-鿿]/.test(ch)) {
      chinese++;
    } else {
      other++;
    }
  }
  // ~2 chars per token for Chinese, ~4 chars per token for English/mixed
  return Math.ceil(chinese / 2 + other / 4);
}

function estimateMessagesTokens(
  msgs: Array<Record<string, unknown>>
): number {
  let total = 0;
  for (const m of msgs) {
    total += estimateTokens(JSON.stringify(m));
  }
  return total;
}

async function summarizeConversation(
  oldMessages: Array<Record<string, unknown>>,
  modelId: string,
  apiKey: string,
  baseUrl: string,
  sessionId: string,
  apiTimeoutMs: number
): Promise<string | null> {
  const log2 = createLogger("compression");
  const conversationText = oldMessages
    .map((m) => {
      const content =
        typeof m.content === "string" ? m.content : JSON.stringify(m.content);
      return `[${m.role}]: ${content}`;
    })
    .join("\n\n");

  const summaryPrompt = `Please summarize the following conversation history concisely. Preserve:
- Key decisions and their rationale
- Code changes and their purpose
- Important conclusions and findings
- Any incomplete work still in progress

<conversation>
${conversationText}
</conversation>

Provide a compact summary (no more than 300 words). Only output the summary, no preamble.`;

  const body = {
    model: modelId,
    messages: [{ role: "user", content: summaryPrompt }],
    stream: false,
  };

  const res = await fetch(`${baseUrl.replace(/\/$/, "")}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(apiTimeoutMs),
  });

  if (!res.ok) {
    log2.warn(
      { status: res.status, sessionId },
      "Summarization API call failed"
    );
    return null;
  }

  const data = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const summary = data.choices?.[0]?.message?.content;
  if (summary) {
    log2.info(
      { sessionId, summaryLen: summary.length, oldMsgCount: oldMessages.length },
      "Conversation summarized"
    );
  }
  return summary || null;
}

// ─── Tool execution ─────────────────────────────────────────

import { readFileSync, writeFileSync, existsSync, readdirSync, statSync } from "fs";
import { execSync } from "child_process";
import { resolve, relative, join, basename } from "path";

async function executeTool(
  name: string,
  args: Record<string, unknown>,
  cwd: string
): Promise<string> {
  const baseDir = resolve(cwd || process.cwd());

  try {
    switch (name) {
      case "read_file": {
        const filePath = resolve(baseDir, String(args.path));
        if (!existsSync(filePath)) return `Error: File not found: ${args.path}`;
        const content = readFileSync(filePath, "utf-8");
        return content;
      }

      case "write_file": {
        const filePath = resolve(baseDir, String(args.path));
        writeFileSync(filePath, String(args.content), "utf-8");
        return `File written: ${relative(baseDir, filePath)}`;
      }

      case "list_directory": {
        const dirPath = resolve(baseDir, String(args.path || "."));
        if (!existsSync(dirPath)) return `Error: Directory not found: ${args.path}`;
        const entries = readdirSync(dirPath).map((name) => {
          const stats = statSync(resolve(dirPath, name));
          return `${stats.isDirectory() ? "📁" : "📄"} ${name}`;
        });
        return entries.join("\n") || "(empty)";
      }

      case "run_command": {
        const cmd = String(args.command);
        const workDir = args.cwd ? resolve(baseDir, String(args.cwd)) : baseDir;
        const result = execSync(cmd, { cwd: workDir, timeout: 60000, encoding: "utf-8" });
        return result;
      }

      case "search_files": {
        const pat = String(args.pattern);
        const searchDir = args.path ? resolve(baseDir, String(args.path)) : baseDir;
        const files = nativeGlob(pat, searchDir);
        return files.length > 0 ? files.join("\n") : "No files found";
      }

      case "search_content": {
        const pattern = String(args.pattern);
        const searchDir = args.path ? resolve(baseDir, String(args.path)) : baseDir;
        const result = execSync(
          `rg --line-number --max-count=5 "${pattern}" "${searchDir}"`,
          { cwd: baseDir, timeout: 30000, encoding: "utf-8" }
        );
        return result || "No matches found";
      }

      default:
        return `Unknown tool: ${name}`;
    }
  } catch (err) {
    return `Error: ${err instanceof Error ? err.message : String(err)}`;
  }
}

// ─── Streaming OpenAI API call ──────────────────────────────

interface StreamResult {
  content: string | null;
  toolCalls: Array<{ id: string; name: string; arguments: string }>;
  usage?: { input_tokens: number; output_tokens: number };
}

async function streamChatCompletion(
  messages: Array<Record<string, unknown>>,
  model: ProviderModel,
  apiKey: string,
  baseUrl: string,
  tools: typeof BUILTIN_TOOLS | undefined,
  streamTimeoutMs: number,
  streamChunkTimeoutMs: number,
  onTextDelta: (text: string) => void,
  onUsage?: (usage: { input_tokens: number; output_tokens: number }) => void
): Promise<StreamResult> {
  const body: Record<string, unknown> = {
    model: model.id,
    messages,
    stream: true,
    stream_options: { include_usage: true },
  };

  if (tools) {
    body.tools = tools;
    body.tool_choice = "auto";
  }

  const url = `${baseUrl.replace(/\/$/, "")}/chat/completions`;

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(streamTimeoutMs),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`OpenAI API error ${res.status}: ${text}`);
  }

  if (!res.body) {
    throw new Error("Streaming not supported by this provider");
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let contentResult = "";
  const toolCallsAcc = new Map<number, { id: string; name: string; arguments: string }>();
  let usageResult: { input_tokens: number; output_tokens: number } | undefined;
  let lastChunkTime = Date.now();

  // Stream-level timeout: if no chunk arrives within limit, abort

  while (true) {
    const readResult = await Promise.race([
      reader.read(),
      new Promise<never>((_, reject) =>
        setTimeout(
          () => reject(new Error(`Stream read timeout: no data for ${streamChunkTimeoutMs / 1000}s`)),
          streamChunkTimeoutMs
        )
      ),
    ]);
    const { done, value } = readResult;
    if (done) break;
    lastChunkTime = Date.now();

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    // Keep the last incomplete line in the buffer
    buffer = lines.pop() || "";

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || !trimmed.startsWith("data: ")) continue;

      const dataStr = trimmed.slice(6); // Remove "data: "
      if (dataStr === "[DONE]") continue;

      try {
        const chunk = JSON.parse(dataStr);
        const choices = chunk.choices;
        if (!choices || choices.length === 0) continue;

        const delta = choices[0].delta;
        if (!delta) continue;

        // ── Text content ────────────────────────
        if (delta.content) {
          contentResult += delta.content;
          onTextDelta(delta.content);
        }

        // ── Tool calls (accumulate across chunks) ─
        if (delta.tool_calls) {
          for (const tc of delta.tool_calls) {
            const idx: number = tc.index ?? 0;
            if (!toolCallsAcc.has(idx)) {
              toolCallsAcc.set(idx, { id: tc.id || "", name: "", arguments: "" });
            }
            const acc = toolCallsAcc.get(idx)!;
            if (tc.id) acc.id = tc.id;
            if (tc.function?.name) acc.name += tc.function.name;
            if (tc.function?.arguments) acc.arguments += tc.function.arguments;
          }
        }

        // ── Usage (may appear in intermediate or final chunk) ─
        if (chunk.usage) {
          const u = {
            input_tokens: chunk.usage.prompt_tokens || 0,
            output_tokens: chunk.usage.completion_tokens || 0,
          };
          usageResult = u;
          onUsage?.(u);
        }
      } catch {
        // Skip malformed JSON chunks
      }
    }
  }

  // Also send the assembled content as a final assistant_complete
  // so the frontend can finalize the streaming message
  // (We already streamed all deltas, so this is just for completeness)

  return {
    content: contentResult || null,
    toolCalls: Array.from(toolCallsAcc.values()).filter((tc) => tc.name),
    usage: usageResult,
  };
}

// ─── Public API ────────────────────────────────────────────

export async function runOpenAIAgent(
  prompt: string,
  send: SendFn,
  options: OpenAIOptions
): Promise<void> {
  const { sessionId, model, apiKey, baseUrl, cwd } = options;
  const MAX_TURNS = options.maxTurns ?? 30;

  log.info({ sessionId, model: model.id }, "Starting OpenAI agent (streaming)");

  send({ type: "turn_start", payload: { sessionId } });

  // ── Build conversation history from persisted session ────
  let messages: Array<Record<string, unknown>> = [
    {
      role: "system",
      content: options.systemPrompt ||
        `You are an AI coding assistant. You help with software engineering tasks.
You have access to tools: read_file, write_file, list_directory, run_command, search_files, search_content.
Current working directory: ${cwd || process.cwd()}.
Be thorough and helpful. When you need information, use the tools available.`,
    },
  ];

  // Load previous messages from the persisted session for multi-turn context.
  // NOTE: OpenAI-compatible APIs don't have server-side sessions — we must
  // rebuild the full conversation history from our session store every turn.
  // The messageRouter has already saved the current user message to the session,
  // so we skip the very last message (it's the prompt we're sending now).
  try {
    const session = getSession(sessionId);
    if (session?.messages && session.messages.length > 0) {
      // Skip the last message — it's the current user prompt (already saved by messageRouter)
      // Also skip streaming drafts (__draft__*) which can have incomplete tool calls
      const historyMsgs = session.messages
        .slice(0, -1)
        .filter((m) => !m.id.startsWith("__draft__"));
      const seenToolCallIds = new Set<string>();

      for (const msg of historyMsgs) {
        if (msg.role === "user") {
          messages.push({ role: "user", content: msg.content });
        } else if (msg.role === "assistant") {
          // Only include tool calls that have actually completed (have output)
          const completeCalls = (msg.toolCalls || []).filter(
            (tc) => tc.status !== "running" && tc.output != null
          );
          // Deduplicate against previously seen IDs
          const uniqueCalls = completeCalls.filter((tc) => {
            if (seenToolCallIds.has(tc.toolUseId)) return false;
            seenToolCallIds.add(tc.toolUseId);
            return true;
          });

          const assistantEntry: Record<string, unknown> = {
            role: "assistant",
            content: msg.content || null,
          };
          if (uniqueCalls.length > 0) {
            assistantEntry.tool_calls = uniqueCalls.map((tc) => ({
              id: tc.toolUseId,
              type: "function",
              function: {
                name: tc.toolName,
                arguments: JSON.stringify(tc.input),
              },
            }));
          }
          messages.push(assistantEntry);

          // Push tool result ONLY for calls actually included in this assistant message
          for (const tc of uniqueCalls) {
            messages.push({
              role: "tool",
              tool_call_id: tc.toolUseId,
              content: tc.output || "",
            });
          }
        }
      }
      log.info(
        { sessionId, historyMessages: messages.length, totalStored: session.messages.length },
        "Loaded conversation history from session"
      );
    }
  } catch (err) {
    log.warn({ err, sessionId }, "Failed to load session history, starting fresh");
  }

  // Add the current user prompt
  messages.push({ role: "user", content: prompt });

  // ── Context compression ────────────────────────────────────
  // Skip if explicitly disabled (default: enabled)
  if (options.compressionEnabled === false) {
    log.debug({ sessionId }, "Context compression disabled by user setting");
  } else {
    const contextWindow =
      (options.compressionContextWindow && options.compressionContextWindow > 0)
        ? options.compressionContextWindow
        : (model as unknown as Record<string, unknown>).contextWindow as number || 128_000;
    const thresholdPercent = options.compressionThreshold ?? 75; // percentage
    const threshold = thresholdPercent / 100;
    const keepRecent = options.compressionKeepRecent ?? 8;

    const estimatedTokens = estimateMessagesTokens(messages);
    if (estimatedTokens > contextWindow * threshold) {
      log.info(
        { sessionId, estimatedTokens, threshold: Math.floor(contextWindow * threshold), thresholdPercent, keepRecent },
        "Context compression triggered"
      );
        try {
          // Split: summarize oldest messages, keep recent ones + system prompt
          const recentStart = Math.max(1, messages.length - keepRecent);
          const oldMessages = messages.slice(1, recentStart);
          const recentMessages = messages.slice(recentStart);

          const summary = await summarizeConversation(
            oldMessages, model.id, apiKey, baseUrl, sessionId,
            options.apiTimeoutMs ?? 60_000
          );

          if (summary) {
            messages = [
              messages[0],
              { role: "user", content: `[Previous conversation summary — key context]\n${summary}` },
              { role: "assistant", content: "Understood. I'll continue with this context." },
              ...recentMessages.filter((m) => m.role !== "system"),
            ];
            log.info(
              { sessionId, compressedTo: messages.length, summaryLen: summary.length },
              "Context compressed successfully"
            );
          }
        } catch (err) {
          log.warn({ err, sessionId }, "Context compression failed, continuing uncompressed");
        }
      }
    }

  // ── Helper: periodically save streaming draft to session ─────
  const DRAFT_SAVE_INTERVAL_MS = 2000;
  let draftSaveTimer: ReturnType<typeof setInterval> | null = null;
  let draftContent = "";
  let draftToolCalls: Array<{ toolUseId: string; toolName: string; input: Record<string, unknown>; status: "pending" | "running" | "complete" | "error"; isError: boolean }> = [];

  const saveStreamingDraft = () => {
    try {
      const s = getSession(sessionId);
      if (!s) return;
      s.messages = s.messages.filter((m) => m.id !== `__draft__${sessionId}`);
      if (draftContent.trim() || draftToolCalls.length > 0) {
        const draftMsg: ChatMessage = {
          id: `__draft__${sessionId}`,
          role: "assistant",
          content: draftContent.trim(),
          isStreaming: true,
          timestamp: Date.now(),
        };
        if (draftToolCalls.length > 0) draftMsg.toolCalls = [...draftToolCalls];
        s.messages.push(draftMsg);
      }
      saveSession(s);
    } catch {
      // Non-critical
    }
  };

  draftSaveTimer = setInterval(saveStreamingDraft, DRAFT_SAVE_INTERVAL_MS);

  let totalInputTokens = 0;
  let totalOutputTokens = 0;
  let turnCount = 0;

  try {
    while (turnCount < MAX_TURNS) {
      turnCount++;

      // ── Streaming API call ──────────────────────
      draftContent = "";
      draftToolCalls = [];
      const result = await streamChatCompletion(
        messages,
        model,
        apiKey,
        baseUrl,
        BUILTIN_TOOLS,
        options.streamTimeoutMs ?? 120_000,
        options.streamChunkTimeoutMs ?? 90_000,
        (text) => {
          // Stream each text chunk to the frontend in real time
          send({ type: "text_delta", payload: { sessionId, text } });
          draftContent += text;
        },
        (usage) => {
          // Send real-time token usage to the frontend
          if (usage.input_tokens > 0 || usage.output_tokens > 0) {
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
          }
        }
      );

      if (result.usage) {
        totalInputTokens += result.usage.input_tokens;
        totalOutputTokens += result.usage.output_tokens;
      }

      // ── Build assistant message for API history ──
      const assistantMsg: Record<string, unknown> = {
        role: "assistant",
        content: result.content || null,
      };
      if (result.toolCalls && result.toolCalls.length > 0) {
        assistantMsg.tool_calls = result.toolCalls.map((tc) => ({
          id: tc.id,
          type: "function",
          function: {
            name: tc.name,
            arguments: tc.arguments,
          },
        }));
      }
      messages.push(assistantMsg);

      // ── Handle tool calls ───────────────────────
      if (result.toolCalls && result.toolCalls.length > 0) {
        for (const tc of result.toolCalls) {
          const input = JSON.parse(tc.arguments || "{}");

          // ── Permission check ──────────────────
          const perm = await checkPermission(tc.name, input, sessionId, send, options);
          if (perm.behavior === "deny") {
            send({
              type: "tool_start",
              payload: { sessionId, toolName: tc.name, toolUseId: tc.id, input },
            });
            send({
              type: "tool_result",
              payload: {
                sessionId,
                toolUseId: tc.id,
                output: "Permission denied by user",
                outputType: "text",
                isError: true,
                durationMs: 0,
              },
            });
            messages.push({
              role: "tool",
              tool_call_id: tc.id,
              content: "Permission denied by user",
            });
            continue;
          }

          draftToolCalls.push({
            toolUseId: tc.id,
            toolName: tc.name,
            input,
            status: "running",
            isError: false,
          });

          send({
            type: "tool_start",
            payload: {
              sessionId,
              toolName: tc.name,
              toolUseId: tc.id,
              input,
            },
          });

          const toolStart = Date.now();
          const output = await executeTool(tc.name, input, cwd || process.cwd());
          const durationMs = Date.now() - toolStart;

          // Update draft tool call
          const dtc = draftToolCalls.find((d) => d.toolUseId === tc.id);
          if (dtc) {
            dtc.status = output.startsWith("Error:") ? "error" : "complete";
            dtc.isError = output.startsWith("Error:");
          }

          send({
            type: "tool_result",
            payload: {
              sessionId,
              toolUseId: tc.id,
              output,
              outputType: tc.name === "run_command" ? "terminal" : "text",
              isError: output.startsWith("Error:"),
              durationMs,
            },
          });

          messages.push({
            role: "tool",
            tool_call_id: tc.id,
            content: output,
          });
        }

        continue; // Loop to get next assistant response
      }

      // No tool calls — conversation complete
      break;
    }

    // Calculate cost
    const costUSD =
      model.inputCostPer1M != null && model.outputCostPer1M != null
        ? (totalInputTokens / 1_000_000) * model.inputCostPer1M +
          (totalOutputTokens / 1_000_000) * model.outputCostPer1M
        : 0;

    send({
      type: "turn_result",
      payload: {
        sessionId,
        result: {
          subtype: "success",
          durationMs: 0,
          totalTokens: totalInputTokens + totalOutputTokens,
          inputTokens: totalInputTokens,
          outputTokens: totalOutputTokens,
          costUSD,
        },
      },
    });

    // ── Persist session to disk ──────────────────
    // Stop draft saves BEFORE saving the final message to prevent a race
    // where the timer fires between save and clearInterval, adding a stale draft.
    if (draftSaveTimer) { clearInterval(draftSaveTimer); draftSaveTimer = null; }
    try {
      const s = getSession(sessionId);
      if (s) {
        // Remove any streaming draft
        s.messages = s.messages.filter((m) => m.id !== `__draft__${sessionId}`);
        // Merge all assistant messages from the conversation history
        // into ONE combined ChatMessage (like the Anthropic agent does).
        let combinedContent = "";
        const combinedToolCalls: ChatMessage["toolCalls"] = [];
        for (let i = 1; i < messages.length; i++) {
          const m = messages[i];
          if (m.role !== "assistant") continue;
          const text = typeof m.content === "string" ? m.content : "";
          if (text) combinedContent = text; // Use the last assistant text content
          if (Array.isArray(m.tool_calls) && m.tool_calls.length > 0) {
            const mapped = (m.tool_calls as Array<Record<string, unknown>>).map((tc) => ({
              toolUseId: (tc.id as string) || "",
              toolName: (tc.function as Record<string, unknown>)?.name as string || "unknown",
              input: JSON.parse(((tc.function as Record<string, unknown>)?.arguments as string) || "{}"),
              status: "complete" as const,
              isError: false,
            }));
            combinedToolCalls.push(...mapped);
          }
        }
        const assistantMsg: ChatMessage = {
          id: `msg_${Date.now()}_assistant`,
          role: "assistant",
          content: combinedContent,
          isStreaming: false,
          timestamp: Date.now(),
        };
        if (combinedToolCalls.length > 0) {
          assistantMsg.toolCalls = combinedToolCalls;
        }
        s.messages.push(assistantMsg);
        s.lastActiveAt = Date.now();
        s.messageCount = s.messages.filter((m) => m.role === "user" || m.role === "assistant").length;
        s.totalTokens = (s.totalTokens || 0) + totalInputTokens + totalOutputTokens;
        s.totalCostUSD = (s.totalCostUSD || 0) + costUSD;
        saveSession(s);
      }
    } catch (err) {
      log.error({ err, sessionId }, "Session save error (non-fatal)");
    }
    if (draftSaveTimer) { clearInterval(draftSaveTimer); draftSaveTimer = null; }
  } catch (error) {
    if (draftSaveTimer) { clearInterval(draftSaveTimer); draftSaveTimer = null; }
    const msg = error instanceof Error ? error.message : String(error);
    log.error({ sessionId, error: msg }, "OpenAI agent failed");

    send({
      type: "error",
      payload: { sessionId, message: msg, code: "OPENAI_ERROR" },
    });

    send({
      type: "turn_result",
      payload: {
        sessionId,
        result: {
          subtype: "error",
          durationMs: 0,
          totalTokens: totalInputTokens + totalOutputTokens,
          inputTokens: totalInputTokens,
          outputTokens: totalOutputTokens,
          costUSD: 0,
        },
      },
    });
  }
}

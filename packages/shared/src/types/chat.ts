// Core chat types shared between frontend and backend

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  toolCalls?: ToolCall[];
  thinking?: string;
  isStreaming: boolean;
  timestamp: number;
  sources?: Citation[];
}

export interface ToolCall {
  toolUseId: string;
  toolName: string;
  input: Record<string, unknown>;
  output?: string;
  outputType?: "text" | "diff" | "file" | "terminal" | "json";
  isError: boolean;
  status: "pending" | "running" | "complete" | "error";
  durationMs?: number;
  startedAt?: number;
}

export interface Citation {
  url: string;
  title: string;
  snippet?: string;
}

export interface TurnResult {
  subtype: "success" | "error_max_turns" | "error_tool_use" | "interrupted" | "error";
  durationMs: number;
  totalTokens: number;
  inputTokens: number;
  outputTokens: number;
  cacheCreationInputTokens?: number;
  cacheReadInputTokens?: number;
  costUSD: number;
}

export type PermissionMode = "default" | "acceptEdits" | "bypassPermissions" | "plan";

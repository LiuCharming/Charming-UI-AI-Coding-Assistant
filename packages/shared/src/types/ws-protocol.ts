// WebSocket protocol message types

import type { ChatMessage, ToolCall, TurnResult, Citation } from "./chat";

// ─── Client → Server ───────────────────────────────────────

export interface PromptPayload {
  text: string;
  sessionId?: string;
  cwd?: string;
  projectId?: string;
  providerId?: string;
  modelId?: string;
  attachedFiles?: AttachedFile[];
  images?: AttachedImage[];
  /** If set, truncate session messages after this message ID before sending */
  editFromMessageId?: string;
}

export interface AttachedFile {
  path: string;
  content?: string;
}

export interface AttachedImage {
  data: string;   // base64
  mediaType: string;
}

export interface PermissionResponsePayload {
  requestId: string;
  approved: boolean;
  remember?: "session" | "project" | "user";
}

export interface SetModelPayload {
  model: string;
}

export interface SetPermissionModePayload {
  mode: "default" | "acceptEdits" | "bypassPermissions" | "plan";
}

export interface TerminalStartPayload {
  sessionId: string;
  cwd: string;
  shell?: string;
  condaEnv?: string;
}

export type ClientMessage =
  | { type: "prompt"; payload: PromptPayload }
  | { type: "permission_response"; payload: PermissionResponsePayload }
  | { type: "interrupt" }
  | { type: "regenerate"; payload: { sessionId: string } }
  | { type: "fork_session"; payload: { sessionId: string; messageId: string } }
  | { type: "set_model"; payload: SetModelPayload }
  | { type: "set_permission_mode"; payload: SetPermissionModePayload }
  | { type: "terminal_start"; payload: TerminalStartPayload }
  | { type: "terminal_stop" }
  | { type: "terminal_input"; payload: { data: string } }
  | { type: "terminal_resize"; payload: { cols: number; rows: number } };

// ─── Server → Client ───────────────────────────────────────

export interface TextDeltaPayload {
  sessionId: string;
  text: string;
}

export interface ThinkingDeltaPayload {
  sessionId: string;
  text: string;
}

export interface ToolStartPayload {
  sessionId: string;
  toolName: string;
  toolUseId: string;
  input: Record<string, unknown>;
}

export interface ToolResultPayload {
  sessionId: string;
  toolUseId: string;
  output: string;
  outputType: "text" | "diff" | "file" | "terminal" | "json";
  isError: boolean;
  durationMs: number;
}

export interface PermissionRequestPayload {
  sessionId: string;
  requestId: string;
  toolName: string;
  toolInput: Record<string, unknown>;
  toolDescription?: string;
  reason: string;
}

export interface SessionUpdatePayload {
  sessionId: string;
  title?: string;
  cost?: {
    input: number;
    output: number;
    total: number;
  };
}

export interface AssistantCompletePayload {
  sessionId: string;
  message: ChatMessage;
}

export interface McpStatusPayload {
  serverName: string;
  status: "connected" | "failed" | "needs-auth" | "pending";
  error?: string;
}

export interface ErrorPayload {
  sessionId?: string;
  message: string;
  code: string;
}

export interface TurnResultPayload {
  sessionId: string;
  result: TurnResult;
}

export interface SourcesPayload {
  sessionId: string;
  sources: Citation[];
}

export type ServerMessage =
  | { type: "text_delta"; payload: TextDeltaPayload }
  | { type: "thinking_delta"; payload: ThinkingDeltaPayload }
  | { type: "thinking_start"; payload: { sessionId: string } }
  | { type: "thinking_end"; payload: { sessionId: string } }
  | { type: "tool_start"; payload: ToolStartPayload }
  | { type: "tool_result"; payload: ToolResultPayload }
  | { type: "permission_request"; payload: PermissionRequestPayload }
  | { type: "assistant_complete"; payload: AssistantCompletePayload }
  | { type: "session_update"; payload: SessionUpdatePayload }
  | { type: "mcp_status"; payload: McpStatusPayload }
  | { type: "turn_result"; payload: TurnResultPayload }
  | { type: "sources"; payload: SourcesPayload }
  | { type: "error"; payload: ErrorPayload }
  | { type: "turn_start"; payload: { sessionId: string } }
  | { type: "sdk_session_init"; payload: { sessionId: string; sdkSessionId: string } }
  | { type: "fork_complete"; payload: { originalSessionId: string; newSessionId: string } }
  | { type: "system"; payload: { sessionId: string; message: string } }
  | { type: "terminal_output"; payload: { data: string } }
  | { type: "terminal_exit"; payload: { exitCode: number } };

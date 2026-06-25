// Project management types

export interface SSHConnectionConfig {
  host: string;
  port: number;
  username: string;
  /** One of these must be set */
  password?: string;
  privateKey?: string;
  /** Absolute path on the remote machine */
  remotePath: string;
}

export interface ProjectMeta {
  id: string;
  name: string;
  path: string;           // absolute working directory
  description?: string;
  createdAt: number;
  lastOpenedAt: number;
  sessionCount: number;
  tags?: string[];
  /** Connection type — local filesystem or remote via SSH */
  connectionType?: "local" | "ssh";
  /** SSH connection config (only for connectionType === "ssh") */
  sshConfig?: SSHConnectionConfig;
}

export interface ProjectListResponse {
  projects: ProjectMeta[];
}

// Session management types

export interface SessionMeta {
  id: string;
  title: string;
  cwd: string;
  projectId?: string;     // parent project
  createdAt: number;
  lastActiveAt: number;
  messageCount: number;
  totalTokens?: number;
  totalCostUSD?: number;
  tags?: string[];
  /** SDK's internal session UUID for multi-turn resume */
  sdkSessionId?: string;
  /** If this session was forked from another, the source session ID */
  forkedFrom?: string;
}

export interface SessionDetail extends SessionMeta {
  messages: import("./chat").ChatMessage[];
  /** SDK's internal session UUID — used to resume multi-turn conversations */
  sdkSessionId?: string;
}

export interface SessionListResponse {
  sessions: SessionMeta[];
  total: number;
}

// Full-text search types

export interface SearchMatch {
  sessionId: string;
  sessionTitle: string;
  messageIndex: number;
  role: "user" | "assistant";
  /** Where the match was found — content, thinking, or tool input/output */
  field: "content" | "thinking" | "toolName" | "toolInput" | "toolOutput";
  /** ~100 chars around the match position, with the match itself */
  snippet: string;
}

export interface SearchResult {
  sessionId: string;
  sessionTitle: string;
  cwd: string;
  lastActiveAt: number;
  matches: SearchMatch[];
  matchCount: number;
}

export interface SearchResponse {
  query: string;
  results: SearchResult[];
  totalMatches: number;
}

// User settings types

export type Theme = "dark" | "light" | "system";

// ─── Provider / Model types ────────────────────────────────

export type ProviderType = "anthropic" | "openai_compatible";

export interface ProviderConfig {
  id: string;
  name: string;
  type: ProviderType;
  apiKey: string;           // stored encrypted/masked
  baseUrl?: string;         // custom endpoint (e.g. gateway, proxy, OpenRouter)
  models: ProviderModel[];
  enabled: boolean;
  isDefault: boolean;
}

export interface ProviderModel {
  id: string;               // model ID (e.g. "claude-sonnet-4-5-20250929", "gpt-4o")
  name: string;             // display name (e.g. "Claude Sonnet 4.5")
  providerId: string;
  maxTokens?: number;
  contextWindow?: number;   // max context window in tokens (default 128K)
  supportsThinking?: boolean;
  supportsVision?: boolean;
  inputCostPer1M?: number;  // USD per 1M input tokens
  outputCostPer1M?: number;
}

export const BUILTIN_PROVIDERS: ProviderConfig[] = [
  {
    id: "anthropic",
    name: "Anthropic",
    type: "anthropic",
    apiKey: "",
    baseUrl: "https://api.anthropic.com",
    enabled: true,
    isDefault: true,
    models: [
      { id: "claude-sonnet-4-5-20250929", name: "Claude Sonnet 4.5", providerId: "anthropic", maxTokens: 200000, contextWindow: 200_000, supportsThinking: true, supportsVision: true, inputCostPer1M: 3, outputCostPer1M: 15 },
      { id: "claude-opus-4-8-20251101", name: "Claude Opus 4.8", providerId: "anthropic", maxTokens: 200000, contextWindow: 200_000, supportsThinking: true, supportsVision: true, inputCostPer1M: 15, outputCostPer1M: 75 },
      { id: "claude-haiku-4-5-20251001", name: "Claude Haiku 4.5", providerId: "anthropic", maxTokens: 200000, contextWindow: 200_000, supportsThinking: false, supportsVision: true, inputCostPer1M: 0.8, outputCostPer1M: 4 },
      { id: "claude-fable-5-20250929", name: "Claude Fable 5", providerId: "anthropic", maxTokens: 200000, contextWindow: 200_000, supportsThinking: true, supportsVision: true, inputCostPer1M: 3, outputCostPer1M: 15 },
    ],
  },
  {
    id: "openai",
    name: "OpenAI / Compatible",
    type: "openai_compatible",
    apiKey: "",
    baseUrl: "https://api.openai.com/v1",
    enabled: true,
    isDefault: false,
    models: [
      { id: "gpt-4o", name: "GPT-4o", providerId: "openai", maxTokens: 128000, contextWindow: 128_000, supportsThinking: false, supportsVision: true, inputCostPer1M: 2.5, outputCostPer1M: 10 },
      { id: "gpt-4o-mini", name: "GPT-4o Mini", providerId: "openai", maxTokens: 128000, contextWindow: 128_000, supportsThinking: false, supportsVision: true, inputCostPer1M: 0.15, outputCostPer1M: 0.6 },
    ],
  },
];

// ─── MCP ───────────────────────────────────────────────────

export interface McpServerConfig {
  name: string;
  transport: "stdio" | "http" | "sse" | "websocket";
  command?: string;
  args?: string[];
  url?: string;
  env?: Record<string, string>;
  headers?: Record<string, string>;
  enabled: boolean;
  tools?: McpToolInfo[];
  status?: "connected" | "failed" | "needs-auth" | "pending" | "disconnected";
}

export interface McpToolInfo {
  name: string;
  description?: string;
  inputSchema?: Record<string, unknown>;
}

export interface PermissionRule {
  id: string;
  toolPattern: string;       // glob or regex pattern for tool name
  pathPattern?: string;      // optional: only match when tool targets this path
  action: "allow" | "deny" | "ask";
  scope: "session" | "project" | "user";
}

export interface UserSettings {
  theme: Theme;
  defaultModel: string;
  defaultProvider: string;         // provider ID
  defaultPermissionMode: import("./chat").PermissionMode;
  defaultEffort: "low" | "medium" | "high";
  maxThinkingTokens?: number;
  providers: ProviderConfig[];
  mcpServers: Record<string, McpServerConfig>;
  permissionRules: PermissionRule[];
  spendingLimitUSD: number | null;
  systemPrompt?: string;
  autoApproveTools: string[];
  fontSize: number;
  sendWithEnter: boolean;
  showThinking: boolean;

  // Context compression
  compressionEnabled: boolean;
  compressionContextWindow: number;  // override context window size in tokens (0 = use model default)
  compressionThreshold: number;      // percentage of context window (e.g. 75 = 75%)
  compressionKeepRecent: number;     // keep N most recent messages uncompressed
}

import { useState, useEffect, useRef, useCallback } from "react";
import { X, Shield, Server, Palette, Cpu, Plus, RefreshCw, Wallet } from "lucide-react";
import { ThemeToggle } from "./ThemeToggle";
import { cn } from "@/lib/cn";
import { useI18n, SUPPORTED_LOCALES } from "@/i18n";
import { rest } from "@/api/restClient";
import type { ProviderConfig, UserSettings, McpServerConfig } from "@cgui/shared";

interface SettingsDialogProps {
  isOpen: boolean;
  onClose: () => void;
}

type Tab = "general" | "permissions" | "mcp" | "providers";

export function SettingsDialog({ isOpen, onClose }: SettingsDialogProps) {
  const { t, locale, setLocale } = useI18n();
  const [activeTab, setActiveTab] = useState<Tab>("general");
  const [settings, setSettings] = useState<UserSettings | null>(null);
  const [saving, setSaving] = useState(false);
  const [fetchingProvider, setFetchingProvider] = useState<string | null>(null);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [checkingBalance, setCheckingBalance] = useState<string | null>(null);
  const [balanceError, setBalanceError] = useState<string | null>(null);
  const [providerBalances, setProviderBalances] = useState<Record<string, {
    isAvailable: boolean;
    balances: Array<{ currency: string; totalBalance: number; grantedBalance: number; toppedUpBalance: number }>;
  } | null>>({});

  // ── MCP form state ──
  const [mcpFormOpen, setMcpFormOpen] = useState(false);
  const [editingMcp, setEditingMcp] = useState<string | null>(null); // server name being edited
  const [mcpForm, setMcpForm] = useState<McpServerConfig>({
    name: "",
    transport: "stdio",
    command: "",
    args: [],
    url: "",
    env: {},
    headers: {},
    enabled: true,
  });
  const [mcpEnvText, setMcpEnvText] = useState("");    // KEY=VALUE per line
  const [mcpHeadersText, setMcpHeadersText] = useState(""); // KEY: VALUE per line
  const [mcpArgsText, setMcpArgsText] = useState("");  // one arg per line
  const [addingProvider, setAddingProvider] = useState(false);
  const [newProviderType, setNewProviderType] = useState<ProviderConfig["type"]>("openai_compatible");

  // ── System prompt: local state + debounced save ──
  const [systemPromptDraft, setSystemPromptDraft] = useState("");
  const systemPromptTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Sync draft from loaded settings
  useEffect(() => {
    if (settings) {
      setSystemPromptDraft(settings.systemPrompt || "");
    }
  }, [settings?.systemPrompt]);

  useEffect(() => {
    if (isOpen) {
      rest.get<UserSettings>("/settings").then(setSettings).catch(() => {});
    }
  }, [isOpen]);

  const debouncedSaveSystemPrompt = useCallback(
    (value: string) => {
      setSystemPromptDraft(value);
      if (systemPromptTimer.current) clearTimeout(systemPromptTimer.current);
      systemPromptTimer.current = setTimeout(() => {
        saveSettings({ systemPrompt: value });
      }, 400);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [settings]
  );

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const tabs: { id: Tab; label: string; icon: React.ComponentType<any> }[] = [
    { id: "general", label: t("settings.general"), icon: Palette },
    { id: "providers", label: t("settings.providers"), icon: Cpu },
    { id: "permissions", label: t("settings.permissions"), icon: Shield },
    { id: "mcp", label: t("settings.mcpServers"), icon: Server },
  ];

  const saveSettings = async (updates: Partial<UserSettings>) => {
    if (!settings) return;
    setSaving(true);
    const merged = { ...settings, ...updates };
    try {
      await rest.put("/settings", merged);
      setSettings(merged);
    } catch {
      // non-critical — data is in local state
    } finally {
      setSaving(false);
    }
  };

  // Debounced save for provider fields
  const settingsRef = useRef(settings);
  settingsRef.current = settings;
  const providerSaveTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  const debouncedSaveProviderField = (index: number, field: string, value: unknown) => {
    const key = `${index}-${field}`;
    if (providerSaveTimers.current[key]) {
      clearTimeout(providerSaveTimers.current[key]);
    }
    providerSaveTimers.current[key] = setTimeout(() => {
      const s = settingsRef.current;
      if (!s) return;
      const newProviders = [...s.providers];
      newProviders[index] = { ...newProviders[index], [field]: value };
      rest.put("/settings", { ...s, providers: newProviders }).catch(() => {});
    }, 400);
  };

  const fetchModelsFromProvider = async (provider: ProviderConfig, index: number) => {
    setFetchError(null);
    setFetchingProvider(provider.id);
    try {
      const result = await rest.post<{
        models?: Array<{ id: string; name: string }>;
        error?: string;
        detail?: string;
      }>("/providers/fetch-models", {
        baseUrl: provider.baseUrl,
        apiKey: provider.apiKey,
        type: provider.type,
      });

      if (result.error) {
        setFetchError(result.detail || result.error);
        setFetchingProvider(null);
        return;
      }

      const fetchedModels = result.models || [];
      if (fetchedModels.length === 0) {
        setFetchError(t("settings.modelFetchFailed"));
        setFetchingProvider(null);
        return;
      }

      // Merge fetched models into the provider, preserving existing metadata
      const newProviders = [...settings!.providers];
      const existingModels = newProviders[index].models;
      const mergedModels = fetchedModels.map((fm) => {
        const existing = existingModels.find((m) => m.id === fm.id);
        return {
          id: fm.id,
          name: fm.name,
          providerId: provider.id,
          maxTokens: existing?.maxTokens ?? 128000,
          supportsThinking: existing?.supportsThinking ?? false,
          supportsVision: existing?.supportsVision ?? true,
          inputCostPer1M: existing?.inputCostPer1M,
          outputCostPer1M: existing?.outputCostPer1M,
        };
      });
      newProviders[index] = { ...newProviders[index], models: mergedModels };
      await saveSettings({ providers: newProviders });
    } catch (err) {
      setFetchError(err instanceof Error ? err.message : t("settings.modelFetchFailed"));
    } finally {
      setFetchingProvider(null);
    }
  };

  const fetchBalance = async (provider: ProviderConfig) => {
    setBalanceError(null);
    setCheckingBalance(provider.id);
    try {
      const result = await rest.post<{
        isAvailable: boolean;
        balances: Array<{ currency: string; totalBalance: number; grantedBalance: number; toppedUpBalance: number }>;
        error?: string;
        detail?: string;
      }>("/providers/balance", {
        baseUrl: provider.baseUrl,
        apiKey: provider.apiKey,
      });

      if (result.error) {
        setBalanceError(result.detail || result.error);
        return;
      }

      setProviderBalances((prev) => ({ ...prev, [provider.id]: result }));
    } catch (err) {
      setBalanceError(err instanceof Error ? err.message : t("settings.balanceFetchFailed"));
    } finally {
      setCheckingBalance(null);
    }
  };

  // ── MCP helpers ──
  const openAddMcp = () => {
    setEditingMcp(null);
    setMcpForm({ name: "", transport: "stdio", command: "", args: [], url: "", env: {}, headers: {}, enabled: true });
    setMcpEnvText("");
    setMcpHeadersText("");
    setMcpArgsText("");
    setMcpFormOpen(true);
  };

  const openEditMcp = (name: string) => {
    const cfg = settings?.mcpServers?.[name];
    if (!cfg) return;
    setEditingMcp(name);
    setMcpForm({ ...cfg });
    setMcpEnvText(cfg.env ? Object.entries(cfg.env).map(([k, v]) => `${k}=${v}`).join("\n") : "");
    setMcpHeadersText(cfg.headers ? Object.entries(cfg.headers).map(([k, v]) => `${k}: ${v}`).join("\n") : "");
    setMcpArgsText(cfg.args?.join("\n") || "");
    setMcpFormOpen(true);
  };

  const parseMcpForm = (): McpServerConfig => {
    const env: Record<string, string> = {};
    mcpEnvText.split("\n").forEach((line) => {
      const idx = line.indexOf("=");
      if (idx > 0) env[line.slice(0, idx).trim()] = line.slice(idx + 1).trim();
    });
    const headers: Record<string, string> = {};
    mcpHeadersText.split("\n").forEach((line) => {
      const idx = line.indexOf(":");
      if (idx > 0) headers[line.slice(0, idx).trim()] = line.slice(idx + 1).trim();
    });
    const args = mcpArgsText.split("\n").map((s) => s.trim()).filter(Boolean);
    return { ...mcpForm, env, headers, args };
  };

  const saveMcpServer = () => {
    if (!settings || !mcpForm.name.trim()) return;
    const cfg = parseMcpForm();
    const newServers = { ...settings.mcpServers, [cfg.name]: cfg };
    saveSettings({ mcpServers: newServers });
    setMcpFormOpen(false);
    setEditingMcp(null);
  };

  const deleteMcpServer = (name: string) => {
    if (!settings) return;
    const newServers = { ...settings.mcpServers };
    delete newServers[name];
    saveSettings({ mcpServers: newServers });
  };

  const toggleMcpServer = (name: string, enabled: boolean) => {
    if (!settings?.mcpServers?.[name]) return;
    const newServers = {
      ...settings.mcpServers,
      [name]: { ...settings.mcpServers[name], enabled },
    };
    saveSettings({ mcpServers: newServers });
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center pointer-events-none">
      {/* Backdrop — only covers main content, not sidebar */}
      <div
        className="absolute left-64 top-0 right-0 bottom-0 bg-black/50 backdrop-blur-sm pointer-events-auto"
        onClick={onClose}
      />

      {/* Dialog */}
      <div className="relative bg-card border border-border rounded-2xl shadow-2xl w-full max-w-2xl max-h-[80vh] flex overflow-hidden pointer-events-auto">
        {/* Sidebar tabs */}
        <div className="w-48 flex-shrink-0 border-r border-border p-3 space-y-1">
          {tabs.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => setActiveTab(id)}
              className={cn(
                "w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-colors",
                activeTab === id
                  ? "bg-primary/10 text-primary font-medium"
                  : "text-muted-foreground hover:text-foreground hover:bg-secondary"
              )}
            >
              <Icon size={16} />
              {label}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 flex flex-col min-h-0">
          <div className="flex items-center justify-between px-6 py-4 border-b border-border">
            <h2 className="font-semibold text-foreground">{t("settings.title")}</h2>
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors"
            >
              <X size={18} />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-6">
            {!settings && (
              <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
                Loading settings...
              </div>
            )}
            {settings && activeTab === "general" && (
              <div className="space-y-6">
                <div>
                  <h3 className="text-sm font-medium text-foreground mb-2">
                    {t("settings.language")}
                  </h3>
                  <div className="flex items-center gap-2">
                    {SUPPORTED_LOCALES.map((l) => (
                      <button
                        key={l.code}
                        onClick={() => setLocale(l.code)}
                        className={cn(
                          "flex items-center gap-2 px-3 py-2 rounded-lg text-sm border transition-colors",
                          locale === l.code
                            ? "border-primary bg-primary/10 text-primary"
                            : "border-border hover:bg-secondary text-foreground"
                        )}
                      >
                        <span>{l.flag}</span>
                        <span>{l.name}</span>
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <h3 className="text-sm font-medium text-foreground mb-2">
                    {t("settings.appearance")}
                  </h3>
                  <ThemeToggle />
                </div>
                <div>
                  <h3 className="text-sm font-medium text-foreground mb-2">
                    {t("settings.defaultModel")}
                  </h3>
                  <select className="w-full text-sm bg-secondary rounded-lg px-3 py-2 border border-border outline-none focus:ring-1 focus:ring-ring">
                    <option value="claude-sonnet-4-5-20250929">{t("models.claude_sonnet")}</option>
                    <option value="claude-opus-4-8-20251101">{t("models.claude_opus")}</option>
                    <option value="claude-haiku-4-5-20251001">{t("models.claude_haiku")}</option>
                  </select>
                </div>
                <div>
                  <h3 className="text-sm font-medium text-foreground mb-2">
                    {t("settings.spendingLimit")}
                  </h3>
                  <div className="flex items-center gap-2">
                    <span className="text-muted-foreground text-sm">$</span>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={settings.spendingLimitUSD ?? ""}
                      onChange={(e) => {
                        const val = e.target.value ? parseFloat(e.target.value) : null;
                        saveSettings({ spendingLimitUSD: val as number | null });
                      }}
                      placeholder={t("settings.noLimit")}
                      className="w-32 text-sm bg-secondary rounded-lg px-3 py-2 border border-border outline-none focus:ring-1 focus:ring-ring"
                    />
                    <span className="text-xs text-muted-foreground">{t("settings.perQuery")}</span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    {t("settings.spendingLimitHint")}
                  </p>
                </div>
                <div>
                  <h3 className="text-sm font-medium text-foreground mb-2">
                    {t("settings.permissionMode")}
                  </h3>
                  <select
                    value={settings.defaultPermissionMode || "default"}
                    onChange={(e) =>
                      saveSettings({ defaultPermissionMode: e.target.value as UserSettings["defaultPermissionMode"] })
                    }
                    className="w-full text-sm bg-secondary rounded-lg px-3 py-2 border border-border outline-none focus:ring-1 focus:ring-ring"
                  >
                    <option value="default">{t("permMode.default")}</option>
                    <option value="acceptEdits">{t("permMode.acceptEdits")}</option>
                    <option value="bypassPermissions">{t("permMode.bypassPermissions")}</option>
                  </select>
                </div>
                <div>
                  <h3 className="text-sm font-medium text-foreground mb-2">
                    {t("settings.autoApproveTools")}
                  </h3>
                  <input
                    type="text"
                    value={(settings.autoApproveTools || []).join(", ")}
                    onChange={(e) =>
                      saveSettings({
                        autoApproveTools: e.target.value
                          .split(",")
                          .map((s) => s.trim())
                          .filter(Boolean),
                      })
                    }
                    placeholder="e.g. Read, Glob, Grep"
                    className="w-full text-sm bg-secondary rounded-lg px-3 py-2 border border-border outline-none focus:ring-1 focus:ring-ring"
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    {t("settings.autoApproveToolsHint")}
                  </p>
                </div>
                {/* Context Compression */}
                <div className="border-t border-border pt-4">
                  <h3 className="text-sm font-medium text-foreground mb-1">
                    {t("settings.compression")}
                  </h3>
                  <p className="text-xs text-muted-foreground mb-3">
                    {t("settings.compressionDesc")}
                  </p>
                  <div className="space-y-3">
                    <label className="flex items-center gap-3 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={settings.compressionEnabled !== false}
                        onChange={(e) =>
                          saveSettings({ compressionEnabled: e.target.checked })
                        }
                        className="w-4 h-4 rounded accent-primary"
                      />
                      <span className="text-sm">{t("settings.compressionEnabled")}</span>
                    </label>
                    {settings.compressionEnabled !== false && (
                      <>
                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <label className="text-xs text-muted-foreground block mb-1">
                              {t("settings.compressionContextWindow")}
                            </label>
                            <input
                              type="number"
                              min={0}
                              step={1000}
                              value={settings.compressionContextWindow ?? 128000}
                              onChange={(e) =>
                                saveSettings({ compressionContextWindow: Math.max(0, Number(e.target.value)) })
                              }
                              className="w-full text-sm bg-secondary rounded-lg px-3 py-2 border border-border outline-none focus:ring-1 focus:ring-ring"
                            />
                            <p className="text-xs text-muted-foreground mt-1">
                              {t("settings.compressionContextWindowHint")}
                            </p>
                          </div>
                          <div>
                            <label className="text-xs text-muted-foreground block mb-1">
                              {t("settings.compressionThreshold")}
                            </label>
                            <input
                              type="number"
                              min={0}
                              max={100}
                              value={settings.compressionThreshold ?? 75}
                              onChange={(e) =>
                                saveSettings({ compressionThreshold: Math.max(0, Math.min(100, Number(e.target.value))) })
                              }
                              className="w-full text-sm bg-secondary rounded-lg px-3 py-2 border border-border outline-none focus:ring-1 focus:ring-ring"
                            />
                            <p className="text-xs text-muted-foreground mt-1">
                              {t("settings.compressionThresholdHint")}
                            </p>
                          </div>
                        </div>
                        <div>
                          <label className="text-xs text-muted-foreground block mb-1">
                            {t("settings.compressionKeepRecent")}
                          </label>
                          <input
                            type="number"
                            min={1}
                            max={50}
                            value={settings.compressionKeepRecent ?? 8}
                            onChange={(e) =>
                              saveSettings({ compressionKeepRecent: Math.max(1, Number(e.target.value)) })
                            }
                            className="w-24 text-sm bg-secondary rounded-lg px-3 py-2 border border-border outline-none focus:ring-1 focus:ring-ring"
                          />
                          <p className="text-xs text-muted-foreground mt-1">
                            {t("settings.compressionKeepRecentHint")}
                          </p>
                        </div>
                      </>
                    )}
                  </div>
                </div>

                <div>
                  <h3 className="text-sm font-medium text-foreground mb-2">
                    {t("settings.systemPrompt")}
                  </h3>
                  <textarea
                    value={systemPromptDraft}
                    onChange={(e) => debouncedSaveSystemPrompt(e.target.value)}
                    placeholder={t("settings.systemPromptHint")}
                    rows={4}
                    className="w-full text-sm bg-secondary rounded-lg px-3 py-2 border border-border outline-none focus:ring-1 focus:ring-ring resize-vertical font-mono"
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    {t("settings.systemPromptDesc")}
                  </p>
                </div>
              </div>
            )}

            {activeTab === "providers" && settings && (
              <div className="space-y-6">
                <p className="text-sm text-muted-foreground">
                  {t("settings.providersDesc")}
                </p>
                {settings.providers.map((provider, i) => (
                  <div key={provider.id} className="p-4 rounded-xl border border-border bg-card">
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <Cpu size={16} className="text-primary" />
                        <input
                          type="text"
                          autoComplete="off"
                          name={`provider-name-${provider.id}`}
                          value={provider.name}
                          onChange={(e) => {
                            const val = e.target.value;
                            const newProviders = [...settings.providers];
                            newProviders[i] = { ...newProviders[i], name: val };
                            setSettings({ ...settings, providers: newProviders });
                            debouncedSaveProviderField(i, "name", val);
                          }}
                          className="font-medium text-sm text-foreground bg-transparent border-b border-transparent hover:border-border focus:border-primary focus:outline-none px-1 py-0.5 min-w-[100px] w-auto transition-colors"
                        />
                        <span className={cn(
                          "text-xs px-1.5 py-0.5 rounded",
                          provider.type === "anthropic"
                            ? "bg-purple-500/10 text-purple-500"
                            : "bg-green-500/10 text-green-500"
                        )}>
                          {provider.type === "anthropic" ? t("settings.claudeSdkBadge") : t("settings.openaiApiBadge")}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <label className="flex items-center gap-2 text-xs">
                          <input
                            type="checkbox"
                            checked={provider.enabled}
                            onChange={(e) => {
                              const newProviders = [...settings.providers];
                              newProviders[i] = { ...newProviders[i], enabled: e.target.checked };
                              saveSettings({ providers: newProviders });
                            }}
                          />
                          {t("settings.enabled")}
                        </label>
                        <button
                          onClick={() => {
                            const newProviders = settings.providers.filter((_, idx) => idx !== i);
                            saveSettings({ providers: newProviders });
                          }}
                          className="p-1 rounded hover:bg-red-500/10 text-muted-foreground hover:text-red-500 transition-colors"
                          title="Delete provider"
                        >
                          <X size={14} />
                        </button>
                      </div>
                    </div>

                    {/* API Key */}
                    <div className="mb-3">
                      <label className="text-xs text-muted-foreground mb-1 block">API Key</label>
                      <input
                        type="password"
                        autoComplete="off"
                        name={`api-key-${provider.id}`}
                        value={provider.apiKey || ""}
                        onChange={(e) => {
                          const val = e.target.value;
                          const newProviders = [...settings.providers];
                          newProviders[i] = {
                            ...newProviders[i],
                            apiKey: val,
                            enabled: val ? true : newProviders[i].enabled,
                          };
                          setSettings({ ...settings, providers: newProviders });
                          debouncedSaveProviderField(i, "apiKey", val);
                        }}
                        placeholder={
                          provider.type === "anthropic"
                            ? "sk-ant-api03-..."
                            : "sk-..."
                        }
                        className="w-full text-sm bg-secondary rounded-lg px-3 py-2 border border-border outline-none focus:ring-1 focus:ring-ring font-mono"
                      />
                    </div>

                    {/* Base URL — only for OpenAI-compatible providers */}
                    {provider.type === "openai_compatible" && (
                      <div className="mb-3">
                        <label className="text-xs text-muted-foreground mb-1 block">
                          {t("settings.baseUrl")}
                          <span className="text-primary ml-1">({t("settings.baseUrlHint")})</span>
                        </label>
                        <input
                          type="text"
                          autoComplete="off"
                          name={`base-url-${provider.id}`}
                          value={provider.baseUrl || ""}
                          onChange={(e) => {
                            const val = e.target.value;
                            const newProviders = [...settings.providers];
                            newProviders[i] = { ...newProviders[i], baseUrl: val };
                            setSettings({ ...settings, providers: newProviders });
                            debouncedSaveProviderField(i, "baseUrl", val);
                          }}
                          className="w-full text-sm bg-secondary rounded-lg px-3 py-2 border border-border outline-none focus:ring-1 focus:ring-ring font-mono"
                        />
                      </div>
                    )}

                    {/* Models list */}
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <label className="text-xs text-muted-foreground">
                          {provider.models.length} {t("settings.models")}
                        </label>
                        <button
                          onClick={() => fetchModelsFromProvider(provider, i)}
                          disabled={fetchingProvider === provider.id || !provider.baseUrl || !provider.apiKey}
                          className="flex items-center gap-1 text-xs text-primary hover:underline disabled:text-muted-foreground disabled:no-underline disabled:cursor-not-allowed"
                          title={t("settings.fetchModelsHint")}
                        >
                          <RefreshCw
                            size={12}
                            className={fetchingProvider === provider.id ? "animate-spin" : ""}
                          />
                          {fetchingProvider === provider.id
                            ? t("settings.fetchingModels")
                            : t("settings.fetchModels")}
                        </button>
                      </div>
                      {fetchError && (
                        <p className="text-xs text-red-500 mb-1">{fetchError}</p>
                      )}
                      {balanceError && (
                        <p className="text-xs text-red-500 mb-1">{balanceError}</p>
                      )}

                      {/* Balance display */}
                      {providerBalances[provider.id] && (
                        <div className="mb-3 p-2 rounded-lg bg-emerald-500/5 border border-emerald-500/20">
                          {providerBalances[provider.id]!.isAvailable ? (
                            <div className="space-y-1">
                              {providerBalances[provider.id]!.balances.map((b, bi) => (
                                <div key={bi} className="flex items-center gap-2 text-xs">
                                  <span className="text-emerald-500 font-medium tabular-nums">
                                    {b.currency} {b.totalBalance.toFixed(2)}
                                  </span>
                                  {b.grantedBalance > 0 && (
                                    <span className="text-muted-foreground">
                                      {t("settings.granted")}: {b.grantedBalance.toFixed(2)}
                                    </span>
                                  )}
                                  {b.toppedUpBalance > 0 && (
                                    <span className="text-muted-foreground">
                                      {t("settings.toppedUp")}: {b.toppedUpBalance.toFixed(2)}
                                    </span>
                                  )}
                                </div>
                              ))}
                            </div>
                          ) : (
                            <span className="text-xs text-muted-foreground">{t("settings.notAvailable")}</span>
                          )}
                        </div>
                      )}

                      {/* Action buttons row */}
                      <div className="flex items-center gap-2 mb-1">
                        <button
                          onClick={() => fetchBalance(provider)}
                          disabled={checkingBalance === provider.id || !provider.baseUrl || !provider.apiKey}
                          className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground disabled:text-muted-foreground/40 disabled:cursor-not-allowed transition-colors"
                          title={t("settings.checkBalance")}
                        >
                          <Wallet
                            size={12}
                            className={checkingBalance === provider.id ? "animate-pulse" : ""}
                          />
                          {checkingBalance === provider.id
                            ? t("settings.checkingBalance")
                            : t("settings.checkBalance")}
                        </button>
                      </div>

                      <div className="space-y-1 max-h-48 overflow-y-auto">
                        {provider.models.map((model, mi) => (
                          <div key={model.id} className="flex items-center gap-2 text-xs bg-secondary rounded-md px-3 py-1.5">
                            <span className="flex-1 font-mono text-foreground">{model.id}</span>
                            <span className="text-muted-foreground">{model.name}</span>
                            {model.inputCostPer1M && (
                              <span className="text-muted-foreground">
                                ${model.inputCostPer1M}/{t("settings.costPerM")} · ${model.outputCostPer1M}/{t("settings.costPerM")}
                              </span>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                ))}

                {/* Add provider */}
                {addingProvider ? (
                  <div className="p-4 rounded-xl border-2 border-primary/30 bg-card space-y-3">
                    <div className="text-xs text-muted-foreground">Provider Type</div>
                    <select
                      value={newProviderType}
                      onChange={(e) => setNewProviderType(e.target.value as ProviderConfig["type"])}
                      className="w-full text-sm bg-secondary rounded-lg px-3 py-2 border border-border outline-none focus:ring-1 focus:ring-ring"
                    >
                      <option value="openai_compatible">OpenAI Compatible — DeepSeek, OpenAI, OpenRouter, Azure…</option>
                      <option value="anthropic">Anthropic — Claude SDK (requires sk-ant-… key)</option>
                    </select>
                    <div className="flex items-center gap-2 pt-1">
                      <button
                        onClick={() => {
                          const newProvider: ProviderConfig = {
                            id: `custom_${Date.now()}`,
                            name: newProviderType === "anthropic" ? "Anthropic" : t("settings.customProvider"),
                            type: newProviderType,
                            apiKey: "",
                            baseUrl: newProviderType === "anthropic" ? "https://api.anthropic.com" : "",
                            enabled: true,
                            isDefault: false,
                            models: [],
                          };
                          saveSettings({ providers: [...settings.providers, newProvider] });
                          setAddingProvider(false);
                          setNewProviderType("openai_compatible");
                        }}
                        className="px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 transition-opacity"
                      >
                        {t("settings.addProvider")}
                      </button>
                      <button
                        onClick={() => setAddingProvider(false)}
                        className="px-4 py-2 rounded-lg bg-secondary text-sm hover:bg-border transition-colors"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    onClick={() => setAddingProvider(true)}
                    className="w-full flex items-center justify-center gap-2 p-3 rounded-xl border-2 border-dashed border-border text-sm text-muted-foreground hover:text-foreground hover:border-primary/50 transition-colors"
                  >
                    <Plus size={16} />
                    {t("settings.addProvider")}
                  </button>
                )}
              </div>
            )}

            {activeTab === "permissions" && settings && (
              <div className="space-y-4">
                <p className="text-sm text-muted-foreground">
                  {t("settings.permissionsDesc")}
                </p>
                {["Read", "Edit", "Write", "Bash", "WebSearch", "WebFetch"].map((tool) => {
                  const autoApprove = settings.autoApproveTools || [];
                  const checked = autoApprove.includes(tool);
                  return (
                    <label
                      key={tool}
                      className="flex items-center justify-between py-2 cursor-pointer"
                    >
                      <span className="text-sm text-foreground">{tool}</span>
                      <input
                        type="checkbox"
                        className="rounded"
                        checked={checked}
                        onChange={(e) => {
                          const next = e.target.checked
                            ? [...autoApprove, tool]
                            : autoApprove.filter((t) => t !== tool);
                          saveSettings({ autoApproveTools: next });
                        }}
                      />
                    </label>
                  );
                })}
              </div>
            )}

            {activeTab === "mcp" && settings && (
              <div className="space-y-4">
                <p className="text-sm text-muted-foreground">
                  {t("settings.mcpDesc")}
                </p>

                {/* Server list */}
                {Object.keys(settings.mcpServers || {}).length === 0 && !mcpFormOpen ? (
                  <div className="text-center text-muted-foreground text-sm py-8">
                    {t("settings.noMcpServers")}
                  </div>
                ) : (
                  <div className="space-y-3">
                    {Object.entries(settings.mcpServers || {}).map(([name, cfg]) => (
                      <div key={name} className="p-4 rounded-xl border border-border bg-card">
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-2">
                            <Server size={16} className="text-primary" />
                            <span className="font-medium text-sm text-foreground">{name}</span>
                            <span className={cn(
                              "text-[10px] px-1.5 py-0.5 rounded font-medium",
                              cfg.transport === "stdio"
                                ? "bg-purple-500/10 text-purple-500"
                                : cfg.transport === "sse"
                                  ? "bg-amber-500/10 text-amber-500"
                                  : "bg-blue-500/10 text-blue-500"
                            )}>
                              {cfg.transport.toUpperCase()}
                            </span>
                            {cfg.status && (
                              <span className={cn(
                                "text-[10px] px-1.5 py-0.5 rounded",
                                cfg.status === "connected"
                                  ? "bg-emerald-500/10 text-emerald-500"
                                  : cfg.status === "failed"
                                    ? "bg-red-500/10 text-red-500"
                                    : "bg-muted text-muted-foreground"
                              )}>
                                {cfg.status}
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-2">
                            <label className="flex items-center gap-1.5 text-[10px]">
                              <input
                                type="checkbox"
                                checked={cfg.enabled}
                                onChange={(e) => toggleMcpServer(name, e.target.checked)}
                              />
                              {t("settings.enabled")}
                            </label>
                            <button
                              onClick={() => openEditMcp(name)}
                              className="p-1 rounded hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors"
                              title="Edit"
                            >
                              ✎
                            </button>
                            <button
                              onClick={() => deleteMcpServer(name)}
                              className="p-1 rounded hover:bg-red-500/10 text-muted-foreground hover:text-red-500 transition-colors"
                              title="Delete"
                            >
                              <X size={14} />
                            </button>
                          </div>
                        </div>
                        {/* Details */}
                        <div className="text-xs text-muted-foreground space-y-0.5 ml-6">
                          {cfg.transport === "stdio" && cfg.command && (
                            <div>Command: <code className="bg-secondary rounded px-1">{cfg.command} {(cfg.args || []).join(" ")}</code></div>
                          )}
                          {(cfg.transport === "http" || cfg.transport === "sse" || cfg.transport === "websocket") && cfg.url && (
                            <div>URL: <code className="bg-secondary rounded px-1">{cfg.url}</code></div>
                          )}
                          {cfg.tools && cfg.tools.length > 0 && (
                            <div>{cfg.tools.length} tool(s): {cfg.tools.map((t) => t.name).join(", ")}</div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Add/Edit form */}
                {mcpFormOpen ? (
                  <div className="p-4 rounded-xl border-2 border-primary/30 bg-card space-y-3">
                    <h4 className="text-sm font-medium text-foreground">
                      {editingMcp ? `Edit: ${editingMcp}` : t("settings.addMcp")}
                    </h4>

                    {/* Name */}
                    <div>
                      <label className="text-xs text-muted-foreground block mb-1">Name *</label>
                      <input
                        type="text"
                        autoComplete="off"
                        value={mcpForm.name}
                        onChange={(e) => setMcpForm({ ...mcpForm, name: e.target.value })}
                        placeholder="e.g. filesystem, github"
                        disabled={!!editingMcp}
                        className="w-full text-sm bg-secondary rounded-lg px-3 py-2 border border-border outline-none focus:ring-1 focus:ring-ring disabled:opacity-50"
                      />
                    </div>

                    {/* Transport */}
                    <div>
                      <label className="text-xs text-muted-foreground block mb-1">Transport</label>
                      <select
                        value={mcpForm.transport}
                        onChange={(e) => setMcpForm({ ...mcpForm, transport: e.target.value as McpServerConfig["transport"] })}
                        className="w-full text-sm bg-secondary rounded-lg px-3 py-2 border border-border outline-none focus:ring-1 focus:ring-ring"
                      >
                        <option value="stdio">stdio (local process)</option>
                        <option value="http">HTTP</option>
                        <option value="sse">SSE (Server-Sent Events)</option>
                        <option value="websocket">WebSocket</option>
                      </select>
                    </div>

                    {/* Stdio fields */}
                    {mcpForm.transport === "stdio" && (
                      <>
                        <div>
                          <label className="text-xs text-muted-foreground block mb-1">Command *</label>
                          <input
                            type="text"
                            autoComplete="off"
                            value={mcpForm.command || ""}
                            onChange={(e) => setMcpForm({ ...mcpForm, command: e.target.value })}
                            placeholder="e.g. npx, uvx, node"
                            className="w-full text-sm bg-secondary rounded-lg px-3 py-2 border border-border outline-none focus:ring-1 focus:ring-ring font-mono"
                          />
                        </div>
                        <div>
                          <label className="text-xs text-muted-foreground block mb-1">Arguments (one per line)</label>
                          <textarea
                            value={mcpArgsText}
                            onChange={(e) => setMcpArgsText(e.target.value)}
                            placeholder={`-y\n@anthropic-ai/mcp-server-filesystem\n/path/to/dir`}
                            rows={3}
                            className="w-full text-sm bg-secondary rounded-lg px-3 py-2 border border-border outline-none focus:ring-1 focus:ring-ring font-mono resize-none"
                          />
                        </div>
                      </>
                    )}

                    {/* HTTP/SSE/WS fields */}
                    {(mcpForm.transport === "http" || mcpForm.transport === "sse" || mcpForm.transport === "websocket") && (
                      <div>
                        <label className="text-xs text-muted-foreground block mb-1">URL *</label>
                        <input
                          type="text"
                          autoComplete="off"
                          value={mcpForm.url || ""}
                          onChange={(e) => setMcpForm({ ...mcpForm, url: e.target.value })}
                          placeholder="http://localhost:3001/mcp"
                          className="w-full text-sm bg-secondary rounded-lg px-3 py-2 border border-border outline-none focus:ring-1 focus:ring-ring font-mono"
                        />
                      </div>
                    )}

                    {/* Environment variables */}
                    <div>
                      <label className="text-xs text-muted-foreground block mb-1">Environment Variables (KEY=VALUE, one per line)</label>
                      <textarea
                        value={mcpEnvText}
                        onChange={(e) => setMcpEnvText(e.target.value)}
                        placeholder="API_KEY=sk-..."
                        rows={2}
                        className="w-full text-sm bg-secondary rounded-lg px-3 py-2 border border-border outline-none focus:ring-1 focus:ring-ring font-mono resize-none"
                      />
                    </div>

                    {/* Headers (HTTP-based transports only) */}
                    {(mcpForm.transport === "http" || mcpForm.transport === "sse" || mcpForm.transport === "websocket") && (
                      <div>
                        <label className="text-xs text-muted-foreground block mb-1">Headers (KEY: VALUE, one per line)</label>
                        <textarea
                          value={mcpHeadersText}
                          onChange={(e) => setMcpHeadersText(e.target.value)}
                          placeholder="Authorization: Bearer sk-..."
                          rows={2}
                          className="w-full text-sm bg-secondary rounded-lg px-3 py-2 border border-border outline-none focus:ring-1 focus:ring-ring font-mono resize-none"
                        />
                      </div>
                    )}

                    {/* Enabled toggle */}
                    <label className="flex items-center gap-2 text-xs">
                      <input
                        type="checkbox"
                        checked={mcpForm.enabled}
                        onChange={(e) => setMcpForm({ ...mcpForm, enabled: e.target.checked })}
                      />
                      {t("settings.enabled")}
                    </label>

                    {/* Action buttons */}
                    <div className="flex items-center gap-2 pt-1">
                      <button
                        onClick={saveMcpServer}
                        disabled={!mcpForm.name.trim()}
                        className="px-4 py-1.5 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 disabled:opacity-40 transition-opacity"
                      >
                        {editingMcp ? "Update" : "Add"}
                      </button>
                      <button
                        onClick={() => { setMcpFormOpen(false); setEditingMcp(null); }}
                        className="px-4 py-1.5 rounded-lg bg-secondary text-sm hover:bg-border transition-colors"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    onClick={openAddMcp}
                    className="w-full flex items-center justify-center gap-2 p-3 rounded-xl border-2 border-dashed border-border text-sm text-muted-foreground hover:text-foreground hover:border-primary/50 transition-colors"
                  >
                    <Plus size={16} />
                    {t("settings.addMcp")}
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

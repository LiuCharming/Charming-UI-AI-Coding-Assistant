/**
 * REST routes for user settings.
 */

import { Router } from "express";
import type { UserSettings } from "@cgui/shared";
import { config } from "../utils/config";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { resolve } from "path";

export const settingsRouter = Router();

const SETTINGS_FILE = resolve(config.cguiHome, "settings.json");

function ensureCGUIHome(): void {
  if (!existsSync(config.cguiHome)) {
    mkdirSync(config.cguiHome, { recursive: true });
  }
}

function loadSettings(): UserSettings {
  ensureCGUIHome();
  let settings: UserSettings;
  try {
    if (existsSync(SETTINGS_FILE)) {
      const raw = readFileSync(SETTINGS_FILE, "utf-8");
      const parsed = JSON.parse(raw);
      // Merge with defaults so that new fields always get their default values
      const defaults = getDefaultSettings();
      settings = { ...defaults, ...parsed };

      // Only restore built-in providers when the user has NO providers at all
      // (fresh install or corrupted data). Otherwise respect the user's deletions.
      if (!parsed.providers || !Array.isArray(parsed.providers) || parsed.providers.length === 0) {
        settings.providers = defaults.providers;
      }
    } else {
      return getDefaultSettings();
    }
  } catch {
    return getDefaultSettings();
  }

  // Normalize: auto-enable providers that have API keys configured
  let changed = false;
  for (const p of settings.providers) {
    if (!p.enabled && p.apiKey) {
      p.enabled = true;
      changed = true;
    }
  }
  if (changed) {
    saveSettings(settings);
  }

  return settings;
}

function saveSettings(settings: UserSettings): void {
  ensureCGUIHome();
  writeFileSync(SETTINGS_FILE, JSON.stringify(settings, null, 2), "utf-8");
}

function getDefaultSettings(): UserSettings {
  return {
    theme: "dark",
    defaultModel: "claude-sonnet-4-5-20250929",
    defaultProvider: "anthropic",
    defaultPermissionMode: "default",
    defaultEffort: "medium",
    providers: [
      {
        id: "anthropic",
        name: "Anthropic",
        type: "anthropic" as const,
        apiKey: "",
        baseUrl: "https://api.anthropic.com",
        enabled: true,
        isDefault: true,
        models: [
          { id: "claude-sonnet-4-5-20250929", name: "Claude Sonnet 4.5", providerId: "anthropic", maxTokens: 200000, supportsThinking: true, supportsVision: true, inputCostPer1M: 3, outputCostPer1M: 15 },
          { id: "claude-opus-4-8-20251101", name: "Claude Opus 4.8", providerId: "anthropic", maxTokens: 200000, supportsThinking: true, supportsVision: true, inputCostPer1M: 15, outputCostPer1M: 75 },
          { id: "claude-haiku-4-5-20251001", name: "Claude Haiku 4.5", providerId: "anthropic", maxTokens: 200000, supportsThinking: false, supportsVision: true, inputCostPer1M: 0.8, outputCostPer1M: 4 },
        ],
      },
      {
        id: "openai",
        name: "OpenAI / Compatible",
        type: "openai_compatible" as const,
        apiKey: "",
        baseUrl: "https://api.openai.com/v1",
        enabled: true,
        isDefault: false,
        models: [
          { id: "gpt-4o", name: "GPT-4o", providerId: "openai", maxTokens: 128000, supportsThinking: false, supportsVision: true, inputCostPer1M: 2.5, outputCostPer1M: 10 },
          { id: "gpt-4o-mini", name: "GPT-4o Mini", providerId: "openai", maxTokens: 128000, supportsThinking: false, supportsVision: true, inputCostPer1M: 0.15, outputCostPer1M: 0.6 },
        ],
      },
    ],
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

settingsRouter.get("/", (_req, res) => {
  res.json(loadSettings());
});

settingsRouter.put("/", (req, res) => {
  const settings = { ...loadSettings(), ...req.body };
  saveSettings(settings);
  res.json(settings);
});

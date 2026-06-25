/**
 * REST routes for provider model discovery.
 * Fetches available models from a provider's API endpoint.
 */

import { Router } from "express";

export const providersRouter = Router();

// POST /api/providers/fetch-models
// Body: { baseUrl: string, apiKey: string, type: "anthropic" | "openai_compatible" }
providersRouter.post("/fetch-models", async (req, res) => {
  const { baseUrl, apiKey, type } = req.body;

  if (!baseUrl || !apiKey) {
    res.status(400).json({ error: "baseUrl and apiKey are required" });
    return;
  }

  try {
    if (type === "anthropic") {
      // Anthropic doesn't have a public /models endpoint.
      // Return the well-known Claude models.
      res.json({
        models: [
          { id: "claude-sonnet-4-5-20250929", name: "Claude Sonnet 4.5" },
          { id: "claude-opus-4-8-20251101", name: "Claude Opus 4.8" },
          { id: "claude-haiku-4-5-20251001", name: "Claude Haiku 4.5" },
          { id: "claude-fable-5-20250929", name: "Claude Fable 5" },
        ],
      });
      return;
    }

    // OpenAI-compatible: try multiple URL patterns
    const urlCandidates: string[] = [];
    const cleanBase = baseUrl.replace(/\/+$/, "");

    // If base URL already ends with /v1 or /v2 etc, use it directly
    if (/\/v\d+$/.test(cleanBase)) {
      urlCandidates.push(`${cleanBase}/models`);
    } else {
      // Try without /v1 first, then with /v1 (covers providers like DeepSeek)
      urlCandidates.push(`${cleanBase}/models`);
      urlCandidates.push(`${cleanBase}/v1/models`);
    }

    let lastError: string | null = null;
    let lastStatus = 0;
    let models: Array<{ id: string; name: string }> = [];

    for (const url of urlCandidates) {
      try {
        const response = await fetch(url, {
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
          },
          // Some providers are slow to respond
          signal: AbortSignal.timeout(15000),
        });

        if (!response.ok) {
          lastStatus = response.status;
          const errText = await response.text().catch(() => "");
          lastError = errText.substring(0, 300);
          // 404/403 -> try next candidate; other errors -> break and report
          if (response.status !== 404 && response.status !== 403) {
            break;
          }
          continue;
        }

        const data = (await response.json()) as {
          data?: Array<{ id: string; object?: string }>;
          object?: string;
        };

        const rawModels = data.data || [];

        models = rawModels
          .filter((m) => {
            const id = m.id.toLowerCase();
            // Filter out non-chat models
            if (
              id.includes("embedding") ||
              id.includes("tts") ||
              id.includes("whisper") ||
              id.includes("dall-e") ||
              id.includes("moderation") ||
              id.includes("audio") ||
              id.includes("vectorize") ||
              id.includes("babbage") ||
              id.includes("davinci") ||
              id.includes("instruct") ||
              id.includes("similarity")
            ) {
              return false;
            }
            return true;
          })
          .map((m) => ({
            id: m.id,
            name: m.id
              .replace(/-/g, " ")
              .replace(/_/g, " ")
              .split(" ")
              .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
              .join(" "),
          }))
          .sort((a, b) => {
            const aIsChat = a.id.includes("chat") || a.id.includes("claude");
            const bIsChat = b.id.includes("chat") || b.id.includes("claude");
            if (aIsChat && !bIsChat) return -1;
            if (!aIsChat && bIsChat) return 1;
            return a.id.localeCompare(b.id);
          });

        if (models.length > 0) break;
      } catch (fetchErr) {
        lastError = fetchErr instanceof Error ? fetchErr.message : String(fetchErr);
        continue;
      }
    }

    if (models.length === 0) {
      res.status(502).json({
        error: `Unable to fetch models from provider (HTTP ${lastStatus})`,
        detail: lastError
          ? `${lastError}\n\nTried: ${urlCandidates.join(", ")}`
          : `Tried: ${urlCandidates.join(", ")}`,
      });
      return;
    }

    res.json({ models });
  } catch (err) {
    res.status(500).json({
      error: "Failed to fetch models",
      detail: err instanceof Error ? err.message : String(err),
    });
  }
});

// ─── Balance check ───────────────────────────────────────────

interface BalanceInfo {
  currency: string;
  total_balance: string;
  granted_balance: string;
  topped_up_balance: string;
}

// POST /api/providers/balance
// Body: { baseUrl: string, apiKey: string }
providersRouter.post("/balance", async (req, res) => {
  const { baseUrl, apiKey } = req.body;

  if (!baseUrl || !apiKey) {
    res.status(400).json({ error: "baseUrl and apiKey are required" });
    return;
  }

  try {
    const cleanBase = baseUrl.replace(/\/+$/, "");
    // DeepSeek and other compatible providers: /user/balance
    const url = `${cleanBase}/user/balance`;

    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        Accept: "application/json",
      },
      signal: AbortSignal.timeout(10000),
    });

    if (!response.ok) {
      const errText = await response.text().catch(() => "");
      res.status(response.status).json({
        error: `Balance query failed (HTTP ${response.status})`,
        detail: errText.substring(0, 500),
      });
      return;
    }

    const data = (await response.json()) as {
      is_available?: boolean;
      balance_infos?: BalanceInfo[];
    };

    if (!data.balance_infos || data.balance_infos.length === 0) {
      res.json({
        isAvailable: data.is_available ?? false,
        balances: [],
      });
      return;
    }

    res.json({
      isAvailable: data.is_available ?? false,
      balances: data.balance_infos.map((b) => ({
        currency: b.currency,
        totalBalance: parseFloat(b.total_balance),
        grantedBalance: parseFloat(b.granted_balance),
        toppedUpBalance: parseFloat(b.topped_up_balance),
      })),
    });
  } catch (err) {
    res.status(502).json({
      error: "Failed to query balance",
      detail: err instanceof Error ? err.message : String(err),
    });
  }
});

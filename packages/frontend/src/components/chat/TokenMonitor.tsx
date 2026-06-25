import { useSessionStore } from "@/store/sessionStore";
import { useChatStore } from "@/store/chatStore";
import { Zap, ArrowUp, ArrowDown, Coins } from "lucide-react";

function fmt(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(1) + "K";
  return String(n);
}

function fmtCost(n: number): string {
  if (n >= 1) return "$" + n.toFixed(2);
  if (n >= 0.01) return "$" + n.toFixed(3);
  return "$" + n.toFixed(4);
}

export function TokenMonitor() {
  const { lastTurnTokens, interimUsage, sessionTotalCost, sessions, activeSessionId } =
    useSessionStore();
  const { isStreaming, streamingOutputChars } = useChatStore();

  const activeSession = sessions.find((s) => s.id === activeSessionId);
  const totalTokens = activeSession?.totalTokens || 0;
  const totalCost = activeSession?.totalCostUSD || sessionTotalCost || 0;

  // During streaming, prefer real API usage if available, else estimate from char count
  const liveOutputTokens = interimUsage?.output
    || (streamingOutputChars > 0 ? Math.max(1, Math.round(streamingOutputChars / 4)) : 0);
  const liveInputTokens = interimUsage?.input || 0;
  const liveCost = interimUsage?.cost || 0;

  return (
    <div className="flex items-center gap-2 text-xs text-muted-foreground">
      {/* Streaming pulse */}
      {isStreaming && (
        <Zap size={11} className="text-yellow-500 animate-pulse flex-shrink-0" />
      )}

      {/* Real-time streaming usage, or last turn breakdown */}
      {isStreaming && liveOutputTokens > 0 ? (
        <>
          <span className="flex items-center gap-0.5 tabular-nums">
            {liveInputTokens > 0 && (
              <>
                <ArrowUp size={10} className="text-blue-400" />
                <span className="text-blue-400">{fmt(liveInputTokens)}</span>
                <span className="mx-0.5 opacity-50">/</span>
              </>
            )}
            <ArrowDown size={10} className="text-purple-400 animate-pulse" />
            <span className="text-purple-400">{liveInputTokens > 0 ? fmt(liveOutputTokens) : `~${fmt(liveOutputTokens)}`}</span>
            <span className="opacity-50 ml-0.5">streaming…</span>
          </span>
          {liveCost > 0 && (
            <span className="tabular-nums opacity-70">{fmtCost(liveCost)}</span>
          )}
        </>
      ) : lastTurnTokens ? (
        <>
          <span className="flex items-center gap-0.5 tabular-nums">
            <ArrowUp size={10} className="text-blue-400" />
            <span className="text-blue-400">{fmt(lastTurnTokens.input)}</span>
            <span className="mx-0.5 opacity-50">/</span>
            <ArrowDown size={10} className="text-purple-400" />
            <span className="text-purple-400">{fmt(lastTurnTokens.output)}</span>
          </span>
          {lastTurnTokens.cost > 0 && (
            <span className="tabular-nums opacity-70">
              {fmtCost(lastTurnTokens.cost)}
            </span>
          )}
        </>
      ) : (
        <span className="text-muted-foreground/50">—</span>
      )}

      {/* Divider + total */}
      {totalTokens > 0 && (
        <>
          <span className="opacity-30">|</span>
          <span className="flex items-center gap-0.5 tabular-nums">
            <Coins size={10} className="opacity-50" />
            <span>{fmt(totalTokens)}</span>
            {totalCost > 0 && (
              <span className="opacity-60 ml-0.5">{fmtCost(totalCost)}</span>
            )}
          </span>
        </>
      )}
    </div>
  );
}

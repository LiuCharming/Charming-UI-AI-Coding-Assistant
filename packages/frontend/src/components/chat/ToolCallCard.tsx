import { useState, useMemo } from "react";
import type { ToolCall } from "@cgui/shared";
import { cn } from "@/lib/cn";
import { useI18n } from "@/i18n";
import { formatDuration } from "@/lib/format";
import {
  ChevronDown,
  ChevronRight,
  Terminal,
  FileText,
  Edit3,
  Search,
  Globe,
  Wrench,
  CheckCircle2,
  XCircle,
  Loader2,
} from "lucide-react";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const TOOL_ICONS: Record<string, React.ComponentType<any>> = {
  Bash: Terminal,
  Read: FileText,
  Write: Edit3,
  Edit: Edit3,
  Glob: Search,
  Grep: Search,
  WebSearch: Globe,
  WebFetch: Globe,
};

interface ToolCallCardProps {
  toolCall: ToolCall;
}

/** Pick out the "key" parameter from tool input for a compact summary */
function summarizeTool(toolName: string, input: Record<string, unknown>): string {
  switch (toolName) {
    case "Read":
    case "read_file": {
      const path = String(input.path || input.file_path || "");
      return path ? basename(path as string) : "file";
    }
    case "Write":
    case "write_file":
    case "Edit": {
      const path = String(input.path || input.file_path || "");
      return path ? basename(path as string) : "file";
    }
    case "Bash":
    case "run_command": {
      const cmd = String(input.command || "");
      return cmd.length > 50 ? cmd.slice(0, 50) + "…" : cmd;
    }
    case "Glob":
    case "search_files": {
      const pat = String(input.pattern || "");
      return pat;
    }
    case "Grep":
    case "search_content": {
      const pat = String(input.pattern || input.query || "");
      return pat.length > 40 ? pat.slice(0, 40) + "…" : pat;
    }
    case "list_directory": {
      const dir = String(input.path || ".");
      return dir;
    }
    default:
      return "";
  }
}

/** Truncate output for display, keeping first and last lines */
function truncateOutput(output: string, maxLen = 2000): string {
  if (output.length <= maxLen) return output;
  const half = Math.floor(maxLen / 2);
  const first = output.slice(0, half);
  const last = output.slice(-half);
  return first + `\n\n… (${output.length - maxLen} more chars) …\n\n` + last;
}

/** Get a brief status hint from the output */
function summarizeResult(toolName: string, output: string, isError: boolean): string {
  if (isError) return output.split("\n")[0].slice(0, 80);
  switch (toolName) {
    case "Read":
    case "read_file":
      return `${output.length} chars`;
    case "Write":
    case "write_file":
      return output.split("\n")[0];
    case "Bash":
    case "run_command":
    case "list_directory": {
      const lines = output.split("\n").filter(Boolean);
      return `${lines.length} lines`;
    }
    case "search_files": {
      const lines = output.split("\n").filter(Boolean);
      return lines.length > 1 ? `${lines.length} files` : output;
    }
    case "search_content": {
      const lines = output.split("\n").filter(Boolean);
      return lines.length > 1 ? `${lines.length} matches` : output;
    }
    default:
      return output.length > 80 ? `${output.length} chars` : output;
  }
}

// Simple basename helper
function basename(path: string): string {
  const parts = path.replace(/\\/g, "/").split("/");
  return parts[parts.length - 1] || path;
}

export function ToolCallCard({ toolCall }: ToolCallCardProps) {
  const { t } = useI18n();
  const [isOpen, setIsOpen] = useState(false);
  const { toolName, input, output, status, isError, durationMs } = toolCall;

  const Icon = TOOL_ICONS[toolName] || Wrench;
  const summary = useMemo(() => summarizeTool(toolName, input), [toolName, input]);
  const resultHint = useMemo(
    () => (output != null ? summarizeResult(toolName, output, isError) : null),
    [toolName, output, isError]
  );

  const StatusIcon =
    status === "running"
      ? Loader2
      : status === "error" || isError
        ? XCircle
        : CheckCircle2;

  return (
    <div className="rounded-md border border-border/60 bg-card/50 overflow-hidden text-xs">
      {/* Compact header — always one line, minimal when collapsed */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center gap-1.5 px-2.5 py-1.5 hover:bg-secondary/50 transition-colors"
      >
        {isOpen ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
        <Icon size={12} className="text-muted-foreground flex-shrink-0" />
        <span className="font-medium text-foreground truncate">{toolName}</span>
        <StatusIcon
          size={12}
          className={cn(
            "flex-shrink-0",
            status === "running" && "text-primary animate-spin",
            status === "error" || isError ? "text-red-500" : "text-green-500"
          )}
        />
        <span className="text-muted-foreground/60 truncate ml-auto">
          {status === "running"
            ? "running…"
            : summary
              ? summary
              : resultHint
                ? resultHint
                : ""}
        </span>
      </button>

      {/* Expanded details */}
      {isOpen && (
        <div className="px-2.5 pb-2 space-y-2 border-t border-border/60 pt-2">
          {/* Meta line: duration + result hint */}
          <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
            {durationMs != null && (
              <span className="tabular-nums">⏱ {formatDuration(durationMs)}</span>
            )}
            {resultHint && status !== "running" && (
              <span className="truncate">
                {isError ? "❌ " : "✓ "}{resultHint}
              </span>
            )}
            {status === "running" && <span>⏳ running…</span>}
          </div>

          {/* Input — always compact */}
          <div>
            <div className="text-[10px] font-medium text-muted-foreground mb-0.5 uppercase tracking-wide">
              {t("tool.parameters")}
            </div>
            <pre className="text-[11px] bg-secondary/80 rounded px-2 py-1 overflow-x-auto font-mono max-h-24 overflow-y-auto">
              {JSON.stringify(input, null, 2)}
            </pre>
          </div>

          {/* Output */}
          {output != null && (
            <div>
              <div
                className={cn(
                  "text-[10px] font-medium mb-0.5 uppercase tracking-wide",
                  isError ? "text-red-500" : "text-muted-foreground"
                )}
              >
                {isError ? t("tool.error") : t("tool.result")}
                {output.length > 2000 && (
                  <span className="font-normal normal-case ml-1">
                    ({output.length} chars, truncated)
                  </span>
                )}
              </div>
              <pre
                className={cn(
                  "text-[11px] rounded px-2 py-1 overflow-x-auto font-mono max-h-48 overflow-y-auto",
                  isError
                    ? "bg-red-500/10 text-red-500"
                    : "bg-secondary/80"
                )}
              >
                {truncateOutput(output)}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

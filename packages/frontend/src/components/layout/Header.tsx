import { useState, useEffect } from "react";
import { Folder, Zap, FolderOpen, Download, Terminal, Square } from "lucide-react";
import { cn } from "@/lib/cn";
import { useChatStore } from "@/store/chatStore";
import { useSessionStore } from "@/store/sessionStore";
import { useProjectStore } from "@/store/projectStore";
import { useI18n } from "@/i18n";
import { TokenMonitor } from "@/components/chat/TokenMonitor";
import { useChatActions } from "@/hooks/useStreamingChat";
import { rest } from "@/api/restClient";
import { toast } from "@/lib/toast";

interface HeaderProps {
  onToggleFiles?: () => void;
  filesOpen?: boolean;
  onToggleTerminal?: () => void;
  terminalOpen?: boolean;
}

function formatElapsed(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  return `${min}:${sec.toString().padStart(2, "0")}`;
}

export function Header({ onToggleFiles, filesOpen, onToggleTerminal, terminalOpen }: HeaderProps) {
  const { t } = useI18n();
  const { isStreaming, streamingStartedAt } = useChatStore();
  const { activeSessionId, sessions } = useSessionStore();
  const { activeProjectId, projects } = useProjectStore();
  const { interrupt } = useChatActions();
  const activeSession = sessions.find((s) => s.id === activeSessionId);
  const activeProject = projects.find((p) => p.id === activeProjectId);

  // ── Streaming timer ──
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    if (!streamingStartedAt) {
      setElapsed(0);
      return;
    }
    const tick = () => setElapsed(Date.now() - streamingStartedAt);
    tick();
    const id = setInterval(tick, 200);
    return () => clearInterval(id);
  }, [streamingStartedAt]);

  return (
    <div className="h-full flex items-center justify-between px-4">
      {/* Left: session info */}
      <div className="flex items-center gap-3">
        <h1 className="text-sm font-medium text-foreground truncate max-w-[300px]">
          {activeSession?.title || "CGUI"}
        </h1>
        {activeProject && (
          <span className="flex items-center gap-1 text-xs text-muted-foreground bg-secondary rounded-full px-2 py-0.5">
            <Folder size={11} />
            <span className="truncate max-w-[150px]">{activeProject.name}</span>
          </span>
        )}
        {isStreaming && (
          <span className="flex items-center gap-1.5 text-xs text-primary">
            <Zap size={12} className="animate-pulse" />
            <span className="font-mono tabular-nums">{formatElapsed(elapsed)}</span>
            <button
              onClick={interrupt}
              className="p-0.5 ml-1 rounded bg-destructive/80 hover:bg-destructive text-destructive-foreground transition-colors"
              title="Stop generating"
            >
              <Square size={10} fill="currentColor" />
            </button>
          </span>
        )}
      </div>

      {/* Right: token monitor + status + file toggle + export */}
      <div className="flex items-center gap-2">
        <TokenMonitor />
        {activeSessionId && (
          <button
            onClick={async () => {
              try {
                await rest.download(`/sessions/export/${activeSessionId}?format=md`);
              } catch {
                toast.error("Export failed");
              }
            }}
            className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
            title={String(t("export.exportChat"))}
          >
            <Download size={15} />
          </button>
        )}
        {onToggleTerminal && (
          <button
            onClick={onToggleTerminal}
            className={cn(
              "p-1.5 rounded-lg transition-colors",
              terminalOpen
                ? "bg-primary/10 text-primary"
                : "text-muted-foreground hover:text-foreground hover:bg-secondary"
            )}
            title={terminalOpen ? "Hide terminal" : "Show terminal"}
          >
            <Terminal size={15} />
          </button>
        )}
        {onToggleFiles && (
          <button
            onClick={onToggleFiles}
            className={cn(
              "p-1.5 rounded-lg transition-colors",
              filesOpen
                ? "bg-primary/10 text-primary"
                : "text-muted-foreground hover:text-foreground hover:bg-secondary"
            )}
            title={filesOpen ? "Hide file explorer" : "Show file explorer"}
          >
            <FolderOpen size={15} />
          </button>
        )}
        <div
          className={cn(
            "w-2 h-2 rounded-full",
            isStreaming ? "bg-green-500 animate-pulse" : "bg-green-500"
          )}
          title={String(isStreaming ? t("header.active") : t("header.connected"))}
        />
      </div>
    </div>
  );
}

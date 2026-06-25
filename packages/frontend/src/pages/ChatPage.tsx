import { useState, useEffect, useCallback, useMemo } from "react";
import { AppShell } from "@/components/layout/AppShell";
import { Sidebar } from "@/components/layout/Sidebar";
import { Header } from "@/components/layout/Header";
import { ChatView } from "@/components/chat/ChatView";
import { PromptInput } from "@/components/input/PromptInput";
import { PermissionDialog } from "@/components/permissions/PermissionDialog";
import { SettingsDialog } from "@/components/settings/SettingsDialog";
import { CommandPalette } from "@/components/layout/CommandPalette";
import type { CommandItem } from "@/components/layout/CommandPalette";
import { SearchDialog } from "@/components/layout/SearchDialog";
import { FileExplorer } from "@/components/files/FileExplorer";
import { TerminalPanel } from "@/components/terminal/TerminalPanel";
import { useTerminalStore } from "@/store/terminalStore";
import { confirm } from "@/lib/toast";
import { useGlobalShortcuts } from "@/hooks/useGlobalShortcuts";
import { useChatStore } from "@/store/chatStore";
import { useSessions } from "@/hooks/useSessions";
import { useProjectStore } from "@/store/projectStore";
import { useSessionStore } from "@/store/sessionStore";
import { useWsMessages, useChatActions } from "@/hooks/useStreamingChat";
import { useTheme } from "@/hooks/useTheme";
import { useI18n } from "@/i18n";
import {
  MessageSquarePlus,
  Settings,
  Sun,
  Moon,
  Copy,
  Trash2,
  FileText,
  Download,
  Search,
  Terminal,
} from "lucide-react";
import { rest } from "@/api/restClient";
import { toast } from "@/lib/toast";

export function ChatPage() {
  const { t } = useI18n();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [filesOpen, setFilesOpen] = useState(false);
  const [panelWidth, setPanelWidth] = useState(() => {
    const saved = localStorage.getItem("charming-panel-width");
    return saved ? Number(saved) : 320;
  });
  const [searchOpen, setSearchOpen] = useState(false);
  const [scrollToIndex, setScrollToIndex] = useState<number | null>(null);

  // Edit mode state
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [editingText, setEditingText] = useState("");

  const handlePanelWidth = useCallback((w: number) => {
    setPanelWidth(w);
    localStorage.setItem("charming-panel-width", String(w));
  }, []);
  const {
    isOpen: terminalOpen,
    height: terminalHeight,
    setHeight: setTerminalHeight,
    toggle: toggleTerminal,
  } = useTerminalStore();
  const { isStreaming, messages } = useChatStore();
  const { newChat, openSession } = useSessions();
  const { loadSessions } = useSessions();
  const { loadProjects, projects, activeProjectId } = useProjectStore();
  const activeSessionId = useSessionStore((s) => s.activeSessionId);
  const { theme, resolved, setTheme } = useTheme();
  const { sendPrompt, regenerate, forkSession } = useChatActions();
  const toggleTheme = useCallback(() => {
    setTheme(resolved === "dark" ? "light" : "dark");
  }, [resolved, setTheme]);

  // Register WS message handler exactly ONCE
  useWsMessages();

  useEffect(() => {
    loadProjects();
    loadSessions();
  }, [loadProjects, loadSessions]);

  // Close file explorer when switching to free chat (no project)
  useEffect(() => {
    if (!activeProjectId) setFilesOpen(false);
  }, [activeProjectId]);

  // ── Edit message handler ───────────────────────────────
  const handleEdit = useCallback((messageId: string, text: string) => {
    setEditingMessageId(messageId);
    setEditingText(text);
  }, []);

  const handleCancelEdit = useCallback(() => {
    setEditingMessageId(null);
    setEditingText("");
  }, []);

  // ── Fork handler ──────────────────────────────────────────
  const handleFork = useCallback(
    (messageId: string) => {
      const sid = useSessionStore.getState().activeSessionId;
      if (!sid) return;
      forkSession(sid, messageId);
    },
    [forkSession]
  );

  // ── Copy last reply ──────────────────────────────────────
  const copyLastReply = useCallback(() => {
    const lastAssistant = [...messages].reverse().find((m) => m.role === "assistant");
    if (!lastAssistant) return;
    navigator.clipboard.writeText(lastAssistant.content).catch(() => {});
  }, [messages]);

  // ── Search navigation ────────────────────────────────────
  const handleNavigateToMessage = useCallback(
    (sessionId: string, messageIndex: number) => {
      const currentSid = useSessionStore.getState().activeSessionId;
      if (currentSid === sessionId) {
        // Already on this session — just scroll
        setScrollToIndex(messageIndex);
      } else {
        // Open the session first, then scroll after it loads
        openSession(sessionId);
        // Give the store time to update messages, then scroll
        setTimeout(() => setScrollToIndex(messageIndex), 300);
      }
    },
    [openSession]
  );

  const handleScrollComplete = useCallback(() => {
    setScrollToIndex(null);
  }, []);

  // ── Command palette commands ─────────────────────────────
  const closePalette = useCallback(() => {
    if (paletteOpen) {
      setPaletteOpen(false);
      return true;
    }
    return false;
  }, [paletteOpen]);

  const _ = (key: string) => String(t(key));

  const commands = useMemo<CommandItem[]>(
    () => [
      {
        id: "new-chat",
        label: _("commandPalette.newChat"),
        description: _("commandPalette.newChatDesc"),
        icon: MessageSquarePlus,
        action: () => newChat(),
        keywords: ["chat", "new", "session"],
      },
      {
        id: "toggle-theme",
        label: theme === "dark" ? _("commandPalette.lightTheme") : _("commandPalette.darkTheme"),
        description: _("commandPalette.themeDesc"),
        icon: theme === "dark" ? Sun : Moon,
        action: () => toggleTheme(),
        keywords: ["dark", "light", "theme", "color"],
      },
      {
        id: "open-settings",
        label: _("settings.title"),
        description: _("commandPalette.settingsDesc"),
        icon: Settings,
        action: () => setSettingsOpen(true),
        keywords: ["settings", "config", "preferences"],
      },
      {
        id: "copy-last-reply",
        label: _("commandPalette.copyLastReply"),
        description: _("commandPalette.copyLastReplyDesc"),
        icon: Copy,
        action: () => copyLastReply(),
        keywords: ["copy", "clipboard", "response"],
      },
      {
        id: "clear-chat",
        label: _("commandPalette.clearChat"),
        description: _("commandPalette.clearChatDesc"),
        icon: Trash2,
        action: async () => {
          const ok = await confirm({
            title: _("commandPalette.clearChatConfirmTitle"),
            description: _("commandPalette.clearChatConfirmDesc"),
            confirmLabel: _("commandPalette.clearChat"),
            variant: "danger",
          });
          if (ok) useChatStore.getState().clearMessages();
        },
        keywords: ["clear", "delete", "reset", "wipe"],
      },
      {
        id: "export-chat",
        label: _("export.exportChat"),
        description: _("export.exportDesc"),
        icon: Download,
        action: async () => {
          const sid = useSessionStore.getState().activeSessionId;
          if (!sid) return;
          try {
            await rest.download(`/sessions/export/${sid}?format=md`);
          } catch {
            toast.error(_("export.exportFailed"));
          }
        },
        keywords: ["export", "download", "markdown", "json", "save"],
      },
      {
        id: "search-messages",
        label: _("search.searchMessages"),
        description: _("search.searchDesc"),
        icon: Search,
        action: () => setSearchOpen(true),
        keywords: ["search", "find", "fulltext", "grep", "content"],
      },
      {
        id: "toggle-files",
        label: _("commandPalette.toggleFiles"),
        description: _("commandPalette.toggleFilesDesc"),
        icon: FileText,
        action: () => setFilesOpen((prev) => !prev),
        keywords: ["files", "explorer", "sidebar", "panel", "toggle"],
      },
      {
        id: "toggle-terminal",
        label: _("commandPalette.toggleTerminal"),
        description: _("commandPalette.toggleTerminalDesc"),
        icon: Terminal,
        action: () => toggleTerminal(),
        keywords: ["terminal", "shell", "command", "pty", "console"],
      },
    ],
    [_, theme, toggleTheme, newChat, copyLastReply, toggleTerminal]
  );

  // ── Global shortcuts ─────────────────────────────────────
  useGlobalShortcuts({
    openCommandPalette: () => setPaletteOpen(true),
    closeCommandPaletteIfOpen: closePalette,
    newChat,
    copyLastReply,
    openSettings: () => setSettingsOpen(true),
  });

  return (
    <>
      <AppShell
        sidebar={<Sidebar onOpenSettings={() => setSettingsOpen(true)} onSearch={() => setSearchOpen(true)} />}
        header={
          <Header
            onToggleFiles={activeProjectId ? () => setFilesOpen((v) => !v) : undefined}
            filesOpen={filesOpen}
            onToggleTerminal={toggleTerminal}
            terminalOpen={terminalOpen}
          />
        }
        rightPanel={
          <FileExplorer
            rootPath={projects.find((p) => p.id === activeProjectId)?.path || "."}
            onClose={() => setFilesOpen(false)}
          />
        }
        rightPanelOpen={filesOpen}
        panelWidth={panelWidth}
        onPanelWidthChange={handlePanelWidth}
        bottomPanel={<TerminalPanel />}
        bottomPanelOpen={terminalOpen}
        bottomPanelHeight={terminalHeight}
        onBottomPanelHeightChange={(h) => setTerminalHeight(h)}
      >
        <div className="h-full flex flex-col">
          <ChatView
            scrollToIndex={scrollToIndex}
            onScrollComplete={handleScrollComplete}
            scrollBottomKey={activeSessionId}
            onRegenerate={regenerate}
            onEdit={handleEdit}
            onFork={handleFork}
          />
          <PromptInput
            editingMessageId={editingMessageId}
            editingText={editingText}
            onCancelEdit={handleCancelEdit}
          />
        </div>
      </AppShell>

      {/* Permission dialog — rendered at root for z-index isolation */}
      <PermissionDialog />

      {/* Settings dialog */}
      <SettingsDialog
        isOpen={settingsOpen}
        onClose={() => setSettingsOpen(false)}
      />

      {/* Command palette */}
      <CommandPalette
        isOpen={paletteOpen}
        onClose={() => setPaletteOpen(false)}
        commands={commands}
      />

      {/* Search dialog */}
      <SearchDialog
        isOpen={searchOpen}
        onClose={() => setSearchOpen(false)}
        onNavigate={handleNavigateToMessage}
      />
    </>
  );
}

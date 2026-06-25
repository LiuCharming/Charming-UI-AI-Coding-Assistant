import { useState } from "react";
import { Plus, Search, SearchCheck, Trash2, MessageSquare, Settings, X, GitFork } from "lucide-react";
import { cn } from "@/lib/cn";
import { useSessions } from "@/hooks/useSessions";
import { confirm } from "@/lib/toast";
import { useProjectStore } from "@/store/projectStore";
import { ProjectSelector } from "./ProjectSelector";
import { useI18n } from "@/i18n";
import { formatRelativeTime } from "@/lib/format";

interface SidebarProps {
  onOpenSettings: () => void;
  onSearch?: () => void;
}

export function Sidebar({ onOpenSettings, onSearch }: SidebarProps) {
  const { t } = useI18n();
  const { sessions, activeSessionId, openSession, newChat, deleteSession } =
    useSessions();
  const [search, setSearch] = useState("");

  const filtered = sessions.filter((s) =>
    s.title.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <form autoComplete="off" className="flex flex-col h-full">
      {/* Header */}
      <div className="p-3 flex items-center justify-between border-b border-border">
        <span className="font-semibold text-sm text-sidebar-foreground">
          {t("app.shortTitle")}
        </span>
        <div className="flex items-center gap-1">
          {onSearch && (
            <button
              type="button"
              onClick={onSearch}
              className="p-1.5 rounded-md hover:bg-sidebar-accent text-sidebar-foreground transition-colors"
              title={t("search.searchMessages")}
            >
              <SearchCheck size={16} />
            </button>
          )}
          <button
            type="button"
            onClick={onOpenSettings}
            className="p-1.5 rounded-md hover:bg-sidebar-accent text-sidebar-foreground transition-colors"
            title={t("sidebar.settings")}
          >
            <Settings size={16} />
          </button>
          <button
            type="button"
            onClick={newChat}
            className="p-1.5 rounded-md hover:bg-sidebar-accent text-sidebar-foreground transition-colors"
            title={t("sidebar.newChat")}
          >
            <Plus size={16} />
          </button>
        </div>
      </div>

      {/* Project selector */}
      <div className="px-2 pt-2">
        <ProjectSelector />
      </div>

      {/* Search */}
      <div className="p-2">
        <div className="relative">
          <Search
            size={14}
            className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground"
          />
          <input
            type="text"
            name="sidebar-search"
            autoComplete="off"
            placeholder={t("sidebar.search")}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-8 pr-8 py-1.5 text-sm rounded-md bg-sidebar-accent text-sidebar-foreground placeholder:text-muted-foreground outline-none focus:ring-1 focus:ring-ring transition-colors"
          />
          {search && (
            <button
              type="button"
              onClick={() => setSearch("")}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-sidebar-foreground"
            >
              <X size={12} />
            </button>
          )}
        </div>
      </div>

      {/* Session list */}
      <div className="flex-1 overflow-y-auto px-2 pb-2">
        {filtered.length === 0 ? (
          <div className="text-center text-muted-foreground text-sm py-8">
            {search ? t("sidebar.noMatching") : t("sidebar.noSessions")}
          </div>
        ) : (
          filtered.map((session) => (
            <div
              key={session.id}
              onClick={() => openSession(session.id)}
              className={cn(
                "group flex items-center gap-2 px-3 py-2 rounded-md cursor-pointer transition-colors mb-0.5",
                session.id === activeSessionId
                  ? "bg-sidebar-accent text-sidebar-accent-foreground"
                  : "hover:bg-sidebar-accent/50 text-sidebar-foreground"
              )}
            >
              <MessageSquare size={14} className="flex-shrink-0 opacity-60" />
              <div className="flex-1 min-w-0">
                <div className="text-sm truncate flex items-center gap-1">
                  {session.title}
                  {session.forkedFrom && (
                    <span title="Forked conversation"><GitFork size={10} className="flex-shrink-0 text-muted-foreground/60" /></span>
                  )}
                </div>
                <div className="text-xs text-muted-foreground">
                  {formatRelativeTime(session.lastActiveAt)}
                </div>
              </div>
              <button
                type="button"
                onClick={async (e) => {
                  e.stopPropagation();
                  const ok = await confirm({
                    title: String(t("sidebar.deleteConfirmTitle")),
                    description: String(t("sidebar.deleteConfirmDesc")).replace("{title}", session.title),
                    confirmLabel: String(t("sidebar.delete")),
                    variant: "danger",
                  });
                  if (ok) deleteSession(session.id);
                }}
                className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-sidebar-accent text-muted-foreground hover:text-red-400 transition-all"
                title={t("sidebar.deleteSession")}
              >
                <Trash2 size={12} />
              </button>
            </div>
          ))
        )}
      </div>

      {/* Footer */}
      <div className="p-2 border-t border-border text-xs text-muted-foreground text-center">
        {t("sidebar.version")}
      </div>
    </form>
  );
}

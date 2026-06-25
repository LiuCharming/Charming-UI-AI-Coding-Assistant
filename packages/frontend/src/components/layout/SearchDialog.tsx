/**
 * Full-text message search dialog — searches across all sessions.
 * Same modal pattern as CommandPalette.
 */

import { useState, useRef, useEffect, useCallback } from "react";
import { Search, MessageSquare, Loader2, CornerDownLeft } from "lucide-react";
import { cn } from "@/lib/cn";
import { useI18n } from "@/i18n";
import type { SearchResponse, SearchResult, SearchMatch } from "@cgui/shared";

interface SearchDialogProps {
  isOpen: boolean;
  onClose: () => void;
  /** Called when user selects a result to navigate to. */
  onNavigate: (sessionId: string, messageIndex: number) => void;
}

/** Highlight matching text in a snippet by wrapping matches in <mark>. */
function highlightSnippet(snippet: string, query: string): React.ReactNode {
  if (!query) return snippet;
  const lower = snippet.toLowerCase();
  const q = query.toLowerCase();
  const parts: React.ReactNode[] = [];
  let last = 0;
  let pos = 0;
  while ((pos = lower.indexOf(q, pos)) !== -1) {
    if (pos > last) parts.push(snippet.slice(last, pos));
    parts.push(
      <mark key={pos} className="bg-yellow-500/30 text-foreground rounded-sm px-0.5">
        {snippet.slice(pos, pos + q.length)}
      </mark>
    );
    pos += q.length;
    last = pos;
  }
  if (last < snippet.length) parts.push(snippet.slice(last));
  return parts.length > 0 ? parts : snippet;
}

export function SearchDialog({ isOpen, onClose, onNavigate }: SearchDialogProps) {
  const { t: _t } = useI18n();
  const t = (key: string) => String(_t(key));
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [totalMatches, setTotalMatches] = useState(0);
  const [loading, setLoading] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

  // Reset on open
  useEffect(() => {
    if (isOpen) {
      setQuery("");
      setResults([]);
      setTotalMatches(0);
      setSelectedIndex(0);
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [isOpen]);

  // Debounced search
  useEffect(() => {
    if (!isOpen || !query.trim()) {
      setResults([]);
      setTotalMatches(0);
      return;
    }
    setLoading(true);
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      try {
        const res = await fetch(
          `/api/sessions/search?q=${encodeURIComponent(query.trim())}&limit=20`
        );
        if (!res.ok) throw new Error("Search failed");
        const data: SearchResponse = await res.json();
        setResults(data.results);
        setTotalMatches(data.totalMatches);
        setSelectedIndex(0);
      } catch {
        setResults([]);
      } finally {
        setLoading(false);
      }
    }, 300);
    return () => clearTimeout(debounceRef.current);
  }, [query, isOpen]);

  // Flatten results into selectable items
  const items = results.flatMap((r) =>
    r.matches.map((m) => ({ ...m, _sessionId: r.sessionId, _sessionTitle: r.sessionTitle }))
  );
  const safeIndex = Math.min(selectedIndex, Math.max(0, items.length - 1));

  // Scroll selected into view
  useEffect(() => {
    if (!listRef.current) return;
    const children = listRef.current.querySelectorAll("[data-search-item]");
    if (children[safeIndex]) {
      (children[safeIndex] as HTMLElement).scrollIntoView({ block: "nearest" });
    }
  }, [safeIndex]);

  const execute = useCallback(
    (index: number) => {
      const item = items[index];
      if (!item) return;
      onClose();
      setTimeout(() => onNavigate(item._sessionId, item.messageIndex), 0);
    },
    [items, onClose, onNavigate]
  );

  const handleKeyDown = (e: React.KeyboardEvent) => {
    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        setSelectedIndex((prev) => (prev + 1 >= items.length ? 0 : prev + 1));
        break;
      case "ArrowUp":
        e.preventDefault();
        setSelectedIndex((prev) => (prev - 1 < 0 ? items.length - 1 : prev - 1));
        break;
      case "Enter":
        e.preventDefault();
        execute(safeIndex);
        break;
      case "Escape":
        e.preventDefault();
        onClose();
        break;
    }
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-[60] flex items-start justify-center pt-[12vh]"
      onClick={onClose}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />

      {/* Dialog */}
      <div
        onClick={(e) => e.stopPropagation()}
        className="relative bg-card border border-border rounded-2xl shadow-2xl w-full max-w-xl overflow-hidden"
      >
        {/* Search input */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-border">
          <Search size={16} className="text-muted-foreground flex-shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setSelectedIndex(0);
            }}
            onKeyDown={handleKeyDown}
            placeholder={t("search.searchPlaceholder")}
            className="flex-1 bg-transparent outline-none text-sm text-foreground placeholder:text-muted-foreground"
            autoComplete="off"
            spellCheck={false}
          />
          {loading && (
            <Loader2 size={14} className="text-muted-foreground animate-spin flex-shrink-0" />
          )}
          <kbd className="text-[10px] text-muted-foreground bg-secondary rounded px-1.5 py-0.5 flex-shrink-0">
            esc
          </kbd>
        </div>

        {/* Results */}
        <div ref={listRef} className="max-h-80 overflow-y-auto p-2">
          {!query.trim() ? (
            <div className="text-sm text-muted-foreground text-center py-12">
              {t("search.searchMessages")}
            </div>
          ) : loading ? (
            <div className="text-sm text-muted-foreground text-center py-12">
              {t("search.searching")}
            </div>
          ) : items.length === 0 ? (
            <div className="text-sm text-muted-foreground text-center py-12">
              {t("search.noResults").replace("{query}", query)}
            </div>
          ) : (
            items.map((item, i) => {
              const roleLabel = item.role === "user" ? "You" : "Claude";
              const fieldLabel =
                item.field === "thinking"
                  ? "Thinking"
                  : item.field === "toolName"
                  ? "Tool"
                  : item.field === "toolInput"
                  ? "Tool Input"
                  : item.field === "toolOutput"
                  ? "Tool Output"
                  : "";
              return (
                <button
                  key={`${item.sessionId}-${item.messageIndex}-${item.field}-${i}`}
                  data-search-item
                  onClick={() => execute(i)}
                  onMouseEnter={() => setSelectedIndex(i)}
                  className={cn(
                    "w-full flex items-start gap-3 px-3 py-2.5 rounded-lg text-left transition-colors mb-0.5",
                    i === safeIndex
                      ? "bg-primary/10 text-primary"
                      : "text-foreground hover:bg-secondary"
                  )}
                >
                  <MessageSquare size={14} className="flex-shrink-0 mt-0.5 opacity-60" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className="text-xs font-medium text-primary">
                        {item._sessionTitle}
                      </span>
                      <span className="text-[10px] text-muted-foreground">
                        {roleLabel}
                      </span>
                      {fieldLabel && (
                        <span className="text-[10px] text-muted-foreground bg-secondary rounded px-1">
                          {fieldLabel}
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-muted-foreground line-clamp-2">
                      {highlightSnippet(item.snippet, query)}
                    </div>
                  </div>
                </button>
              );
            })
          )}
        </div>

        {/* Footer */}
        {items.length > 0 && (
          <div className="flex items-center gap-4 px-4 py-2 border-t border-border text-[10px] text-muted-foreground">
            <span>↑↓ Navigate</span>
            <span className="flex items-center gap-1">
              <CornerDownLeft size={10} /> Open
            </span>
            <span>Esc Close</span>
            {totalMatches > 0 && (
              <span className="ml-auto">
                {totalMatches} match{totalMatches !== 1 ? "es" : ""} in {results.length} session{results.length !== 1 ? "s" : ""}
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

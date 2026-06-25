/**
 * VS Code-style command palette.
 * Opened via Ctrl+K. Fuzzy-match against available commands.
 */

import { useState, useRef, useEffect, useCallback } from "react";
import {
  MessageSquarePlus,
  Settings,
  Sun,
  Moon,
  Copy,
  Trash2,
  FileText,
  Zap,
} from "lucide-react";
import { cn } from "@/lib/cn";
import { useI18n } from "@/i18n";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type IconComponent = any;

export interface CommandItem {
  id: string;
  label: string;
  description?: string;
  icon: IconComponent;
  action: () => void;
  keywords?: string[];
}

interface CommandPaletteProps {
  isOpen: boolean;
  onClose: () => void;
  commands: CommandItem[];
}

function fuzzyMatch(query: string, target: string): boolean {
  const q = query.toLowerCase();
  const t = target.toLowerCase();
  let qi = 0;
  for (let ti = 0; ti < t.length && qi < q.length; ti++) {
    if (t[ti] === q[qi]) qi++;
  }
  return qi === q.length;
}

export function CommandPalette({ isOpen, onClose, commands }: CommandPaletteProps) {
  const { t: _t } = useI18n();
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Reset state when opening
  useEffect(() => {
    if (isOpen) {
      setQuery("");
      setSelectedIndex(0);
      // Focus input on next frame (after dialog renders)
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [isOpen]);

  // Filter commands by query
  const filtered = query.trim()
    ? commands.filter((c) => {
        if (fuzzyMatch(query, c.label)) return true;
        if (c.description && fuzzyMatch(query, c.description)) return true;
        if (c.keywords) {
          for (const kw of c.keywords) {
            if (fuzzyMatch(query, kw)) return true;
          }
        }
        return false;
      })
    : commands;

  // Clamp selected index
  const safeIndex = Math.min(selectedIndex, Math.max(0, filtered.length - 1));

  // Scroll selected item into view
  useEffect(() => {
    if (!listRef.current) return;
    const items = listRef.current.children;
    if (items[safeIndex]) {
      (items[safeIndex] as HTMLElement).scrollIntoView({ block: "nearest" });
    }
  }, [safeIndex]);

  const execute = useCallback(
    (index: number) => {
      const cmd = filtered[index];
      if (!cmd) return;
      onClose();
      // Execute on next tick so the palette closes first
      setTimeout(() => cmd.action(), 0);
    },
    [filtered, onClose]
  );

  const handleKeyDown = (e: React.KeyboardEvent) => {
    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        setSelectedIndex((prev) => {
          const next = prev + 1;
          return next >= filtered.length ? 0 : next;
        });
        break;
      case "ArrowUp":
        e.preventDefault();
        setSelectedIndex((prev) => {
          const next = prev - 1;
          return next < 0 ? filtered.length - 1 : next;
        });
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
      className="fixed inset-0 z-[60] flex items-start justify-center pt-[15vh]"
      onClick={onClose}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />

      {/* Palette */}
      <div
        onClick={(e) => e.stopPropagation()}
        className="relative bg-card border border-border rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden"
      >
        {/* Search input */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-border">
          <span className="text-muted-foreground text-sm">&gt;</span>
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setSelectedIndex(0);
            }}
            onKeyDown={handleKeyDown}
            placeholder="Type a command or search..."
            className="flex-1 bg-transparent outline-none text-sm text-foreground placeholder:text-muted-foreground"
            autoComplete="off"
            spellCheck={false}
          />
          <kbd className="text-[10px] text-muted-foreground bg-secondary rounded px-1.5 py-0.5">
            esc
          </kbd>
        </div>

        {/* Results */}
        <div
          ref={listRef}
          className="max-h-64 overflow-y-auto p-2"
        >
          {filtered.length === 0 ? (
            <div className="text-sm text-muted-foreground text-center py-8">
              No matching commands
            </div>
          ) : (
            filtered.map((cmd, i) => {
              const Icon = cmd.icon;
              return (
                <button
                  key={cmd.id}
                  onClick={() => execute(i)}
                  onMouseEnter={() => setSelectedIndex(i)}
                  className={cn(
                    "w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left transition-colors",
                    i === safeIndex
                      ? "bg-primary/10 text-primary"
                      : "text-foreground hover:bg-secondary"
                  )}
                >
                  <Icon size={16} className="flex-shrink-0 opacity-70" />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm">{cmd.label}</div>
                    {cmd.description && (
                      <div className="text-xs text-muted-foreground truncate">
                        {cmd.description}
                      </div>
                    )}
                  </div>
                </button>
              );
            })
          )}
        </div>

        {/* Footer hint */}
        <div className="flex items-center gap-4 px-4 py-2 border-t border-border text-[10px] text-muted-foreground">
          <span>↑↓ Navigate</span>
          <span>↵ Execute</span>
          <span>Esc Close</span>
        </div>
      </div>
    </div>
  );
}

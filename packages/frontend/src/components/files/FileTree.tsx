/**
 * Recursive file tree. Each directory is lazily loaded on expand.
 */

import { createContext, useContext, useState, useCallback, useEffect } from "react";
import { rest } from "@/api/restClient";
import { cn } from "@/lib/cn";
import { Folder, FolderOpen, File, ChevronRight, Loader2 } from "lucide-react";

// ─── Types ─────────────────────────────────────────────────

export interface FileEntry {
  name: string;
  path: string;
  isDirectory: boolean;
  size: number;
  modifiedAt: number;
}

// ─── Context to avoid prop drilling ────────────────────────

interface TreeCtx {
  selectedPath: string | null;
  select: (path: string) => void;
}

const TreeContext = createContext<TreeCtx>({ selectedPath: null, select: () => {} });

// ─── TreeNode ───────────────────────────────────────────────

function Row({ entry, depth }: { entry: FileEntry; depth: number }) {
  const { selectedPath, select } = useContext(TreeContext);
  const [open, setOpen] = useState(false);
  const [kids, setKids] = useState<FileEntry[] | null>(null);
  const [busy, setBusy] = useState(false);

  const handleClick = useCallback(async () => {
    if (!entry.isDirectory) {
      select(entry.path);
      return;
    }
    if (open) { setOpen(false); return; }
    if (kids === null) {
      setBusy(true);
      try {
        const data = await rest.get<{ path: string; entries: FileEntry[] }>(
          `/files?path=${encodeURIComponent(entry.path)}`
        );
        setKids(data.entries);
        setOpen(true);
      } catch { /* network error — silently skip */ }
      finally { setBusy(false); }
    } else {
      setOpen(true);
    }
  }, [entry, open, kids, select]);

  const active = selectedPath === entry.path;
  const pad = depth * 12 + 8;

  return (
    <div>
      <button
        onClick={handleClick}
        className={cn(
          "w-full flex items-center gap-1.5 py-1 px-2 rounded text-xs text-left hover:bg-secondary/60 transition-colors",
          active ? "bg-primary/10 text-primary" : "text-muted-foreground"
        )}
        style={{ paddingLeft: pad }}
      >
        {/* Chevron or spacer */}
        {entry.isDirectory
          ? busy
            ? <Loader2 size={12} className="animate-spin shrink-0" />
            : <ChevronRight size={12} className={cn("shrink-0 transition", open && "rotate-90")} />
          : <span className="w-3 shrink-0" />
        }

        {/* Icon */}
        {entry.isDirectory
          ? (open ? <FolderOpen size={14} className="shrink-0 text-amber-500" /> : <Folder size={14} className="shrink-0 text-amber-500" />)
          : <File size={14} className="shrink-0 text-blue-400" />
        }

        <span className="truncate">{entry.name}</span>
      </button>

      {open && kids && kids.map((child) => (
        <Row key={child.path} entry={child} depth={depth + 1} />
      ))}
    </div>
  );
}

// ─── FileTree root ──────────────────────────────────────────

interface FileTreeProps {
  rootPath: string;
  selectedPath: string | null;
  onSelect: (path: string) => void;
}

export function FileTree({ rootPath, selectedPath, onSelect }: FileTreeProps) {
  const [entries, setEntries] = useState<FileEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!rootPath) return;
    setLoading(true);
    rest
      .get<{ entries: FileEntry[] }>(`/files?path=${encodeURIComponent(rootPath)}`)
      .then((d) => setEntries(d.entries))
      .catch(() => setEntries([]))
      .finally(() => setLoading(false));
  }, [rootPath]);

  const ctx: TreeCtx = { selectedPath, select: onSelect };

  if (loading) {
    return <div className="flex justify-center py-8"><Loader2 size={16} className="animate-spin text-muted-foreground" /></div>;
  }
  if (entries.length === 0) {
    return <div className="text-xs text-muted-foreground text-center py-8">Empty directory</div>;
  }

  return (
    <TreeContext.Provider value={ctx}>
      <div className="py-1">
        {entries.map((e) => <Row key={e.path} entry={e} depth={0} />)}
      </div>
    </TreeContext.Provider>
  );
}

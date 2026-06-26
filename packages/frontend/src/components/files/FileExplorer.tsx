/**
 * File explorer panel — tree on top, preview below with a draggable divider.
 * Supports maximizing the preview to fill the panel.
 */

import { useState, useCallback, useRef, useEffect } from "react";
import { PanelRightClose, FolderOpen, RefreshCw, GripHorizontal, Maximize2, Minimize2 } from "lucide-react";
import { useI18n } from "@/i18n";
import { FileTree } from "./FileTree";
import { FilePreview } from "./FilePreview";

const MIN_PREVIEW = 100;
const TREE_MIN = 60;
const DEFAULT_SPLIT = 50;

interface FileExplorerProps {
  rootPath: string;
  onClose: () => void;
}

export function FileExplorer({ rootPath, onClose }: FileExplorerProps) {
  const { t: _ } = useI18n();
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [treeKey, setTreeKey] = useState(0);
  const [previewMaximized, setPreviewMaximized] = useState(false);

  // ── Internal resize between tree and preview ─────────
  const containerRef = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);
  const [splitPct, setSplitPct] = useState(DEFAULT_SPLIT);

  const onDividerDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    dragging.current = true;
    document.body.style.cursor = "row-resize";
    document.body.style.userSelect = "none";
  }, []);

  useEffect(() => {
    const move = (e: MouseEvent) => {
      if (!dragging.current || !containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const pct = ((e.clientY - rect.top) / rect.height) * 100;
      setSplitPct(Math.max(TREE_MIN, Math.min(100 - MIN_PREVIEW / (rect.height || 1) * 100, pct)));
    };
    const up = () => {
      if (!dragging.current) return;
      dragging.current = false;
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
    document.addEventListener("mousemove", move);
    document.addEventListener("mouseup", up);
    return () => {
      document.removeEventListener("mousemove", move);
      document.removeEventListener("mouseup", up);
    };
  }, []);

  return (
    <div ref={containerRef} className="h-full flex flex-col bg-sidebar">
      {/* ── Header ──────────────────────────────────── */}
      <div className="flex items-center justify-between px-3 py-2.5 border-b border-border shrink-0">
        <div className="flex items-center gap-2 text-xs font-medium text-foreground min-w-0">
          <FolderOpen size={14} className="text-amber-500 shrink-0" />
          <span className="truncate">
            {rootPath.split(/[/\\]/).pop() || rootPath}
          </span>
        </div>
        <div className="flex items-center gap-0.5">
          {selectedPath && (
            <button
              onClick={() => setPreviewMaximized((v) => !v)}
              className="p-1 rounded hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors"
              title={previewMaximized ? "Restore tree" : "Maximize preview"}
            >
              {previewMaximized ? <Minimize2 size={13} /> : <Maximize2 size={13} />}
            </button>
          )}
          <button onClick={() => setTreeKey((k) => k + 1)}
            className="p-1 rounded hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors"
            title="Refresh">
            <RefreshCw size={12} />
          </button>
          <button onClick={onClose}
            className="p-1 rounded hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors"
            title="Close">
            <PanelRightClose size={14} />
          </button>
        </div>
      </div>

      {/* ── Maximized preview mode ──────────────────── */}
      {previewMaximized && selectedPath && (
        <div className="flex-1 min-h-0 flex flex-col">
          <div className="px-3 py-1.5 border-b border-border shrink-0 bg-secondary/30 flex items-center justify-between">
            <span className="text-[10px] font-mono text-muted-foreground truncate">
              {selectedPath}
            </span>
          </div>
          <FilePreview filePath={selectedPath} />
        </div>
      )}

      {/* ── Split mode: tree + preview ──────────────── */}
      {!previewMaximized && (
        <>
          {/* Tree */}
          <div className="overflow-y-auto" style={{ height: selectedPath ? `${splitPct}%` : "100%" }}>
            <FileTree key={treeKey} rootPath={rootPath} selectedPath={selectedPath} onSelect={setSelectedPath} />
          </div>

          {/* Divider + Preview */}
          {selectedPath && (
            <>
              <div
                onMouseDown={onDividerDown}
                className="h-1.5 shrink-0 cursor-row-resize hover:bg-primary/20 active:bg-primary/30 transition-colors flex items-center justify-center group"
              >
                <GripHorizontal size={12} className="opacity-0 group-hover:opacity-40 text-primary transition-opacity" />
              </div>

              <div className="flex-1 min-h-0 flex flex-col border-t border-border">
                <div className="px-3 py-1.5 border-b border-border shrink-0 bg-secondary/30">
                  <span className="text-[10px] font-mono text-muted-foreground truncate block">
                    {selectedPath}
                  </span>
                </div>
                <FilePreview filePath={selectedPath} />
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}

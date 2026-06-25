/**
 * Fetches and displays file content.
 * Truncates at MAX_LINES to avoid rendering huge files.
 */

import { useState, useEffect } from "react";
import { rest } from "@/api/restClient";
import { formatBytes } from "@/lib/format";
import { FileText, Loader2, AlertTriangle } from "lucide-react";

const MAX_LINES = 200;

interface FilePreviewProps {
  filePath: string | null;
}

interface Meta {
  size: number;
  modifiedAt: number;
}

function truncate(content: string): string {
  const lines = content.split("\n");
  if (lines.length <= MAX_LINES) return content;
  return lines.slice(0, MAX_LINES).join("\n")
    + `\n\n// ... ${lines.length - MAX_LINES} more lines ...`;
}

export function FilePreview({ filePath }: FilePreviewProps) {
  const [content, setContent] = useState<string | null>(null);
  const [meta, setMeta] = useState<Meta | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!filePath) {
      setContent(null);
      setMeta(null);
      setError(null);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);

    rest
      .get<{ content: string; size: number; modifiedAt: number }>(
        `/files/content?path=${encodeURIComponent(filePath)}`
      )
      .then((data) => {
        if (cancelled) return;
        setContent(truncate(data.content));
        setMeta({ size: data.size, modifiedAt: data.modifiedAt });
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Failed to load");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
  }, [filePath]);

  // ── States ──────────────────────────────────────────

  if (!filePath) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-center text-muted-foreground/60">
          <FileText size={32} className="mx-auto mb-2 opacity-30" />
          <p className="text-xs">Select a file to preview</p>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center">
        <Loader2 size={20} className="animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-center">
          <AlertTriangle size={24} className="mx-auto mb-2 text-amber-500" />
          <p className="text-xs text-muted-foreground">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      {meta && (
        <div className="flex items-center gap-3 px-3 py-1.5 border-b border-border text-[10px] text-muted-foreground shrink-0">
          <span>{formatBytes(meta.size)}</span>
          <span className="opacity-30">|</span>
          <span>{new Date(meta.modifiedAt).toLocaleString()}</span>
        </div>
      )}
      <pre className="flex-1 overflow-auto p-3 text-xs font-mono text-foreground/90 whitespace-pre leading-relaxed">
        {content}
      </pre>
    </div>
  );
}

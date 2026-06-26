/**
 * Fetches and displays file content with syntax highlighting.
 * Edit mode uses a transparent textarea overlaid on Shiki-highlighted code,
 * so the editing style matches the preview exactly.
 */

import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import ReactMarkdown from "react-markdown";
import { rest } from "@/api/restClient";
import { formatBytes } from "@/lib/format";
import { useTheme } from "@/hooks/useTheme";
import { getHighlighter, getCachedHighlight, setCachedHighlight, guessLangFromPath } from "@/lib/shiki";
import { FileText, Loader2, AlertTriangle, Eye, Code2, Pencil, Save, X } from "lucide-react";
import { cn } from "@/lib/cn";
import { CodeBlock } from "@/components/chat/CodeBlock";
import { toast } from "@/lib/toast";

interface FilePreviewProps {
  filePath: string | null;
}

interface Meta {
  size: number;
  modifiedAt: number;
}

export function FilePreview({ filePath }: FilePreviewProps) {
  const { resolved: themeResolved } = useTheme();
  const dark = themeResolved === "dark";
  const [content, setContent] = useState<string | null>(null);
  const [meta, setMeta] = useState<Meta | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [highlightedHtml, setHighlightedHtml] = useState<string>("");
  const [highlighting, setHighlighting] = useState(false);
  const [truncated, setTruncated] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editContent, setEditContent] = useState("");
  const [saving, setSaving] = useState(false);
  const [editHighlightedHtml, setEditHighlightedHtml] = useState("");

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const highlightRef = useRef<HTMLDivElement>(null);
  const highlightTimerRef = useRef<ReturnType<typeof setTimeout>>();

  // Reset edit mode when file changes
  useEffect(() => {
    setEditing(false);
    setEditHighlightedHtml("");
  }, [filePath]);

  useEffect(() => {
    if (!filePath) {
      setContent(null);
      setMeta(null);
      setError(null);
      setHighlightedHtml("");
      setTruncated(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);
    setHighlightedHtml("");
    setTruncated(false);

    rest
      .get<{ content: string; size: number; modifiedAt: number; truncated?: boolean }>(
        `/files/content?path=${encodeURIComponent(filePath)}`
      )
      .then((data) => {
        if (cancelled) return;
        setContent(data.content);
        setMeta({ size: data.size, modifiedAt: data.modifiedAt });
        if (data.truncated) setTruncated(true);
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

  // ── Highlight when content arrives (skip markdown — rendered separately) ──
  const isMarkdown = filePath ? /\.(md|mdx)$/i.test(filePath) : false;

  useEffect(() => {
    if (!content || !filePath || isMarkdown) return;

    const text = content;
    const lang = guessLangFromPath(filePath);
    const cached = getCachedHighlight(dark, lang, text);
    if (cached) {
      setHighlightedHtml(cached);
      return;
    }

    let cancelled = false;
    setHighlighting(true);

    async function highlight() {
      try {
        const hl = await getHighlighter(dark ? "dark" : "light");
        if (cancelled) return;
        const result = hl.codeToHtml(text, {
          lang,
          theme: dark ? "dark-plus" : "github-light",
        });
        if (!cancelled) {
          setCachedHighlight(dark, lang, text, result);
          setHighlightedHtml(result);
        }
      } catch {
        if (!cancelled) setHighlightedHtml("");
      } finally {
        if (!cancelled) setHighlighting(false);
      }
    }

    highlight();
    return () => { cancelled = true; };
  }, [content, filePath, dark, isMarkdown]);

  // ── Live highlight for edit mode (debounced) ──────────
  useEffect(() => {
    if (!editing || !editContent) {
      setEditHighlightedHtml("");
      return;
    }

    const lang = guessLangFromPath(filePath ?? "");
    const cached = getCachedHighlight(dark, `edit:${lang}`, editContent);
    if (cached) {
      setEditHighlightedHtml(cached);
      return;
    }

    clearTimeout(highlightTimerRef.current);
    highlightTimerRef.current = setTimeout(async () => {
      try {
        const hl = await getHighlighter(dark ? "dark" : "light");
        const result = hl.codeToHtml(editContent, {
          lang,
          theme: dark ? "dark-plus" : "github-light",
        });
        setCachedHighlight(dark, `edit:${lang}`, editContent, result);
        setEditHighlightedHtml(result);
      } catch {
        // ignore
      }
    }, 200);

    return () => clearTimeout(highlightTimerRef.current);
  }, [editing, editContent, filePath, dark]);

  // ── Sync scroll between textarea and highlight layer ──
  const syncScroll = useCallback(() => {
    const ta = textareaRef.current;
    const hl = highlightRef.current;
    if (ta && hl) {
      hl.scrollTop = ta.scrollTop;
      hl.scrollLeft = ta.scrollLeft;
    }
  }, []);

  // ── Edit handlers ────────────────────────────────────
  const enterEdit = useCallback(() => {
    if (content != null) {
      setEditContent(content);
      setEditing(true);
      setEditHighlightedHtml("");
    }
  }, [content]);

  const cancelEdit = useCallback(() => {
    setEditing(false);
    setEditContent("");
    setEditHighlightedHtml("");
  }, []);

  const saveFile = useCallback(async () => {
    if (!filePath || saving) return;
    setSaving(true);
    try {
      const data = await rest.post<{ size: number; modifiedAt: number }>(
        "/files/save",
        { path: filePath, content: editContent }
      );
      setContent(editContent);
      setMeta({ size: data.size, modifiedAt: data.modifiedAt });
      setHighlightedHtml("");
      setEditing(false);
      setEditHighlightedHtml("");
      toast.success("File saved");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  }, [filePath, editContent, saving]);

  // Ctrl+S to save
  useEffect(() => {
    if (!editing) return;
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "s") {
        e.preventDefault();
        saveFile();
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [editing, saveFile]);

  // ── Stable markdown components (no re-render on stream) ──────────────────
  const markdownComponents = useMemo(
    () => ({
      code: ({ children, className, ...props }: any) => {
        const isInline = !className;
        if (isInline) {
          return (
            <code
              className="bg-secondary text-foreground/90 rounded px-1 py-0.5 text-[11px] font-mono"
              {...props}
            >
              {children}
            </code>
          );
        }
        const lang = className.replace("language-", "");
        const codeString = String(children).replace(/\n$/, "");
        return <CodeBlock language={lang}>{codeString}</CodeBlock>;
      },
      pre: ({ children }: any) => <>{children}</>,
    }),
    []
  );

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

  const langName = isMarkdown ? "Markdown" : guessLangFromPath(filePath);
  const lineCount = content ? content.split("\n").length : 0;

  return (
    <div className="flex-1 min-h-0 flex flex-col">
      {/* Meta bar */}
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-border shrink-0">
        <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
          <span className="flex items-center gap-1">
            <FileText size={11} />
            <span className="font-mono text-xs">{filePath.split(/[/\\]/).pop()}</span>
          </span>
          {meta && (
            <>
              <span className="opacity-30">|</span>
              <span>{formatBytes(meta.size)}</span>
              <span className="opacity-30">|</span>
              <span>{lineCount.toLocaleString()} lines</span>
              <span className="opacity-30">|</span>
              <span>{new Date(meta.modifiedAt).toLocaleString()}</span>
            </>
          )}
        </div>
        <div className="flex items-center gap-1">
          {editing ? (
            <>
              <button
                onClick={saveFile}
                disabled={saving}
                className="flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/25 transition-colors disabled:opacity-50"
              >
                <Save size={10} />
                {saving ? "saving..." : "save"}
              </button>
              <button
                onClick={cancelEdit}
                className="flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded bg-secondary text-muted-foreground hover:text-foreground transition-colors"
              >
                <X size={10} />
                cancel
              </button>
            </>
          ) : (
            <>
              <button
                onClick={enterEdit}
                disabled={truncated}
                className="flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded bg-secondary text-muted-foreground hover:text-foreground transition-colors disabled:opacity-40"
                title={truncated ? "Cannot edit truncated files" : "Edit file"}
              >
                <Pencil size={10} />
                edit
              </button>
              <span className={cn("text-[10px] px-1.5 py-0.5 rounded", "bg-secondary text-muted-foreground")}>
                {highlighting ? (
                  <span className="flex items-center gap-1">
                    <Loader2 size={10} className="animate-spin" />
                    highlighting...
                  </span>
                ) : isMarkdown ? (
                  <span className="flex items-center gap-1">
                    <Eye size={10} />
                    {langName}
                  </span>
                ) : highlightedHtml ? (
                  <span className="flex items-center gap-1">
                    <Eye size={10} />
                    {langName}
                  </span>
                ) : (
                  <span className="flex items-center gap-1">
                    <Code2 size={10} />
                    {langName}
                  </span>
                )}
              </span>
            </>
          )}
        </div>
      </div>

      {/* Truncation warning */}
      {truncated && (
        <div className="px-3 py-1.5 bg-amber-500/10 border-b border-amber-500/20 text-[11px] text-amber-600 dark:text-amber-400 flex items-center gap-1.5 shrink-0">
          <AlertTriangle size={12} />
          <span>File exceeds 5MB — showing first 1MB</span>
        </div>
      )}

      {/* Content */}
      {editing ? (
        <div className="flex-1 min-h-0 relative">
          {/* Highlight layer — Shiki output, scroll-synced with textarea */}
          <div
            ref={highlightRef}
            className="absolute inset-0 overflow-hidden p-3 text-xs font-mono leading-relaxed whitespace-pre-wrap break-all pointer-events-none shiki-wrapper [&_.shiki]:bg-transparent! [&_.shiki]:p-0! [&_pre]:whitespace-pre-wrap! [&_pre]:break-all! [&_pre]:m-0!"
            dangerouslySetInnerHTML={{
              __html: editHighlightedHtml || `<pre>${escapeHtml(editContent)}</pre>`,
            }}
          />
          {/* Transparent textarea — captures input, highlight shows through */}
          <textarea
            ref={textareaRef}
            value={editContent}
            onChange={(e) => setEditContent(e.target.value)}
            onScroll={syncScroll}
            className="absolute inset-0 w-full h-full resize-none bg-transparent font-mono text-xs p-3 leading-relaxed overflow-auto outline-none border-0"
            style={{
              color: "transparent",
              caretColor: dark ? "#5296e2" : "#1a73e8",
              whiteSpace: "pre-wrap",
              wordBreak: "break-all",
              WebkitTextFillColor: "transparent",
            }}
            spellCheck={false}
            autoFocus
          />
        </div>
      ) : isMarkdown && content ? (
        <div className="flex-1 overflow-auto p-4 text-sm leading-relaxed prose prose-sm dark:prose-invert max-w-none [&_table]:text-xs [&_th]:p-1.5 [&_td]:p-1.5 [&_h1]:text-lg [&_h2]:text-base [&_h3]:text-sm [&_pre]:my-2 [&_pre]:rounded-lg">
          <ReactMarkdown components={markdownComponents}>
            {content}
          </ReactMarkdown>
        </div>
      ) : highlightedHtml ? (
        <div
          className="flex-1 overflow-auto p-3 text-xs leading-relaxed shiki-wrapper [&_.shiki]:bg-transparent! [&_.shiki]:p-0! [&_pre]:whitespace-pre-wrap [&_pre]:break-all"
          dangerouslySetInnerHTML={{ __html: highlightedHtml }}
        />
      ) : (
        <pre className="flex-1 overflow-auto p-3 text-xs font-mono text-foreground/90 whitespace-pre leading-relaxed">
          {content}
        </pre>
      )}
    </div>
  );
}

/** Escape HTML so raw text can be shown inside dangerouslySetInnerHTML fallback. */
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

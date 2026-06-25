/**
 * Fetches and displays file content with syntax highlighting.
 */

import { useState, useEffect, useMemo } from "react";
import ReactMarkdown from "react-markdown";
import { rest } from "@/api/restClient";
import { formatBytes } from "@/lib/format";
import { useTheme } from "@/hooks/useTheme";
import { getHighlighter, getCachedHighlight, setCachedHighlight, guessLangFromPath } from "@/lib/shiki";
import { FileText, Loader2, AlertTriangle, Eye, Code2 } from "lucide-react";
import { cn } from "@/lib/cn";
import { CodeBlock } from "@/components/chat/CodeBlock";

const MAX_LINES = 300;

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
  const { resolved: themeResolved } = useTheme();
  const dark = themeResolved === "dark";
  const [content, setContent] = useState<string | null>(null);
  const [meta, setMeta] = useState<Meta | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [highlightedHtml, setHighlightedHtml] = useState<string>("");
  const [highlighting, setHighlighting] = useState(false);

  useEffect(() => {
    if (!filePath) {
      setContent(null);
      setMeta(null);
      setError(null);
      setHighlightedHtml("");
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);
    setHighlightedHtml("");

    rest
      .get<{ content: string; size: number; modifiedAt: number }>(
        `/files/content?path=${encodeURIComponent(filePath)}`
      )
      .then((data) => {
        if (cancelled) return;
        const truncated = truncate(data.content);
        setContent(truncated);
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

  const ext = (filePath.split(".").pop() || "").toLowerCase();
  const langName = isMarkdown ? "Markdown" : guessLangFromPath(filePath);

  return (
    <div className="h-full flex flex-col">
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
              <span>{new Date(meta.modifiedAt).toLocaleString()}</span>
            </>
          )}
        </div>
        <span className={cn(
          "text-[10px] px-1.5 py-0.5 rounded",
          "bg-secondary text-muted-foreground"
        )}>
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
      </div>

      {/* Content */}
      {isMarkdown && content ? (
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

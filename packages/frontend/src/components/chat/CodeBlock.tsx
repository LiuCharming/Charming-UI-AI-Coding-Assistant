import { useEffect, useState, useRef } from "react";
import { useTheme } from "@/hooks/useTheme";

// Shiki imports
let highlighterPromise: Promise<import("shiki").Highlighter> | null = null;
let currentTheme: "dark" | "light" = "dark";

async function getHighlighter(theme: "dark" | "light") {
  // Re-create if theme changed
  if (highlighterPromise && currentTheme !== theme) {
    highlighterPromise = null;
  }
  if (!highlighterPromise) {
    currentTheme = theme;
    highlighterPromise = import("shiki").then(({ createHighlighter }) =>
      createHighlighter({
        themes: [theme === "dark" ? "dark-plus" : "github-light"],
        langs: [
          "typescript",
          "javascript",
          "tsx",
          "jsx",
          "python",
          "json",
          "html",
          "css",
          "bash",
          "shell",
          "sh",
          "yaml",
          "yml",
          "markdown",
          "md",
          "sql",
          "rust",
          "go",
          "java",
          "c",
          "cpp",
          "csharp",
          "ruby",
          "php",
          "swift",
          "kotlin",
          "xml",
          "diff",
          "plaintext",
          "text",
        ],
      })
    );
  }
  return highlighterPromise;
}

interface CodeBlockProps {
  children: string;
  language?: string;
}

// Cache highlighted results to avoid re-highlighting
const highlightCache = new Map<string, string>();
const MAX_CACHE_SIZE = 200;

export function CodeBlock({ children, language }: CodeBlockProps) {
  const { resolved: themeResolved } = useTheme();
  const dark = themeResolved === "dark";
  const [html, setHtml] = useState<string>("");
  const mountedRef = useRef(true);

  const cacheKey = `${dark ? "dark" : "light"}:${language || "text"}:${children}`;
  const cached = highlightCache.get(cacheKey);

  useEffect(() => {
    mountedRef.current = true;

    if (cached) {
      setHtml(cached);
      return;
    }

    let cancelled = false;

    async function highlight() {
      try {
        const hl = await getHighlighter(dark ? "dark" : "light");
        if (cancelled || !mountedRef.current) return;

        const normalizedLang = normalizeLang(language || "text");
        const result = hl.codeToHtml(children, {
          lang: normalizedLang,
          theme: dark ? "dark-plus" : "github-light",
        });

        if (!cancelled && mountedRef.current) {
          // Trim cache if too large
          if (highlightCache.size >= MAX_CACHE_SIZE) {
            const firstKey = highlightCache.keys().next().value;
            if (firstKey) highlightCache.delete(firstKey);
          }
          highlightCache.set(cacheKey, result);
          setHtml(result);
        }
      } catch {
        // Fallback: Shiki can't highlight this language, show plain
        if (!cancelled && mountedRef.current) {
          setHtml("");
        }
      }
    }

    highlight();

    return () => {
      cancelled = true;
      mountedRef.current = false;
    };
  }, [cacheKey, cached, children, language, dark]);

  // If we have highlighted HTML, render it
  if (html) {
    return (
      <div
        className="shiki-wrapper [&_.shiki]:bg-transparent! [&_.shiki]:p-0! [&_pre]:overflow-x-auto"
        dangerouslySetInnerHTML={{ __html: html }}
      />
    );
  }

  // Fallback: plain code with basic styling
  return (
    <code className="font-mono text-sm block overflow-x-auto whitespace-pre">
      {children}
    </code>
  );
}

function normalizeLang(lang: string): string {
  const map: Record<string, string> = {
    ts: "typescript",
    js: "javascript",
    jsx: "jsx",
    tsx: "tsx",
    py: "python",
    rb: "ruby",
    sh: "bash",
    shell: "bash",
    zsh: "bash",
    yml: "yaml",
    md: "markdown",
    cs: "csharp",
    cpp: "cpp",
    cc: "cpp",
    cxx: "cpp",
    kt: "kotlin",
    txt: "text",
    plaintext: "text",
    "": "text",
  };
  return map[lang.toLowerCase()] || lang.toLowerCase();
}

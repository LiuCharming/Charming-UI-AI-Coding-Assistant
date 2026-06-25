import { useEffect, useState, useRef } from "react";
import { useTheme } from "@/hooks/useTheme";
import { getHighlighter, getCachedHighlight, setCachedHighlight, normalizeLang } from "@/lib/shiki";

interface CodeBlockProps {
  children: string;
  language?: string;
}

export function CodeBlock({ children, language }: CodeBlockProps) {
  const { resolved: themeResolved } = useTheme();
  const dark = themeResolved === "dark";
  const [html, setHtml] = useState<string>("");
  const mountedRef = useRef(true);

  const cached = getCachedHighlight(dark, language || "text", children);

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
          setCachedHighlight(dark, language || "text", children, result);
          setHtml(result);
        }
      } catch {
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
  }, [cached, children, language, dark]);

  if (html) {
    return (
      <div
        className="shiki-wrapper [&_.shiki]:bg-transparent! [&_.shiki]:p-0! [&_pre]:overflow-x-auto"
        dangerouslySetInnerHTML={{ __html: html }}
      />
    );
  }

  return (
    <code className="font-mono text-sm block overflow-x-auto whitespace-pre">
      {children}
    </code>
  );
}

/**
 * Shiki syntax highlighter singleton.
 * Shared by CodeBlock (chat) and FilePreview (file explorer).
 */

let highlighterPromise: Promise<import("shiki").Highlighter> | null = null;
let currentTheme: "dark" | "light" = "dark";

const highlightCache = new Map<string, string>();
const MAX_CACHE_SIZE = 300;

export async function getHighlighter(theme: "dark" | "light") {
  if (highlighterPromise && currentTheme !== theme) {
    highlighterPromise = null;
  }
  if (!highlighterPromise) {
    currentTheme = theme;
    highlighterPromise = import("shiki").then(({ createHighlighter }) =>
      createHighlighter({
        themes: [theme === "dark" ? "dark-plus" : "github-light"],
        langs: [
          "typescript", "javascript", "tsx", "jsx", "python",
          "json", "html", "css", "bash", "shell", "sh",
          "yaml", "yml", "markdown", "md", "sql",
          "rust", "go", "java", "c", "cpp", "csharp",
          "ruby", "php", "swift", "kotlin", "xml",
          "diff", "toml", "ini", "dockerfile", "makefile",
          "plaintext", "text",
        ],
      })
    );
  }
  return highlighterPromise;
}

export function getCachedHighlight(dark: boolean, language: string, code: string): string | undefined {
  const cacheKey = `${dark ? "dark" : "light"}:${language || "text"}:${code}`;
  return highlightCache.get(cacheKey);
}

export function setCachedHighlight(dark: boolean, language: string, code: string, html: string): void {
  const cacheKey = `${dark ? "dark" : "light"}:${language || "text"}:${code}`;
  if (highlightCache.size >= MAX_CACHE_SIZE) {
    const firstKey = highlightCache.keys().next().value;
    if (firstKey) highlightCache.delete(firstKey);
  }
  highlightCache.set(cacheKey, html);
}

export function normalizeLang(lang: string): string {
  const map: Record<string, string> = {
    ts: "typescript", tsx: "tsx",
    js: "javascript", jsx: "jsx",
    py: "python", rb: "ruby",
    sh: "bash", shell: "bash", zsh: "bash",
    yml: "yaml",
    md: "markdown",
    cs: "csharp",
    cpp: "cpp", cc: "cpp", cxx: "cpp",
    kt: "kotlin",
    txt: "text", plaintext: "text",
    "": "text",
    toml: "toml",
    ini: "ini",
    cfg: "ini",
    conf: "ini",
    dockerfile: "dockerfile",
    makefile: "makefile",
  };
  return map[lang.toLowerCase()] || lang.toLowerCase();
}

/** Guess language from file extension. */
export function guessLangFromPath(filePath: string): string {
  const ext = (filePath.split(".").pop() || "").toLowerCase();
  const map: Record<string, string> = {
    ts: "typescript", tsx: "tsx",
    js: "javascript", jsx: "jsx", mjs: "javascript", cjs: "javascript",
    py: "python", pyi: "python",
    rb: "ruby",
    rs: "rust",
    go: "go",
    java: "java",
    c: "c", h: "c",
    cpp: "cpp", cc: "cpp", cxx: "cpp", hpp: "cpp",
    cs: "csharp",
    php: "php",
    swift: "swift",
    kt: "kotlin",
    json: "json", jsonc: "json",
    html: "html", htm: "html",
    css: "css", scss: "css", less: "css",
    xml: "xml", svg: "xml",
    yaml: "yaml", yml: "yaml",
    md: "markdown", mdx: "markdown",
    sql: "sql",
    sh: "bash", bash: "bash", zsh: "bash",
    ps1: "shell",
    toml: "toml",
    ini: "ini", cfg: "ini", conf: "ini",
    diff: "diff", patch: "diff",
    dockerfile: "dockerfile",
    makefile: "makefile",
    txt: "text", log: "text",
  };
  return map[ext] || "text";
}

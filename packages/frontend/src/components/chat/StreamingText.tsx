import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import "katex/dist/katex.min.css";
import { CodeBlock } from "./CodeBlock";

interface StreamingTextProps {
  content: string;
  isStreaming?: boolean;
}

export function StreamingText({ content, isStreaming }: StreamingTextProps) {
  if (!content) return null;

  // During active streaming, render plain text to avoid expensive
  // ReactMarkdown re-parsing (remark-gfm + remark-math + rehype-katex)
  // on every text_delta — this is the main source of scroll lag.
  if (isStreaming) {
    return (
      <div className="streaming-cursor whitespace-pre-wrap">
        {content}
      </div>
    );
  }

  // Fully rendered markdown after streaming completes
  return (
    <div>
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkMath]}
        rehypePlugins={[rehypeKatex]}
        components={{
          // Custom code block with copy button + syntax highlighting
          pre: ({ children, ...props }) => {
            // Extract raw code string from children for clipboard copy
            let codeString = "";
            const child = children as
              | { props?: { children?: string; className?: string } }
              | undefined;
            if (child?.props?.children) {
              codeString = String(child.props.children);
            }
            return (
              <div className="relative group/code my-3 rounded-lg border border-border overflow-hidden">
                {/* Header bar with language label + copy button */}
                <div className="flex items-center justify-between px-3 py-1.5 bg-secondary/50 border-b border-border">
                  <span className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider">
                    {child?.props?.className
                      ? child.props.className.replace("language-", "")
                      : "code"}
                  </span>
                  <button
                    onClick={() => navigator.clipboard.writeText(codeString)}
                    className="text-[10px] text-muted-foreground hover:text-foreground transition-colors"
                  >
                    Copy
                  </button>
                </div>
                {/* Code content */}
                <div className="overflow-x-auto">
                  <pre {...props}>{children}</pre>
                </div>
              </div>
            );
          },
          code: ({ children, className, ...props }) => {
            const isInline = !className;
            if (isInline) {
              return (
                <code
                  className="bg-secondary rounded px-1.5 py-0.5 text-sm font-mono"
                  {...props}
                >
                  {children}
                </code>
              );
            }
            // Fenced code block — use Shiki for syntax highlighting
            const lang = className.replace("language-", "");
            const codeString = String(children).replace(/\n$/, "");
            return (
              <CodeBlock language={lang}>{codeString}</CodeBlock>
            );
          },
          a: ({ href, children, ...props }) => (
            <a
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary underline underline-offset-2 hover:opacity-80"
              {...props}
            >
              {children}
            </a>
          ),
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}

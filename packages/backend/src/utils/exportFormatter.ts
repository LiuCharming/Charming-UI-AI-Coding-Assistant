/**
 * Export session as Markdown or JSON.
 */
import type { SessionDetail } from "@cgui/shared";

/** Sanitize a string for use in a filename. */
function sanitizeFilename(name: string): string {
  return name.replace(/[<>:"/\\|?*]/g, "_").replace(/\s+/g, "_").slice(0, 120);
}

/** Escape pipe characters in table cells for GFM. */
function escTable(s: string): string {
  return s.replace(/\|/g, "\\|").replace(/\n/g, " ");
}

/** Format a single message as Markdown. */
function formatMessage(msg: SessionDetail["messages"][number]): string {
  const lines: string[] = [];
  const who = msg.role === "user" ? "You" : "Claude";

  lines.push(`### ${who}`);

  if (msg.content) {
    lines.push("");
    lines.push(msg.content);
  }

  if (msg.thinking) {
    lines.push("");
    lines.push(`<details>`);
    lines.push(`<summary>🤔 Thinking</summary>`);
    lines.push("");
    lines.push("> " + msg.thinking.replace(/\n/g, "\n> "));
    lines.push("");
    lines.push(`</details>`);
  }

  if (msg.toolCalls && msg.toolCalls.length > 0) {
    for (const tc of msg.toolCalls) {
      lines.push("");
      lines.push(`<details>`);
      lines.push(
        `<summary>🔧 <code>${escTable(tc.toolName)}</code> ${tc.isError ? "❌" : "✅"} (${tc.durationMs != null ? `${tc.durationMs}ms` : "—"})</summary>`
      );
      lines.push("");
      lines.push(`**Input:**`);
      lines.push("```json");
      lines.push(JSON.stringify(tc.input, null, 2));
      lines.push("```");
      if (tc.output) {
        lines.push("");
        lines.push(`**Output:**`);
        lines.push("```");
        lines.push(tc.output.length > 5000 ? tc.output.slice(0, 5000) + "\n…(truncated)" : tc.output);
        lines.push("```");
      }
      lines.push("");
      lines.push(`</details>`);
    }
  }

  if (msg.sources && msg.sources.length > 0) {
    lines.push("");
    lines.push("**Sources:**");
    for (const s of msg.sources) {
      lines.push(`- [${s.title || s.url}](${s.url})`);
    }
  }

  return lines.join("\n");
}

/**
 * Format a session as a Markdown document.
 */
export function formatSessionAsMarkdown(session: SessionDetail): string {
  const lines: string[] = [];

  // Title
  lines.push(`# ${session.title || "Chat Session"}`);
  lines.push("");

  // Meta
  const date = new Date(session.createdAt).toLocaleString();
  lines.push(`- **Date:** ${date}`);
  lines.push(`- **Working directory:** \`${session.cwd || "—"}\``);
  lines.push(`- **Messages:** ${session.messageCount}`);
  if (session.totalTokens) {
    lines.push(`- **Tokens:** ${session.totalTokens.toLocaleString()}`);
  }
  if (session.totalCostUSD != null) {
    lines.push(`- **Cost:** $${session.totalCostUSD.toFixed(4)}`);
  }
  lines.push("");
  lines.push("---");
  lines.push("");

  // Messages
  for (const msg of session.messages) {
    lines.push(formatMessage(msg));
    lines.push("");
  }

  return lines.join("\n");
}

/**
 * Export a session to a downloadable format.
 * Returns { content, contentType, filename }.
 */
export function exportSession(
  session: SessionDetail,
  format: "md" | "json"
): { content: string; contentType: string; filename: string } {
  const safeTitle = sanitizeFilename(session.title || "chat");

  if (format === "json") {
    return {
      content: JSON.stringify(session, null, 2),
      contentType: "application/json",
      filename: `${safeTitle}.json`,
    };
  }

  return {
    content: formatSessionAsMarkdown(session),
    contentType: "text/markdown; charset=utf-8",
    filename: `${safeTitle}.md`,
  };
}

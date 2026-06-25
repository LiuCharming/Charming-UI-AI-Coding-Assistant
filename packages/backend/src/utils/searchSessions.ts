/**
 * Full-text search across all session files.
 */
import { readdirSync, readFileSync } from "fs";
import { resolve } from "path";
import { config } from "./config";
import type {
  SessionDetail,
  SearchMatch,
  SearchResult,
  SearchResponse,
} from "@cgui/shared";

const SESSIONS_DIR = resolve(config.cguiHome, "sessions");

/** Generate a snippet of ~100 chars around the first match position. */
function makeSnippet(text: string, query: string): string {
  const lower = text.toLowerCase();
  const idx = lower.indexOf(query.toLowerCase());
  if (idx === -1) return text.slice(0, 150);

  const snippetLen = 120;
  const start = Math.max(0, idx - snippetLen / 2);
  const end = Math.min(text.length, start + snippetLen);
  let snippet = text.slice(start, end);

  if (start > 0) snippet = "…" + snippet;
  if (end < text.length) snippet = snippet + "…";

  return snippet;
}

/** Count occurrences of query in text (case-insensitive). */
function countMatches(text: string, query: string): number {
  const lower = text.toLowerCase();
  const q = query.toLowerCase();
  let count = 0;
  let pos = 0;
  while ((pos = lower.indexOf(q, pos)) !== -1) {
    count++;
    pos += q.length;
  }
  return count;
}

/**
 * Search all session files for the given query.
 */
export function searchSessions(query: string, limit: number): SearchResponse {
  const results: SearchResult[] = [];
  let totalMatches = 0;

  try {
    const files = readdirSync(SESSIONS_DIR).filter((f) => f.endsWith(".json"));
    for (const file of files) {
      try {
        const raw = readFileSync(resolve(SESSIONS_DIR, file), "utf-8");
        const session: SessionDetail = JSON.parse(raw);
        const matches: SearchMatch[] = [];

        for (let i = 0; i < session.messages.length; i++) {
          const msg = session.messages[i];

          // Search content
          if (msg.content) {
            const cnt = countMatches(msg.content, query);
            if (cnt > 0) {
              matches.push({
                sessionId: session.id,
                sessionTitle: session.title,
                messageIndex: i,
                role: msg.role,
                field: "content",
                snippet: makeSnippet(msg.content, query),
              });
            }
          }

          // Search thinking
          if (msg.thinking) {
            const cnt = countMatches(msg.thinking, query);
            if (cnt > 0) {
              matches.push({
                sessionId: session.id,
                sessionTitle: session.title,
                messageIndex: i,
                role: msg.role,
                field: "thinking",
                snippet: makeSnippet(msg.thinking, query),
              });
            }
          }

          // Search tool calls
          if (msg.toolCalls) {
            for (const tc of msg.toolCalls) {
              if (tc.toolName && countMatches(tc.toolName, query) > 0) {
                matches.push({
                  sessionId: session.id,
                  sessionTitle: session.title,
                  messageIndex: i,
                  role: msg.role,
                  field: "toolName",
                  snippet: `Tool: ${tc.toolName}`,
                });
              }
              // Search tool input as JSON string
              if (tc.input) {
                const inputStr = JSON.stringify(tc.input);
                if (countMatches(inputStr, query) > 0) {
                  matches.push({
                    sessionId: session.id,
                    sessionTitle: session.title,
                    messageIndex: i,
                    role: msg.role,
                    field: "toolInput",
                    snippet: makeSnippet(inputStr, query),
                  });
                }
              }
              if (tc.output && countMatches(tc.output, query) > 0) {
                matches.push({
                  sessionId: session.id,
                  sessionTitle: session.title,
                  messageIndex: i,
                  role: msg.role,
                  field: "toolOutput",
                  snippet: makeSnippet(tc.output, query),
                });
              }
            }
          }
        }

        if (matches.length > 0) {
          results.push({
            sessionId: session.id,
            sessionTitle: session.title,
            cwd: session.cwd,
            lastActiveAt: session.lastActiveAt,
            matches,
            matchCount: matches.length,
          });
          totalMatches += matches.length;
        }
      } catch {
        // Skip corrupt files
      }
    }
  } catch {
    // Directory read error — return empty
  }

  // Sort: more matches first, then by lastActiveAt descending
  results.sort((a, b) => {
    if (b.matchCount !== a.matchCount) return b.matchCount - a.matchCount;
    return b.lastActiveAt - a.lastActiveAt;
  });

  return {
    query,
    results: results.slice(0, limit),
    totalMatches,
  };
}

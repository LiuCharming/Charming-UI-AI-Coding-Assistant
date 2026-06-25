/**
 * Session persistence — reads/writes session JSON files in ~/.charming-ui/sessions/
 */

import { readFileSync, writeFileSync, readdirSync, unlinkSync, existsSync, mkdirSync } from "fs";
import { resolve, basename } from "path";
import { config } from "../utils/config";
import type { SessionMeta, SessionDetail } from "@cgui/shared";
import { createLogger } from "../utils/logger";

const log = createLogger("sessionStore");

const SESSIONS_DIR = resolve(config.cguiHome, "sessions");

function ensureDir(): void {
  if (!existsSync(SESSIONS_DIR)) {
    mkdirSync(SESSIONS_DIR, { recursive: true });
  }
}

function filePath(sessionId: string): string {
  return resolve(SESSIONS_DIR, `${sessionId}.json`);
}

/** List all sessions (metadata only, no messages for performance) */
export function listSessions(): SessionMeta[] {
  ensureDir();
  const sessions: SessionMeta[] = [];
  try {
    const files = readdirSync(SESSIONS_DIR).filter((f) => f.endsWith(".json"));
    for (const file of files) {
      try {
        const raw = readFileSync(resolve(SESSIONS_DIR, file), "utf-8");
        const session: SessionDetail = JSON.parse(raw);
        sessions.push({
          id: session.id,
          title: session.title,
          cwd: session.cwd,
          projectId: session.projectId,
          createdAt: session.createdAt,
          lastActiveAt: session.lastActiveAt,
          messageCount: session.messageCount,
          totalTokens: session.totalTokens,
          totalCostUSD: session.totalCostUSD,
          tags: session.tags,
          sdkSessionId: session.sdkSessionId,
          forkedFrom: session.forkedFrom,
        });
      } catch {
        // Skip corrupt files
      }
    }
  } catch {
    // Directory read error — return empty
  }
  // Sort by lastActiveAt descending
  sessions.sort((a, b) => b.lastActiveAt - a.lastActiveAt);
  return sessions;
}

/** Get a full session with messages */
export function getSession(sessionId: string): SessionDetail | null {
  ensureDir();
  try {
    const raw = readFileSync(filePath(sessionId), "utf-8");
    return JSON.parse(raw) as SessionDetail;
  } catch {
    return null;
  }
}

/** Save a session (full detail with messages) */
export function saveSession(session: SessionDetail): void {
  ensureDir();
  try {
    writeFileSync(filePath(session.id), JSON.stringify(session, null, 2), "utf-8");
  } catch (err) {
    log.error({ err, sessionId: session.id }, "Failed to save session");
  }
}

/** Create a new empty session */
export function createSession(meta: {
  id: string;
  title?: string;
  cwd: string;
  projectId?: string;
  forkedFrom?: string;
}): SessionDetail {
  const now = Date.now();
  const session: SessionDetail = {
    id: meta.id,
    title: meta.title || "New Chat",
    cwd: meta.cwd,
    projectId: meta.projectId,
    createdAt: now,
    lastActiveAt: now,
    messageCount: 0,
    messages: [],
    forkedFrom: meta.forkedFrom,
  };
  saveSession(session);
  return session;
}

/** Update session metadata (does NOT touch messages) */
export function updateSessionMeta(
  sessionId: string,
  updates: Partial<Pick<SessionMeta, "title" | "lastActiveAt" | "messageCount" | "totalTokens" | "totalCostUSD">>
): void {
  const session = getSession(sessionId);
  if (!session) return;
  Object.assign(session, updates);
  saveSession(session);
}

/** Delete a session */
export function deleteSession(sessionId: string): boolean {
  try {
    const path = filePath(sessionId);
    if (existsSync(path)) {
      unlinkSync(path);
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

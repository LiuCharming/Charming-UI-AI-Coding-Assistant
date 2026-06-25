/**
 * REST routes for session management.
 * Sessions are persisted as JSON files in ~/.cgui/sessions/
 */

import { Router } from "express";
import {
  listSessions,
  getSession,
  createSession,
  updateSessionMeta,
  deleteSession,
} from "../storage/sessionStore";
import { exportSession } from "../utils/exportFormatter";
import { searchSessions } from "../utils/searchSessions";

export const sessionsRouter = Router();

// GET /api/sessions — list all sessions (metadata only)
sessionsRouter.get("/", (_req, res) => {
  const sessions = listSessions();
  res.json({ sessions, total: sessions.length });
});

// GET /api/sessions/export/:id — export session as markdown or JSON
sessionsRouter.get("/export/:id", (req, res) => {
  const session = getSession(req.params.id);
  if (!session) {
    return res.status(404).json({ error: "Session not found" });
  }
  const format = (req.query.format as string) === "json" ? "json" : "md";
  const { content, contentType, filename } = exportSession(session, format);
  res
    .setHeader("Content-Type", contentType)
    .setHeader("Content-Disposition", `attachment; filename="${encodeURIComponent(filename)}"`)
    .send(content);
});

// GET /api/sessions/search — full-text search across all sessions
sessionsRouter.get("/search", (req, res) => {
  const q = (req.query.q as string || "").trim();
  const limit = Math.min(Math.max(parseInt(req.query.limit as string) || 20, 1), 100);

  if (!q) {
    return res.json({ query: "", results: [], totalMatches: 0 });
  }

  const response = searchSessions(q, limit);
  res.json(response);
});

// GET /api/sessions/:id — get full session with messages
sessionsRouter.get("/:id", (req, res) => {
  const session = getSession(req.params.id);
  if (!session) {
    return res.status(404).json({ error: "Session not found" });
  }
  res.json(session);
});

// POST /api/sessions — create a new session
sessionsRouter.post("/", (req, res) => {
  const { id, title, cwd, projectId } = req.body;
  if (!cwd) {
    return res.status(400).json({ error: "cwd is required" });
  }
  const session = createSession({
    id: id || `session_${Date.now()}`,
    title,
    cwd,
    projectId,
  });
  res.status(201).json(session);
});

// DELETE /api/sessions/:id
sessionsRouter.delete("/:id", (req, res) => {
  const deleted = deleteSession(req.params.id);
  if (!deleted) {
    return res.status(404).json({ error: "Session not found" });
  }
  res.json({ success: true });
});

// PATCH /api/sessions/:id — update metadata
sessionsRouter.patch("/:id", (req, res) => {
  const session = getSession(req.params.id);
  if (!session) {
    return res.status(404).json({ error: "Session not found" });
  }
  updateSessionMeta(req.params.id, req.body);
  res.json({ ...session, ...req.body });
});

/**
 * REST routes for file system operations.
 */

import { Router } from "express";
import { readdirSync, readFileSync, writeFileSync, statSync, existsSync, openSync, readSync, closeSync } from "fs";
import { resolve, join, relative } from "path";

export const filesRouter = Router();

filesRouter.get("/", (req, res) => {
  const dirPath = resolve(
    process.cwd(),
    (req.query.path as string) || "."
  );

  if (!existsSync(dirPath)) {
    return res.status(404).json({ error: "Directory not found" });
  }

  try {
    const entries = readdirSync(dirPath).map((name) => {
      const fullPath = join(dirPath, name);
      const stats = statSync(fullPath);
      const isDirectory = stats.isDirectory();

      return {
        name,
        path: relative(process.cwd(), fullPath).replace(/\\/g, "/"),
        isDirectory,
        size: isDirectory ? 0 : stats.size,
        modifiedAt: stats.mtimeMs,
      };
    });

    entries.sort((a, b) => {
      if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1;
      return a.name.localeCompare(b.name);
    });

    res.json({ path: relative(process.cwd(), dirPath).replace(/\\/g, "/"), entries });
  } catch (err) {
    res.status(500).json({
      error: "Failed to read directory",
      message: err instanceof Error ? err.message : String(err),
    });
  }
});

filesRouter.get("/content", (req, res) => {
  const filePath = resolve(
    process.cwd(),
    (req.query.path as string) || "."
  );

  if (!existsSync(filePath)) {
    return res.status(404).json({ error: "File not found" });
  }

  try {
    const stats = statSync(filePath);
    if (stats.isDirectory()) {
      return res.status(400).json({ error: "Path is a directory" });
    }

    const MAX_SIZE = 5 * 1024 * 1024; // 5MB — read entire file
    const TRUNCATE_SIZE = 1024 * 1024; // 1MB — partial read for oversized files
    let content: string;
    let truncated = false;

    if (stats.size <= MAX_SIZE) {
      content = readFileSync(filePath, "utf-8");
    } else {
      // Read first TRUNCATE_SIZE bytes for oversized files
      const fd = openSync(filePath, "r");
      const buf = Buffer.alloc(TRUNCATE_SIZE);
      readSync(fd, buf, 0, TRUNCATE_SIZE, 0);
      closeSync(fd);
      content = buf.toString("utf-8");
      // Trim to last complete line
      const lastNewline = content.lastIndexOf("\n");
      if (lastNewline > 0) content = content.slice(0, lastNewline);
      truncated = true;
    }

    res.json({
      path: relative(process.cwd(), filePath).replace(/\\/g, "/"),
      content,
      size: stats.size,
      modifiedAt: stats.mtimeMs,
      truncated,
    });
  } catch (err) {
    res.status(500).json({
      error: "Failed to read file",
      message: err instanceof Error ? err.message : String(err),
    });
  }
});

// ── Save file ──────────────────────────────────────────

filesRouter.post("/save", (req, res) => {
  const { path: relPath, content } = req.body as { path?: string; content?: string };

  if (!relPath || content === undefined || content === null) {
    return res.status(400).json({ error: "path and content are required" });
  }

  const filePath = resolve(process.cwd(), relPath);

  if (!existsSync(filePath)) {
    return res.status(404).json({ error: "File not found" });
  }

  try {
    const stats = statSync(filePath);
    if (stats.isDirectory()) {
      return res.status(400).json({ error: "Path is a directory" });
    }

    writeFileSync(filePath, content, "utf-8");

    const newStats = statSync(filePath);
    res.json({
      path: relative(process.cwd(), filePath).replace(/\\/g, "/"),
      size: newStats.size,
      modifiedAt: newStats.mtimeMs,
    });
  } catch (err) {
    res.status(500).json({
      error: "Failed to save file",
      message: err instanceof Error ? err.message : String(err),
    });
  }
});

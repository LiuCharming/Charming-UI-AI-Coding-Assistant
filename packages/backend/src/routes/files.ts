/**
 * REST routes for file system operations.
 */

import { Router } from "express";
import { readdirSync, readFileSync, statSync, existsSync } from "fs";
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

    const MAX_SIZE = 1024 * 1024; // 1MB
    if (stats.size > MAX_SIZE) {
      return res.status(400).json({
        error: "File too large",
        maxSize: MAX_SIZE,
        fileSize: stats.size,
      });
    }

    const content = readFileSync(filePath, "utf-8");
    res.json({
      path: relative(process.cwd(), filePath).replace(/\\/g, "/"),
      content,
      size: stats.size,
      modifiedAt: stats.mtimeMs,
    });
  } catch (err) {
    res.status(500).json({
      error: "Failed to read file",
      message: err instanceof Error ? err.message : String(err),
    });
  }
});

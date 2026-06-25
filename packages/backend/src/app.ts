/**
 * Express application factory.
 */

import express from "express";
import cors from "cors";
import { config } from "./utils/config";
import { sessionsRouter } from "./routes/sessions";
import { projectsRouter } from "./routes/projects";
import { settingsRouter } from "./routes/settings";
import { mcpRouter } from "./routes/mcp";
import { filesRouter } from "./routes/files";
import { providersRouter } from "./routes/providers";
import { browseRouter } from "./routes/browse";
import { condaRouter } from "./routes/conda";
import { createLogger } from "./utils/logger";

const log = createLogger("app");

export function createApp() {
  const app = express();

  // Middleware
  app.use(
    cors({
      origin: config.frontendUrl,
      credentials: true,
    })
  );
  app.use(express.json({ limit: "50mb" }));

  // Request timeout — prevent a stuck handler from blocking the entire server
  app.use((_req, res, next) => {
    // 15s timeout for REST API routes (WebSocket messages skip Express)
    res.setTimeout(15_000, () => {
      if (!res.headersSent) {
        res.status(504).json({ error: "Request timeout" });
      }
    });
    next();
  });

  // Request logging
  app.use((req, _res, next) => {
    log.debug({ method: req.method, url: req.url }, "HTTP request");
    next();
  });

  // Health check
  app.get("/api/health", (_req, res) => {
    res.json({
      status: "ok",
      version: "0.1.0",
      uptime: process.uptime(),
    });
  });

  // API Routes
  app.use("/api/projects", projectsRouter);
  app.use("/api/sessions", sessionsRouter);
  app.use("/api/settings", settingsRouter);
  app.use("/api/mcp/servers", mcpRouter);
  app.use("/api/files", filesRouter);
  app.use("/api/providers", providersRouter);
  app.use("/api/browse-directory", browseRouter);
  app.use("/api/conda-envs", condaRouter);

  // 404 handler
  app.use((_req, res) => {
    res.status(404).json({ error: "Not found" });
  });

  // Error handler
  app.use(
    (
      err: Error,
      _req: express.Request,
      res: express.Response,
      _next: express.NextFunction
    ) => {
      log.error({ err }, "Unhandled error");
      res.status(500).json({
        error: "Internal server error",
        message: process.env.NODE_ENV === "development" ? err.message : undefined,
      });
    }
  );

  return app;
}

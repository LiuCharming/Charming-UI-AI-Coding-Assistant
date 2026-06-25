/**
 * REST routes for MCP server management.
 */

import { Router } from "express";
import type { McpServerConfig } from "@cgui/shared";

export const mcpRouter = Router();

// In-memory MCP server configs (synced from settings)
const mcpServers: Record<string, McpServerConfig> = {};

mcpRouter.get("/", (_req, res) => {
  const list = Object.entries(mcpServers).map(([name, config]) => ({
    name,
    ...config,
  }));
  res.json({ servers: list });
});

mcpRouter.post("/", (req, res) => {
  const { name, ...config } = req.body;
  if (!name) {
    return res.status(400).json({ error: "Server name is required" });
  }
  mcpServers[name] = { ...config, name, enabled: config.enabled ?? true, status: "pending" };
  res.status(201).json({ name, ...mcpServers[name] });
});

mcpRouter.delete("/:name", (req, res) => {
  const { name } = req.params;
  if (!mcpServers[name]) {
    return res.status(404).json({ error: "MCP server not found" });
  }
  delete mcpServers[name];
  res.json({ success: true });
});

mcpRouter.patch("/:name", (req, res) => {
  const { name } = req.params;
  if (!mcpServers[name]) {
    return res.status(404).json({ error: "MCP server not found" });
  }
  mcpServers[name] = { ...mcpServers[name], ...req.body };
  res.json({ name, ...mcpServers[name] });
});

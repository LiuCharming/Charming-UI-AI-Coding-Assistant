/**
 * REST routes for SSH remote project operations.
 */

import { Router } from "express";
import type { SSHConnectionConfig } from "@cgui/shared";
import {
  testSSHConnection,
  listRemoteDir,
  readRemoteFile,
  disconnect,
} from "../ssh/sshManager";

export const sshRouter = Router();

/** POST /api/ssh/test — test SSH connection and remote path access */
sshRouter.post("/test", async (req, res) => {
  const config: SSHConnectionConfig = req.body;
  if (!config?.host || !config?.username || !config?.remotePath) {
    return res.status(400).json({ error: "host, username, and remotePath are required" });
  }
  if (!config.password && !config.privateKey) {
    return res.status(400).json({ error: "password or privateKey is required" });
  }
  try {
    await testSSHConnection(config);
    res.json({ success: true, message: "Connection successful" });
  } catch (err: any) {
    res.json({ success: false, message: err.message || "Connection failed" });
  }
});

/** POST /api/ssh/list — list remote directory */
sshRouter.post("/list", async (req, res) => {
  const { config, path } = req.body;
  if (!config || !path) {
    return res.status(400).json({ error: "config and path are required" });
  }
  try {
    const entries = await listRemoteDir(config, path);
    res.json({ entries });
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Failed to list directory" });
  }
});

/** POST /api/ssh/read — read a remote file */
sshRouter.post("/read", async (req, res) => {
  const { config, path } = req.body;
  if (!config || !path) {
    return res.status(400).json({ error: "config and path are required" });
  }
  try {
    const content = await readRemoteFile(config, path);
    res.json({ content });
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Failed to read file" });
  }
});

/** POST /api/ssh/disconnect — explicitly disconnect */
sshRouter.post("/disconnect", (req, res) => {
  const config: SSHConnectionConfig = req.body;
  if (config?.host) {
    disconnect(config);
  }
  res.json({ success: true });
});

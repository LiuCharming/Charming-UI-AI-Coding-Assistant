/**
 * REST route for listing conda environments.
 */

import { Router } from "express";
import { execFile } from "child_process";

export const condaRouter = Router();

export interface CondaEnvInfo {
  name: string;
  path: string;
  isActive: boolean; // currently active (not really knowable, but may be set)
}

condaRouter.get("/", async (_req, res) => {
  try {
    const envs = await listCondaEnvs();
    res.json({ envs });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: message });
  }
});

async function listCondaEnvs(): Promise<CondaEnvInfo[]> {
  // Try `conda env list --json` first
  try {
    const stdout = await execFileAsync("conda", ["env", "list", "--json"]);
    const data = JSON.parse(stdout);
    // conda env list --json returns { envs: ["/path/to/env1", "/path/to/env2", ...] }
    // Newer versions return { envs: [{ name: "...", prefix: "..." }, ...] }
    if (data.envs && Array.isArray(data.envs)) {
      if (data.envs.length > 0 && typeof data.envs[0] === "string") {
        // Old format: array of paths
        return data.envs.map((p: string) => {
          const name = p.split(/[/\\]/).pop() || p;
          return { name, path: p, isActive: false };
        });
      }
      // New format: array of { name, prefix } objects
      return data.envs.map((e: { name?: string; prefix?: string }) => {
        const name = e.name || (e.prefix ? e.prefix.split(/[/\\]/).pop() || e.prefix : "unknown");
        return { name, path: e.prefix || "", isActive: !!e.name && name === "base" };
      });
    }
  } catch {
    // conda env list --json failed, try `conda info --envs` (plain text output)
  }

  // Fallback: parse `conda info --envs` plain text output
  try {
    const stdout = await execFileAsync("conda", ["info", "--envs"]);
    const envs: CondaEnvInfo[] = [];
    for (const line of stdout.split("\n")) {
      // Lines look like: "base                 *  /opt/conda" or "myenv                   /home/user/.conda/envs/myenv"
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const parts = trimmed.split(/\s{2,}/);
      if (parts.length >= 2) {
        const name = parts[0].replace("*", "").trim();
        const path = parts[parts.length - 1].trim();
        const isActive = parts[0].includes("*");
        if (name && path) {
          envs.push({ name, path, isActive });
        }
      }
    }
    return envs;
  } catch {
    // conda not found or failed
    return [];
  }
}

function execFileAsync(cmd: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(cmd, args, { timeout: 15000 }, (err, stdout, stderr) => {
      if (err) {
        reject(new Error(stderr || err.message));
        return;
      }
      resolve(stdout);
    });
  });
}

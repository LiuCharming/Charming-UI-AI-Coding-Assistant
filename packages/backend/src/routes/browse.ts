/**
 * REST route for native OS folder picker.
 *
 * Browsers cannot return absolute filesystem paths for security reasons.
 * This endpoint spawns a native OS dialog that returns the full path.
 */

import { Router } from "express";
import { spawn } from "child_process";
import { createLogger } from "../utils/logger";

const log = createLogger("browse");
export const browseRouter = Router();

/**
 * Open a native folder picker dialog and return the selected path.
 *
 * POST /api/browse-directory
 * Body: { startPath?: string } — optional initial directory
 * Response: { path: string | null } — null if the user cancelled
 */
browseRouter.post("/", async (req, res) => {
  const startPath: string = req.body?.startPath || "";

  try {
    const selectedPath = await openFolderPicker(startPath);
    res.json({ path: selectedPath });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    log.error({ err }, "Folder picker failed");
    res.status(500).json({ error: message });
  }
});

/**
 * Open the native OS folder picker and return the selected absolute path.
 * Returns null if the user cancelled.
 */
function openFolderPicker(startPath: string): Promise<string | null> {
  return new Promise((resolve, reject) => {
    const platform = process.platform;

    if (platform === "win32") {
      openWindowsPicker(startPath, resolve, reject);
    } else if (platform === "darwin") {
      openMacPicker(startPath, resolve, reject);
    } else {
      openLinuxPicker(startPath, resolve, reject);
    }
  });
}

// ── Windows: PowerShell + Windows.Forms ──────────────────────────

function openWindowsPicker(
  startPath: string,
  resolve: (v: string | null) => void,
  reject: (e: Error) => void
) {
  // Build a self-contained PowerShell script that loads WinForms
  // and shows the FolderBrowserDialog.
  const escapedPath = (startPath || "").replace(/'/g, "''");
  const psScript = [
    `Add-Type -AssemblyName System.Windows.Forms`,
    `$d = New-Object System.Windows.Forms.FolderBrowserDialog`,
    `$d.Description = 'Select project folder'`,
    `$d.ShowNewFolderButton = $true`,
    escapedPath ? `$d.SelectedPath = '${escapedPath}'` : "",
    `if ($d.ShowDialog() -eq 'OK') { Write-Output $d.SelectedPath }`,
  ]
    .filter(Boolean)
    .join("; ");

  const child = spawn("powershell.exe", [
    "-NoProfile",
    "-NonInteractive",
    "-Command",
    psScript,
  ], {
    windowsHide: true,
  });

  let stdout = "";
  let stderr = "";

  child.stdout.on("data", (d: Buffer) => (stdout += d.toString()));
  child.stderr.on("data", (d: Buffer) => (stderr += d.toString()));

  child.on("close", (code) => {
    const trimmed = stdout.trim();
    if (code === 0 && trimmed) {
      resolve(trimmed);
    } else if (code === 0 && !trimmed) {
      // User cancelled the dialog
      resolve(null);
    } else {
      log.warn({ code, stderr }, "PowerShell folder picker error");
      reject(new Error(stderr.trim() || `PowerShell exited with code ${code}`));
    }
  });

  child.on("error", (err) => reject(err));
}

// ── macOS: osascript (AppleScript) ────────────────────────────────

function openMacPicker(
  _startPath: string,
  resolve: (v: string | null) => void,
  reject: (e: Error) => void
) {
  const script = `
    set folderPath to choose folder with prompt "Select project folder"
    set pathStr to POSIX path of folderPath
    return pathStr
  `;

  const child = spawn("osascript", ["-e", script]);
  let stdout = "";
  let stderr = "";

  child.stdout.on("data", (d: Buffer) => (stdout += d.toString()));
  child.stderr.on("data", (d: Buffer) => (stderr += d.toString()));

  child.on("close", (code) => {
    const trimmed = stdout.trim();
    if (code === 0 && trimmed) {
      resolve(trimmed);
    } else if (code === 1 && !trimmed) {
      // User cancelled (osascript returns 1 on user cancel)
      resolve(null);
    } else {
      reject(new Error(stderr.trim() || `osascript error code ${code}`));
    }
  });

  child.on("error", (err) => reject(err));
}

// ── Linux: zenity (or fallback to kdialog) ───────────────────────

function openLinuxPicker(
  _startPath: string,
  resolve: (v: string | null) => void,
  reject: (e: Error) => void
) {
  // Try zenity first (GNOME), then kdialog (KDE)
  const cmd = whichSync("zenity")
    ? { bin: "zenity", args: ["--file-selection", "--directory", "--title=Select project folder"] }
    : whichSync("kdialog")
      ? { bin: "kdialog", args: ["--getexistingdirectory"] }
      : null;

  if (!cmd) {
    reject(new Error("No folder picker available. Install zenity or kdialog."));
    return;
  }

  const child = spawn(cmd.bin, cmd.args);
  let stdout = "";
  let stderr = "";

  child.stdout.on("data", (d: Buffer) => (stdout += d.toString()));
  child.stderr.on("data", (d: Buffer) => (stderr += d.toString()));

  child.on("close", (code) => {
    const trimmed = stdout.trim();
    if (code === 0 && trimmed) {
      resolve(trimmed);
    } else if (code !== 0 && !trimmed) {
      resolve(null); // user cancelled
    } else {
      reject(new Error(stderr.trim() || `${cmd.bin} exited with ${code}`));
    }
  });

  child.on("error", (err) => reject(err));
}

// ── Helpers ──────────────────────────────────────────────────────

function whichSync(name: string): boolean {
  const { execSync } = require("child_process");
  try {
    execSync(`which ${name}`, { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

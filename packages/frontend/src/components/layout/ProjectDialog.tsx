import { useState, useEffect, useCallback } from "react";
import {
  X,
  FolderSearch,
  FolderOpen,
  CheckCircle2,
  GitBranch,
  FileJson,
  FileText,
  Loader2,
  Monitor,
  Globe,
  Server,
  Terminal,
} from "lucide-react";
import { cn } from "@/lib/cn";
import { useProjectStore } from "@/store/projectStore";
import { useI18n } from "@/i18n";
import { rest } from "@/api/restClient";

interface ProjectDialogProps {
  isOpen: boolean;
  onClose: () => void;
}

type ConnectionType = "local" | "ssh";

export function ProjectDialog({ isOpen, onClose }: ProjectDialogProps) {
  const { t } = useI18n();
  const { createProject, scanDirectory, browseDirectory } = useProjectStore();

  const [connType, setConnType] = useState<ConnectionType>("local");
  const [name, setName] = useState("");
  const [path, setPath] = useState("");
  const [description, setDescription] = useState("");
  // SSH fields
  const [sshHost, setSshHost] = useState("");
  const [sshPort, setSshPort] = useState("22");
  const [sshUser, setSshUser] = useState("");
  const [sshAuth, setSshAuth] = useState<"password" | "key">("password");
  const [sshPassword, setSshPassword] = useState("");
  const [sshKey, setSshKey] = useState("");
  const [sshRemotePath, setSshRemotePath] = useState("");
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);

  const [scanResult, setScanResult] = useState<{
    name: string;
    description: string;
    hasClaudeMd: boolean;
    hasGit: boolean;
    hasPackageJson: boolean;
  } | null>(null);
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState("");

  // Scan directory when path changes (local only)
  useEffect(() => {
    if (connType !== "local" || !path || path.length < 2) {
      setScanResult(null);
      return;
    }

    const timer = setTimeout(async () => {
      setScanning(true);
      try {
        const result = await scanDirectory(path);
        setScanResult(result);
        if (!name) setName(result.name);
        if (!description) setDescription(result.description);
      } catch {
        setScanResult(null);
      } finally {
        setScanning(false);
      }
    }, 500);

    return () => clearTimeout(timer);
  }, [path, scanDirectory, name, description, connType]);

  // ── Browse directory via native OS folder picker ──────
  const handleBrowse = useCallback(async () => {
    try {
      const selected = await browseDirectory(path || undefined);
      if (selected) {
        setPath(selected);
      }
    } catch (err) {
      console.error("Directory picker failed:", err);
    }
  }, [browseDirectory, path]);

  // ── Test SSH connection ──
  const handleTestConnection = async () => {
    if (!sshHost || !sshUser || !sshRemotePath) {
      setTestResult({ success: false, message: "Host, username, and remote path are required" });
      return;
    }
    setTesting(true);
    setTestResult(null);
    try {
      const result = await rest.post<{ success: boolean; message: string }>("/ssh/test", {
        host: sshHost.trim(),
        port: parseInt(sshPort) || 22,
        username: sshUser.trim(),
        password: sshAuth === "password" ? sshPassword : undefined,
        privateKey: sshAuth === "key" ? sshKey : undefined,
        remotePath: sshRemotePath.trim(),
      });
      setTestResult(result);
    } catch (err: any) {
      setTestResult({ success: false, message: err.message || "Connection failed" });
    } finally {
      setTesting(false);
    }
  };

  const handleCreate = async () => {
    if (!name.trim()) {
      setError(t("project.nameRequired"));
      return;
    }
    if (connType === "ssh") {
      if (!sshHost.trim() || !sshUser.trim() || !sshRemotePath.trim()) {
        setError("SSH host, username, and remote path are required");
        return;
      }
      if (sshAuth === "password" && !sshPassword) {
        setError("Password is required");
        return;
      }
      if (sshAuth === "key" && !sshKey) {
        setError("Private key is required");
        return;
      }
    } else if (!path.trim()) {
      setError(t("project.nameRequired"));
      return;
    }

    try {
      await createProject(
        name.trim(),
        connType === "ssh" ? sshRemotePath.trim() : path.trim(),
        description.trim(),
        connType === "ssh"
          ? {
              connectionType: "ssh",
              sshConfig: {
                host: sshHost.trim(),
                port: parseInt(sshPort) || 22,
                username: sshUser.trim(),
                password: sshAuth === "password" ? sshPassword : undefined,
                privateKey: sshAuth === "key" ? sshKey : undefined,
                remotePath: sshRemotePath.trim(),
              },
            }
          : undefined,
      );
      onClose();
      resetForm();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const resetForm = () => {
    setConnType("local");
    setName("");
    setPath("");
    setDescription("");
    setSshHost("");
    setSshPort("22");
    setSshUser("");
    setSshAuth("password");
    setSshPassword("");
    setSshKey("");
    setSshRemotePath("");
    setTestResult(null);
    setScanResult(null);
    setError("");
  };

  const handleClose = () => {
    resetForm();
    onClose();
  };

  if (!isOpen) return null;

  const effectivePath = connType === "ssh" ? sshRemotePath : path;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={handleClose}
      />

      {/* Dialog */}
      <div className="relative bg-card border border-border rounded-2xl shadow-2xl w-full max-w-lg mx-4 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <h2 className="font-semibold text-foreground">{t("project.createProject")}</h2>
          <button
            onClick={handleClose}
            className="p-1.5 rounded-lg hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 space-y-4 max-h-[70vh] overflow-y-auto">
          {/* Connection type tabs */}
          <div>
            <label className="text-sm font-medium text-foreground mb-2 block">
              Connection Type
            </label>
            <div className="flex gap-1 bg-secondary rounded-lg p-1">
              <button
                onClick={() => setConnType("local")}
                className={cn(
                  "flex-1 flex items-center justify-center gap-1.5 py-2 rounded-md text-sm transition-colors",
                  connType === "local"
                    ? "bg-card text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                <Monitor size={14} />
                Local
              </button>
              <button
                onClick={() => setConnType("ssh")}
                className={cn(
                  "flex-1 flex items-center justify-center gap-1.5 py-2 rounded-md text-sm transition-colors",
                  connType === "ssh"
                    ? "bg-card text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                <Server size={14} />
                SSH Remote
              </button>
            </div>
          </div>

          {/* SSH fields */}
          {connType === "ssh" && (
            <div className="space-y-3 p-4 rounded-lg bg-secondary/30 border border-border">
              <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                <Globe size={14} className="text-primary" />
                SSH Connection
              </div>

              <div className="grid grid-cols-3 gap-2">
                <div className="col-span-2">
                  <label className="text-xs text-muted-foreground mb-1 block">Host</label>
                  <input
                    type="text"
                    value={sshHost}
                    onChange={(e) => setSshHost(e.target.value)}
                    placeholder="192.168.1.100"
                    className="w-full px-3 py-2 text-sm bg-secondary rounded-lg border border-border outline-none focus:ring-2 focus:ring-ring font-mono"
                  />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">Port</label>
                  <input
                    type="text"
                    value={sshPort}
                    onChange={(e) => setSshPort(e.target.value)}
                    placeholder="22"
                    className="w-full px-3 py-2 text-sm bg-secondary rounded-lg border border-border outline-none focus:ring-2 focus:ring-ring font-mono"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Username</label>
                <input
                  type="text"
                  value={sshUser}
                  onChange={(e) => setSshUser(e.target.value)}
                  placeholder="root"
                  className="w-full px-3 py-2 text-sm bg-secondary rounded-lg border border-border outline-none focus:ring-2 focus:ring-ring"
                />
              </div>

              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Auth Method</label>
                <div className="flex gap-1 bg-secondary rounded-lg p-1">
                  <button
                    onClick={() => setSshAuth("password")}
                    className={cn(
                      "flex-1 py-1.5 rounded text-xs transition-colors",
                      sshAuth === "password" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground"
                    )}
                  >
                    Password
                  </button>
                  <button
                    onClick={() => setSshAuth("key")}
                    className={cn(
                      "flex-1 py-1.5 rounded text-xs transition-colors",
                      sshAuth === "key" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground"
                    )}
                  >
                    Private Key
                  </button>
                </div>
              </div>

              {sshAuth === "password" ? (
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">Password</label>
                  <input
                    type="password"
                    value={sshPassword}
                    onChange={(e) => setSshPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full px-3 py-2 text-sm bg-secondary rounded-lg border border-border outline-none focus:ring-2 focus:ring-ring"
                  />
                </div>
              ) : (
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">
                    Private Key (paste content)
                  </label>
                  <textarea
                    value={sshKey}
                    onChange={(e) => setSshKey(e.target.value)}
                    placeholder="-----BEGIN OPENSSH PRIVATE KEY-----"
                    rows={3}
                    className="w-full px-3 py-2 text-xs bg-secondary rounded-lg border border-border outline-none focus:ring-2 focus:ring-ring font-mono resize-vertical"
                  />
                </div>
              )}

              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Remote Working Directory</label>
                <input
                  type="text"
                  value={sshRemotePath}
                  onChange={(e) => setSshRemotePath(e.target.value)}
                  placeholder="/home/user/project"
                  className="w-full px-3 py-2 text-sm bg-secondary rounded-lg border border-border outline-none focus:ring-2 focus:ring-ring font-mono"
                />
              </div>

              {/* Test connection */}
              <button
                onClick={handleTestConnection}
                disabled={testing || !sshHost || !sshUser || !sshRemotePath}
                className={cn(
                  "flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg transition-colors",
                  testing || !sshHost || !sshUser || !sshRemotePath
                    ? "bg-secondary text-muted-foreground cursor-not-allowed"
                    : "bg-primary/10 text-primary hover:bg-primary/20"
                )}
              >
                {testing ? (
                  <Loader2 size={12} className="animate-spin" />
                ) : (
                  <Terminal size={12} />
                )}
                {testing ? "Testing..." : "Test Connection"}
              </button>

              {testResult && (
                <div className={cn(
                  "text-xs px-3 py-2 rounded-lg",
                  testResult.success
                    ? "bg-green-500/10 text-green-600 border border-green-500/20"
                    : "bg-destructive/10 text-destructive border border-destructive/20"
                )}>
                  {testResult.message}
                </div>
              )}
            </div>
          )}

          {/* Path input (local only) */}
          {connType === "local" && (
            <div>
              <label className="text-sm font-medium text-foreground mb-1.5 block">
                {t("project.projectDir")}
              </label>
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <input
                    type="text"
                    value={path}
                    onChange={(e) => setPath(e.target.value)}
                    placeholder="F:\my-project"
                    className="w-full pl-9 pr-10 py-2.5 text-sm bg-secondary rounded-lg border border-border outline-none focus:ring-2 focus:ring-ring font-mono"
                  />
                  <FolderSearch
                    size={16}
                    className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
                  />
                  {scanning && (
                    <Loader2
                      size={16}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-primary animate-spin"
                    />
                  )}
                </div>
                <button
                  type="button"
                  onClick={handleBrowse}
                  className="flex items-center gap-1.5 px-3 py-2.5 text-sm bg-secondary rounded-lg border border-border hover:bg-secondary/80 text-muted-foreground hover:text-foreground transition-colors flex-shrink-0"
                  title="Browse for folder"
                >
                  <FolderOpen size={16} />
                  Browse
                </button>
              </div>

              {/* Scan results */}
              {scanResult && (
                <div className="mt-3 p-3 rounded-lg bg-secondary/50 border border-border space-y-2">
                  <div className="flex items-center gap-2 text-sm">
                    <CheckCircle2 size={14} className="text-green-500" />
                    <span className="text-foreground font-medium">
                      {scanResult.name}
                    </span>
                  </div>
                  {scanResult.description && (
                    <div className="text-xs text-muted-foreground">
                      {scanResult.description}
                    </div>
                  )}
                  <div className="flex items-center gap-3 text-xs">
                    {scanResult.hasGit && (
                      <span className="flex items-center gap-1 text-muted-foreground">
                        <GitBranch size={12} />
                        Git
                      </span>
                    )}
                    {scanResult.hasPackageJson && (
                      <span className="flex items-center gap-1 text-muted-foreground">
                        <FileJson size={12} />
                        package.json
                      </span>
                    )}
                    {scanResult.hasClaudeMd && (
                      <span className="flex items-center gap-1 text-primary">
                        <FileText size={12} />
                        CLAUDE.md
                      </span>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Name input */}
          <div>
            <label className="text-sm font-medium text-foreground mb-1.5 block">
              {t("project.projectName")}
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="My Project"
              className="w-full px-3 py-2.5 text-sm bg-secondary rounded-lg border border-border outline-none focus:ring-2 focus:ring-ring"
            />
          </div>

          {/* Description */}
          <div>
            <label className="text-sm font-medium text-foreground mb-1.5 block">
              {t("project.description")}
            </label>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={t("project.descriptionPlaceholder")}
              className="w-full px-3 py-2.5 text-sm bg-secondary rounded-lg border border-border outline-none focus:ring-2 focus:ring-ring"
            />
          </div>

          {/* Path preview */}
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            {connType === "ssh" ? (
              <Globe size={12} />
            ) : (
              <FolderSearch size={12} />
            )}
            <span className="font-mono truncate">
              {connType === "ssh"
                ? `ssh://${sshUser || "user"}@${sshHost || "host"}:${sshPort}${effectivePath || "/path"}`
                : effectivePath || t("project.select")}
            </span>
          </div>

          {/* Error */}
          {error && (
            <div className="p-3 rounded-lg bg-destructive/10 border border-destructive/20 text-sm text-destructive">
              {error}
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-border bg-secondary/30">
          <button
            onClick={handleClose}
            className="px-4 py-2 rounded-lg text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            {t("project.cancel")}
          </button>
          <button
            onClick={handleCreate}
            disabled={
              connType === "ssh"
                ? !name.trim() || !sshHost.trim() || !sshUser.trim() || !sshRemotePath.trim()
                : !name.trim() || !path.trim()
            }
            className={cn(
              "px-4 py-2 rounded-lg text-sm font-medium transition-all",
              (connType === "ssh"
                ? name.trim() && sshHost.trim() && sshUser.trim() && sshRemotePath.trim()
                : name.trim() && path.trim())
                ? "bg-primary text-primary-foreground hover:opacity-90"
                : "bg-secondary text-muted-foreground cursor-not-allowed"
            )}
          >
            {t("project.createProject")}
          </button>
        </div>
      </div>
    </div>
  );
}

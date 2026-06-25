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
} from "lucide-react";
import { cn } from "@/lib/cn";
import { useProjectStore } from "@/store/projectStore";
import { useI18n } from "@/i18n";

interface ProjectDialogProps {
  isOpen: boolean;
  onClose: () => void;
}

export function ProjectDialog({ isOpen, onClose }: ProjectDialogProps) {
  const { t } = useI18n();
  const { createProject, scanDirectory, browseDirectory } = useProjectStore();

  const [name, setName] = useState("");
  const [path, setPath] = useState("");
  const [description, setDescription] = useState("");
  const [scanResult, setScanResult] = useState<{
    name: string;
    description: string;
    hasClaudeMd: boolean;
    hasGit: boolean;
    hasPackageJson: boolean;
  } | null>(null);
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState("");

  // Scan directory when path changes
  useEffect(() => {
    if (!path || path.length < 2) {
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
  }, [path, scanDirectory, name, description]);

  // ── Browse directory via native OS folder picker ──────
  const handleBrowse = useCallback(async () => {
    try {
      const selected = await browseDirectory(path || undefined);
      if (selected) {
        setPath(selected);
      }
      // If null, the user cancelled — do nothing
    } catch (err) {
      console.error("Directory picker failed:", err);
    }
  }, [browseDirectory, path]);

  const handleCreate = async () => {
    if (!name.trim() || !path.trim()) {
      setError(t("project.nameRequired"));
      return;
    }

    try {
      await createProject(name.trim(), path.trim(), description.trim());
      onClose();
      resetForm();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("project.createFailed"));
    }
  };

  const resetForm = () => {
    setName("");
    setPath("");
    setDescription("");
    setScanResult(null);
    setError("");
  };

  const handleClose = () => {
    resetForm();
    onClose();
  };

  if (!isOpen) return null;

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
        <div className="p-6 space-y-4">
          {/* Path input */}
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
            disabled={!name.trim() || !path.trim()}
            className={cn(
              "px-4 py-2 rounded-lg text-sm font-medium transition-all",
              name.trim() && path.trim()
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

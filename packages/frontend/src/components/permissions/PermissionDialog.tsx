import { usePermissionStore } from "@/store/permissionStore";
import { useChatActions } from "@/hooks/useStreamingChat";
import { useI18n } from "@/i18n";
import { Shield, X, Check, AlertTriangle } from "lucide-react";

export function PermissionDialog() {
  const { pending, showDialog, setShowDialog } = usePermissionStore();
  const { respondToPermission } = useChatActions();

  const { t } = useI18n();

  if (!showDialog || pending.length === 0) return null;

  const req = pending[0];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={() => setShowDialog(false)}
      />

      {/* Dialog */}
      <div className="relative bg-card border border-border rounded-2xl shadow-2xl w-full max-w-lg mx-4 overflow-hidden">
        {/* Header */}
        <div className="flex items-center gap-3 px-6 py-4 border-b border-border">
          <div className="p-2 rounded-full bg-yellow-500/10">
            <Shield size={20} className="text-yellow-500" />
          </div>
          <div className="flex-1">
            <h3 className="font-semibold text-foreground">
              {t("permission.title")}
            </h3>
            <p className="text-sm text-muted-foreground">
              {t("permission.subtitle")}
            </p>
          </div>
        </div>

        {/* Body */}
        <div className="px-6 py-4 space-y-3">
          <div>
            <div className="text-xs font-medium text-muted-foreground mb-1">
              {t("permission.tool")}
            </div>
            <div className="text-sm font-mono bg-secondary rounded-md px-3 py-2">
              {req.toolName}
            </div>
          </div>

          {Object.keys(req.toolInput).length > 0 && (
            <div>
              <div className="text-xs font-medium text-muted-foreground mb-1">
                {t("permission.params")}
              </div>
              <pre className="text-xs bg-secondary rounded-md p-3 overflow-x-auto font-mono max-h-32 overflow-y-auto">
                {JSON.stringify(req.toolInput, null, 2)}
              </pre>
            </div>
          )}

          {req.reason && (
            <div className="flex items-start gap-2 p-3 rounded-lg bg-yellow-500/5 border border-yellow-500/20">
              <AlertTriangle size={14} className="text-yellow-500 flex-shrink-0 mt-0.5" />
              <p className="text-xs text-yellow-600 dark:text-yellow-400">
                {req.reason}
              </p>
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-border bg-secondary/30">
          <button
            onClick={() => respondToPermission(req.requestId, false)}
            className="flex items-center gap-2 px-4 py-2 rounded-lg border border-border text-sm text-foreground hover:bg-secondary transition-colors"
          >
            <X size={16} className="text-red-500" />
            {t("permission.deny")}
          </button>
          <button
            onClick={() => respondToPermission(req.requestId, true)}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm hover:opacity-90 transition-opacity"
          >
            <Check size={16} />
            {t("permission.allow")}
          </button>
        </div>
      </div>
    </div>
  );
}

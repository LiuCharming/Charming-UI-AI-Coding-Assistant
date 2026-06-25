/**
 * Reusable confirmation dialog using @radix-ui/react-dialog.
 */

import * as Dialog from "@radix-ui/react-dialog";
import { AlertTriangle, X } from "lucide-react";
import { cn } from "@/lib/cn";

export interface ConfirmProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: "danger" | "default";
  onConfirm: () => void;
}

export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  variant = "default",
  onConfirm,
}: ConfirmProps) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[70] bg-black/50 backdrop-blur-sm" />
        <Dialog.Content
          className="fixed top-1/2 left-1/2 z-[70] -translate-x-1/2 -translate-y-1/2 bg-card border border-border rounded-2xl shadow-2xl p-6 w-full max-w-sm"
        >
          <div className="flex items-start gap-4">
            <div
              className={cn(
                "w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0",
                variant === "danger"
                  ? "bg-destructive/10 text-destructive"
                  : "bg-primary/10 text-primary"
              )}
            >
              <AlertTriangle size={20} />
            </div>
            <div className="flex-1 min-w-0">
              <Dialog.Title className="text-sm font-semibold text-foreground">
                {title}
              </Dialog.Title>
              {description && (
                <Dialog.Description className="text-xs text-muted-foreground mt-1.5">
                  {description}
                </Dialog.Description>
              )}
            </div>
            <Dialog.Close className="p-1 rounded hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors">
              <X size={14} />
            </Dialog.Close>
          </div>

          <div className="flex justify-end gap-2 mt-6">
            <Dialog.Close className="px-4 py-2 text-xs rounded-lg border border-border hover:bg-secondary transition-colors">
              {cancelLabel}
            </Dialog.Close>
            <Dialog.Close
              onClick={onConfirm}
              className={cn(
                "px-4 py-2 text-xs rounded-lg text-white transition-colors",
                variant === "danger"
                  ? "bg-destructive hover:bg-destructive/80"
                  : "bg-primary hover:bg-primary/80"
              )}
            >
              {confirmLabel}
            </Dialog.Close>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

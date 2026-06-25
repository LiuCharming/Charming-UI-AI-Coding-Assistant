/**
 * Renders a ConfirmDialog driven by the global confirm store.
 * Place in App root once.
 */

import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { useConfirmStore } from "@/lib/toast";

export function GlobalConfirm() {
  const { open, title, description, confirmLabel, variant, setOpen, handleConfirm } =
    useConfirmStore();

  return (
    <ConfirmDialog
      open={open}
      onOpenChange={setOpen}
      title={title}
      description={description}
      confirmLabel={confirmLabel}
      variant={variant}
      onConfirm={handleConfirm}
    />
  );
}

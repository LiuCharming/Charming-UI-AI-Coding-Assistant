/**
 * Horizontal list of attachment chips. Returns null when empty.
 */
import { AttachmentChip } from "./AttachmentChip";
import type { LocalAttachment } from "./types";

interface AttachmentListProps {
  attachments: LocalAttachment[];
  onRemove: (id: string) => void;
}

export function AttachmentList({ attachments, onRemove }: AttachmentListProps) {
  if (attachments.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-1.5 mt-2">
      {attachments.map((att) => (
        <AttachmentChip key={att.id} attachment={att} onRemove={onRemove} />
      ))}
    </div>
  );
}

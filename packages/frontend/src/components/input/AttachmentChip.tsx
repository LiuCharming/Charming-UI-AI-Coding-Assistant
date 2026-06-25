/**
 * Attachment chip — shows filename, size, and X remove button.
 */
import { FileText, Image, X } from "lucide-react";
import { formatBytes } from "@/lib/format";
import type { LocalAttachment } from "./types";

interface AttachmentChipProps {
  attachment: LocalAttachment;
  onRemove: (id: string) => void;
}

export function AttachmentChip({ attachment, onRemove }: AttachmentChipProps) {
  const Icon = attachment.isImage ? Image : FileText;

  return (
    <div className="inline-flex items-center gap-1.5 bg-secondary border border-border rounded-lg px-2 py-1 text-xs max-w-[240px] group">
      <Icon size={12} className="flex-shrink-0 text-muted-foreground" />
      <span className="truncate flex-1 min-w-0" title={attachment.name}>
        {attachment.name}
      </span>
      <span className="text-[10px] text-muted-foreground flex-shrink-0">
        {formatBytes(attachment.size)}
      </span>
      <button
        onClick={() => onRemove(attachment.id)}
        className="flex-shrink-0 p-0.5 rounded hover:bg-destructive/10 hover:text-destructive transition-colors"
        title="Remove attachment"
      >
        <X size={10} />
      </button>
    </div>
  );
}

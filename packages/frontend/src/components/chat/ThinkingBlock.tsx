import { useState } from "react";
import { ChevronDown, ChevronRight, Brain } from "lucide-react";
import { useI18n } from "@/i18n";

interface ThinkingBlockProps {
  content: string;
}

export function ThinkingBlock({ content }: ThinkingBlockProps) {
  const { t } = useI18n();
  const [isOpen, setIsOpen] = useState(false);

  if (!content) return null;

  return (
    <div className="mb-2">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
      >
        {isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        <Brain size={14} />
        {t("chat.thinking")}
      </button>
      {isOpen && (
        <div className="mt-2 p-3 rounded-lg bg-secondary/50 border border-border text-xs text-muted-foreground whitespace-pre-wrap font-mono max-h-60 overflow-y-auto">
          {content}
        </div>
      )}
    </div>
  );
}

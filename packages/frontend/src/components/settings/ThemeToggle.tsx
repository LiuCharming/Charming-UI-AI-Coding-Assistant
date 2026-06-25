import { Moon, Sun, Monitor } from "lucide-react";
import { useTheme } from "@/hooks/useTheme";
import { useI18n } from "@/i18n";
import { cn } from "@/lib/cn";

export function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const { t } = useI18n();

  const options = [
    { value: "dark" as const, icon: Moon, label: t("theme.dark") },
    { value: "light" as const, icon: Sun, label: t("theme.light") },
    { value: "system" as const, icon: Monitor, label: t("theme.system") },
  ];

  return (
    <div className="flex items-center gap-1 bg-secondary rounded-lg p-0.5">
      {options.map(({ value, icon: Icon, label }) => (
        <button
          key={value}
          onClick={() => setTheme(value)}
          className={cn(
            "flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs transition-colors",
            theme === value
              ? "bg-background text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground"
          )}
          title={label}
        >
          <Icon size={14} />
          <span className="hidden sm:inline">{label}</span>
        </button>
      ))}
    </div>
  );
}

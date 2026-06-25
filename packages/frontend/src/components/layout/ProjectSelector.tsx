import { useState } from "react";
import {
  Folder,
  ChevronDown,
  Plus,
  Trash2,
  FolderOpen,
} from "lucide-react";
import { cn } from "@/lib/cn";
import { useProjectStore } from "@/store/projectStore";
import { ProjectDialog } from "./ProjectDialog";
import { useI18n } from "@/i18n";
import { confirm } from "@/lib/toast";

export function ProjectSelector() {
  const { t } = useI18n();
  const [isOpen, setIsOpen] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const {
    projects,
    activeProjectId,
    setActiveProject,
    deleteProject,
  } = useProjectStore();

  const activeProject = projects.find((p) => p.id === activeProjectId);

  return (
    <>
      <div className="relative">
        {/* Trigger */}
        <button
          onClick={() => setIsOpen(!isOpen)}
          className="w-full flex items-center gap-2 px-3 py-2 text-sm rounded-lg hover:bg-sidebar-accent text-sidebar-foreground transition-colors"
        >
          <Folder size={15} className="flex-shrink-0 text-primary" />
          <span className="flex-1 text-left truncate">
            {activeProject?.name || t("project.select")}
          </span>
          <ChevronDown
            size={14}
            className={cn(
              "flex-shrink-0 transition-transform",
              isOpen && "rotate-180"
            )}
          />
        </button>

        {/* Dropdown */}
        {isOpen && (
          <>
            <div
              className="fixed inset-0 z-10"
              onClick={() => setIsOpen(false)}
            />
            <div className="absolute left-2 right-2 top-full mt-1 z-20 bg-popover border border-border rounded-lg shadow-xl overflow-hidden">
              <div className="max-h-60 overflow-y-auto py-1">
                {projects.length === 0 ? (
                  <div className="px-3 py-4 text-center text-sm text-muted-foreground">
                    {t("project.noProjects").split("\n").map((line, i) => (
                      <span key={i}>
                        {line}
                        {i === 0 && <br />}
                      </span>
                    ))}
                  </div>
                ) : (
                  projects.map((project) => (
                    <div
                      key={project.id}
                      className={cn(
                        "group flex items-center gap-2 px-3 py-2 text-sm cursor-pointer transition-colors",
                        project.id === activeProjectId
                          ? "bg-primary/10 text-primary"
                          : "text-foreground hover:bg-secondary"
                      )}
                      onClick={() => {
                        setActiveProject(project.id);
                        setIsOpen(false);
                      }}
                    >
                      {project.id === activeProjectId ? (
                        <FolderOpen size={14} className="flex-shrink-0" />
                      ) : (
                        <Folder size={14} className="flex-shrink-0 text-muted-foreground" />
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="truncate">{project.name}</div>
                        <div className="text-xs text-muted-foreground truncate">
                          {project.path}
                        </div>
                      </div>
                      <button
                        onClick={async (e) => {
                          e.stopPropagation();
                          const ok = await confirm({
                            title: String(t("project.deleteConfirm")).replace("{name}", project.name),
                            variant: "danger",
                            confirmLabel: String(t("project.deleteProject")),
                          });
                          if (ok) deleteProject(project.id);
                        }}
                        className="p-1 rounded opacity-0 group-hover:opacity-100 hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-all"
                        title={t("project.deleteProject")}
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                  ))
                )}
              </div>

              {/* Add project button */}
              <div className="border-t border-border p-1">
                <button
                  onClick={() => {
                    setIsOpen(false);
                    setDialogOpen(true);
                  }}
                  className="w-full flex items-center gap-2 px-3 py-2 text-sm text-muted-foreground hover:text-foreground hover:bg-secondary rounded-md transition-colors"
                >
                  <Plus size={14} />
                  {t("project.addProject")}
                </button>
              </div>
            </div>
          </>
        )}
      </div>

      <ProjectDialog
        isOpen={dialogOpen}
        onClose={() => setDialogOpen(false)}
      />
    </>
  );
}

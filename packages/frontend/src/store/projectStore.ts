/**
 * Project store — manages project list and active project.
 */

import { create } from "zustand";
import type { ProjectMeta } from "@cgui/shared";
import { rest } from "../api/restClient";
import { toast } from "../lib/toast";

interface ProjectState {
  projects: ProjectMeta[];
  activeProjectId: string | null;
  isLoading: boolean;

  // Actions
  loadProjects: () => Promise<void>;
  setActiveProject: (id: string | null) => void;
  createProject: (
    name: string,
    path: string,
    description?: string,
    opts?: { connectionType?: "local" | "ssh"; sshConfig?: import("@cgui/shared").SSHConnectionConfig }
  ) => Promise<ProjectMeta>;
  deleteProject: (id: string) => Promise<void>;
  getActiveProject: () => ProjectMeta | undefined;
  scanDirectory: (path: string) => Promise<{
    name: string;
    description: string;
    hasClaudeMd: boolean;
    hasGit: boolean;
    hasPackageJson: boolean;
  }>;
  browseDirectory: (startPath?: string) => Promise<string | null>;
}

export const useProjectStore = create<ProjectState>((set, get) => ({
  projects: [],
  activeProjectId: null,
  isLoading: false,

  loadProjects: async () => {
    set({ isLoading: true });
    try {
      const data = await rest.get<{ projects: ProjectMeta[] }>("/projects");
      set({ projects: data.projects });

      // Auto-select most recent project if none active
      if (!get().activeProjectId && data.projects.length > 0) {
        set({ activeProjectId: data.projects[0].id });
      }
    } catch (err) {
      toast.error("Failed to load projects");
    } finally {
      set({ isLoading: false });
    }
  },

  setActiveProject: (id) => set({ activeProjectId: id }),

  createProject: async (name, path, description, opts) => {
    const project = await rest.post<ProjectMeta>("/projects", {
      name,
      path,
      description,
      connectionType: opts?.connectionType || "local",
      sshConfig: opts?.sshConfig,
    });
    set((s) => ({
      projects: [project, ...s.projects],
      activeProjectId: project.id,
    }));
    return project;
  },

  deleteProject: async (id) => {
    await rest.delete(`/projects/${id}`);
    set((s) => ({
      projects: s.projects.filter((p) => p.id !== id),
      activeProjectId: s.activeProjectId === id
        ? (s.projects[0]?.id || null)
        : s.activeProjectId,
    }));
  },

  getActiveProject: () => {
    const { projects, activeProjectId } = get();
    return projects.find((p) => p.id === activeProjectId);
  },

  scanDirectory: async (path) => {
    return rest.post<{
      name: string;
      description: string;
      hasClaudeMd: boolean;
      hasGit: boolean;
      hasPackageJson: boolean;
    }>("/projects/scan", { path });
  },

  browseDirectory: async (startPath) => {
    const result = await rest.post<{ path: string | null }>("/browse-directory", { startPath });
    return result.path;
  },
}));

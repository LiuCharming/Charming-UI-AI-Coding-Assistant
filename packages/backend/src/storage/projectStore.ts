/**
 * Project persistence — CRUD for project metadata.
 * Stored in ~/.cgui/projects.json
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { resolve, basename } from "path";
import type { ProjectMeta } from "@cgui/shared";
import { config } from "../utils/config";
import { createLogger } from "../utils/logger";
import { randomUUID } from "crypto";

const log = createLogger("projectStore");

const PROJECTS_FILE = resolve(config.cguiHome, "projects.json");

function ensureStore(): void {
  if (!existsSync(config.cguiHome)) {
    mkdirSync(config.cguiHome, { recursive: true });
  }
}

function loadProjects(): ProjectMeta[] {
  ensureStore();
  try {
    if (existsSync(PROJECTS_FILE)) {
      const raw = readFileSync(PROJECTS_FILE, "utf-8");
      return JSON.parse(raw);
    }
  } catch (err) {
    log.error({ err }, "Failed to load projects");
  }
  return [];
}

function saveProjects(projects: ProjectMeta[]): void {
  ensureStore();
  writeFileSync(PROJECTS_FILE, JSON.stringify(projects, null, 2), "utf-8");
}

export function listProjects(): ProjectMeta[] {
  return loadProjects().sort(
    (a, b) => b.lastOpenedAt - a.lastOpenedAt
  );
}

export function getProject(id: string): ProjectMeta | undefined {
  return loadProjects().find((p) => p.id === id);
}

export function createProject(
  name: string,
  path: string,
  description?: string
): ProjectMeta {
  const projects = loadProjects();

  // Check for duplicate name or path
  if (projects.some((p) => p.name === name)) {
    throw new Error(`Project "${name}" already exists`);
  }

  const project: ProjectMeta = {
    id: randomUUID(),
    name,
    path: resolve(path),
    description,
    createdAt: Date.now(),
    lastOpenedAt: Date.now(),
    sessionCount: 0,
  };

  projects.push(project);
  saveProjects(projects);

  log.info({ id: project.id, name, path: project.path }, "Project created");
  return project;
}

export function updateProject(
  id: string,
  updates: Partial<Pick<ProjectMeta, "name" | "path" | "description" | "tags">>
): ProjectMeta | null {
  const projects = loadProjects();
  const idx = projects.findIndex((p) => p.id === id);
  if (idx === -1) return null;

  projects[idx] = {
    ...projects[idx],
    ...updates,
    path: updates.path ? resolve(updates.path) : projects[idx].path,
  };
  saveProjects(projects);

  log.info({ id }, "Project updated");
  return projects[idx];
}

export function deleteProject(id: string): boolean {
  const projects = loadProjects();
  const filtered = projects.filter((p) => p.id !== id);
  if (filtered.length === projects.length) return false;

  saveProjects(filtered);
  log.info({ id }, "Project deleted");
  return true;
}

export function touchProject(id: string): void {
  const projects = loadProjects();
  const project = projects.find((p) => p.id === id);
  if (project) {
    project.lastOpenedAt = Date.now();
    saveProjects(projects);
  }
}

export function incrementSessionCount(id: string): void {
  const projects = loadProjects();
  const project = projects.find((p) => p.id === id);
  if (project) {
    project.sessionCount++;
    saveProjects(projects);
  }
}

/**
 * Scan a directory for common project indicators.
 */
export function scanDirectory(path: string): {
  name: string;
  description: string;
  hasClaudeMd: boolean;
  hasGit: boolean;
  hasPackageJson: boolean;
} {
  const absPath = resolve(path);
  let hasClaudeMd = false;
  let hasGit = false;
  let hasPackageJson = false;

  try {
    hasClaudeMd =
      existsSync(resolve(absPath, "CLAUDE.md")) ||
      existsSync(resolve(absPath, ".claude", "CLAUDE.md"));
  } catch {}
  try {
    hasGit = existsSync(resolve(absPath, ".git"));
  } catch {}
  try {
    hasPackageJson = existsSync(resolve(absPath, "package.json"));
  } catch {}

  const name = basename(absPath);
  let description = "";
  if (hasPackageJson) description = "Node.js project";
  if (hasGit) description = description
    ? `${description} (git)`
    : "Git repository";

  return { name, description, hasClaudeMd, hasGit, hasPackageJson };
}

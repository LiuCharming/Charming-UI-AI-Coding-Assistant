/**
 * REST routes for project management.
 */

import { Router } from "express";
import {
  listProjects,
  getProject,
  createProject,
  updateProject,
  deleteProject,
  scanDirectory,
} from "../storage/projectStore";
import { createLogger } from "../utils/logger";

const log = createLogger("projects");
export const projectsRouter = Router();

// List all projects
projectsRouter.get("/", (_req, res) => {
  const projects = listProjects();
  res.json({ projects });
});

// Get single project
projectsRouter.get("/:id", (req, res) => {
  const project = getProject(req.params.id);
  if (!project) {
    return res.status(404).json({ error: "Project not found" });
  }
  res.json(project);
});

// Create project
projectsRouter.post("/", (req, res) => {
  try {
    const { name, path, description, connectionType, sshConfig } = req.body;
    if (!name || !path) {
      return res
        .status(400)
        .json({ error: "Name and path are required" });
    }
    const project = createProject(name, path, {
      description,
      connectionType: connectionType || "local",
      sshConfig,
    });
    res.status(201).json(project);
  } catch (err) {
    const message =
      err instanceof Error ? err.message : String(err);
    res.status(400).json({ error: message });
  }
});

// Update project
projectsRouter.patch("/:id", (req, res) => {
  const { name, path, description, tags } = req.body;
  const project = updateProject(req.params.id, {
    name,
    path,
    description,
    tags,
  });
  if (!project) {
    return res.status(404).json({ error: "Project not found" });
  }
  res.json(project);
});

// Delete project
projectsRouter.delete("/:id", (req, res) => {
  const deleted = deleteProject(req.params.id);
  if (!deleted) {
    return res.status(404).json({ error: "Project not found" });
  }
  res.json({ success: true });
});

// Scan directory for project indicators
projectsRouter.post("/scan", (req, res) => {
  const { path } = req.body;
  if (!path) {
    return res.status(400).json({ error: "Path is required" });
  }
  try {
    const info = scanDirectory(path);
    res.json(info);
  } catch (err) {
    const message =
      err instanceof Error ? err.message : String(err);
    res.status(400).json({ error: message });
  }
});

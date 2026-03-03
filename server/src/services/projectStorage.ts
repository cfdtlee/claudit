import crypto from 'crypto';
import { Project } from '../types.js';
import { db } from './database.js';

const stmtAll = db.prepare('SELECT * FROM projects ORDER BY createdAt DESC');
const stmtById = db.prepare('SELECT * FROM projects WHERE id = ?');
const stmtInsert = db.prepare(`
  INSERT INTO projects (id, name, description, repoPath, branch, defaultAgentId, defaultModel, defaultPermissionMode, createdAt, updatedAt)
  VALUES (@id, @name, @description, @repoPath, @branch, @defaultAgentId, @defaultModel, @defaultPermissionMode, @createdAt, @updatedAt)
`);
const stmtDelete = db.prepare('DELETE FROM projects WHERE id = ?');

function rowToProject(row: any): Project {
  const project: Project = {
    id: row.id,
    name: row.name,
    repoPath: row.repoPath,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
  if (row.description != null) project.description = row.description;
  if (row.branch != null) project.branch = row.branch;
  if (row.defaultAgentId != null) project.defaultAgentId = row.defaultAgentId;
  if (row.defaultModel != null) project.defaultModel = row.defaultModel;
  if (row.defaultPermissionMode != null) project.defaultPermissionMode = row.defaultPermissionMode;
  return project;
}

function projectToParams(project: Project) {
  return {
    id: project.id,
    name: project.name,
    description: project.description ?? null,
    repoPath: project.repoPath,
    branch: project.branch ?? null,
    defaultAgentId: project.defaultAgentId ?? null,
    defaultModel: project.defaultModel ?? null,
    defaultPermissionMode: project.defaultPermissionMode ?? null,
    createdAt: project.createdAt,
    updatedAt: project.updatedAt,
  };
}

export function getAllProjects(): Project[] {
  return stmtAll.all().map(rowToProject);
}

export function getProject(id: string): Project | undefined {
  const row = stmtById.get(id);
  return row ? rowToProject(row) : undefined;
}

export function createProject(data: Omit<Project, 'id' | 'createdAt' | 'updatedAt'>): Project {
  const now = new Date().toISOString();
  const project: Project = {
    ...data,
    id: crypto.randomUUID(),
    createdAt: now,
    updatedAt: now,
  };
  stmtInsert.run(projectToParams(project));
  return project;
}

export function updateProject(id: string, updates: Partial<Project>): Project | null {
  const existing = getProject(id);
  if (!existing) return null;
  const merged: Project = { ...existing, ...updates, id, updatedAt: new Date().toISOString() };
  stmtDelete.run(id);
  stmtInsert.run(projectToParams(merged));
  return merged;
}

export function deleteProject(id: string): boolean {
  const result = stmtDelete.run(id);
  return result.changes > 0;
}

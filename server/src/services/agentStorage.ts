import crypto from 'crypto';
import { Agent } from '../types.js';
import { db } from './database.js';

const stmtAll = db.prepare('SELECT * FROM agents ORDER BY isSystem DESC, createdAt DESC');
const stmtById = db.prepare('SELECT * FROM agents WHERE id = ?');
const stmtInsert = db.prepare(`
  INSERT INTO agents (id, name, avatar, specialty, systemPrompt, recentSummary, isSystem, createdAt, updatedAt, lastActiveAt)
  VALUES (@id, @name, @avatar, @specialty, @systemPrompt, @recentSummary, @isSystem, @createdAt, @updatedAt, @lastActiveAt)
`);
const stmtDelete = db.prepare('DELETE FROM agents WHERE id = ?');

function rowToAgent(row: any): Agent {
  const agent: Agent = {
    id: row.id,
    name: row.name,
    systemPrompt: row.systemPrompt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
  if (row.avatar != null) agent.avatar = row.avatar;
  if (row.specialty != null) agent.specialty = row.specialty;
  if (row.recentSummary != null) agent.recentSummary = row.recentSummary;
  if (row.isSystem) agent.isSystem = true;
  if (row.lastActiveAt != null) agent.lastActiveAt = row.lastActiveAt;
  return agent;
}

function agentToParams(agent: Agent) {
  return {
    id: agent.id,
    name: agent.name,
    avatar: agent.avatar ?? null,
    specialty: agent.specialty ?? null,
    systemPrompt: agent.systemPrompt,
    recentSummary: agent.recentSummary ?? null,
    isSystem: agent.isSystem ? 1 : 0,
    createdAt: agent.createdAt,
    updatedAt: agent.updatedAt,
    lastActiveAt: agent.lastActiveAt ?? null,
  };
}

export function getAllAgents(): Agent[] {
  return stmtAll.all().map(rowToAgent);
}

export function getAgent(id: string): Agent | undefined {
  const row = stmtById.get(id);
  return row ? rowToAgent(row) : undefined;
}

export function createAgent(data: Omit<Agent, 'id' | 'createdAt' | 'updatedAt'>): Agent {
  const now = new Date().toISOString();
  const agent: Agent = {
    ...data,
    id: crypto.randomUUID(),
    createdAt: now,
    updatedAt: now,
  };
  stmtInsert.run(agentToParams(agent));
  return agent;
}

export function updateAgent(id: string, updates: Partial<Agent>): Agent | null {
  const existing = getAgent(id);
  if (!existing) return null;
  const merged: Agent = { ...existing, ...updates, id, updatedAt: new Date().toISOString() };
  stmtDelete.run(id);
  stmtInsert.run(agentToParams(merged));
  return merged;
}

export function deleteAgent(id: string): boolean {
  const agent = getAgent(id);
  if (agent?.isSystem) throw new Error('Cannot delete system agent');
  const result = stmtDelete.run(id);
  return result.changes > 0;
}

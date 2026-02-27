import crypto from 'crypto';
import { TodoProviderConfig } from '../types.js';
import { db } from './database.js';

// --- Prepared statements ---

const stmtAll = db.prepare('SELECT * FROM provider_configs');
const stmtById = db.prepare('SELECT * FROM provider_configs WHERE id = ?');
const stmtInsert = db.prepare(`
  INSERT INTO provider_configs (id, providerId, name, enabled, config, syncIntervalMinutes, lastSyncAt, lastSyncError, createdAt)
  VALUES (@id, @providerId, @name, @enabled, @config, @syncIntervalMinutes, @lastSyncAt, @lastSyncError, @createdAt)
`);
const stmtDelete = db.prepare('DELETE FROM provider_configs WHERE id = ?');

// --- Row mapper ---

function rowToConfig(row: any): TodoProviderConfig {
  const config: TodoProviderConfig = {
    id: row.id,
    providerId: row.providerId,
    name: row.name,
    enabled: row.enabled === 1,
    config: JSON.parse(row.config),
    createdAt: row.createdAt,
  };
  if (row.syncIntervalMinutes != null) config.syncIntervalMinutes = row.syncIntervalMinutes;
  if (row.lastSyncAt != null) config.lastSyncAt = row.lastSyncAt;
  if (row.lastSyncError != null) config.lastSyncError = row.lastSyncError;
  return config;
}

function configToParams(config: TodoProviderConfig) {
  return {
    id: config.id,
    providerId: config.providerId,
    name: config.name,
    enabled: config.enabled ? 1 : 0,
    config: JSON.stringify(config.config),
    syncIntervalMinutes: config.syncIntervalMinutes ?? null,
    lastSyncAt: config.lastSyncAt ?? null,
    lastSyncError: config.lastSyncError ?? null,
    createdAt: config.createdAt,
  };
}

/** Trim whitespace from all string values in config (prevents pasted keys with spaces) */
function sanitizeConfig(config: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(config)) {
    result[key] = typeof value === 'string' ? value.replace(/\s+/g, '') : value;
  }
  return result;
}

export function getAllConfigs(): TodoProviderConfig[] {
  return stmtAll.all().map(rowToConfig);
}

export function getConfig(id: string): TodoProviderConfig | undefined {
  const row = stmtById.get(id);
  return row ? rowToConfig(row) : undefined;
}

export function createConfig(data: Omit<TodoProviderConfig, 'id' | 'createdAt'>): TodoProviderConfig {
  const config: TodoProviderConfig = {
    ...data,
    config: sanitizeConfig(data.config),
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
  };
  stmtInsert.run(configToParams(config));
  return config;
}

export function updateConfig(id: string, updates: Partial<TodoProviderConfig>): TodoProviderConfig | null {
  const existing = getConfig(id);
  if (!existing) return null;
  const sanitized = updates.config ? { ...updates, config: sanitizeConfig(updates.config) } : updates;
  const merged: TodoProviderConfig = { ...existing, ...sanitized, id };
  stmtDelete.run(id);
  stmtInsert.run(configToParams(merged));
  return merged;
}

export function deleteConfig(id: string): boolean {
  const result = stmtDelete.run(id);
  return result.changes > 0;
}

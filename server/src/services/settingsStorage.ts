import { ClauditConfig } from '../types.js';
import { db } from './database.js';

const stmtGet = db.prepare('SELECT value FROM settings WHERE key = ?');
const stmtSet = db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)');
const stmtAll = db.prepare('SELECT key, value FROM settings');

const DEFAULTS: ClauditConfig = {
  defaultModel: 'sonnet',
  defaultPermissionMode: 'default',
  workingDirectory: '',
  notifyOnWaiting: true,
  notifyOnDone: true,
  notifyOnFailed: true,
  notifyOnStuck: true,
  mayorAutoExecute: false,
  workerEnabled: false,
  maxConcurrentWorkers: 20,
  sessionTimeoutMs: 600000,
  witnessIntervalMs: 30000,
  patrolIntervalMs: 300000,
};

const BOOL_KEYS = new Set([
  'notifyOnWaiting', 'notifyOnDone', 'notifyOnFailed', 'notifyOnStuck',
  'mayorAutoExecute', 'workerEnabled',
]);

const NUMBER_KEYS = new Set([
  'maxConcurrentWorkers', 'sessionTimeoutMs', 'witnessIntervalMs', 'patrolIntervalMs',
]);

export function getSetting(key: string): string | undefined {
  const row = stmtGet.get(key) as any;
  return row?.value;
}

export function setSetting(key: string, value: string): void {
  stmtSet.run(key, value);
}

export function getAllSettings(): Record<string, string> {
  const rows = stmtAll.all() as any[];
  const result: Record<string, string> = {};
  for (const row of rows) {
    result[row.key] = row.value;
  }
  return result;
}

export function getSettingsObject(): ClauditConfig {
  const raw = getAllSettings();
  const config: ClauditConfig = {};

  for (const [key, defaultVal] of Object.entries(DEFAULTS)) {
    const rawVal = raw[key];
    if (BOOL_KEYS.has(key)) {
      (config as any)[key] = rawVal !== undefined ? rawVal === 'true' : defaultVal;
    } else if (NUMBER_KEYS.has(key)) {
      (config as any)[key] = rawVal !== undefined ? Number(rawVal) : defaultVal;
    } else {
      (config as any)[key] = rawVal ?? defaultVal;
    }
  }

  // String-only keys without defaults
  if (raw.mayorSessionId !== undefined) config.mayorSessionId = raw.mayorSessionId;

  return config;
}

export function updateSettings(config: Partial<ClauditConfig>): ClauditConfig {
  const txn = db.transaction(() => {
    for (const [key, value] of Object.entries(config)) {
      if (value !== undefined) {
        setSetting(key, String(value));
      }
    }
  });
  txn();
  return getSettingsObject();
}

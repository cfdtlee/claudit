/**
 * Resolves HTTP port the same way as the server: PORT env, then settings.serverPort in SQLite, then 3001.
 */
import { join } from 'path';
import { homedir } from 'os';
import { existsSync } from 'fs';
import { createRequire } from 'module';

const DATA_DIR = join(homedir(), '.claudit');
const DEFAULT_PORT = 3001;

export function getResolvedPort() {
  if (process.env.PORT !== undefined && process.env.PORT !== '') {
    const p = parseInt(process.env.PORT, 10);
    if (!Number.isNaN(p) && p > 0 && p <= 65535) return p;
  }
  const dbName = process.env.NODE_ENV === 'development' ? 'claudit-dev.db' : 'claudit.db';
  const dbPath = join(DATA_DIR, dbName);
  if (!existsSync(dbPath)) return DEFAULT_PORT;
  try {
    const require = createRequire(import.meta.url);
    const Database = require('better-sqlite3');
    const db = new Database(dbPath, { readonly: true });
    const row = db.prepare('SELECT value FROM settings WHERE key = ?').get('serverPort');
    db.close();
    if (row?.value != null && row.value !== '') {
      const p = parseInt(String(row.value), 10);
      if (!Number.isNaN(p) && p > 0 && p <= 65535) return p;
    }
  } catch {
    // ignore
  }
  return DEFAULT_PORT;
}

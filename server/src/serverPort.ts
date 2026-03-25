import { getSettingsObject } from './services/settingsStorage.js';

const DEFAULT = 3001;

/** HTTP listen port: `PORT` env wins, then saved `serverPort`, then default. */
export function resolveServerPort(): number {
  if (process.env.PORT !== undefined && process.env.PORT !== '') {
    const p = parseInt(process.env.PORT, 10);
    if (!Number.isNaN(p) && p > 0 && p <= 65535) return p;
  }
  const fromSettings = getSettingsObject().serverPort;
  if (
    fromSettings !== undefined &&
    Number.isFinite(fromSettings) &&
    fromSettings > 0 &&
    fromSettings <= 65535
  ) {
    return Math.floor(fromSettings);
  }
  return DEFAULT;
}

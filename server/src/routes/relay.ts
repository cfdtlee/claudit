import { Router } from 'express';
import QRCode from 'qrcode';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { generateKeyPair, keyToBase64Url, keyFromBase64Url } from '../services/relayCrypto.js';
import {
  startRelay,
  stopRelay,
  getRelayStatus,
  getPairingInfo,
} from '../services/relayConnector.js';

const router = Router();

// ── Persistence ─────────────────────────────────────────────────────────────

const CLAUDIT_DIR = path.join(os.homedir(), '.claudit');
const RELAY_CONFIG_FILE = path.join(CLAUDIT_DIR, 'relay.json');

interface PersistedRelayConfig {
  relayUrl: string;
  pairingId: string;
  secretKeyBase64: string;
}

function saveRelayConfig(cfg: PersistedRelayConfig): void {
  try {
    if (!fs.existsSync(CLAUDIT_DIR)) fs.mkdirSync(CLAUDIT_DIR, { recursive: true });
    fs.writeFileSync(RELAY_CONFIG_FILE, JSON.stringify(cfg, null, 2), { mode: 0o600 });
    console.log('[relay] Pairing credentials saved to', RELAY_CONFIG_FILE);
  } catch (err: any) {
    console.error('[relay] Failed to save config:', err.message);
  }
}

function loadRelayConfig(): PersistedRelayConfig | null {
  try {
    if (!fs.existsSync(RELAY_CONFIG_FILE)) return null;
    const data = fs.readFileSync(RELAY_CONFIG_FILE, 'utf-8');
    const cfg = JSON.parse(data);
    if (cfg.relayUrl && cfg.pairingId && cfg.secretKeyBase64) return cfg;
  } catch {}
  return null;
}

function deleteRelayConfig(): void {
  try {
    if (fs.existsSync(RELAY_CONFIG_FILE)) fs.unlinkSync(RELAY_CONFIG_FILE);
  } catch {}
}

// ── Auto-connect on startup ─────────────────────────────────────────────────

const saved = loadRelayConfig();
if (saved) {
  console.log('[relay] Found saved pairing, auto-connecting...');
  const secretKey = keyFromBase64Url(saved.secretKeyBase64);
  startRelay({ relayUrl: saved.relayUrl, pairingId: saved.pairingId, secretKey });
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function buildQrData(relayUrl: string, pairingId: string, keyBase64: string): string {
  let relayHost: string;
  try {
    const url = new URL(relayUrl);
    relayHost = url.host;
  } catch {
    relayHost = relayUrl.replace(/^wss?:\/\//, '');
  }
  return `claudit://${relayHost}/${pairingId}#${keyBase64}`;
}

// ── Routes ───────────────────────────────────────────────────────────────────

// POST /api/relay/start — Start relay (generates new pairing if no saved config)
router.post('/start', (req, res) => {
  try {
    const { relayUrl, fresh } = req.body;
    if (!relayUrl || typeof relayUrl !== 'string') {
      return res.status(400).json({ error: 'relayUrl is required' });
    }

    let pairingId: string;
    let secretKey: Uint8Array;
    let keyBase64: string;

    // Reuse saved credentials unless 'fresh' is requested
    const saved = !fresh ? loadRelayConfig() : null;
    if (saved && saved.relayUrl === relayUrl) {
      pairingId = saved.pairingId;
      secretKey = keyFromBase64Url(saved.secretKeyBase64);
      keyBase64 = saved.secretKeyBase64;
      console.log('[relay] Reusing saved pairing credentials');
    } else {
      const pair = generateKeyPair();
      pairingId = pair.pairingId;
      secretKey = pair.secretKey;
      keyBase64 = keyToBase64Url(secretKey);
      // Persist new credentials
      saveRelayConfig({ relayUrl, pairingId, secretKeyBase64: keyBase64 });
    }

    startRelay({ relayUrl, pairingId, secretKey });

    res.json({
      status: 'connecting',
      pairingId,
      qrData: buildQrData(relayUrl, pairingId, keyBase64),
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to start relay' });
  }
});

// POST /api/relay/stop
router.post('/stop', (_req, res) => {
  stopRelay();
  res.json({ status: 'disconnected' });
});

// POST /api/relay/unpair — Stop and delete saved credentials
router.post('/unpair', (_req, res) => {
  stopRelay();
  deleteRelayConfig();
  res.json({ status: 'unpaired' });
});

// GET /api/relay/status
router.get('/status', (_req, res) => {
  const status = getRelayStatus();
  const pairing = getPairingInfo();
  res.json({ ...status, pairing });
});

// GET /api/relay/qr — QR code as SVG
router.get('/qr', async (_req, res) => {
  try {
    const pairing = getPairingInfo();
    if (!pairing) return res.status(404).json({ error: 'Relay not active. Start relay first.' });

    const qrData = buildQrData(pairing.relayUrl, pairing.pairingId, pairing.secretKeyBase64);
    const svg = await QRCode.toString(qrData, { type: 'svg', margin: 2, width: 300 });
    res.setHeader('Content-Type', 'image/svg+xml');
    res.send(svg);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/relay/qr.png — QR code as PNG
router.get('/qr.png', async (_req, res) => {
  try {
    const pairing = getPairingInfo();
    if (!pairing) return res.status(404).json({ error: 'Relay not active. Start relay first.' });

    const qrData = buildQrData(pairing.relayUrl, pairing.pairingId, pairing.secretKeyBase64);
    const buffer = await QRCode.toBuffer(qrData, { type: 'png', margin: 2, width: 300 });
    res.setHeader('Content-Type', 'image/png');
    res.send(buffer);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/relay/pair — Pairing page with QR code
router.get('/pair', async (_req, res) => {
  const pairing = getPairingInfo();
  if (!pairing) {
    return res.send(`
      <html><body style="background:#0a0a0a;color:#e5e5e5;font-family:system-ui;display:flex;align-items:center;justify-content:center;height:100vh;margin:0">
        <div style="text-align:center">
          <h2>Relay Not Active</h2>
          <p>Start the relay first:</p>
          <code style="background:#1a1a1a;padding:8px 16px;border-radius:8px;display:inline-block">
            POST /api/relay/start {"relayUrl":"wss://claudit-relay.fly.dev"}
          </code>
        </div>
      </body></html>
    `);
  }

  const qrData = buildQrData(pairing.relayUrl, pairing.pairingId, pairing.secretKeyBase64);
  const svg = await QRCode.toString(qrData, { type: 'svg', margin: 2, width: 280 });
  const status = getRelayStatus();

  res.send(`
    <!DOCTYPE html>
    <html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
    <title>Claudit - Pair iOS App</title>
    <style>
      body { background:#0a0a0a; color:#e5e5e5; font-family:system-ui,-apple-system,sans-serif; margin:0; display:flex; align-items:center; justify-content:center; min-height:100vh; }
      .card { background:#1a1a1a; border:1px solid #2a2a2a; border-radius:16px; padding:32px; text-align:center; max-width:360px; }
      h1 { font-size:24px; margin:0 0 8px; }
      .subtitle { color:#737373; font-size:14px; margin:0 0 24px; }
      .qr { background:white; border-radius:12px; padding:16px; display:inline-block; margin:0 0 24px; }
      .qr svg { display:block; }
      .status { display:flex; align-items:center; gap:8px; justify-content:center; margin:0 0 16px; font-size:14px; }
      .dot { width:8px; height:8px; border-radius:50%; }
      .dot.connected { background:#22c55e; }
      .dot.waiting { background:#eab308; }
      .info { background:#111; border-radius:8px; padding:12px; font-size:12px; color:#737373; word-break:break-all; }
      .info code { color:#3b82f6; }
    </style></head>
    <body>
      <div class="card">
        <h1>Pair iOS App</h1>
        <p class="subtitle">Scan this QR code with the Claudit iOS app</p>
        <div class="qr">${svg}</div>
        <div class="status">
          <div class="dot ${status.state === 'connected' ? 'connected' : 'waiting'}"></div>
          <span>${status.state === 'connected' ? 'Connected to relay' : 'Waiting for iOS app...'}</span>
        </div>
        <div class="info">
          Pairing ID: <code>${pairing.pairingId.slice(0, 8)}...</code><br>
          Relay: <code>${pairing.relayUrl}</code>
        </div>
      </div>
    </body></html>
  `);
});

export default router;

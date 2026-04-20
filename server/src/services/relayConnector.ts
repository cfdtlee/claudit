import WebSocket from 'ws';
import http from 'http';
import { encrypt, decrypt } from './relayCrypto.js';
import { getWatcher, stopWatcher } from './jsonlWatcher.js';

// ── Types ──────────────────────────────────────────────────────────────────────

export interface RelayConfig {
  relayUrl: string;        // e.g., "wss://claudit-relay.fly.dev"
  pairingId: string;       // UUID
  secretKey: Uint8Array;   // 32-byte AES-256-GCM key
}

export interface PairingInfo {
  pairingId: string;
  relayUrl: string;
  secretKeyBase64: string; // base64url-encoded key for QR
}

export type RelayConnectionState = 'disconnected' | 'connecting' | 'connected' | 'reconnecting';

export interface RelayStatus {
  state: RelayConnectionState;
  relayUrl: string | null;
  pairingId: string | null;
  connectedSince: number | null;
  reconnectAttempts: number;
}

// ── Module state ───────────────────────────────────────────────────────────────

let config: RelayConfig | null = null;
let controlWs: WebSocket | null = null;
let ptyWs: WebSocket | null = null;
let state: RelayConnectionState = 'disconnected';
let connectedSince: number | null = null;
let reconnectAttempts = 0;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let stopped = false;

// Local proxied WS connections
let localPtyWs: WebSocket | null = null;
let localEventsWs: WebSocket | null = null;

function getLocalPort(): number {
  return parseInt(process.env.PORT || '7433', 10);
}

// ── Public API ─────────────────────────────────────────────────────────────────

export function startRelay(cfg: RelayConfig): void {
  if (controlWs || ptyWs) stopRelay();

  config = cfg;
  stopped = false;
  reconnectAttempts = 0;

  console.log(`[relay] Starting relay to ${cfg.relayUrl} (pairing: ${cfg.pairingId})`);
  connect();
}

export function stopRelay(): void {
  stopped = true;
  if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null; }
  closeWs(controlWs, 'control');
  closeWs(ptyWs, 'pty');
  stopEventForwarding();
  closeLocalPty();
  controlWs = null;
  ptyWs = null;
  setState('disconnected');
  connectedSince = null;
  reconnectAttempts = 0;
  config = null;
  console.log('[relay] Relay stopped');
}

export function getPairingInfo(): PairingInfo | null {
  if (!config) return null;
  return {
    pairingId: config.pairingId,
    relayUrl: config.relayUrl,
    secretKeyBase64: Buffer.from(config.secretKey)
      .toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''),
  };
}

export function getRelayStatus(): RelayStatus {
  return {
    state,
    relayUrl: config?.relayUrl ?? null,
    pairingId: config?.pairingId ?? null,
    connectedSince,
    reconnectAttempts,
  };
}

// ── Connection logic ───────────────────────────────────────────────────────────

function setState(newState: RelayConnectionState): void {
  if (state !== newState) {
    console.log(`[relay] State: ${state} -> ${newState}`);
    state = newState;
  }
}

function connect(): void {
  if (!config || stopped) return;
  setState(reconnectAttempts > 0 ? 'reconnecting' : 'connecting');

  const controlUrl = `${config.relayUrl}/ws/control`;
  const ptyUrl = `${config.relayUrl}/ws/pty`;

  let controlReady = false;
  let ptyReady = false;

  function checkBothReady() {
    if (controlReady && ptyReady) {
      setState('connected');
      connectedSince = Date.now();
      reconnectAttempts = 0;
      console.log('[relay] Both channels connected');
      startEventForwarding();
    }
  }

  function sendJoin(ws: WebSocket) {
    ws.send(JSON.stringify({
      type: 'join',
      pairingId: config!.pairingId,
      role: 'server',
    }));
  }

  // ── Control channel ──
  controlWs = new WebSocket(controlUrl);

  controlWs.on('open', () => {
    console.log('[relay] Control channel open, sending join');
    sendJoin(controlWs!);
  });

  controlWs.on('message', (raw: Buffer) => {
    const text = raw.toString('utf-8');

    // Handle relay control messages (unencrypted)
    try {
      const msg = JSON.parse(text);
      if (msg.type === 'joined') {
        console.log(`[relay] Control joined, peer: ${msg.peer}`);
        controlReady = true;
        checkBothReady();
        return;
      }
      if (msg.type === 'peer_joined') {
        console.log('[relay] Peer (iOS) joined');
        if (!connectedSince) { controlReady = true; checkBothReady(); }
        return;
      }
      if (msg.type === 'peer_left') {
        console.log('[relay] Peer (iOS) left');
        return;
      }
      if (msg.type === 'pong') return;
    } catch {
      // Not JSON — treat as encrypted message
    }

    // Encrypted message from iOS
    console.log(`[relay] Received encrypted msg on control, length=${text.length}`);
    handleControlMessage(text);
  });

  controlWs.on('close', (code, reason) => {
    console.log(`[relay] Control closed: ${code} ${reason.toString()}`);
    controlWs = null;
    handleDisconnect();
  });

  controlWs.on('error', (err) => {
    console.error('[relay] Control error:', err.message);
  });

  // ── PTY channel ──
  ptyWs = new WebSocket(ptyUrl);

  ptyWs.on('open', () => {
    console.log('[relay] PTY channel open, sending join');
    sendJoin(ptyWs!);
  });

  ptyWs.on('message', (raw: Buffer) => {
    const text = raw.toString('utf-8');

    try {
      const msg = JSON.parse(text);
      if (msg.type === 'joined') {
        console.log(`[relay] PTY joined, peer: ${msg.peer}`);
        ptyReady = true;
        checkBothReady();
        return;
      }
      if (msg.type === 'peer_joined' || msg.type === 'peer_left' || msg.type === 'pong') return;
    } catch {}

    handlePtyMessage(text);
  });

  ptyWs.on('close', (code, reason) => {
    console.log(`[relay] PTY closed: ${code} ${reason.toString()}`);
    ptyWs = null;
    handleDisconnect();
  });

  ptyWs.on('error', (err) => {
    console.error('[relay] PTY error:', err.message);
  });
}

function handleDisconnect(): void {
  if (stopped) return;
  closeWs(controlWs, 'control');
  closeWs(ptyWs, 'pty');
  stopEventForwarding();
  closeLocalPty();
  controlWs = null;
  ptyWs = null;
  connectedSince = null;
  scheduleReconnect();
}

function scheduleReconnect(): void {
  if (stopped || reconnectTimer) return;
  reconnectAttempts++;
  const delay = Math.min(1000 * Math.pow(2, reconnectAttempts - 1), 30000);
  console.log(`[relay] Reconnecting in ${delay}ms (attempt ${reconnectAttempts})`);
  setState('reconnecting');
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    connect();
  }, delay);
}

function closeWs(ws: WebSocket | null, label: string): void {
  if (!ws) return;
  try {
    ws.removeAllListeners();
    if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
      ws.close(1000, 'relay stopped');
    }
  } catch (err: any) {
    console.error(`[relay] Error closing ${label} ws:`, err.message);
  }
}

// ── Message handling ───────────────────────────────────────────────────────────

function decryptMessage(base64: string): any | null {
  if (!config) return null;
  const plaintext = decrypt(base64, config.secretKey);
  if (!plaintext) {
    console.error('[relay] Decryption failed');
    return null;
  }
  try { return JSON.parse(plaintext); }
  catch { console.error('[relay] Invalid decrypted JSON'); return null; }
}

function handleControlMessage(text: string): void {
  const msg = decryptMessage(text);
  if (!msg) return;

  switch (msg.channel) {
    case 'api': handleApiRequest(msg); break;
    case 'chat': proxyChatMessage(msg); break;
    case 'watch': handleWatchSession(msg); break;
    case 'terminal-input':
    case 'terminal-control': forwardToPtyWs(msg); break;
  }
}

function handlePtyMessage(text: string): void {
  const msg = decryptMessage(text);
  if (!msg) return;
  if (msg.channel === 'terminal-input' || msg.channel === 'terminal-control') {
    forwardToPtyWs(msg);
  }
}

// ── API proxying ───────────────────────────────────────────────────────────────

function handleApiRequest(msg: {
  channel: 'api'; requestId: string; payload: string;
}): void {
  // payload contains the inner request: { method, path, body? }
  let inner: { method: string; path: string; body?: string };
  try {
    inner = JSON.parse(msg.payload);
  } catch {
    console.error('[relay] Invalid API request payload');
    return;
  }

  console.log(`[relay] API proxy: ${inner.method} ${inner.path}`);

  const port = getLocalPort();
  const options: http.RequestOptions = {
    hostname: '127.0.0.1', port, path: inner.path, method: inner.method,
    headers: { 'Content-Type': 'application/json' },
  };

  const req = http.request(options, (res) => {
    const chunks: Buffer[] = [];
    res.on('data', (chunk: Buffer) => chunks.push(chunk));
    res.on('end', () => {
      const responseBody = Buffer.concat(chunks).toString('utf-8');
      console.log(`[relay] API response: ${res.statusCode} (${responseBody.length} bytes)`);
      sendEncrypted(controlWs, {
        channel: 'api',
        requestId: msg.requestId,
        payload: JSON.stringify({ status: res.statusCode ?? 500, body: responseBody }),
      });
    });
  });

  req.on('error', (err) => {
    console.error(`[relay] API proxy error: ${err.message}`);
    sendEncrypted(controlWs, {
      channel: 'api',
      requestId: msg.requestId,
      payload: JSON.stringify({ status: 502, body: JSON.stringify({ error: err.message }) }),
    });
  });

  if (inner.body) req.write(inner.body);
  req.end();
}

// ── Chat proxying ──────────────────────────────────────────────────────────────

// Active chat WebSocket connections keyed by sessionId
const chatConnections = new Map<string, WebSocket>();

function proxyChatMessage(msg: any): void {
  const inner = JSON.parse(msg.payload || '{}');
  const port = getLocalPort();

  // For 'resume', create or reuse a persistent chat connection
  if (inner.type === 'resume') {
    const sessionId = inner.sessionId;

    // Reuse existing connection if alive
    const existing = chatConnections.get(sessionId);
    if (existing && existing.readyState === WebSocket.OPEN) {
      console.log(`[relay] Reusing existing chat WS for session ${sessionId.substring(0, 8)}`);
      existing.send(JSON.stringify(inner));
      return;
    }

    const localWs = new WebSocket(`ws://127.0.0.1:${port}/ws/chat`);
    chatConnections.set(sessionId, localWs);

    localWs.on('open', () => {
      console.log(`[relay] Chat WS connected for session ${sessionId.substring(0, 8)}`);
      localWs.send(JSON.stringify(inner));
    });
    localWs.on('message', (data: Buffer) => {
      sendEncrypted(controlWs, {
        channel: 'chat',
        requestId: null,
        payload: data.toString(),
      });
    });
    localWs.on('close', () => {
      console.log(`[relay] Chat WS closed for session ${sessionId.substring(0, 8)}`);
      chatConnections.delete(sessionId);
    });
    localWs.on('error', (err) => {
      console.error('[relay] Chat proxy error:', err.message);
      chatConnections.delete(sessionId);
    });
    return;
  }

  // For 'message' and 'stop', send to existing connection
  if (inner.type === 'message' || inner.type === 'stop') {
    // Find active chat connection
    for (const [, ws] of chatConnections) {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(inner));
        return;
      }
    }
    console.warn('[relay] No active chat connection for message');
  }
}

// ── PTY proxying ───────────────────────────────────────────────────────────────

function ensureLocalPtyConnection(): WebSocket | null {
  if (localPtyWs && localPtyWs.readyState === WebSocket.OPEN) return localPtyWs;

  const port = getLocalPort();
  localPtyWs = new WebSocket(`ws://127.0.0.1:${port}/ws/terminal`);
  localPtyWs.on('open', () => console.log('[relay] Local PTY connected'));
  localPtyWs.on('message', (data: Buffer) => {
    // Send PTY output through control channel (iOS only connects to control)
    sendEncrypted(controlWs, { channel: 'terminal', requestId: null, payload: data.toString() });
  });
  localPtyWs.on('close', () => { localPtyWs = null; });
  localPtyWs.on('error', (err) => { console.error('[relay] Local PTY error:', err.message); localPtyWs = null; });
  return localPtyWs;
}

function closeLocalPty(): void {
  if (localPtyWs) { localPtyWs.removeAllListeners(); try { localPtyWs.close(); } catch {} localPtyWs = null; }
}

function forwardToPtyWs(msg: any): void {
  const ws = ensureLocalPtyConnection();
  if (!ws) return;

  let data: string;
  if (msg.channel === 'terminal-input') {
    // Wrap raw text in the {type:"input",data:"..."} format ptyManager expects
    data = JSON.stringify({ type: 'input', data: msg.payload });
  } else if (msg.channel === 'terminal-control') {
    // Control messages (resume, resize) are already JSON in payload
    data = msg.payload || JSON.stringify(msg);
  } else {
    data = msg.payload || JSON.stringify(msg);
  }

  console.log(`[relay] Forwarding to local PTY (${msg.channel}): ${data.substring(0, 80)}`);
  if (ws.readyState === WebSocket.OPEN) ws.send(data);
  else ws.once('open', () => ws.send(data));
}

// ── JSONL Watch proxying ───────────────────────────────────────────────────────

function handleWatchSession(msg: any): void {
  const inner = JSON.parse(msg.payload || '{}');

  if (inner.action === 'start' && inner.projectHash && inner.sessionId) {
    const watcher = getWatcher(inner.projectHash, inner.sessionId);

    // Remove old listener if any, then add new one
    watcher.removeAllListeners('change');
    watcher.on('change', () => {
      console.log(`[relay] JSONL change detected for ${inner.sessionId.substring(0, 8)}`);
      sendEncrypted(controlWs, {
        channel: 'watch',
        requestId: null,
        payload: JSON.stringify({
          type: 'session_changed',
          sessionId: inner.sessionId,
          projectHash: inner.projectHash,
        }),
      });
    });

    console.log(`[relay] Watching JSONL for session ${inner.sessionId.substring(0, 8)}`);
  } else if (inner.action === 'stop' && inner.projectHash && inner.sessionId) {
    stopWatcher(inner.projectHash, inner.sessionId);
    console.log(`[relay] Stopped watching JSONL for ${inner.sessionId.substring(0, 8)}`);
  }
}

// ── Events proxying ────────────────────────────────────────────────────────────

function startEventForwarding(): void {
  if (localEventsWs) return;
  const port = getLocalPort();
  localEventsWs = new WebSocket(`ws://127.0.0.1:${port}/ws/events`);
  localEventsWs.on('message', (data: Buffer) => {
    try {
      sendEncrypted(controlWs, {
        channel: 'events',
        requestId: null,
        payload: data.toString(),
      });
    } catch (err: any) { console.error('[relay] Event forward error:', err.message); }
  });
  localEventsWs.on('close', () => {
    localEventsWs = null;
    if (!stopped && state === 'connected') setTimeout(() => startEventForwarding(), 1000);
  });
  localEventsWs.on('error', (err) => console.error('[relay] Events error:', err.message));
}

function stopEventForwarding(): void {
  if (localEventsWs) { localEventsWs.removeAllListeners(); try { localEventsWs.close(); } catch {} localEventsWs = null; }
}

// ── Encrypted send helper ──────────────────────────────────────────────────────

function sendEncrypted(ws: WebSocket | null, payload: object): void {
  if (!config) { console.error('[relay] sendEncrypted: no config'); return; }
  if (!ws) { console.error('[relay] sendEncrypted: no ws'); return; }
  if (ws.readyState !== WebSocket.OPEN) {
    console.error(`[relay] sendEncrypted: ws not open (state=${ws.readyState})`);
    return;
  }
  const plaintext = JSON.stringify(payload);
  const encrypted = encrypt(plaintext, config.secretKey);
  console.log(`[relay] sendEncrypted: ${encrypted.length} bytes to relay`);
  ws.send(encrypted);
}

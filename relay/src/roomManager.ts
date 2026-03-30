import { WebSocket } from "ws";
import type { Channel, Role } from "./protocol.js";

interface RoomSlot {
  server: WebSocket | null;
  client: WebSocket | null;
}

interface Room {
  pairingId: string;
  control: RoomSlot;
  pty: RoomSlot;
  createdAt: number;
  lastActivity: number;
}

const IDLE_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes
const CLEANUP_INTERVAL_MS = 60 * 1000; // 60 seconds

export class RoomManager {
  private rooms = new Map<string, Room>();
  private cleanupTimer: ReturnType<typeof setInterval> | null = null;

  start(): void {
    this.cleanupTimer = setInterval(() => this.cleanup(), CLEANUP_INTERVAL_MS);
  }

  stop(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }
    // Close all connections
    for (const room of this.rooms.values()) {
      for (const channel of ["control", "pty"] as const) {
        const slot = room[channel];
        slot.server?.close(1001, "server shutting down");
        slot.client?.close(1001, "server shutting down");
      }
    }
    this.rooms.clear();
  }

  join(
    pairingId: string,
    channel: Channel,
    role: Role,
    ws: WebSocket
  ): { peer: "connected" | "waiting" } {
    let room = this.rooms.get(pairingId);
    if (!room) {
      room = {
        pairingId,
        control: { server: null, client: null },
        pty: { server: null, client: null },
        createdAt: Date.now(),
        lastActivity: Date.now(),
      };
      this.rooms.set(pairingId, room);
    }

    const slot = room[channel];
    const existing = slot[role];

    // Kick previous connection in same slot
    if (existing && existing.readyState === WebSocket.OPEN) {
      log("warn", `Replacing existing ${role} on ${channel} in room ${short(pairingId)}`);
      existing.close(4000, "replaced by new connection");
    }

    slot[role] = ws;
    room.lastActivity = Date.now();

    const peerRole: Role = role === "server" ? "client" : "server";
    const peer = slot[peerRole];
    const peerConnected = peer !== null && peer.readyState === WebSocket.OPEN;

    // Notify peer that we joined
    if (peerConnected && peer) {
      sendJson(peer, { type: "peer_joined" });
    }

    log("info", `${role} joined ${channel} in room ${short(pairingId)} (peer: ${peerConnected ? "connected" : "waiting"})`);

    return { peer: peerConnected ? "connected" : "waiting" };
  }

  leave(pairingId: string, channel: Channel, role: Role): void {
    const room = this.rooms.get(pairingId);
    if (!room) return;

    const slot = room[channel];
    slot[role] = null;

    // Notify peer
    const peerRole: Role = role === "server" ? "client" : "server";
    const peer = slot[peerRole];
    if (peer && peer.readyState === WebSocket.OPEN) {
      sendJson(peer, { type: "peer_left" });
    }

    log("info", `${role} left ${channel} in room ${short(pairingId)}`);

    // Remove room if completely empty
    if (
      !room.control.server &&
      !room.control.client &&
      !room.pty.server &&
      !room.pty.client
    ) {
      this.rooms.delete(pairingId);
      log("info", `Room ${short(pairingId)} removed (empty)`);
    }
  }

  getPeer(pairingId: string, channel: Channel, role: Role): WebSocket | null {
    const room = this.rooms.get(pairingId);
    if (!room) return null;
    room.lastActivity = Date.now();
    const peerRole: Role = role === "server" ? "client" : "server";
    const peer = room[channel][peerRole];
    return peer && peer.readyState === WebSocket.OPEN ? peer : null;
  }

  get roomCount(): number {
    return this.rooms.size;
  }

  get connectionCount(): number {
    let count = 0;
    for (const room of this.rooms.values()) {
      for (const channel of ["control", "pty"] as const) {
        if (room[channel].server?.readyState === WebSocket.OPEN) count++;
        if (room[channel].client?.readyState === WebSocket.OPEN) count++;
      }
    }
    return count;
  }

  private cleanup(): void {
    const now = Date.now();
    let removed = 0;
    for (const [id, room] of this.rooms) {
      if (now - room.lastActivity > IDLE_TIMEOUT_MS) {
        for (const channel of ["control", "pty"] as const) {
          room[channel].server?.close(4001, "room expired");
          room[channel].client?.close(4001, "room expired");
        }
        this.rooms.delete(id);
        removed++;
      }
    }
    if (removed > 0) {
      log("info", `Cleanup: removed ${removed} idle room(s), ${this.rooms.size} remaining`);
    }
  }
}

function sendJson(ws: WebSocket, data: unknown): void {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(data));
  }
}

function short(id: string): string {
  return id.length > 8 ? id.slice(0, 8) + "..." : id;
}

function log(level: string, msg: string): void {
  const ts = new Date().toISOString();
  console.log(`${ts} [${level.toUpperCase()}] ${msg}`);
}

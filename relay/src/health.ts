import type { IncomingMessage, ServerResponse } from "node:http";
import type { RoomManager } from "./roomManager.js";

export function handleHealth(
  _req: IncomingMessage,
  res: ServerResponse,
  rooms: RoomManager
): void {
  const body = JSON.stringify({
    status: "ok",
    rooms: rooms.roomCount,
    connections: rooms.connectionCount,
    uptime: Math.floor(process.uptime()),
  });
  res.writeHead(200, {
    "Content-Type": "application/json",
    "Cache-Control": "no-cache",
  });
  res.end(body);
}

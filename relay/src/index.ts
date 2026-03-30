import { createServer } from "node:http";
import { WebSocket, WebSocketServer } from "ws";
import { RoomManager } from "./roomManager.js";
import { handleHealth } from "./health.js";
import { parseJoinMessage, isPing, type Channel, type Role } from "./protocol.js";

const PORT = parseInt(process.env.PORT || "8080", 10);
const MAX_MESSAGE_SIZE = 2 * 1024 * 1024; // 2MB (large session responses)
const JOIN_TIMEOUT_MS = 30_000;
const WS_PING_INTERVAL_MS = 8_000; // Aggressive pinging to prevent Fly.io proxy idle timeout

const rooms = new RoomManager();

// --- HTTP server ---

const server = createServer((req, res) => {
  if (req.url === "/health" && req.method === "GET") {
    handleHealth(req, res, rooms);
    return;
  }
  res.writeHead(404, { "Content-Type": "text/plain" });
  res.end("Not Found");
});

// --- WebSocket servers (one per channel) ---

const controlWss = new WebSocketServer({ noServer: true, maxPayload: MAX_MESSAGE_SIZE });
const ptyWss = new WebSocketServer({ noServer: true, maxPayload: MAX_MESSAGE_SIZE });

server.on("upgrade", (req, socket, head) => {
  const url = req.url || "";

  if (url === "/ws/control") {
    controlWss.handleUpgrade(req, socket, head, (ws) => {
      controlWss.emit("connection", ws, req);
    });
  } else if (url === "/ws/pty") {
    ptyWss.handleUpgrade(req, socket, head, (ws) => {
      ptyWss.emit("connection", ws, req);
    });
  } else {
    log("warn", `Rejected upgrade to unknown path: ${url}`);
    socket.write("HTTP/1.1 404 Not Found\r\n\r\n");
    socket.destroy();
  }
});

function setupChannel(wss: WebSocketServer, channel: Channel): void {
  wss.on("connection", (ws: WebSocket) => {
    let joined = false;
    let pairingId = "";
    let role: Role = "client";

    // Require join message within timeout
    const joinTimer = setTimeout(() => {
      if (!joined) {
        log("warn", `${channel}: connection timed out waiting for join`);
        ws.close(4002, "join timeout");
      }
    }, JOIN_TIMEOUT_MS);

    // Protocol-level ping/pong keep-alive
    const pingTimer = setInterval(() => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.ping();
      }
    }, WS_PING_INTERVAL_MS);

    ws.on("message", (data: Buffer | string, isBinary: boolean) => {
      // Before join: expect text JSON join message
      if (!joined) {
        if (isBinary) {
          ws.close(4003, "first message must be JSON join");
          return;
        }
        const text = typeof data === "string" ? data : data.toString("utf-8");
        const joinMsg = parseJoinMessage(text);
        if (!joinMsg) {
          ws.close(4003, "invalid join message");
          return;
        }

        clearTimeout(joinTimer);
        joined = true;
        pairingId = joinMsg.pairingId;
        role = joinMsg.role;

        const result = rooms.join(pairingId, channel, role, ws);
        sendJson(ws, { type: "joined", peer: result.peer });
        return;
      }

      // After join: handle ping or forward to peer
      if (!isBinary) {
        const text = typeof data === "string" ? data : data.toString("utf-8");
        if (isPing(text)) {
          sendJson(ws, { type: "pong" });
          return;
        }
      }

      // Forward to peer
      const peer = rooms.getPeer(pairingId, channel, role);
      const dataLen = typeof data === "string" ? data.length : (data as Buffer).length;
      if (peer) {
        log("info", `${channel}: forwarding ${dataLen} bytes from ${role} to peer`);
        peer.send(data, { binary: isBinary });
      } else {
        log("warn", `${channel}: no peer for ${role} in room ${pairingId.slice(0, 8)}..., dropping ${dataLen} bytes`);
      }
    });

    ws.on("close", () => {
      clearTimeout(joinTimer);
      clearInterval(pingTimer);
      if (joined) {
        rooms.leave(pairingId, channel, role);
      }
    });

    ws.on("error", (err: Error) => {
      log("error", `${channel} ws error: ${err.message}`);
      // close event will fire after this
    });
  });
}

setupChannel(controlWss, "control");
setupChannel(ptyWss, "pty");

// --- Startup ---

rooms.start();

server.listen(PORT, () => {
  log("info", `Claudit relay server listening on port ${PORT}`);
});

// --- Graceful shutdown ---

function shutdown(signal: string): void {
  log("info", `Received ${signal}, shutting down...`);
  rooms.stop();

  // Close WebSocket servers
  controlWss.close();
  ptyWss.close();

  server.close(() => {
    log("info", "HTTP server closed");
    process.exit(0);
  });

  // Force exit after 5s
  setTimeout(() => {
    log("warn", "Forced exit after timeout");
    process.exit(1);
  }, 5000).unref();
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));

// --- Helpers ---

function sendJson(ws: WebSocket, data: unknown): void {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(data));
  }
}

function log(level: string, msg: string): void {
  const ts = new Date().toISOString();
  console.log(`${ts} [${level.toUpperCase()}] ${msg}`);
}

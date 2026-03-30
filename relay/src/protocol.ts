export type Role = "server" | "client";
export type Channel = "control" | "pty";

export interface JoinMessage {
  type: "join";
  pairingId: string;
  role: Role;
}

export interface JoinedResponse {
  type: "joined";
  peer: "connected" | "waiting";
}

export interface PeerJoinedMessage {
  type: "peer_joined";
}

export interface PeerLeftMessage {
  type: "peer_left";
}

export interface PingMessage {
  type: "ping";
}

export interface PongMessage {
  type: "pong";
}

export type RelayMessage =
  | JoinMessage
  | JoinedResponse
  | PeerJoinedMessage
  | PeerLeftMessage
  | PingMessage
  | PongMessage;

export function parseJoinMessage(data: string): JoinMessage | null {
  try {
    const msg = JSON.parse(data);
    if (
      msg.type === "join" &&
      typeof msg.pairingId === "string" &&
      msg.pairingId.length > 0 &&
      msg.pairingId.length <= 128 &&
      (msg.role === "server" || msg.role === "client")
    ) {
      return msg as JoinMessage;
    }
  } catch {
    // invalid JSON
  }
  return null;
}

export function isPing(data: string): boolean {
  try {
    const msg = JSON.parse(data);
    return msg.type === "ping";
  } catch {
    return false;
  }
}

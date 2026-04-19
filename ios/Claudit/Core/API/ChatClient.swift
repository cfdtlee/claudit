import Foundation

/// Handles real-time chat with Claude via the /ws/chat WebSocket protocol through the relay tunnel.
@Observable
final class ChatClient {
    private weak var tunnel: TunnelProtocol?

    var isConnected = false
    var isStreaming = false
    var streamingText = ""        // Accumulated assistant response text
    var streamingThinking = ""    // Accumulated thinking text

    /// Called when a complete response is received (done)
    var onDone: (() -> Void)?

    init(tunnel: TunnelProtocol?) {
        self.tunnel = tunnel
    }

    /// Resume/connect to a session
    func resume(sessionId: String, projectPath: String) {
        let msg: [String: String] = [
            "type": "resume",
            "sessionId": sessionId,
            "projectPath": projectPath
        ]
        guard let data = try? JSONSerialization.data(withJSONObject: msg),
              let text = String(data: data, encoding: .utf8) else { return }
        try? tunnel?.sendChat(text)
    }

    /// Send a message to Claude
    func sendMessage(_ content: String) {
        isStreaming = true
        streamingText = ""
        streamingThinking = ""

        print("[Chat] Sending message: \(content.prefix(50))")
        let msg: [String: Any] = [
            "type": "message",
            "content": content
        ]
        guard let data = try? JSONSerialization.data(withJSONObject: msg),
              let text = String(data: data, encoding: .utf8) else {
            print("[Chat] Failed to encode message")
            return
        }
        do {
            try tunnel?.sendChat(text)
            print("[Chat] Message sent via tunnel")
        } catch {
            print("[Chat] Send error: \(error)")
        }
    }

    /// Handle incoming chat message from server
    func handleMessage(_ jsonString: String) {
        guard let data = jsonString.data(using: .utf8),
              let msg = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
              let type = msg["type"] as? String else {
            print("[Chat] Failed to parse message: \(jsonString.prefix(100))")
            return
        }
        print("[Chat] Received: \(type)")

        switch type {
        case "connected":
            isConnected = true
            print("[Chat] Connected to session")

        case "assistant_text":
            if let text = msg["text"] as? String {
                streamingText += text
            }

        case "assistant_thinking":
            if let text = msg["text"] as? String {
                streamingThinking += text
            }

        case "tool_use":
            let name = msg["name"] as? String ?? "tool"
            streamingText += "\n[Using \(name)...]\n"

        case "tool_result":
            break // Tool results flow into assistant_text

        case "done":
            isStreaming = false
            print("[Chat] Response complete")
            onDone?()

        case "error":
            let message = msg["message"] as? String ?? "Unknown error"
            print("[Chat] Error: \(message)")
            isStreaming = false

        default:
            break
        }
    }
}

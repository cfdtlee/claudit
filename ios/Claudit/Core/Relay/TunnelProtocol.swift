import Foundation

/// Channel types for multiplexed relay communication.
enum TunnelChannel: String, Codable {
    case api
    case terminal
    case terminalInput = "terminal-input"
    case terminalControl = "terminal-control"
    case events
    case chat
}

/// Envelope format for tunnel messages.
struct TunnelEnvelope: Codable {
    let channel: TunnelChannel
    let requestId: String?
    let payload: String  // JSON string of the inner message
}

/// An API request sent through the tunnel.
struct TunnelAPIRequest: Codable {
    let method: String
    let path: String
    let body: String?  // JSON string
}

/// An API response received through the tunnel.
struct TunnelAPIResponse: Codable {
    let status: Int
    let body: String  // JSON string
}

/// Handles message multiplexing and encryption over the relay WebSocket.
@Observable
final class TunnelProtocol {
    let crypto: Crypto

    /// Pending API requests waiting for responses.
    private var pendingRequests: [String: CheckedContinuation<TunnelAPIResponse, Error>] = [:]
    private let requestLock = NSLock()

    /// Event handler for terminal data.
    var onTerminalData: ((Data) -> Void)?

    /// Event handler for server-sent events.
    var onEvent: ((String) -> Void)?

    /// Continuation for waiting for PTY ready signal.
    private var readyContinuation: CheckedContinuation<Void, Never>?

    /// Wait for PTY "ready" signal (with timeout).
    func waitForReady(timeout: TimeInterval = 10) async -> Bool {
        await withCheckedContinuation { cont in
            readyContinuation = cont
            Task {
                try? await Task.sleep(for: .seconds(timeout))
                if let c = readyContinuation {
                    readyContinuation = nil
                    c.resume()
                }
            }
        }
        return true
    }

    /// Signal that PTY is ready.
    func signalReady() {
        readyContinuation?.resume()
        readyContinuation = nil
    }

    /// Reference to the relay client for sending.
    weak var relayClient: RelayClient?

    init(crypto: Crypto) {
        self.crypto = crypto
    }

    // MARK: - Outgoing

    /// Send an API request through the tunnel and await the response.
    func apiRequest(method: String, path: String, body: String? = nil) async throws -> TunnelAPIResponse {
        let requestId = UUID().uuidString

        let request = TunnelAPIRequest(method: method, path: path, body: body)
        let requestJSON = try JSONEncoder().encode(request)

        let envelope = TunnelEnvelope(
            channel: .api,
            requestId: requestId,
            payload: String(data: requestJSON, encoding: .utf8)!
        )

        return try await withCheckedThrowingContinuation { continuation in
            requestLock.lock()
            pendingRequests[requestId] = continuation
            requestLock.unlock()

            do {
                try sendEnvelope(envelope)
            } catch {
                requestLock.lock()
                pendingRequests.removeValue(forKey: requestId)
                requestLock.unlock()
                continuation.resume(throwing: error)
            }

            // Timeout after 30 seconds
            Task {
                try? await Task.sleep(for: .seconds(30))
                self.requestLock.lock()
                let pending = self.pendingRequests.removeValue(forKey: requestId)
                self.requestLock.unlock()
                pending?.resume(throwing: TunnelError.timeout)
            }
        }
    }

    /// Send terminal input (raw keystrokes) through the tunnel.
    func sendTerminalInput(_ data: String) throws {
        let envelope = TunnelEnvelope(
            channel: .terminalInput,
            requestId: nil,
            payload: data
        )
        try sendEnvelope(envelope)
    }

    /// Send terminal control message (resume, resize, etc.) through the tunnel.
    func sendTerminalControl(_ message: String) throws {
        let envelope = TunnelEnvelope(
            channel: .terminalControl,
            requestId: nil,
            payload: message
        )
        try sendEnvelope(envelope)
    }

    // MARK: - Incoming

    /// Handle a decrypted message from the relay.
    func handleMessage(_ message: String) {
        guard let data = message.data(using: .utf8),
              let envelope = try? JSONDecoder().decode(TunnelEnvelope.self, from: data)
        else { return }

        switch envelope.channel {
        case .api:
            handleAPIResponse(envelope)
        case .terminal, .terminalControl:
            // Check for PTY ready signal in terminal data
            let cleaned = envelope.payload.replacingOccurrences(of: "\0", with: "")
            if cleaned.contains("\"type\":\"ready\"") {
                signalReady()
            }
            if let termData = envelope.payload.data(using: .utf8) {
                onTerminalData?(termData)
            }
        case .terminalInput:
            break // Input is outgoing only
        case .events:
            onEvent?(envelope.payload)
        case .chat:
            break // Future use
        }
    }

    // MARK: - Private

    private func sendEnvelope(_ envelope: TunnelEnvelope) throws {
        guard let client = relayClient else {
            throw TunnelError.notConnected
        }

        let envelopeJSON = try JSONEncoder().encode(envelope)
        let plaintext = String(data: envelopeJSON, encoding: .utf8)!
        let encrypted = try crypto.encrypt(plaintext)

        client.ensureConnectedAndSend(encrypted)
    }

    private func handleAPIResponse(_ envelope: TunnelEnvelope) {
        guard let requestId = envelope.requestId,
              let data = envelope.payload.data(using: .utf8),
              let response = try? JSONDecoder().decode(TunnelAPIResponse.self, from: data)
        else { return }

        requestLock.lock()
        let continuation = pendingRequests.removeValue(forKey: requestId)
        requestLock.unlock()

        continuation?.resume(returning: response)
    }
}

enum TunnelError: LocalizedError {
    case notConnected
    case timeout
    case serverError(Int, String)

    var errorDescription: String? {
        switch self {
        case .notConnected: return "Not connected to relay"
        case .timeout: return "Request timed out"
        case .serverError(let code, let msg): return "Server error \(code): \(msg)"
        }
    }
}

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
    let payload: String
}

/// An API request sent through the tunnel.
struct TunnelAPIRequest: Codable {
    let method: String
    let path: String
    let body: String?
}

/// An API response received through the tunnel.
struct TunnelAPIResponse: Codable {
    let status: Int
    let body: String
}

/// Handles message multiplexing and encryption over the relay WebSocket.
@Observable
final class TunnelProtocol {
    let crypto: Crypto

    private var pendingRequests: [String: CheckedContinuation<TunnelAPIResponse, Error>] = [:]
    private let requestLock = NSLock()

    /// Event handler for terminal data.
    var onTerminalData: ((Data) -> Void)?

    /// Event handler for server-sent events.
    var onEvent: ((String) -> Void)?

    /// Reference to the relay client for sending.
    weak var relayClient: RelayClient?

    // PTY ready/exit signaling
    private var readyContinuation: CheckedContinuation<Bool, Never>?
    private var ptyExited = false

    init(crypto: Crypto) {
        self.crypto = crypto
    }

    // MARK: - PTY Ready/Exit

    /// Prepare to receive ready signal BEFORE sending resume.
    /// Must be called before sendTerminalControl(resume).
    func prepareForReady() {
        ptyExited = false
        // Cancel any existing waiter
        readyContinuation?.resume(returning: false)
        readyContinuation = nil
    }

    /// Wait for PTY ready signal. Returns true if ready, false if exited or timed out.
    func waitForReady(timeout: TimeInterval = 15) async -> Bool {
        // If already got a signal before we started waiting
        if ptyExited { return false }

        return await withCheckedContinuation { cont in
            readyContinuation = cont
            Task {
                try? await Task.sleep(for: .seconds(timeout))
                if let c = readyContinuation {
                    readyContinuation = nil
                    c.resume(returning: false) // Timeout
                }
            }
        }
    }

    /// Signal PTY is ready.
    func signalReady() {
        print("[Tunnel] PTY ready signal received")
        readyContinuation?.resume(returning: true)
        readyContinuation = nil
    }

    /// Signal PTY exited.
    func signalExit(code: Int) {
        print("[Tunnel] PTY exit signal received (code \(code))")
        ptyExited = true
        readyContinuation?.resume(returning: false)
        readyContinuation = nil
    }

    // MARK: - Outgoing

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
                return
            }

            Task {
                try? await Task.sleep(for: .seconds(30))
                self.requestLock.lock()
                let pending = self.pendingRequests.removeValue(forKey: requestId)
                self.requestLock.unlock()
                pending?.resume(throwing: TunnelError.timeout)
            }
        }
    }

    func sendTerminalInput(_ data: String) throws {
        let envelope = TunnelEnvelope(channel: .terminalInput, requestId: nil, payload: data)
        try sendEnvelope(envelope)
    }

    func sendTerminalControl(_ message: String) throws {
        let envelope = TunnelEnvelope(channel: .terminalControl, requestId: nil, payload: message)
        try sendEnvelope(envelope)
    }

    // MARK: - Incoming

    func handleMessage(_ message: String) {
        guard let data = message.data(using: .utf8),
              let envelope = try? JSONDecoder().decode(TunnelEnvelope.self, from: data)
        else { return }

        switch envelope.channel {
        case .api:
            handleAPIResponse(envelope)

        case .terminal, .terminalControl:
            // Parse PTY control messages (may have \x00 prefix)
            let cleaned = envelope.payload.replacingOccurrences(of: "\0", with: "").trimmingCharacters(in: .whitespacesAndNewlines)
            if cleaned.hasPrefix("{"), let ctrlData = cleaned.data(using: .utf8),
               let ctrl = try? JSONSerialization.jsonObject(with: ctrlData) as? [String: Any],
               let type = ctrl["type"] as? String {
                switch type {
                case "ready":
                    signalReady()
                case "exit":
                    let code = ctrl["exitCode"] as? Int ?? -1
                    signalExit(code: code)
                default:
                    break
                }
            }
            if let termData = envelope.payload.data(using: .utf8) {
                onTerminalData?(termData)
            }

        case .terminalInput:
            break

        case .events:
            onEvent?(envelope.payload)

        case .chat:
            break
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
    case sessionExited(Int)
    case serverError(Int, String)

    var errorDescription: String? {
        switch self {
        case .notConnected: return "Not connected to relay"
        case .timeout: return "Request timed out"
        case .sessionExited(let code): return "Session exited (code \(code))"
        case .serverError(let code, let msg): return "Server error \(code): \(msg)"
        }
    }
}

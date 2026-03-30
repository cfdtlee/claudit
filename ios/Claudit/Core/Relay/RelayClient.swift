import Foundation

/// WebSocket client that connects to the claudit relay server.
/// Uses aggressive pinging and dead-connection detection to survive Fly.io proxy idle timeouts.
final class RelayClient: NSObject, @unchecked Sendable {
    private let relayURL: String
    private let pairingId: String
    let tunnel: TunnelProtocol
    private let onStatusChange: (ConnectionStatus) -> Void

    private var currentConnectionId: UUID?
    private var webSocketTask: URLSessionWebSocketTask?
    private var session: URLSession?
    private var reconnectAttempt = 0
    private let maxReconnectDelay: TimeInterval = 30
    private var isManualDisconnect = false
    private var pingTimer: Timer?
    private var pongDeadline: Date?
    private var reconnectWorkItem: DispatchWorkItem?
    private var pendingSends: [String] = []

    init(
        relayURL: String,
        pairingId: String,
        tunnel: TunnelProtocol,
        onStatusChange: @escaping (ConnectionStatus) -> Void
    ) {
        self.relayURL = relayURL
        self.pairingId = pairingId
        self.tunnel = tunnel
        self.onStatusChange = onStatusChange
        super.init()
        tunnel.relayClient = self
        print("[Relay] Init relay=\(relayURL) pairing=\(pairingId)")
    }

    func connect() {
        isManualDisconnect = false
        reconnectWorkItem?.cancel()
        reconnectWorkItem = nil

        // Clean up previous connection
        webSocketTask?.cancel(with: .goingAway, reason: nil)
        webSocketTask = nil
        session?.invalidateAndCancel()
        session = nil

        let connId = UUID()
        currentConnectionId = connId
        onStatusChange(.connecting)

        let wsURL = buildWSURL()
        print("[Relay] [\(connId.uuidString.prefix(4))] Connecting to \(wsURL)")
        guard let url = URL(string: wsURL) else {
            onStatusChange(.disconnected)
            return
        }

        let delegateQueue = OperationQueue()
        delegateQueue.maxConcurrentOperationCount = 1

        let config = URLSessionConfiguration.ephemeral
        config.timeoutIntervalForRequest = 60

        let newSession = URLSession(configuration: config, delegate: self, delegateQueue: delegateQueue)
        self.session = newSession
        let task = newSession.webSocketTask(with: url)
        self.webSocketTask = task
        task.resume()
    }

    func disconnect() {
        isManualDisconnect = true
        currentConnectionId = nil
        reconnectWorkItem?.cancel()
        reconnectWorkItem = nil
        DispatchQueue.main.async {
            self.pingTimer?.invalidate()
            self.pingTimer = nil
        }
        webSocketTask?.cancel(with: .normalClosure, reason: nil)
        webSocketTask = nil
        session?.invalidateAndCancel()
        session = nil
        onStatusChange(.disconnected)
    }

    func send(_ message: String) {
        guard let task = webSocketTask else {
            print("[Relay] Send: no task, queueing")
            pendingSends.append(message)
            scheduleReconnect()
            return
        }
        task.send(.string(message)) { [weak self] error in
            if let error {
                print("[Relay] Send error: \(error.localizedDescription)")
                self?.scheduleReconnect()
            }
        }
    }

    /// Queue message, reconnect if needed, send when connected.
    func ensureConnectedAndSend(_ message: String) {
        if webSocketTask == nil {
            pendingSends.append(message)
            connect()
        } else {
            send(message)
        }
    }

    // MARK: - Private

    private func buildWSURL() -> String {
        var base = relayURL
        if base.hasPrefix("http://") { base = "ws://" + base.dropFirst(7) }
        else if base.hasPrefix("https://") { base = "wss://" + base.dropFirst(8) }
        else if !base.hasPrefix("ws://") && !base.hasPrefix("wss://") { base = "wss://" + base }
        if base.hasSuffix("/") { base = String(base.dropLast()) }
        return "\(base)/ws/control"
    }

    private func sendJoinMessage() {
        let join = "{\"type\":\"join\",\"pairingId\":\"\(pairingId)\",\"role\":\"client\"}"
        send(join)
    }

    private func startReceiveLoop(_ connId: UUID) {
        guard connId == currentConnectionId, let task = webSocketTask else { return }

        task.receive { [weak self] result in
            guard let self, connId == self.currentConnectionId else { return }
            switch result {
            case .success(let message):
                switch message {
                case .string(let text): self.processMessage(text, connId: connId)
                case .data(let data):
                    if let text = String(data: data, encoding: .utf8) {
                        self.processMessage(text, connId: connId)
                    }
                @unknown default: break
                }
                self.startReceiveLoop(connId)

            case .failure(let error):
                guard connId == self.currentConnectionId else { return }
                print("[Relay] Receive error: \(error.localizedDescription)")
                self.scheduleReconnect()
            }
        }
    }

    private func processMessage(_ text: String, connId: UUID) {
        guard connId == currentConnectionId else { return }

        // Relay control messages (unencrypted JSON)
        if let data = text.data(using: .utf8),
           let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
           let type = json["type"] as? String {
            switch type {
            case "joined":
                let peer = json["peer"] as? String ?? "waiting"
                print("[Relay] Joined, peer: \(peer)")
                if peer == "connected" { markConnected() }
            case "peer_joined":
                print("[Relay] Peer joined")
                markConnected()
            case "peer_left":
                print("[Relay] Peer left")
                DispatchQueue.main.async { self.onStatusChange(.reconnecting) }
            case "pong":
                pongDeadline = nil // Pong received, connection alive
            default: break
            }
            return
        }

        // Encrypted tunnel message
        do {
            let decrypted = try tunnel.crypto.decrypt(text)
            if let d = decrypted.data(using: .utf8),
               let env = try? JSONSerialization.jsonObject(with: d) as? [String: Any],
               let ch = env["channel"] as? String {
                let payloadLen = (env["payload"] as? String)?.count ?? 0
                print("[Relay] Received \(ch) (\(payloadLen) chars)")
            }
            DispatchQueue.main.async {
                self.tunnel.handleMessage(decrypted)
            }
        } catch {
            print("[Relay] Decrypt error (\(text.count) chars): \(error.localizedDescription)")
        }
    }

    private func markConnected() {
        reconnectAttempt = 0
        DispatchQueue.main.async {
            self.onStatusChange(.connected)
            // Flush queued messages
            let msgs = self.pendingSends
            self.pendingSends = []
            for msg in msgs { self.send(msg) }
            // Start aggressive ping — every 5s to prevent Fly.io proxy idle timeout
            self.startPingTimer()
        }
    }

    private func startPingTimer() {
        pingTimer?.invalidate()
        // Send both app-level and WS-level pings every 5 seconds
        pingTimer = Timer.scheduledTimer(withTimeInterval: 5, repeats: true) { [weak self] _ in
            guard let self, let task = self.webSocketTask else { return }

            // Check if previous pong was missed (dead connection)
            if let deadline = self.pongDeadline, Date() > deadline {
                print("[Relay] Pong timeout — connection dead, reconnecting")
                self.scheduleReconnect()
                return
            }

            // Send app-level ping (relay responds with pong)
            self.send("{\"type\":\"ping\"}")
            self.pongDeadline = Date().addingTimeInterval(10) // Expect pong within 10s

            // Also send WS-level ping
            task.sendPing { error in
                if let error {
                    print("[Relay] WS ping failed: \(error.localizedDescription)")
                    self.scheduleReconnect()
                }
            }
        }
    }

    private func scheduleReconnect() {
        guard !isManualDisconnect else { return }
        // Prevent duplicate reconnect scheduling
        guard reconnectWorkItem == nil else { return }

        DispatchQueue.main.async {
            self.pingTimer?.invalidate()
            self.pingTimer = nil
        }
        webSocketTask?.cancel(with: .goingAway, reason: nil)
        webSocketTask = nil
        session?.invalidateAndCancel()
        session = nil

        let delay = min(pow(2.0, Double(reconnectAttempt)), maxReconnectDelay)
        reconnectAttempt += 1
        print("[Relay] Reconnecting in \(delay)s (attempt \(reconnectAttempt))")
        DispatchQueue.main.async { self.onStatusChange(.reconnecting) }

        let item = DispatchWorkItem { [weak self] in
            guard let self, !self.isManualDisconnect else { return }
            self.reconnectWorkItem = nil
            self.connect()
        }
        reconnectWorkItem = item
        DispatchQueue.main.asyncAfter(deadline: .now() + delay, execute: item)
    }
}

// MARK: - URLSessionWebSocketDelegate

extension RelayClient: URLSessionWebSocketDelegate {
    func urlSession(_ session: URLSession, webSocketTask: URLSessionWebSocketTask, didOpenWithProtocol proto: String?) {
        guard let connId = currentConnectionId else { return }
        print("[Relay] [\(connId.uuidString.prefix(4))] WebSocket opened")
        sendJoinMessage()
        startReceiveLoop(connId)
    }

    func urlSession(_ session: URLSession, webSocketTask task: URLSessionWebSocketTask, didCloseWith closeCode: URLSessionWebSocketTask.CloseCode, reason: Data?) {
        print("[Relay] WebSocket closed: \(closeCode.rawValue)")
        scheduleReconnect()
    }

    func urlSession(_ session: URLSession, task: URLSessionTask, didCompleteWithError error: Error?) {
        if let error {
            print("[Relay] Task error: \(error.localizedDescription)")
            scheduleReconnect()
        }
    }
}

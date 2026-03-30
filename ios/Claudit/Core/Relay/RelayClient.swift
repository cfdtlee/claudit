import Foundation

/// WebSocket client that connects to the claudit relay server.
final class RelayClient: NSObject, @unchecked Sendable {
    private let relayURL: String
    private let pairingId: String
    let tunnel: TunnelProtocol
    private let onStatusChange: (ConnectionStatus) -> Void

    // Each connection attempt gets a unique ID to prevent stale callbacks from killing new connections
    private var currentConnectionId: UUID?
    private var webSocketTask: URLSessionWebSocketTask?
    private var session: URLSession?
    private var reconnectAttempt = 0
    private let maxReconnectDelay: TimeInterval = 30
    private var isManualDisconnect = false
    private var pingTimer: Timer?
    private var reconnectWorkItem: DispatchWorkItem?

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
        print("[RelayClient] Init relay=\(relayURL) pairing=\(pairingId)")
    }

    func connect() {
        isManualDisconnect = false

        // Clean up previous connection completely
        webSocketTask?.cancel(with: .goingAway, reason: nil)
        webSocketTask = nil
        session?.invalidateAndCancel()
        session = nil

        let connId = UUID()
        currentConnectionId = connId

        onStatusChange(.connecting)

        let wsURL = buildWSURL()
        print("[RelayClient] [\(connId.uuidString.prefix(4))] Connecting to \(wsURL)")
        guard let url = URL(string: wsURL) else {
            onStatusChange(.disconnected)
            return
        }

        let delegateQueue = OperationQueue()
        delegateQueue.maxConcurrentOperationCount = 1

        let config = URLSessionConfiguration.ephemeral
        config.timeoutIntervalForRequest = 60
        config.waitsForConnectivity = false

        let newSession = URLSession(configuration: config, delegate: self, delegateQueue: delegateQueue)
        self.session = newSession
        let task = newSession.webSocketTask(with: url)
        self.webSocketTask = task
        task.resume()
    }

    func disconnect() {
        print("[RelayClient] Manual disconnect")
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
            print("[RelayClient] Send failed: no task, reconnecting")
            scheduleReconnect()
            return
        }
        task.send(.string(message)) { [weak self] error in
            if let error {
                print("[RelayClient] Send error: \(error.localizedDescription)")
                self?.scheduleReconnect()
            }
        }
    }

    /// Check if connection is alive. Returns false if dead.
    var isConnected: Bool {
        webSocketTask != nil && currentConnectionId != nil
    }

    /// Force reconnect if needed, then send.
    func ensureConnectedAndSend(_ message: String) {
        if webSocketTask == nil {
            // Queue message to send after reconnect
            pendingSends.append(message)
            connect()
        } else {
            send(message)
        }
    }

    private var pendingSends: [String] = []

    private func flushPendingSends() {
        let messages = pendingSends
        pendingSends = []
        for msg in messages {
            send(msg)
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
        print("[RelayClient] Sending join")
        send(join)
    }

    private func startReceiveLoop(_ connId: UUID) {
        guard connId == currentConnectionId else { return }

        webSocketTask?.receive { [weak self] result in
            guard let self, connId == self.currentConnectionId else { return }
            switch result {
            case .success(let message):
                switch message {
                case .string(let text):
                    self.processMessage(text, connId: connId)
                case .data(let data):
                    if let text = String(data: data, encoding: .utf8) {
                        self.processMessage(text, connId: connId)
                    }
                @unknown default: break
                }
                self.startReceiveLoop(connId)

            case .failure(let error):
                guard connId == self.currentConnectionId else { return }
                print("[RelayClient] [\(connId.uuidString.prefix(4))] Receive error: \(error.localizedDescription)")
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
                print("[RelayClient] Joined, peer: \(peer)")
                if peer == "connected" { markConnected() }
            case "peer_joined":
                print("[RelayClient] Peer joined")
                markConnected()
            case "peer_left":
                print("[RelayClient] Peer left")
                DispatchQueue.main.async { self.onStatusChange(.reconnecting) }
            case "pong": break
            default: break
            }
            return
        }

        // Encrypted tunnel message
        do {
            let decrypted = try tunnel.crypto.decrypt(text)
            // Log channel for debugging
            if let d = decrypted.data(using: .utf8),
               let env = try? JSONSerialization.jsonObject(with: d) as? [String: Any],
               let ch = env["channel"] as? String {
                let payloadLen = (env["payload"] as? String)?.count ?? 0
                print("[RelayClient] Received \(ch) message (\(payloadLen) chars)")
            }
            DispatchQueue.main.async {
                self.tunnel.handleMessage(decrypted)
            }
        } catch {
            print("[RelayClient] Decrypt error (input \(text.count) chars): \(error.localizedDescription)")
        }
    }

    private func markConnected() {
        reconnectAttempt = 0
        DispatchQueue.main.async {
            self.onStatusChange(.connected)
            self.flushPendingSends()
            self.pingTimer?.invalidate()
            // Ping every 10s to detect dead connections faster
            self.pingTimer = Timer.scheduledTimer(withTimeInterval: 10, repeats: true) { [weak self] _ in
                guard let self else { return }
                self.webSocketTask?.sendPing { error in
                    if let error {
                        print("[RelayClient] Ping failed: \(error.localizedDescription)")
                        self.scheduleReconnect()
                    }
                }
            }
        }
    }

    private func scheduleReconnect() {
        guard !isManualDisconnect else { return }
        reconnectWorkItem?.cancel()
        let delay = min(pow(2.0, Double(reconnectAttempt)), maxReconnectDelay)
        reconnectAttempt += 1
        print("[RelayClient] Reconnecting in \(delay)s (attempt \(reconnectAttempt))")
        DispatchQueue.main.async { self.onStatusChange(.reconnecting) }
        let item = DispatchWorkItem { [weak self] in
            guard let self, !self.isManualDisconnect else { return }
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
        print("[RelayClient] [\(connId.uuidString.prefix(4))] WebSocket opened")
        sendJoinMessage()
        startReceiveLoop(connId)
    }

    func urlSession(_ session: URLSession, webSocketTask task: URLSessionWebSocketTask, didCloseWith closeCode: URLSessionWebSocketTask.CloseCode, reason: Data?) {
        let connId = currentConnectionId
        print("[RelayClient] [\(connId?.uuidString.prefix(4) ?? "?")] WebSocket closed: \(closeCode.rawValue)")
        // Don't reconnect from here — the receive loop failure will handle it
    }

    func urlSession(_ session: URLSession, task: URLSessionTask, didCompleteWithError error: Error?) {
        if let error {
            let connId = currentConnectionId
            print("[RelayClient] [\(connId?.uuidString.prefix(4) ?? "?")] Task error: \(error.localizedDescription)")
            // Don't reconnect from here — the receive loop failure will handle it
        }
    }
}

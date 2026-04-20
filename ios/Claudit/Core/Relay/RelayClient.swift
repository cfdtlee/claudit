import Foundation
import Starscream

/// WebSocket client using Starscream for reliable relay connections.
/// Starscream manages its own TCP connection, avoiding URLSessionWebSocketTask's
/// HTTP/2 multiplexing bug that causes silent disconnections through Fly.io proxies.
final class RelayClient: @unchecked Sendable, WebSocketDelegate {
    private let relayURL: String
    private let pairingId: String
    let tunnel: TunnelProtocol
    private let onStatusChange: (ConnectionStatus) -> Void

    private var socket: WebSocket?
    private let stateQueue = DispatchQueue(label: "com.claudit.relay.state")
    private var _reconnectAttempt = 0
    private let maxReconnectDelay: TimeInterval = 30
    private var _isManualDisconnect = false
    private var pingTimer: Timer?
    private var _pongDeadline: Date?
    private var _reconnectWorkItem: DispatchWorkItem?
    private var _pendingSends: [String] = []
    private var _hasJoined = false
    private var _isConnected = false

    // MARK: - Thread-safe accessors

    private var isConnected: Bool {
        get { stateQueue.sync { _isConnected } }
        set { stateQueue.sync { _isConnected = newValue } }
    }

    private var pendingSends: [String] {
        get { stateQueue.sync { _pendingSends } }
        set { stateQueue.sync { _pendingSends = newValue } }
    }

    private var reconnectAttempt: Int {
        get { stateQueue.sync { _reconnectAttempt } }
        set { stateQueue.sync { _reconnectAttempt = newValue } }
    }

    private var isManualDisconnect: Bool {
        get { stateQueue.sync { _isManualDisconnect } }
        set { stateQueue.sync { _isManualDisconnect = newValue } }
    }

    private var pongDeadline: Date? {
        get { stateQueue.sync { _pongDeadline } }
        set { stateQueue.sync { _pongDeadline = newValue } }
    }

    private var hasJoined: Bool {
        get { stateQueue.sync { _hasJoined } }
        set { stateQueue.sync { _hasJoined = newValue } }
    }

    private var reconnectWorkItem: DispatchWorkItem? {
        get { stateQueue.sync { _reconnectWorkItem } }
        set { stateQueue.sync { _reconnectWorkItem = newValue } }
    }

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
        tunnel.relayClient = self
        print("[Relay] Init relay=\(relayURL) pairing=\(pairingId)")
    }

    deinit {
        pingTimer?.invalidate()
        pingTimer = nil
        _reconnectWorkItem?.cancel()
        _reconnectWorkItem = nil
        socket?.disconnect()
        socket = nil
    }

    func connect() {
        isManualDisconnect = false
        hasJoined = false
        reconnectWorkItem?.cancel()
        reconnectWorkItem = nil

        // Clean up previous socket
        socket?.disconnect()
        socket = nil

        onStatusChange(.connecting)

        let wsURL = buildWSURL()
        print("[Relay] Connecting to \(wsURL)")
        guard let url = URL(string: wsURL) else {
            onStatusChange(.disconnected)
            return
        }

        var request = URLRequest(url: url)
        request.timeoutInterval = 30

        let ws = WebSocket(request: request)
        ws.delegate = self
        ws.callbackQueue = DispatchQueue(label: "com.claudit.relay.ws", qos: .userInitiated)
        self.socket = ws
        ws.connect()
    }

    func disconnect() {
        print("[Relay] Manual disconnect")
        isManualDisconnect = true
        reconnectWorkItem?.cancel()
        reconnectWorkItem = nil
        DispatchQueue.main.async {
            self.pingTimer?.invalidate()
            self.pingTimer = nil
        }
        socket?.disconnect()
        socket = nil
        onStatusChange(.disconnected)
    }

    func send(_ message: String) {
        guard let ws = socket, isConnected else {
            stateQueue.sync { _pendingSends.append(message) }
            if socket == nil && !isManualDisconnect {
                scheduleReconnect()
            }
            return
        }
        ws.write(string: message)
    }

    func ensureConnectedAndSend(_ message: String) {
        if socket == nil || !isConnected {
            stateQueue.sync { _pendingSends.append(message) }
            connect()
        } else {
            send(message)
        }
    }

    // MARK: - WebSocketDelegate

    func didReceive(event: WebSocketEvent, client: any WebSocketClient) {
        switch event {
        case .connected(_):
            print("[Relay] WebSocket connected")
            isConnected = true
            sendJoinMessage()

        case .disconnected(let reason, let code):
            print("[Relay] Disconnected: \(reason) (code \(code))")
            handleDisconnection()

        case .text(let text):
            processMessage(text)

        case .binary(let data):
            if let text = String(data: data, encoding: .utf8) {
                processMessage(text)
            }

        case .ping(_):
            // Starscream auto-responds with pong
            break

        case .pong(_):
            pongDeadline = nil

        case .viabilityChanged(let viable):
            if !viable {
                print("[Relay] Connection no longer viable")
                handleDisconnection()
            }

        case .reconnectSuggested(let suggested):
            if suggested {
                print("[Relay] Reconnect suggested")
                handleDisconnection()
            }

        case .cancelled:
            print("[Relay] Connection cancelled")
            handleDisconnection()

        case .error(let error):
            print("[Relay] Error: \(error?.localizedDescription ?? "unknown")")
            handleDisconnection()

        case .peerClosed:
            print("[Relay] Peer closed")
            handleDisconnection()
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
        socket?.write(string: join)
    }

    private func processMessage(_ text: String) {
        // Relay control messages (unencrypted JSON)
        if let data = text.data(using: .utf8),
           let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
           let type = json["type"] as? String {
            switch type {
            case "joined":
                let peer = json["peer"] as? String ?? "waiting"
                print("[Relay] Joined, peer: \(peer)")
                hasJoined = true
                if peer == "connected" { markConnected() }
            case "peer_joined":
                print("[Relay] Peer joined")
                markConnected()
            case "peer_left":
                print("[Relay] Peer left")
                DispatchQueue.main.async { self.onStatusChange(.reconnecting) }
            case "pong":
                pongDeadline = nil
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
            let msgs = self.stateQueue.sync { () -> [String] in
                let m = self._pendingSends
                self._pendingSends = []
                return m
            }
            for msg in msgs { self.send(msg) }
            // Start ping timer (every 15s is plenty with Starscream's own TCP connection)
            self.startPingTimer()
        }
    }

    private func startPingTimer() {
        pingTimer?.invalidate()
        pingTimer = Timer.scheduledTimer(withTimeInterval: 15, repeats: true) { [weak self] _ in
            guard let self else { return }

            if let deadline = self.pongDeadline, Date() > deadline {
                print("[Relay] Pong timeout, reconnecting")
                self.scheduleReconnect()
                return
            }

            self.send("{\"type\":\"ping\"}")
            self.pongDeadline = Date().addingTimeInterval(15)
            self.socket?.write(ping: Data())
        }
    }

    private func handleDisconnection() {
        isConnected = false
        guard !isManualDisconnect else { return }
        scheduleReconnect()
    }

    private func scheduleReconnect() {
        guard !isManualDisconnect else { return }
        guard reconnectWorkItem == nil else { return }

        DispatchQueue.main.async {
            self.pingTimer?.invalidate()
            self.pingTimer = nil
        }
        socket?.disconnect()
        socket = nil

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

import Foundation
import SwiftUI

enum ConnectionStatus: String {
    case disconnected
    case connecting
    case connected
    case reconnecting

    var color: Color {
        switch self {
        case .connected: return .statusSuccess
        case .connecting, .reconnecting: return .statusWarning
        case .disconnected: return .statusError
        }
    }

    var label: String {
        switch self {
        case .connected: return "Connected"
        case .connecting: return "Connecting..."
        case .reconnecting: return "Reconnecting..."
        case .disconnected: return "Disconnected"
        }
    }
}

@Observable
final class AppState {
    var connectionStatus: ConnectionStatus = .disconnected
    var isPaired: Bool = false
    var relayURL: String = ""
    var pairingId: String = ""
    var errorMessage: String?

    private(set) var relayClient: RelayClient?
    private(set) var apiClient: APIClient?
    private(set) var tunnel: TunnelProtocol?

    func loadPairingState() {
        if let url = Preferences.shared.relayURL,
           let pid = KeychainHelper.load(key: "claudit_pairing_id"),
           let _ = KeychainHelper.loadData(key: "claudit_secret_key") {
            relayURL = url
            pairingId = String(data: pid, encoding: .utf8) ?? ""
            isPaired = !relayURL.isEmpty && !pairingId.isEmpty
        }
    }

    func pair(url: String, pairingId: String, secretKey: Data) {
        // Always disconnect + clear old state first
        disconnect()
        relayClient = nil
        apiClient = nil
        tunnel = nil

        // Save new credentials
        Preferences.shared.relayURL = url
        KeychainHelper.save(key: "claudit_pairing_id", data: pairingId.data(using: .utf8)!)
        KeychainHelper.save(key: "claudit_secret_key", data: secretKey)

        self.relayURL = url
        self.pairingId = pairingId
        self.isPaired = true

        print("[AppState] Paired with relay=\(url) pairing=\(pairingId)")

        // Connect immediately
        connect()
    }

    func unpair() {
        disconnect()
        Preferences.shared.relayURL = nil
        KeychainHelper.delete(key: "claudit_pairing_id")
        KeychainHelper.delete(key: "claudit_secret_key")
        relayURL = ""
        pairingId = ""
        isPaired = false
        relayClient = nil
        apiClient = nil
        tunnel = nil
    }

    func connect() {
        // If already have a live client, don't create another
        if relayClient != nil {
            print("[AppState] Already have relay client, skipping connect")
            return
        }

        guard isPaired,
              !relayURL.isEmpty,
              !pairingId.isEmpty,
              let keyData = KeychainHelper.loadData(key: "claudit_secret_key")
        else { return }

        let crypto = Crypto(secretKey: keyData)
        let tunnelInstance = TunnelProtocol(crypto: crypto)
        self.tunnel = tunnelInstance

        let relay = RelayClient(
            relayURL: relayURL,
            pairingId: pairingId,
            tunnel: tunnelInstance,
            onStatusChange: { [weak self] status in
                Task { @MainActor in
                    self?.connectionStatus = status
                }
            }
        )

        self.relayClient = relay
        self.apiClient = APIClient(tunnel: tunnelInstance)
        relay.connect()
    }

    func disconnect() {
        relayClient?.disconnect()
        relayClient = nil
        connectionStatus = .disconnected
    }
}

import Foundation
#if os(iOS)
import AVFoundation
#endif

/// Parses and validates claudit:// pairing URLs.
@Observable
final class PairingViewModel {
    var manualURL: String = ""
    var manualPairingId: String = ""
    var manualKey: String = ""
    var errorMessage: String?
    var isProcessing = false
    var showManualEntry = false
    var cameraPermissionGranted = false

    /// Parse a QR code string in the format: claudit://<host>/<pairingId>#<base64urlKey>
    func parsePairingURL(_ urlString: String) -> PairingInfo? {
        // Expected format: claudit://relay.example.com/PAIRING_ID#BASE64URL_KEY
        guard let url = URL(string: urlString),
              url.scheme == "claudit" else {
            errorMessage = "Invalid QR code format. Expected claudit:// URL."
            return nil
        }

        guard let host = url.host else {
            errorMessage = "Missing relay host in QR code."
            return nil
        }

        let pathComponents = url.pathComponents.filter { $0 != "/" }
        guard let pairingId = pathComponents.first, !pairingId.isEmpty else {
            errorMessage = "Missing pairing ID in QR code."
            return nil
        }

        guard let fragment = url.fragment, !fragment.isEmpty else {
            errorMessage = "Missing encryption key in QR code."
            return nil
        }

        guard let keyData = base64URLDecode(fragment), keyData.count == 32 else {
            errorMessage = "Invalid encryption key in QR code."
            return nil
        }

        // Reconstruct relay URL (use HTTPS by default)
        let port = url.port.map { ":\($0)" } ?? ""
        let relayURL = "https://\(host)\(port)"

        return PairingInfo(relayURL: relayURL, pairingId: pairingId, secretKey: keyData)
    }

    /// Validate manual entry fields and construct PairingInfo.
    func validateManualEntry() -> PairingInfo? {
        guard !manualURL.isEmpty else {
            errorMessage = "Relay URL is required."
            return nil
        }

        guard !manualPairingId.isEmpty else {
            errorMessage = "Pairing ID is required."
            return nil
        }

        guard !manualKey.isEmpty else {
            errorMessage = "Encryption key is required."
            return nil
        }

        guard let keyData = base64URLDecode(manualKey), keyData.count == 32 else {
            errorMessage = "Invalid encryption key. Must be 32 bytes base64url-encoded."
            return nil
        }

        return PairingInfo(relayURL: manualURL, pairingId: manualPairingId, secretKey: keyData)
    }

    func checkCameraPermission() {
        #if os(iOS)
        switch AVCaptureDevice.authorizationStatus(for: .video) {
        case .authorized:
            cameraPermissionGranted = true
        case .notDetermined:
            AVCaptureDevice.requestAccess(for: .video) { [weak self] granted in
                DispatchQueue.main.async {
                    self?.cameraPermissionGranted = granted
                }
            }
        default:
            cameraPermissionGranted = false
        }
        #endif
    }

    private func base64URLDecode(_ input: String) -> Data? {
        var base64 = input
            .replacingOccurrences(of: "-", with: "+")
            .replacingOccurrences(of: "_", with: "/")

        // Pad to multiple of 4
        let remainder = base64.count % 4
        if remainder > 0 {
            base64 += String(repeating: "=", count: 4 - remainder)
        }

        return Data(base64Encoded: base64)
    }
}

struct PairingInfo {
    let relayURL: String
    let pairingId: String
    let secretKey: Data
}

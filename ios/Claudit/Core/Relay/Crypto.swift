import Foundation
import CryptoKit

/// AES-256-GCM encryption/decryption for relay tunnel communication.
/// Interoperable with Node.js crypto.createCipheriv('aes-256-gcm', key, iv).
final class Crypto: Sendable {
    private let symmetricKey: SymmetricKey
    private let counterLock = NSLock()
    private var _sendCounter: UInt64 = 0

    init(secretKey: Data) {
        precondition(secretKey.count == 32, "Secret key must be 32 bytes")
        self.symmetricKey = SymmetricKey(data: secretKey)
    }

    /// Encrypt plaintext with AES-256-GCM.
    /// Returns base64-encoded: nonce (12 bytes) + ciphertext + tag (16 bytes).
    func encrypt(_ plaintext: String) throws -> String {
        guard let data = plaintext.data(using: .utf8) else {
            throw CryptoError.encodingFailed
        }

        let nonce = AES.GCM.Nonce()
        let sealed = try AES.GCM.seal(data, using: symmetricKey, nonce: nonce)

        guard let combined = sealed.combined else {
            throw CryptoError.encryptionFailed
        }

        return combined.base64EncodedString()
    }

    /// Decrypt a base64-encoded AES-256-GCM ciphertext.
    /// Expects: nonce (12 bytes) + ciphertext + tag (16 bytes).
    func decrypt(_ base64Ciphertext: String) throws -> String {
        guard let combined = Data(base64Encoded: base64Ciphertext) else {
            throw CryptoError.invalidBase64
        }

        let sealedBox = try AES.GCM.SealedBox(combined: combined)
        let decrypted = try AES.GCM.open(sealedBox, using: symmetricKey)

        guard let text = String(data: decrypted, encoding: .utf8) else {
            throw CryptoError.decodingFailed
        }

        return text
    }

    /// Generate next send counter (thread-safe).
    func nextCounter() -> UInt64 {
        counterLock.lock()
        defer { counterLock.unlock() }
        _sendCounter += 1
        return _sendCounter
    }
}

enum CryptoError: LocalizedError {
    case encodingFailed
    case encryptionFailed
    case invalidBase64
    case decodingFailed

    var errorDescription: String? {
        switch self {
        case .encodingFailed: return "Failed to encode plaintext"
        case .encryptionFailed: return "Encryption failed"
        case .invalidBase64: return "Invalid base64 input"
        case .decodingFailed: return "Failed to decode decrypted data"
        }
    }
}

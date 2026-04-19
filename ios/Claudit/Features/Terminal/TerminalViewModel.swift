import Foundation
import SwiftUI

/// ANSI color codes for terminal rendering.
enum ANSIColor: Int {
    case black = 30, red, green, yellow, blue, magenta, cyan, white
    case brightBlack = 90, brightRed, brightGreen, brightYellow
    case brightBlue, brightMagenta, brightCyan, brightWhite

    var color: Color {
        switch self {
        case .black, .brightBlack: return Color(white: 0.3)
        case .red, .brightRed: return .statusError
        case .green, .brightGreen: return .statusSuccess
        case .yellow, .brightYellow: return .statusWarning
        case .blue, .brightBlue: return .accentBlue
        case .magenta, .brightMagenta: return Color(red: 0.8, green: 0.3, blue: 0.8)
        case .cyan, .brightCyan: return Color(red: 0.3, green: 0.8, blue: 0.8)
        case .white, .brightWhite: return .textPrimary
        }
    }
}

/// A parsed segment of terminal text with optional color.
struct TerminalSegment: Identifiable {
    let id = UUID()
    let text: String
    let foreground: Color
    let bold: Bool
}

@Observable
final class TerminalViewModel {
    var lines: [TerminalLine] = []
    var inputText = ""
    var isConnected = false

    private weak var tunnel: TunnelProtocol?
    let sessionId: String
    let projectPath: String

    init(sessionId: String, projectPath: String = "") {
        self.sessionId = sessionId
        self.projectPath = projectPath
    }

    func setTunnel(_ tunnel: TunnelProtocol?) {
        self.tunnel = tunnel

        // Subscribe to terminal data
        tunnel?.onTerminalData = { [weak self] data in
            guard let self, let text = String(data: data, encoding: .utf8) else { return }
            Task { @MainActor in
                self.handleTerminalData(text)
            }
        }

        isConnected = tunnel != nil

        // Send resume command to attach to the PTY session
        if let tunnel {
            tunnel.prepareForReady()
            do {
                let resumeMsg = "{\"type\":\"resume\",\"sessionId\":\"\(sessionId)\",\"projectPath\":\"\(projectPath)\",\"cols\":80,\"rows\":24}"
                try tunnel.sendTerminalControl(resumeMsg)
                print("[TerminalVM] Sent resume for session \(sessionId.prefix(8))")
            } catch {
                print("[TerminalVM] Failed to send resume: \(error)")
            }
        }
    }

    /// Filter PTY control messages vs actual terminal output
    private func handleTerminalData(_ text: String) {
        // Strip leading null bytes (\x00) — PTY control message prefix
        var cleaned = text
        while cleaned.hasPrefix("\0") {
            cleaned = String(cleaned.dropFirst())
        }

        // Try to parse as JSON control message
        let trimmed = cleaned.trimmingCharacters(in: .whitespacesAndNewlines)
        if trimmed.hasPrefix("{") && trimmed.hasSuffix("}") {
            if let data = trimmed.data(using: .utf8),
               let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
               let type = json["type"] as? String {
                switch type {
                case "ready":
                    let sid = String((json["sessionId"] as? String ?? "?").prefix(8))
                    appendOutput("[\u{1B}[32mSession \(sid) ready\u{1B}[0m]\n")
                case "exit":
                    let code = json["exitCode"] as? Int ?? -1
                    if code == 0 {
                        appendOutput("[\u{1B}[32mSession ended\u{1B}[0m]\n")
                    } else {
                        appendOutput("[\u{1B}[33mSession exited (code \(code))\u{1B}[0m]\n")
                    }
                case "scrollback-end":
                    break
                case "detached":
                    appendOutput("[\u{1B}[33mDetached from session\u{1B}[0m]\n")
                case "warning":
                    let msg = json["message"] as? String ?? ""
                    appendOutput("[\u{1B}[33m\(msg)\u{1B}[0m]\n")
                case "error":
                    let msg = json["message"] as? String ?? ""
                    appendOutput("[\u{1B}[31m\(msg)\u{1B}[0m]\n")
                default:
                    break
                }
                return
            }
        }

        // Check for known non-terminal messages
        if trimmed.contains("No conversation found") {
            appendOutput("[\u{1B}[33mNo active session found. Start one from the web UI.\u{1B}[0m]\n")
            return
        }

        // Regular terminal output
        appendOutput(text)
    }

    func sendInput() {
        let text = inputText.trimmingCharacters(in: .whitespaces)
        guard !text.isEmpty, let tunnel else { return }

        do {
            try tunnel.sendTerminalInput(text + "\n")
            appendOutput("$ \(text)\n")
            inputText = ""
        } catch {
            appendOutput("[Error] \(error.localizedDescription)\n")
        }
    }

    func sendKeypress(_ key: String) {
        guard let tunnel else { return }
        try? tunnel.sendTerminalInput(key)
    }

    // MARK: - ANSI Parsing

    func appendOutput(_ raw: String) {
        let segments = parseANSI(raw)
        let newLine = TerminalLine(segments: segments)

        // Split on newlines
        let parts = raw.split(separator: "\n", omittingEmptySubsequences: false)
        if parts.count <= 1 {
            if lines.isEmpty {
                lines.append(newLine)
            } else {
                lines[lines.count - 1].segments.append(contentsOf: segments)
            }
        } else {
            for (i, part) in parts.enumerated() {
                let partSegments = parseANSI(String(part))
                if i == 0 && !lines.isEmpty {
                    lines[lines.count - 1].segments.append(contentsOf: partSegments)
                } else {
                    lines.append(TerminalLine(segments: partSegments))
                }
            }
        }

        // Limit line buffer
        if lines.count > 1000 {
            lines.removeFirst(lines.count - 1000)
        }
    }

    private func parseANSI(_ text: String) -> [TerminalSegment] {
        var segments: [TerminalSegment] = []
        var currentColor: Color = .terminalGreen
        var currentBold = false
        var buffer = ""

        var chars = Array(text)
        var i = 0

        while i < chars.count {
            // ESC sequence
            if chars[i] == "\u{1B}" && i + 1 < chars.count {
                // Flush buffer
                if !buffer.isEmpty {
                    segments.append(TerminalSegment(text: buffer, foreground: currentColor, bold: currentBold))
                    buffer = ""
                }

                let next = chars[i + 1]

                if next == "[" {
                    // CSI sequence: ESC [ ... <final byte>
                    i += 2
                    var codeStr = ""
                    // Read parameter bytes (0x30-0x3F) and intermediate bytes (0x20-0x2F)
                    while i < chars.count {
                        let c = chars[i]
                        if c >= "\u{40}" && c <= "\u{7E}" {
                            // Final byte — determines the sequence type
                            break
                        }
                        codeStr.append(c)
                        i += 1
                    }

                    if i < chars.count {
                        let finalByte = chars[i]
                        i += 1

                        // Only process SGR (m) sequences for color/style
                        if finalByte == "m" {
                            let codes = codeStr.split(separator: ";").compactMap { Int($0) }
                            for code in codes {
                                switch code {
                                case 0:
                                    currentColor = .terminalGreen
                                    currentBold = false
                                case 1:
                                    currentBold = true
                                case 30...37, 90...97:
                                    if let ansi = ANSIColor(rawValue: code) {
                                        currentColor = ansi.color
                                    }
                                default:
                                    break
                                }
                            }
                        }
                        // All other CSI sequences (cursor, clear, scroll, etc.) are silently skipped
                    }
                } else if next == "]" {
                    // OSC sequence: ESC ] ... BEL or ST
                    i += 2
                    while i < chars.count && chars[i] != "\u{07}" && chars[i] != "\u{1B}" {
                        i += 1
                    }
                    if i < chars.count && chars[i] == "\u{07}" { i += 1 }
                    else if i + 1 < chars.count && chars[i] == "\u{1B}" && chars[i+1] == "\\" { i += 2 }
                } else if next == "(" || next == ")" {
                    // Character set designation — skip 3 bytes total
                    i += 3
                } else {
                    // Other 2-byte ESC sequences — skip
                    i += 2
                }
            } else if chars[i] == "\r" {
                // Carriage return — skip (we handle \n for newlines)
                i += 1
            } else if chars[i].asciiValue ?? 0 < 32 && chars[i] != "\n" && chars[i] != "\t" {
                // Skip other control characters
                i += 1
            } else {
                buffer.append(chars[i])
                i += 1
            }
        }

        if !buffer.isEmpty {
            segments.append(TerminalSegment(text: buffer, foreground: currentColor, bold: currentBold))
        }

        return segments
    }
}

struct TerminalLine: Identifiable {
    let id = UUID()
    var segments: [TerminalSegment]
}

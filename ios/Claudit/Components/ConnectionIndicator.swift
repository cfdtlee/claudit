import SwiftUI

struct ConnectionIndicator: View {
    @Environment(AppState.self) private var appState
    @State private var showDetail = false
    @State private var pulseAnimation = false

    var body: some View {
        Button {
            showDetail = true
        } label: {
            HStack(spacing: 4) {
                Circle()
                    .fill(appState.connectionStatus.color)
                    .frame(width: 8, height: 8)
                    .scaleEffect(shouldPulse ? (pulseAnimation ? 1.3 : 1.0) : 1.0)
                    .animation(
                        shouldPulse
                            ? .easeInOut(duration: 0.8).repeatForever(autoreverses: true)
                            : .default,
                        value: pulseAnimation
                    )
            }
        }
        .popover(isPresented: $showDetail) {
            connectionDetail
                .presentationCompactAdaptation(.popover)
        }
        .onAppear {
            pulseAnimation = true
        }
    }

    private var shouldPulse: Bool {
        appState.connectionStatus == .connecting || appState.connectionStatus == .reconnecting
    }

    private var connectionDetail: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(spacing: 8) {
                Circle()
                    .fill(appState.connectionStatus.color)
                    .frame(width: 10, height: 10)

                Text(appState.connectionStatus.label)
                    .font(.headline)
                    .foregroundStyle(.textPrimary)
            }

            if !appState.relayURL.isEmpty {
                VStack(alignment: .leading, spacing: 4) {
                    Text("Relay")
                        .font(.caption)
                        .foregroundStyle(.textSecondary)
                    Text(appState.relayURL)
                        .font(.caption.monospaced())
                        .foregroundStyle(.textPrimary)
                }
            }

            if !appState.pairingId.isEmpty {
                VStack(alignment: .leading, spacing: 4) {
                    Text("Pairing ID")
                        .font(.caption)
                        .foregroundStyle(.textSecondary)
                    Text(String(appState.pairingId.prefix(12)) + "...")
                        .font(.caption.monospaced())
                        .foregroundStyle(.textPrimary)
                }
            }

            if appState.connectionStatus == .disconnected {
                Button("Reconnect") {
                    appState.connect()
                    showDetail = false
                }
                .buttonStyle(.bordered)
                .tint(.accentBlue)
                .frame(maxWidth: .infinity)
            }
        }
        .padding()
        .frame(minWidth: 220)
    }
}

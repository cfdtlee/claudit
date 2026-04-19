import SwiftUI

struct SettingsView: View {
    @Environment(AppState.self) private var appState
    @State private var showUnpairConfirm = false
    @State private var showRepairSheet = false

    var body: some View {
        NavigationStack {
            Form {
                // Connection section
                Section("Connection") {
                    HStack {
                        Text("Status")
                        Spacer()
                        HStack(spacing: 6) {
                            Circle()
                                .fill(appState.connectionStatus.color)
                                .frame(width: 8, height: 8)
                            Text(appState.connectionStatus.label)
                                .font(.subheadline)
                                .foregroundStyle(.textSecondary)
                        }
                    }

                    HStack {
                        Text("Relay URL")
                        Spacer()
                        Text(appState.relayURL)
                            .font(.caption)
                            .foregroundStyle(.textSecondary)
                            .lineLimit(1)
                    }

                    HStack {
                        Text("Pairing ID")
                        Spacer()
                        Text(String(appState.pairingId.prefix(8)) + "...")
                            .font(.caption.monospaced())
                            .foregroundStyle(.textSecondary)
                    }

                    if appState.connectionStatus == .disconnected {
                        Button("Reconnect") {
                            appState.connect()
                        }
                    }
                }

                // Display preferences
                Section("Display") {
                    Toggle("Hide Empty Sessions", isOn: Binding(
                        get: { Preferences.shared.hideEmptySessions },
                        set: { Preferences.shared.hideEmptySessions = $0 }
                    ))

                    Toggle("Managed Sessions Only", isOn: Binding(
                        get: { Preferences.shared.showManagedOnly },
                        set: { Preferences.shared.showManagedOnly = $0 }
                    ))

                    Picker("Theme", selection: Binding(
                        get: { Preferences.shared.theme },
                        set: { Preferences.shared.theme = $0 }
                    )) {
                        ForEach(AppTheme.allCases) { theme in
                            Text(theme.displayName).tag(theme)
                        }
                    }
                }

                // Pairing actions
                Section("Pairing") {
                    Button("Re-pair (Scan New QR)") {
                        showRepairSheet = true
                    }

                    Button("Disconnect & Unpair", role: .destructive) {
                        showUnpairConfirm = true
                    }
                }

                // About
                Section("About") {
                    HStack {
                        Text("Version")
                        Spacer()
                        Text("1.0.0")
                            .foregroundStyle(.textSecondary)
                    }

                    HStack {
                        Text("App")
                        Spacer()
                        Text("Claudit iOS")
                            .foregroundStyle(.textSecondary)
                    }

                    Link(destination: URL(string: "https://github.com/claudit/claudit")!) {
                        HStack {
                            Text("Source Code")
                            Spacer()
                            Image(systemName: "arrow.up.right.square")
                                .foregroundStyle(.textSecondary)
                        }
                    }
                }
            }
            .navigationTitle("Settings")
            .alert("Unpair Device", isPresented: $showUnpairConfirm) {
                Button("Unpair", role: .destructive) {
                    appState.unpair()
                }
                Button("Cancel", role: .cancel) {}
            } message: {
                Text("This will disconnect from the relay and remove all pairing credentials. You will need to scan a new QR code to reconnect.")
            }
            .sheet(isPresented: $showRepairSheet) {
                NavigationStack {
                    PairingView()
                        .toolbar {
                            ToolbarItem(placement: .cancellationAction) {
                                Button("Cancel") {
                                    showRepairSheet = false
                                }
                            }
                        }
                }
            }
        }
    }
}

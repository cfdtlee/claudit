import SwiftUI

@main
struct ClauditApp: App {
    @State private var appState = AppState()

    var body: some Scene {
        WindowGroup {
            Group {
                if appState.isPaired {
                    MainTabView()
                } else {
                    PairingView()
                }
            }
            .environment(appState)
            .preferredColorScheme(.dark)
            .onAppear {
                appState.loadPairingState()
            }
        }
    }
}

struct MainTabView: View {
    @Environment(AppState.self) private var appState

    var body: some View {
        TabView {
            SessionListView()
                .tabItem {
                    Label("Sessions", systemImage: "bubble.left.and.bubble.right")
                }

            TaskListView()
                .tabItem {
                    Label("Tasks", systemImage: "checklist")
                }

            DashboardView()
                .tabItem {
                    Label("Dashboard", systemImage: "chart.bar")
                }

            SettingsView()
                .tabItem {
                    Label("Settings", systemImage: "gear")
                }
        }
        .tint(Color.accentBlue)
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                ConnectionIndicator()
            }
        }
        .onAppear {
            appState.connect()
        }
    }
}

import SwiftUI

struct DashboardView: View {
    @Environment(AppState.self) private var appState
    @State private var viewModel = DashboardViewModel()

    var body: some View {
        NavigationStack {
            Group {
                if viewModel.isLoading && viewModel.dashboard == nil {
                    loadingView
                } else if let dashboard = viewModel.dashboard {
                    dashboardContent(dashboard)
                } else {
                    errorView
                }
            }
            .navigationTitle("Dashboard")
            .refreshable {
                await viewModel.loadDashboard()
            }
            .background(Color.bgPrimary)
            .onAppear {
                viewModel.setClient(appState.apiClient)
                Task { await viewModel.loadDashboard() }
            }
        }
    }

    // MARK: - Dashboard Content

    private func dashboardContent(_ data: DashboardData) -> some View {
        ScrollView {
            VStack(spacing: 16) {
                // Stats cards
                LazyVGrid(columns: [
                    GridItem(.flexible()),
                    GridItem(.flexible()),
                ], spacing: 12) {
                    StatCard(
                        title: "Running",
                        value: "\(data.running)",
                        icon: "play.circle.fill",
                        color: .statusSuccess
                    )
                    StatCard(
                        title: "Waiting",
                        value: "\(data.waiting)",
                        icon: "clock.fill",
                        color: .statusWarning
                    )
                    StatCard(
                        title: "Done Today",
                        value: "\(data.doneToday)",
                        icon: "checkmark.circle.fill",
                        color: .accentBlue
                    )
                    StatCard(
                        title: "Failed",
                        value: "\(data.failed)",
                        icon: "xmark.circle.fill",
                        color: .statusError
                    )
                }

                // Token usage
                tokenUsageCard(data.tokenUsageToday)

                // System status
                systemStatusCard(data.systemStatus)

                // Active agents
                if !data.activeAgents.isEmpty {
                    activeAgentsSection(data.activeAgents)
                }

                // Recent tasks
                if !data.recentTasks.isEmpty {
                    recentTasksSection(data.recentTasks)
                }
            }
            .padding()
        }
    }

    // MARK: - Cards

    private func tokenUsageCard(_ tokens: Int) -> some View {
        HStack {
            VStack(alignment: .leading, spacing: 4) {
                Text("Token Usage Today")
                    .font(.caption)
                    .foregroundStyle(.textSecondary)
                Text(viewModel.formatTokens(tokens))
                    .font(.title.bold())
                    .foregroundStyle(.textPrimary)
            }

            Spacer()

            Image(systemName: "chart.line.uptrend.xyaxis")
                .font(.system(size: 32))
                .foregroundStyle(.accentBlue.opacity(0.5))
        }
        .padding()
        .background(Color.bgSecondary)
        .clipShape(RoundedRectangle(cornerRadius: 12))
    }

    private func systemStatusCard(_ status: SystemStatus) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("System Status")
                .font(.headline)
                .foregroundStyle(.textPrimary)

            HStack(spacing: 16) {
                statusItem(
                    "Mayor",
                    online: status.mayorOnline,
                    icon: "crown.fill"
                )

                statusItem(
                    "Witness",
                    online: status.witnessRunning,
                    icon: "eye.fill"
                )
            }

            if status.witnessRunning {
                Text("Last check: \(viewModel.timeAgo(from: status.witnessLastCheck))")
                    .font(.caption)
                    .foregroundStyle(.textSecondary)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding()
        .background(Color.bgSecondary)
        .clipShape(RoundedRectangle(cornerRadius: 12))
    }

    private func statusItem(_ label: String, online: Bool, icon: String) -> some View {
        HStack(spacing: 6) {
            Image(systemName: icon)
                .font(.caption)
                .foregroundStyle(online ? .statusSuccess : .textSecondary)

            Text(label)
                .font(.subheadline)
                .foregroundStyle(.textPrimary)

            Circle()
                .fill(online ? Color.statusSuccess : Color.textSecondary)
                .frame(width: 6, height: 6)
        }
    }

    private func activeAgentsSection(_ agents: [ActiveAgent]) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Active Agents")
                .font(.headline)
                .foregroundStyle(.textPrimary)

            ForEach(agents, id: \.agent.id) { active in
                HStack {
                    VStack(alignment: .leading, spacing: 2) {
                        Text(active.agent.name)
                            .font(.subheadline.weight(.medium))
                            .foregroundStyle(.textPrimary)

                        if let specialty = active.agent.specialty {
                            Text(specialty)
                                .font(.caption)
                                .foregroundStyle(.textSecondary)
                        }
                    }

                    Spacer()

                    HStack(spacing: 8) {
                        if active.runningSessions > 0 {
                            Label("\(active.runningSessions)", systemImage: "play.fill")
                                .font(.caption)
                                .foregroundStyle(.statusSuccess)
                        }
                        if active.waitingSessions > 0 {
                            Label("\(active.waitingSessions)", systemImage: "clock.fill")
                                .font(.caption)
                                .foregroundStyle(.statusWarning)
                        }
                    }
                }
                .padding(.vertical, 4)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding()
        .background(Color.bgSecondary)
        .clipShape(RoundedRectangle(cornerRadius: 12))
    }

    private func recentTasksSection(_ tasks: [ClauditTask]) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Recent Tasks")
                .font(.headline)
                .foregroundStyle(.textPrimary)

            ForEach(tasks.prefix(5)) { task in
                HStack(spacing: 8) {
                    StatusBadge(status: task.status)

                    Text(task.title)
                        .font(.subheadline)
                        .foregroundStyle(.textPrimary)
                        .lineLimit(1)

                    Spacer()

                    Text(viewModel.timeAgo(from: task.updatedAt))
                        .font(.caption2)
                        .foregroundStyle(.textSecondary)
                }
                .padding(.vertical, 2)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding()
        .background(Color.bgSecondary)
        .clipShape(RoundedRectangle(cornerRadius: 12))
    }

    // MARK: - Loading / Error

    private var loadingView: some View {
        VStack(spacing: 16) {
            ProgressView()
                .tint(.accentBlue)
            Text("Loading dashboard...")
                .foregroundStyle(.textSecondary)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }

    private var errorView: some View {
        VStack(spacing: 16) {
            Image(systemName: "chart.bar.xaxis")
                .font(.system(size: 48))
                .foregroundStyle(.textSecondary)

            Text("Could not load dashboard")
                .font(.headline)
                .foregroundStyle(.textPrimary)

            if let error = viewModel.errorMessage {
                Text(error)
                    .font(.caption)
                    .foregroundStyle(.textSecondary)
            }

            Button("Retry") {
                Task { await viewModel.loadDashboard() }
            }
            .buttonStyle(.bordered)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }
}

// MARK: - Stat Card

struct StatCard: View {
    let title: String
    let value: String
    let icon: String
    let color: Color

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                Image(systemName: icon)
                    .foregroundStyle(color)
                Spacer()
            }

            Text(value)
                .font(.title.bold())
                .foregroundStyle(.textPrimary)

            Text(title)
                .font(.caption)
                .foregroundStyle(.textSecondary)
        }
        .padding()
        .background(Color.bgSecondary)
        .clipShape(RoundedRectangle(cornerRadius: 12))
    }
}

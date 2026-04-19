import SwiftUI

struct SessionListView: View {
    @Environment(AppState.self) private var appState
    @State private var viewModel = SessionViewModel()
    @State private var collapsedGroups: Set<String> = []

    var body: some View {
        NavigationStack {
            Group {
                if viewModel.isLoading && viewModel.groups.isEmpty {
                    loadingView
                } else if viewModel.groups.isEmpty {
                    emptyView
                } else {
                    sessionList
                }
            }
            .navigationTitle("Sessions")
            .searchable(text: $viewModel.searchQuery, prompt: "Search sessions...")
            .onChange(of: viewModel.searchQuery) {
                Task { await viewModel.loadSessions() }
            }
            .refreshable {
                await viewModel.loadSessions()
            }
            .background(Color.bgPrimary)
            .onAppear {
                viewModel.setClient(appState.apiClient)
                if appState.apiClient != nil {
                    Task { await viewModel.loadSessions() }
                }
            }
            .onChange(of: appState.connectionStatus) {
                if appState.connectionStatus == .connected {
                    viewModel.setClient(appState.apiClient)
                    Task { await viewModel.loadSessions() }
                }
            }
        }
    }

    // MARK: - Pinned Sessions

    private var pinnedSessions: [(group: ProjectGroup, session: SessionSummary)] {
        viewModel.groups.flatMap { group in
            group.sessions
                .filter { $0.pinned == true }
                .map { (group: group, session: $0) }
        }
    }

    // MARK: - Session List

    private var sessionList: some View {
        List {
            // Pinned Sessions folder
            if !pinnedSessions.isEmpty {
                Section {
                    if !collapsedGroups.contains("__pinned__") {
                        ForEach(pinnedSessions, id: \.session.sessionId) { item in
                            NavigationLink {
                                SessionDetailView(
                                    projectHash: item.group.projectHash,
                                    sessionId: item.session.sessionId,
                                    slug: item.session.slug,
                                    slugPartCount: item.session.slugPartCount
                                )
                            } label: {
                                SessionRow(
                                    session: item.session,
                                    timeAgo: viewModel.timeAgo(from: item.session.timestamp)
                                )
                            }
                        }
                    }
                } header: {
                    folderHeader(
                        icon: "pin.fill",
                        iconColor: .orange,
                        name: "Pinned",
                        count: pinnedSessions.count,
                        groupId: "__pinned__"
                    )
                }
            }

            // Project folders
            ForEach(viewModel.groups) { group in
                Section {
                    if !collapsedGroups.contains(group.projectHash) {
                        ForEach(group.sessions) { session in
                            NavigationLink {
                                SessionDetailView(
                                    projectHash: group.projectHash,
                                    sessionId: session.sessionId,
                                    slug: session.slug,
                                    slugPartCount: session.slugPartCount
                                )
                            } label: {
                                SessionRow(
                                    session: session,
                                    timeAgo: viewModel.timeAgo(from: session.timestamp)
                                )
                            }
                            .swipeActions(edge: .leading) {
                                Button {
                                    Task {
                                        await viewModel.pinSession(
                                            session.sessionId,
                                            pinned: !(session.pinned ?? false)
                                        )
                                    }
                                } label: {
                                    Label(
                                        session.pinned == true ? "Unpin" : "Pin",
                                        systemImage: session.pinned == true ? "pin.slash" : "pin"
                                    )
                                }
                                .tint(.orange)
                            }
                            .swipeActions(edge: .trailing) {
                                Button(role: .destructive) {
                                    Task {
                                        await viewModel.deleteSession(
                                            projectHash: group.projectHash,
                                            sessionId: session.sessionId
                                        )
                                    }
                                } label: {
                                    Label("Delete", systemImage: "trash")
                                }

                                Button {
                                    Task {
                                        await viewModel.archiveSession(session.sessionId)
                                    }
                                } label: {
                                    Label("Archive", systemImage: "archivebox")
                                }
                                .tint(.gray)
                            }
                        }
                    }
                } header: {
                    folderHeader(
                        icon: "folder",
                        iconColor: .textSecondary,
                        name: viewModel.projectName(for: group),
                        count: group.sessions.count,
                        groupId: group.projectHash
                    )
                }
            }
        }
        .listStyle(.insetGrouped)
    }

    // MARK: - Folder Header (tappable to collapse/expand)

    private func folderHeader(icon: String, iconColor: Color, name: String, count: Int, groupId: String) -> some View {
        Button {
            withAnimation(.easeInOut(duration: 0.2)) {
                if collapsedGroups.contains(groupId) {
                    collapsedGroups.remove(groupId)
                } else {
                    collapsedGroups.insert(groupId)
                }
            }
        } label: {
            HStack {
                Image(systemName: collapsedGroups.contains(groupId) ? "chevron.right" : "chevron.down")
                    .font(.caption2)
                    .frame(width: 12)
                Image(systemName: icon)
                    .font(.caption)
                    .foregroundStyle(iconColor)
                Text(name)
                    .font(.caption.bold())
                Spacer()
                Text("\(count)")
                    .font(.caption2)
                    .foregroundStyle(.textSecondary)
            }
            .foregroundStyle(.textSecondary)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }

    // MARK: - Empty / Loading

    private var loadingView: some View {
        VStack(spacing: 16) {
            ProgressView()
                .tint(.accentBlue)
            Text("Loading sessions...")
                .foregroundStyle(.textSecondary)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }

    private var emptyView: some View {
        VStack(spacing: 16) {
            Image(systemName: "bubble.left.and.bubble.right")
                .font(.system(size: 48))
                .foregroundStyle(.textSecondary)

            Text("No sessions found")
                .font(.headline)
                .foregroundStyle(.textPrimary)

            if let error = viewModel.errorMessage {
                Text(error)
                    .font(.caption)
                    .foregroundStyle(.statusError)
                    .multilineTextAlignment(.center)
                    .padding(.horizontal)
            } else {
                Text("Sessions from your claudit server will appear here")
                    .font(.subheadline)
                    .foregroundStyle(.textSecondary)
                    .multilineTextAlignment(.center)
            }

            Button("Refresh") {
                Task { await viewModel.loadSessions() }
            }
            .buttonStyle(.bordered)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }
}

// MARK: - Session Row

struct SessionRow: View {
    let session: SessionSummary
    let timeAgo: String

    var body: some View {
        HStack(spacing: 12) {
            Circle()
                .fill(statusColor)
                .frame(width: 8, height: 8)

            VStack(alignment: .leading, spacing: 4) {
                HStack {
                    if session.pinned == true {
                        Image(systemName: "pin.fill")
                            .font(.caption2)
                            .foregroundStyle(.orange)
                    }

                    Text(displayTitle)
                        .font(.subheadline.weight(.medium))
                        .foregroundStyle(.textPrimary)
                        .lineLimit(1)

                    if let count = session.slugPartCount, count > 1 {
                        Text("\(count)")
                            .font(.caption2)
                            .padding(.horizontal, 5)
                            .padding(.vertical, 1)
                            .background(Color.bgTertiary)
                            .clipShape(Capsule())
                            .foregroundStyle(.textSecondary)
                    }
                }

                Text(session.lastMessage)
                    .font(.caption)
                    .foregroundStyle(.textSecondary)
                    .lineLimit(2)
            }

            Spacer()

            VStack(alignment: .trailing, spacing: 4) {
                Text(timeAgo)
                    .font(.caption2)
                    .foregroundStyle(.textSecondary)

                HStack(spacing: 4) {
                    Image(systemName: "message")
                        .font(.caption2)
                    Text("\(session.messageCount)")
                        .font(.caption2)
                }
                .foregroundStyle(.textSecondary)
            }
        }
        .padding(.vertical, 4)
    }

    private var displayTitle: String {
        if let name = session.displayName, !name.isEmpty { return name }
        if let slug = session.slug, !slug.isEmpty { return slug }
        return String(session.sessionId.prefix(8))
    }

    private var statusColor: Color {
        switch session.status {
        case .running: return .statusSuccess
        case .idle: return .statusWarning
        case .done: return .textSecondary
        }
    }
}

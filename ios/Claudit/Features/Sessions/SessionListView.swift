import SwiftUI

struct SessionListView: View {
    @Environment(AppState.self) private var appState
    @State private var viewModel = SessionViewModel()
    @State private var collapsedGroups: Set<String> = []
    @State private var searchTask: Task<Void, Never>?

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
                searchTask?.cancel()
                searchTask = Task {
                    try? await Task.sleep(for: .seconds(0.3))
                    guard !Task.isCancelled else { return }
                    await viewModel.loadSessions()
                }
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
                Image(systemName: "chevron.right")
                    .font(.caption2)
                    .frame(width: 12)
                    .rotationEffect(.degrees(collapsedGroups.contains(groupId) ? 0 : 90))
                    .animation(.easeInOut(duration: 0.2), value: collapsedGroups.contains(groupId))
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
        List {
            ForEach(0..<7, id: \.self) { _ in
                SkeletonRow()
            }
        }
        .listStyle(.insetGrouped)
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
    @State private var isPulsing = false

    var body: some View {
        HStack(spacing: 12) {
            Circle()
                .fill(statusColor)
                .frame(width: 8, height: 8)
                .opacity(session.status == .running ? (isPulsing ? 0.3 : 1.0) : 1.0)
                .shadow(color: session.status == .running ? .statusSuccess : .clear, radius: 4)
                .onAppear {
                    if session.status == .running {
                        withAnimation(.easeInOut(duration: 0.8).repeatForever(autoreverses: true)) {
                            isPulsing = true
                        }
                    }
                }

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

// MARK: - Skeleton Row

struct SkeletonRow: View {
    @State private var shimmerOffset: CGFloat = -200

    var body: some View {
        HStack(spacing: 12) {
            Circle()
                .fill(Color.bgTertiary)
                .frame(width: 8, height: 8)

            VStack(alignment: .leading, spacing: 6) {
                RoundedRectangle(cornerRadius: 4)
                    .fill(Color.bgTertiary)
                    .frame(width: 140, height: 14)

                RoundedRectangle(cornerRadius: 4)
                    .fill(Color.bgTertiary)
                    .frame(height: 12)
            }

            Spacer()

            VStack(alignment: .trailing, spacing: 6) {
                RoundedRectangle(cornerRadius: 4)
                    .fill(Color.bgTertiary)
                    .frame(width: 40, height: 10)

                RoundedRectangle(cornerRadius: 4)
                    .fill(Color.bgTertiary)
                    .frame(width: 30, height: 10)
            }
        }
        .padding(.vertical, 4)
        .overlay(
            LinearGradient(
                colors: [.clear, .white.opacity(0.15), .clear],
                startPoint: .leading,
                endPoint: .trailing
            )
            .offset(x: shimmerOffset)
            .mask(
                HStack(spacing: 12) {
                    Circle().frame(width: 8, height: 8)
                    VStack(alignment: .leading, spacing: 6) {
                        RoundedRectangle(cornerRadius: 4).frame(width: 140, height: 14)
                        RoundedRectangle(cornerRadius: 4).frame(height: 12)
                    }
                    Spacer()
                    VStack(alignment: .trailing, spacing: 6) {
                        RoundedRectangle(cornerRadius: 4).frame(width: 40, height: 10)
                        RoundedRectangle(cornerRadius: 4).frame(width: 30, height: 10)
                    }
                }
                .padding(.vertical, 4)
            )
        )
        .onAppear {
            withAnimation(.linear(duration: 1.5).repeatForever(autoreverses: false)) {
                shimmerOffset = 400
            }
        }
    }
}

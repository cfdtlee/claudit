import Foundation

@Observable
final class SessionViewModel {
    var groups: [ProjectGroup] = []
    var isLoading = false
    var errorMessage: String?
    var searchQuery = ""
    var selectedDetail: SessionDetail?
    var isLoadingDetail = false

    private weak var apiClient: APIClient?

    init(apiClient: APIClient? = nil) {
        self.apiClient = apiClient
    }

    func setClient(_ client: APIClient?) {
        self.apiClient = client
    }

    func loadSessions() async {
        guard let client = apiClient else { return }

        isLoading = true
        errorMessage = nil

        do {
            let query = searchQuery.isEmpty ? nil : searchQuery
            groups = try await client.fetchSessions(
                query: query,
                hideEmpty: Preferences.shared.hideEmptySessions
            )
        } catch {
            errorMessage = error.localizedDescription
        }

        isLoading = false
    }

    func loadSessionDetail(projectHash: String, sessionId: String) async {
        guard let client = apiClient else {
            print("[SessionVM] No apiClient, cannot load detail")
            errorMessage = "Not connected"
            return
        }

        // Only show loading spinner on INITIAL load, not on refresh
        // This prevents view rebuild which would dismiss the keyboard
        let isInitialLoad = selectedDetail == nil
        if isInitialLoad {
            isLoadingDetail = true
        }

        do {
            print("[SessionVM] Loading detail: \(projectHash)/\(sessionId)")
            selectedDetail = try await client.fetchSessionDetail(
                projectHash: projectHash,
                sessionId: sessionId
            )
            print("[SessionVM] Loaded \(selectedDetail?.messages.count ?? 0) messages")
        } catch {
            print("[SessionVM] Error loading detail: \(error)")
            if isInitialLoad {
                errorMessage = error.localizedDescription
            }
        }

        if isInitialLoad {
            isLoadingDetail = false
        }
    }

    func loadMergedSession(projectHash: String, slug: String) async {
        guard let client = apiClient else { return }

        let isInitialLoad = selectedDetail == nil
        if isInitialLoad { isLoadingDetail = true }

        do {
            let merged = try await client.fetchMergedSession(
                projectHash: projectHash,
                slug: slug
            )
            selectedDetail = SessionDetail(
                sessionId: merged.latestSessionId,
                projectPath: merged.projectPath,
                messages: merged.messages,
                slug: merged.slug
            )
        } catch {
            if isInitialLoad { errorMessage = error.localizedDescription }
        }

        if isInitialLoad { isLoadingDetail = false }
    }

    func pinSession(_ sessionId: String, pinned: Bool) async {
        guard let client = apiClient else { return }
        do {
            try await client.pinSession(sessionId: sessionId, pinned: pinned)
            await loadSessions()
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    func archiveSession(_ sessionId: String) async {
        guard let client = apiClient else { return }
        do {
            try await client.archiveSession(sessionId: sessionId, archived: true)
            await loadSessions()
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    func deleteSession(projectHash: String, sessionId: String) async {
        guard let client = apiClient else { return }
        do {
            try await client.deleteSession(projectHash: projectHash, sessionId: sessionId)
            await loadSessions()
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    // MARK: - Computed

    var totalSessionCount: Int {
        groups.reduce(0) { $0 + $1.sessions.count }
    }

    /// Project name extracted from path.
    func projectName(for group: ProjectGroup) -> String {
        let path = group.projectPath
        if let last = path.split(separator: "/").last {
            return String(last)
        }
        return path
    }

    /// Time-ago string from timestamp.
    func timeAgo(from timestamp: Double) -> String {
        let date = Date(timeIntervalSince1970: timestamp / 1000)
        let formatter = RelativeDateTimeFormatter()
        formatter.unitsStyle = .abbreviated
        return formatter.localizedString(for: date, relativeTo: Date())
    }
}

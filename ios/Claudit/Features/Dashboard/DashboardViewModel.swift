import Foundation

@Observable
final class DashboardViewModel {
    var dashboard: DashboardData?
    var isLoading = false
    var errorMessage: String?

    private weak var apiClient: APIClient?

    func setClient(_ client: APIClient?) {
        self.apiClient = client
    }

    func loadDashboard() async {
        guard let client = apiClient else { return }

        isLoading = true
        errorMessage = nil

        do {
            dashboard = try await client.fetchDashboard()
        } catch {
            errorMessage = error.localizedDescription
        }

        isLoading = false
    }

    // MARK: - Computed

    var totalActive: Int {
        (dashboard?.running ?? 0) + (dashboard?.waiting ?? 0)
    }

    func formatTokens(_ count: Int) -> String {
        if count >= 1_000_000 {
            return String(format: "%.1fM", Double(count) / 1_000_000)
        } else if count >= 1_000 {
            return String(format: "%.1fK", Double(count) / 1_000)
        }
        return "\(count)"
    }

    private static let isoFormatter: ISO8601DateFormatter = {
        let f = ISO8601DateFormatter()
        f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return f
    }()

    private static let isoFormatterNoFractional: ISO8601DateFormatter = {
        let f = ISO8601DateFormatter()
        f.formatOptions = [.withInternetDateTime]
        return f
    }()

    private static let relativeFormatter: RelativeDateTimeFormatter = {
        let f = RelativeDateTimeFormatter()
        f.unitsStyle = .abbreviated
        return f
    }()

    func timeAgo(from dateString: String) -> String {
        if let date = Self.isoFormatter.date(from: dateString) {
            return relativeTime(from: date)
        }
        if let date = Self.isoFormatterNoFractional.date(from: dateString) {
            return relativeTime(from: date)
        }
        return dateString
    }

    private func relativeTime(from date: Date) -> String {
        Self.relativeFormatter.localizedString(for: date, relativeTo: Date())
    }
}

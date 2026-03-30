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

    func timeAgo(from dateString: String) -> String {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        guard let date = formatter.date(from: dateString) else {
            formatter.formatOptions = [.withInternetDateTime]
            guard let d = formatter.date(from: dateString) else { return dateString }
            return relativeTime(from: d)
        }
        return relativeTime(from: date)
    }

    private func relativeTime(from date: Date) -> String {
        let fmt = RelativeDateTimeFormatter()
        fmt.unitsStyle = .abbreviated
        return fmt.localizedString(for: date, relativeTo: Date())
    }
}

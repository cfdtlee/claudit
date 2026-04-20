import Foundation

@Observable
final class TaskViewModel {
    var tasks: [ClauditTask] = []
    var selectedTask: ClauditTask?
    var isLoading = false
    var isLoadingDetail = false
    var errorMessage: String?
    var statusFilter: TaskStatus?

    // Create task form
    var newTaskTitle = ""
    var newTaskDescription = ""
    var showCreateSheet = false

    private weak var apiClient: APIClient?

    func setClient(_ client: APIClient?) {
        self.apiClient = client
    }

    func loadTasks() async {
        guard let client = apiClient else { return }

        isLoading = true
        errorMessage = nil

        do {
            tasks = try await client.fetchTasks(status: statusFilter)
        } catch {
            errorMessage = error.localizedDescription
        }

        isLoading = false
    }

    func loadTaskDetail(id: String) async {
        guard let client = apiClient else { return }

        isLoadingDetail = true

        do {
            selectedTask = try await client.fetchTask(id: id)
        } catch {
            errorMessage = error.localizedDescription
        }

        isLoadingDetail = false
    }

    func createTask() async {
        guard let client = apiClient else { return }
        let title = newTaskTitle.trimmingCharacters(in: .whitespaces)
        guard !title.isEmpty else { return }

        do {
            let task = try await client.createTask(
                title: title,
                description: newTaskDescription.isEmpty ? nil : newTaskDescription
            )
            tasks.insert(task, at: 0)
            newTaskTitle = ""
            newTaskDescription = ""
            showCreateSheet = false
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    func updateStatus(taskId: String, status: TaskStatus) async {
        guard let client = apiClient else { return }

        do {
            let updated = try await client.updateTaskStatus(id: taskId, status: status)
            if let idx = tasks.firstIndex(where: { $0.id == taskId }) {
                tasks[idx] = updated
            }
            if selectedTask?.id == taskId {
                selectedTask = updated
            }
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    func deleteTask(id: String) async {
        guard let client = apiClient else { return }

        do {
            try await client.deleteTask(id: id)
            tasks.removeAll { $0.id == id }
            if selectedTask?.id == id {
                selectedTask = nil
            }
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    // MARK: - Computed

    var filteredTasks: [ClauditTask] {
        if let filter = statusFilter {
            return tasks.filter { $0.status == filter }
        }
        return tasks
    }

    var statusCounts: [TaskStatus: Int] {
        var counts: [TaskStatus: Int] = [:]
        for task in tasks {
            counts[task.status, default: 0] += 1
        }
        return counts
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

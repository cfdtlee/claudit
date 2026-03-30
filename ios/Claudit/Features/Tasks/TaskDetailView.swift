import SwiftUI

struct TaskDetailView: View {
    @Environment(AppState.self) private var appState
    @State private var viewModel = TaskViewModel()
    @State private var showDeleteConfirm = false

    let taskId: String

    var body: some View {
        Group {
            if viewModel.isLoadingDetail {
                ProgressView("Loading task...")
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
            } else if let task = viewModel.selectedTask {
                taskContent(task)
            } else {
                errorView
            }
        }
        .background(Color.bgPrimary)
        .navigationBarTitleDisplayMode(.inline)
        .alert("Delete Task", isPresented: $showDeleteConfirm) {
            Button("Delete", role: .destructive) {
                Task { await viewModel.deleteTask(id: taskId) }
            }
            Button("Cancel", role: .cancel) {}
        } message: {
            Text("Are you sure you want to delete this task?")
        }
        .onAppear {
            viewModel.setClient(appState.apiClient)
            Task { await viewModel.loadTaskDetail(id: taskId) }
        }
    }

    // MARK: - Task Content

    private func taskContent(_ task: ClauditTask) -> some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 20) {
                // Header
                VStack(alignment: .leading, spacing: 8) {
                    HStack {
                        StatusBadge(status: task.status)
                        Spacer()
                        if let priority = task.priority {
                            Label("P\(priority)", systemImage: "flag.fill")
                                .font(.caption)
                                .foregroundStyle(priorityColor(priority))
                        }
                    }

                    Text(task.title)
                        .font(.title2.bold())
                        .foregroundStyle(.textPrimary)

                    if let desc = task.description, !desc.isEmpty {
                        Text(desc)
                            .font(.body)
                            .foregroundStyle(.textSecondary)
                    }
                }
                .padding()
                .background(Color.bgSecondary)
                .clipShape(RoundedRectangle(cornerRadius: 12))

                // Status actions
                statusActions(task)

                // Details section
                detailsSection(task)

                // Tags
                if let tags = task.tags, !tags.isEmpty {
                    tagsSection(tags)
                }

                // Subtasks
                if let subtasks = task.subtasks, !subtasks.isEmpty {
                    subtasksSection(subtasks)
                }

                // Error message
                if let error = task.errorMessage, !error.isEmpty {
                    errorSection(error)
                }

                // Result summary
                if let result = task.resultSummary, !result.isEmpty {
                    resultSection(result)
                }

                // Danger zone
                Button(role: .destructive) {
                    showDeleteConfirm = true
                } label: {
                    Label("Delete Task", systemImage: "trash")
                        .frame(maxWidth: .infinity)
                }
                .buttonStyle(.bordered)
                .tint(.statusError)
            }
            .padding()
        }
    }

    // MARK: - Status Actions

    private func statusActions(_ task: ClauditTask) -> some View {
        HStack(spacing: 12) {
            switch task.status {
            case .pending:
                actionButton("Start", icon: "play.fill", color: .accentBlue) {
                    Task { await viewModel.updateStatus(taskId: task.id, status: .running) }
                }
            case .running:
                actionButton("Pause", icon: "pause.fill", color: .statusWarning) {
                    Task { await viewModel.updateStatus(taskId: task.id, status: .paused) }
                }
                actionButton("Done", icon: "checkmark", color: .statusSuccess) {
                    Task { await viewModel.updateStatus(taskId: task.id, status: .done) }
                }
            case .paused:
                actionButton("Resume", icon: "play.fill", color: .accentBlue) {
                    Task { await viewModel.updateStatus(taskId: task.id, status: .running) }
                }
            case .failed:
                actionButton("Retry", icon: "arrow.counterclockwise", color: .accentBlue) {
                    Task { await viewModel.updateStatus(taskId: task.id, status: .pending) }
                }
            case .waiting:
                actionButton("Done", icon: "checkmark", color: .statusSuccess) {
                    Task { await viewModel.updateStatus(taskId: task.id, status: .done) }
                }
            default:
                EmptyView()
            }
        }
    }

    private func actionButton(_ label: String, icon: String, color: Color, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Label(label, systemImage: icon)
                .frame(maxWidth: .infinity)
        }
        .buttonStyle(.bordered)
        .tint(color)
    }

    // MARK: - Details Section

    private func detailsSection(_ task: ClauditTask) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("Details")
                .font(.headline)
                .foregroundStyle(.textPrimary)

            DetailRow(label: "Created", value: viewModel.timeAgo(from: task.createdAt))
            DetailRow(label: "Updated", value: viewModel.timeAgo(from: task.updatedAt))

            if let assignee = task.assignee {
                DetailRow(label: "Assignee", value: assignee)
            }
            if let branch = task.branch {
                DetailRow(label: "Branch", value: branch)
            }
            if let retries = task.maxRetries {
                DetailRow(label: "Retries", value: "\(task.retryCount)/\(retries)")
            }
            if let tokens = task.tokenUsage {
                DetailRow(label: "Tokens", value: formatNumber(tokens))
            }
            if let prUrl = task.prUrl {
                DetailRow(label: "PR", value: prUrl)
            }
        }
        .padding()
        .background(Color.bgSecondary)
        .clipShape(RoundedRectangle(cornerRadius: 12))
    }

    private func tagsSection(_ tags: [String]) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("Tags")
                .font(.headline)
                .foregroundStyle(.textPrimary)

            FlowLayout(spacing: 6) {
                ForEach(tags, id: \.self) { tag in
                    Text(tag)
                        .font(.caption)
                        .padding(.horizontal, 10)
                        .padding(.vertical, 4)
                        .background(Color.accentBlue.opacity(0.2))
                        .foregroundStyle(.accentBlue)
                        .clipShape(Capsule())
                }
            }
        }
        .padding()
        .background(Color.bgSecondary)
        .clipShape(RoundedRectangle(cornerRadius: 12))
    }

    private func subtasksSection(_ subtasks: [ClauditTask]) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("Subtasks (\(subtasks.count))")
                .font(.headline)
                .foregroundStyle(.textPrimary)

            ForEach(subtasks) { subtask in
                HStack(spacing: 8) {
                    StatusBadge(status: subtask.status)
                    Text(subtask.title)
                        .font(.subheadline)
                        .foregroundStyle(.textPrimary)
                        .lineLimit(1)
                    Spacer()
                }
                .padding(.vertical, 4)
            }
        }
        .padding()
        .background(Color.bgSecondary)
        .clipShape(RoundedRectangle(cornerRadius: 12))
    }

    private func errorSection(_ error: String) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            Label("Error", systemImage: "exclamationmark.triangle.fill")
                .font(.headline)
                .foregroundStyle(.statusError)

            Text(error)
                .font(.caption)
                .foregroundStyle(.textSecondary)
        }
        .padding()
        .background(Color.statusError.opacity(0.1))
        .clipShape(RoundedRectangle(cornerRadius: 12))
    }

    private func resultSection(_ result: String) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            Label("Result", systemImage: "doc.text")
                .font(.headline)
                .foregroundStyle(.statusSuccess)

            Text(result)
                .font(.body)
                .foregroundStyle(.textPrimary)
        }
        .padding()
        .background(Color.bgSecondary)
        .clipShape(RoundedRectangle(cornerRadius: 12))
    }

    private var errorView: some View {
        VStack(spacing: 16) {
            Image(systemName: "exclamationmark.triangle")
                .font(.system(size: 40))
                .foregroundStyle(.statusError)
            Text("Failed to load task")
                .font(.headline)
            if let error = viewModel.errorMessage {
                Text(error)
                    .font(.caption)
                    .foregroundStyle(.textSecondary)
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }

    private func priorityColor(_ priority: Int) -> Color {
        switch priority {
        case 1: return .statusError
        case 2: return .statusWarning
        case 3: return .accentBlue
        default: return .textSecondary
        }
    }

    private func formatNumber(_ n: Int) -> String {
        if n >= 1_000_000 {
            return String(format: "%.1fM", Double(n) / 1_000_000)
        } else if n >= 1_000 {
            return String(format: "%.1fK", Double(n) / 1_000)
        }
        return "\(n)"
    }
}

// MARK: - Detail Row

struct DetailRow: View {
    let label: String
    let value: String

    var body: some View {
        HStack {
            Text(label)
                .font(.caption)
                .foregroundStyle(.textSecondary)
            Spacer()
            Text(value)
                .font(.caption)
                .foregroundStyle(.textPrimary)
        }
    }
}

// MARK: - Flow Layout

struct FlowLayout: Layout {
    let spacing: CGFloat

    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        let result = computeLayout(proposal: proposal, subviews: subviews)
        return result.size
    }

    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
        let result = computeLayout(proposal: proposal, subviews: subviews)
        for (index, offset) in result.offsets.enumerated() {
            subviews[index].place(
                at: CGPoint(x: bounds.minX + offset.x, y: bounds.minY + offset.y),
                proposal: .unspecified
            )
        }
    }

    private func computeLayout(proposal: ProposedViewSize, subviews: Subviews) -> (size: CGSize, offsets: [CGPoint]) {
        let maxWidth = proposal.width ?? .infinity
        var offsets: [CGPoint] = []
        var currentX: CGFloat = 0
        var currentY: CGFloat = 0
        var lineHeight: CGFloat = 0
        var maxX: CGFloat = 0

        for subview in subviews {
            let size = subview.sizeThatFits(.unspecified)

            if currentX + size.width > maxWidth && currentX > 0 {
                currentX = 0
                currentY += lineHeight + spacing
                lineHeight = 0
            }

            offsets.append(CGPoint(x: currentX, y: currentY))
            lineHeight = max(lineHeight, size.height)
            currentX += size.width + spacing
            maxX = max(maxX, currentX)
        }

        return (CGSize(width: maxX, height: currentY + lineHeight), offsets)
    }
}

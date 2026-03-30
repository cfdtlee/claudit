import SwiftUI

struct TaskListView: View {
    @Environment(AppState.self) private var appState
    @State private var viewModel = TaskViewModel()

    var body: some View {
        NavigationStack {
            VStack(spacing: 0) {
                // Status filter chips
                statusFilterBar

                // Task list
                Group {
                    if viewModel.isLoading && viewModel.tasks.isEmpty {
                        loadingView
                    } else if viewModel.filteredTasks.isEmpty {
                        emptyView
                    } else {
                        taskList
                    }
                }
            }
            .navigationTitle("Tasks")
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button {
                        viewModel.showCreateSheet = true
                    } label: {
                        Image(systemName: "plus")
                    }
                }

                ToolbarItem(placement: .topBarLeading) {
                    ConnectionIndicator()
                }
            }
            .refreshable {
                await viewModel.loadTasks()
            }
            .sheet(isPresented: $viewModel.showCreateSheet) {
                createTaskSheet
            }
            .background(Color.bgPrimary)
            .onAppear {
                viewModel.setClient(appState.apiClient)
                Task { await viewModel.loadTasks() }
            }
        }
    }

    // MARK: - Status Filter

    private var statusFilterBar: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 8) {
                filterChip("All", status: nil, count: viewModel.tasks.count)
                filterChip("Pending", status: .pending, count: viewModel.statusCounts[.pending] ?? 0)
                filterChip("Running", status: .running, count: viewModel.statusCounts[.running] ?? 0)
                filterChip("Waiting", status: .waiting, count: viewModel.statusCounts[.waiting] ?? 0)
                filterChip("Done", status: .done, count: viewModel.statusCounts[.done] ?? 0)
                filterChip("Failed", status: .failed, count: viewModel.statusCounts[.failed] ?? 0)
            }
            .padding(.horizontal)
            .padding(.vertical, 8)
        }
        .background(Color.bgSecondary)
    }

    private func filterChip(_ label: String, status: TaskStatus?, count: Int) -> some View {
        let isActive = viewModel.statusFilter == status
        return Button {
            withAnimation {
                viewModel.statusFilter = status
            }
        } label: {
            HStack(spacing: 4) {
                Text(label)
                    .font(.caption.weight(.medium))
                if count > 0 {
                    Text("\(count)")
                        .font(.caption2)
                }
            }
            .padding(.horizontal, 12)
            .padding(.vertical, 6)
            .background(isActive ? Color.accentBlue : Color.bgTertiary)
            .foregroundStyle(isActive ? .white : .textSecondary)
            .clipShape(Capsule())
        }
    }

    // MARK: - Task List

    private var taskList: some View {
        List {
            ForEach(viewModel.filteredTasks) { task in
                NavigationLink {
                    TaskDetailView(taskId: task.id)
                } label: {
                    TaskRow(task: task, timeAgo: viewModel.timeAgo(from: task.updatedAt))
                }
                .swipeActions(edge: .trailing) {
                    if task.status != .done {
                        Button {
                            Task { await viewModel.updateStatus(taskId: task.id, status: .done) }
                        } label: {
                            Label("Done", systemImage: "checkmark")
                        }
                        .tint(.statusSuccess)
                    }

                    Button(role: .destructive) {
                        Task { await viewModel.deleteTask(id: task.id) }
                    } label: {
                        Label("Delete", systemImage: "trash")
                    }
                }
                .swipeActions(edge: .leading) {
                    if task.status == .pending {
                        Button {
                            Task { await viewModel.updateStatus(taskId: task.id, status: .running) }
                        } label: {
                            Label("Start", systemImage: "play")
                        }
                        .tint(.accentBlue)
                    }
                }
            }
        }
        .listStyle(.insetGrouped)
    }

    // MARK: - Create Sheet

    private var createTaskSheet: some View {
        NavigationStack {
            Form {
                Section("Task") {
                    TextField("Title", text: $viewModel.newTaskTitle)
                    TextField("Description (optional)", text: $viewModel.newTaskDescription, axis: .vertical)
                        .lineLimit(3...6)
                }
            }
            .navigationTitle("New Task")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") {
                        viewModel.showCreateSheet = false
                    }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Create") {
                        Task { await viewModel.createTask() }
                    }
                    .disabled(viewModel.newTaskTitle.trimmingCharacters(in: .whitespaces).isEmpty)
                }
            }
        }
        .presentationDetents([.medium])
    }

    // MARK: - Empty / Loading

    private var loadingView: some View {
        VStack(spacing: 16) {
            ProgressView()
                .tint(.accentBlue)
            Text("Loading tasks...")
                .foregroundStyle(.textSecondary)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }

    private var emptyView: some View {
        VStack(spacing: 16) {
            Image(systemName: "checklist")
                .font(.system(size: 48))
                .foregroundStyle(.textSecondary)

            Text("No tasks")
                .font(.headline)
                .foregroundStyle(.textPrimary)

            Text("Create a task to get started")
                .font(.subheadline)
                .foregroundStyle(.textSecondary)

            Button("Create Task") {
                viewModel.showCreateSheet = true
            }
            .buttonStyle(.bordered)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }
}

// MARK: - Task Row

struct TaskRow: View {
    let task: ClauditTask
    let timeAgo: String

    var body: some View {
        HStack(spacing: 12) {
            StatusBadge(status: task.status)

            VStack(alignment: .leading, spacing: 4) {
                Text(task.title)
                    .font(.subheadline.weight(.medium))
                    .foregroundStyle(.textPrimary)
                    .lineLimit(2)

                if let desc = task.description, !desc.isEmpty {
                    Text(desc)
                        .font(.caption)
                        .foregroundStyle(.textSecondary)
                        .lineLimit(1)
                }
            }

            Spacer()

            VStack(alignment: .trailing, spacing: 4) {
                Text(timeAgo)
                    .font(.caption2)
                    .foregroundStyle(.textSecondary)

                if let assignee = task.assignee {
                    Text(assignee)
                        .font(.caption2)
                        .padding(.horizontal, 6)
                        .padding(.vertical, 2)
                        .background(Color.bgTertiary)
                        .clipShape(Capsule())
                        .foregroundStyle(.textSecondary)
                }
            }
        }
        .padding(.vertical, 4)
    }
}

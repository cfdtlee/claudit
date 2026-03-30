import SwiftUI

struct SessionDetailView: View {
    @Environment(AppState.self) private var appState
    @State private var viewModel = SessionViewModel()
    @State private var showTerminal = false
    @State private var messageText = ""
    @State private var keyboardVisible = false
    @State private var isSending = false
    @State private var sendStatus: String?

    let projectHash: String
    let sessionId: String
    let slug: String?
    let slugPartCount: Int?

    var body: some View {
        Group {
            if viewModel.isLoadingDetail {
                ProgressView("Loading conversation...")
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
            } else if let detail = viewModel.selectedDetail {
                conversationView(detail)
            } else if let error = viewModel.errorMessage {
                errorView(error)
            } else {
                // Fallback: auto-retry loading
                ProgressView("Connecting...")
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
                    .onAppear {
                        viewModel.setClient(appState.apiClient)
                        loadConversation()
                    }
            }
        }
        .background(Color.bgPrimary)
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .principal) {
                VStack(spacing: 2) {
                    Text(slug ?? String(sessionId.prefix(8)))
                        .font(.subheadline.bold())
                        .foregroundStyle(.textPrimary)
                    if let count = slugPartCount, count > 1 {
                        Text("\(count) sessions merged")
                            .font(.caption2)
                            .foregroundStyle(.textSecondary)
                    }
                }
            }

            ToolbarItem(placement: .topBarTrailing) {
                Button {
                    showTerminal.toggle()
                } label: {
                    Image(systemName: "terminal")
                }
            }
        }
        .sheet(isPresented: $showTerminal) {
            NavigationStack {
                TerminalView(sessionId: sessionId, projectPath: viewModel.selectedDetail?.projectPath ?? "")
                    .environment(appState)
                    .navigationTitle("Terminal")
                    .navigationBarTitleDisplayMode(.inline)
                    .toolbar {
                        ToolbarItem(placement: .topBarTrailing) {
                            Button("Done") {
                                showTerminal = false
                            }
                        }
                    }
            }
        }
        .toolbar(.hidden, for: .tabBar)
        .onAppear {
            viewModel.setClient(appState.apiClient)
            loadConversation()

            // Listen for real-time session updates via WebSocket events
            appState.tunnel?.onEvent = { [self] eventJSON in
                if eventJSON.contains("session:updated") || eventJSON.contains("session:created") {
                    handleSessionEvent()
                }
            }
        }
        .onReceive(NotificationCenter.default.publisher(for: UIResponder.keyboardWillShowNotification)) { _ in
            keyboardVisible = true
        }
        .onReceive(NotificationCenter.default.publisher(for: UIResponder.keyboardWillHideNotification)) { _ in
            keyboardVisible = false
        }
    }

    // MARK: - Conversation View

    private func conversationView(_ detail: SessionDetail) -> some View {
        VStack(spacing: 0) {
            ScrollViewReader { proxy in
                ScrollView {
                    LazyVStack(spacing: 12) {
                        ForEach(detail.messages) { message in
                            MessageBubble(message: message)
                                .id(message.id)
                        }
                    }
                    .padding()
                }
                .scrollDismissesKeyboard(.interactively)
                .onAppear {
                    if let last = detail.messages.last {
                        proxy.scrollTo(last.id, anchor: .bottom)
                    }
                }
                .onChange(of: keyboardVisible) {
                    if keyboardVisible, let last = detail.messages.last {
                        withAnimation(.easeOut(duration: 0.2)) {
                            proxy.scrollTo(last.id, anchor: .bottom)
                        }
                    }
                }
            }

            Divider()

            // Message input
            HStack(spacing: 8) {
                TextField("Send a message...", text: $messageText, axis: .vertical)
                    .textFieldStyle(.plain)
                    .lineLimit(1...5)
                    .padding(.horizontal, 12)
                    .padding(.vertical, 8)
                    .background(Color.bgSecondary)
                    .clipShape(RoundedRectangle(cornerRadius: 16))

                if isSending {
                    ProgressView()
                        .frame(width: 28, height: 28)
                } else {
                    Button {
                        sendMessage()
                    } label: {
                        Image(systemName: "arrow.up.circle.fill")
                            .font(.title2)
                            .foregroundStyle(messageText.isEmpty ? .textSecondary : .accentBlue)
                    }
                    .disabled(messageText.isEmpty)
                }
            }
            .padding(.horizontal, 12)
            .padding(.vertical, 8)
            .background(Color.bgPrimary)

            if let status = sendStatus {
                Text(status)
                    .font(.caption)
                    .foregroundStyle(.textSecondary)
                    .padding(.horizontal)
                    .padding(.bottom, 4)
            }
        }
    }

    private func errorView(_ error: String) -> some View {
        VStack(spacing: 16) {
            Image(systemName: "exclamationmark.triangle")
                .font(.system(size: 40))
                .foregroundStyle(.statusError)

            Text("Failed to load session")
                .font(.headline)
                .foregroundStyle(.textPrimary)

            Text(error)
                .font(.caption)
                .foregroundStyle(.textSecondary)
                .multilineTextAlignment(.center)
                .padding(.horizontal)

            Button("Retry") {
                loadConversation()
            }
            .buttonStyle(.bordered)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }

    // MARK: - Send

    private func sendMessage() {
        let text = messageText.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !text.isEmpty, let tunnel = appState.tunnel else { return }

        isSending = true
        sendStatus = "Resuming session..."
        let savedText = text
        messageText = ""

        Task {
            do {
                // IMPORTANT: Prepare listener BEFORE sending resume (fixes race condition)
                tunnel.prepareForReady()

                let projectPath = viewModel.selectedDetail?.projectPath ?? ""
                let resume = "{\"type\":\"resume\",\"sessionId\":\"\(sessionId)\",\"projectPath\":\"\(projectPath)\",\"cols\":80,\"rows\":24}"
                try tunnel.sendTerminalControl(resume)

                sendStatus = "Waiting for session..."
                let ready = await tunnel.waitForReady(timeout: 15)

                if !ready {
                    sendStatus = "Session not available. Try opening Terminal."
                    try? await Task.sleep(for: .seconds(3))
                    isSending = false
                    sendStatus = nil
                    return
                }

                // PTY is ready — send the message
                sendStatus = "Sending to Claude..."
                try tunnel.sendTerminalInput(savedText + "\r")
                sendStatus = "Waiting for response..."

                // The event listener will auto-refresh when session:updated fires
            } catch {
                sendStatus = "Error: \(error.localizedDescription)"
                try? await Task.sleep(for: .seconds(3))
                isSending = false
                sendStatus = nil
            }
        }
    }

    /// Called when a session:updated event is received
    private func handleSessionEvent() {
        loadConversation()
        isSending = false
        sendStatus = nil
    }

    // MARK: - Load

    private func loadConversation() {
        Task {
            if let slug, let count = slugPartCount, count > 1 {
                await viewModel.loadMergedSession(
                    projectHash: projectHash,
                    slug: slug
                )
            } else {
                await viewModel.loadSessionDetail(
                    projectHash: projectHash,
                    sessionId: sessionId
                )
            }
        }
    }
}

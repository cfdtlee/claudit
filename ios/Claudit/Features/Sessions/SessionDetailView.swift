import SwiftUI

struct SessionDetailView: View {
    @Environment(AppState.self) private var appState
    @State private var viewModel = SessionViewModel()
    @State private var showTerminal = false
    @State private var messageText = ""
    @State private var keyboardVisible = false
    @State private var isSending = false
    @State private var sendStatus: String?
    @State private var reloadWorkItem: DispatchWorkItem?
    @State private var pendingUserMessage: String?
    @State private var chatResumed = false

    let projectHash: String
    let sessionId: String
    let slug: String?
    let slugPartCount: Int?

    // Stable ID for the pending/typing indicators at the bottom
    private let pendingMessageId = "__pending__"
    private let typingIndicatorId = "__typing__"
    private let bottomAnchorId = "__bottom__"

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
                Button { showTerminal.toggle() } label: {
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
                            Button("Done") { showTerminal = false }
                        }
                    }
            }
        }
        .toolbar(.hidden, for: .tabBar)
        .onAppear {
            viewModel.setClient(appState.apiClient)
            loadConversation()
            setupTerminalDataListener()
            startWatchingSession()
        }
        .onDisappear {
            appState.tunnel?.onTerminalDataSecondary = nil
            appState.tunnel?.onSessionChanged = nil
            reloadWorkItem?.cancel()
            stopWatchingSession()
        }
        .onReceive(NotificationCenter.default.publisher(for: UIResponder.keyboardWillShowNotification)) { _ in
            if !keyboardVisible {
                keyboardVisible = true
            }
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
                        if detail.messages.count > 200 {
                            Text("Showing last 200 of \(detail.messages.count) messages")
                                .font(.caption)
                                .foregroundStyle(.textSecondary)
                                .padding(.bottom, 8)
                        }
                        ForEach(detail.recentMessages) { message in
                            MessageBubble(message: message)
                                .id(message.id)
                        }

                        // Show the user's sent message immediately
                        if let pending = pendingUserMessage {
                            pendingMessageBubble(pending)
                                .id(pendingMessageId)
                        }

                        // Show typing indicator while waiting for response
                        if isSending && pendingUserMessage != nil {
                            typingIndicator
                                .id(typingIndicatorId)
                        }

                        // Invisible anchor at the very bottom
                        Color.clear.frame(height: 1).id(bottomAnchorId)
                    }
                    .padding()
                }
                .scrollDismissesKeyboard(.interactively)
                .onAppear {
                    // Delay to let LazyVStack finish layout before scrolling
                    DispatchQueue.main.asyncAfter(deadline: .now() + 0.1) {
                        scrollToBottom(proxy)
                    }
                }
                .onChange(of: viewModel.selectedDetail?.messages.count) {
                    scrollToBottom(proxy)
                }
                .onChange(of: pendingUserMessage) {
                    scrollToBottom(proxy)
                }
                .onChange(of: keyboardVisible) {
                    if keyboardVisible {
                        proxy.scrollTo(bottomAnchorId, anchor: .bottom)
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
                    Button { sendMessage() } label: {
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

    // MARK: - Pending Message Bubble

    private func pendingMessageBubble(_ text: String) -> some View {
        HStack(alignment: .top) {
            Spacer(minLength: 60)
            VStack(alignment: .trailing, spacing: 6) {
                HStack(spacing: 4) {
                    Image(systemName: "person.fill")
                        .font(.caption2)
                    Text("You")
                        .font(.caption2.weight(.medium))
                }
                .foregroundStyle(.textSecondary)

                Text(text)
                    .font(.subheadline)
                    .foregroundStyle(.textPrimary)
            }
            .padding(12)
            .background(Color.accentBlue.opacity(0.2))
            .clipShape(RoundedRectangle(cornerRadius: 12))
        }
    }

    // MARK: - Typing Indicator

    private var typingIndicator: some View {
        HStack(alignment: .top) {
            VStack(alignment: .leading, spacing: 6) {
                HStack(spacing: 4) {
                    Image(systemName: "cpu")
                        .font(.caption2)
                    Text("Assistant")
                        .font(.caption2.weight(.medium))
                }
                .foregroundStyle(.textSecondary)

                TypingDots()
            }
            .padding(12)
            .background(Color.bgSecondary)
            .clipShape(RoundedRectangle(cornerRadius: 12))

            Spacer(minLength: 20)
        }
    }

    // MARK: - Scroll

    private func scrollToBottom(_ proxy: ScrollViewProxy) {
        proxy.scrollTo(bottomAnchorId, anchor: .bottom)
    }

    // MARK: - Error View

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
            Button("Retry") { loadConversation() }
                .buttonStyle(.bordered)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }

    // MARK: - Send (via PTY)

    private func sendMessage() {
        let text = messageText.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !text.isEmpty, let tunnel = appState.tunnel else { return }

        pendingUserMessage = text
        isSending = true
        sendStatus = nil
        messageText = ""

        Task {
            do {
                // Resume PTY if not yet active
                if !chatResumed {
                    chatResumed = true
                    tunnel.prepareForReady()
                    let projectPath = viewModel.selectedDetail?.projectPath ?? ""
                    let resume = "{\"type\":\"resume\",\"sessionId\":\"\(sessionId)\",\"projectPath\":\"\(projectPath)\",\"cols\":80,\"rows\":24}"
                    try tunnel.sendTerminalControl(resume)

                    let ready = await tunnel.waitForReady(timeout: 15)
                    if !ready {
                        sendStatus = "Session not available"
                        isSending = false
                        pendingUserMessage = nil
                        chatResumed = false
                        return
                    }
                }

                // Send message via PTY terminal-input
                try tunnel.sendTerminalInput(text + "\r")
                // JSONL watcher will detect the response and trigger reload
            } catch {
                sendStatus = "Error: \(error.localizedDescription)"
                isSending = false
                pendingUserMessage = nil
            }
        }
    }

    // MARK: - JSONL Watcher

    private func startWatchingSession() {
        guard let tunnel = appState.tunnel else { return }

        // Tell server to watch this session's JSONL file
        let projectHash = self.projectHash
        let sessionId = self.sessionId
        try? tunnel.watchSession(projectHash: projectHash, sessionId: sessionId, start: true)

        // When JSONL changes, reload conversation
        tunnel.onSessionChanged = { ph, sid in
            guard ph == projectHash && sid == sessionId else { return }

            Task { @MainActor in
                if let slug, let count = slugPartCount, count > 1 {
                    await viewModel.loadMergedSession(projectHash: ph, slug: slug)
                } else {
                    await viewModel.loadSessionDetail(projectHash: ph, sessionId: sid)
                }

                // Only clear pending UI when the LAST message is an assistant response
                // (not when Claude writes the user message echo to JSONL)
                if isSending,
                   let lastMsg = viewModel.selectedDetail?.messages.last,
                   lastMsg.role == .assistant {
                    isSending = false
                    sendStatus = nil
                    pendingUserMessage = nil
                }
            }
        }
    }

    private func stopWatchingSession() {
        try? appState.tunnel?.watchSession(projectHash: projectHash, sessionId: sessionId, start: false)
    }

    // MARK: - Terminal Data Listener

    private func setupTerminalDataListener() {
        // Terminal data listener only refreshes conversation (for terminal→chat sync)
        // Does NOT clear isSending — that's handled by JSONL watcher's onSessionChanged
        appState.tunnel?.onTerminalDataSecondary = { _ in
            reloadWorkItem?.cancel()
            let item = DispatchWorkItem {
                loadConversation()
            }
            reloadWorkItem = item
            DispatchQueue.main.asyncAfter(deadline: .now() + 2, execute: item)
        }
    }

    // MARK: - Load

    private func loadConversation() {
        Task {
            if let slug, let count = slugPartCount, count > 1 {
                await viewModel.loadMergedSession(projectHash: projectHash, slug: slug)
            } else {
                await viewModel.loadSessionDetail(projectHash: projectHash, sessionId: sessionId)
            }
        }
    }
}

// MARK: - Typing Dots Animation

struct TypingDots: View {
    @State private var phase = 0

    var body: some View {
        HStack(spacing: 4) {
            ForEach(0..<3) { i in
                Circle()
                    .fill(Color.textSecondary)
                    .frame(width: 6, height: 6)
                    .opacity(phase == i ? 1.0 : 0.3)
            }
        }
        .onAppear {
            Timer.scheduledTimer(withTimeInterval: 0.4, repeats: true) { _ in
                withAnimation(.easeInOut(duration: 0.2)) {
                    phase = (phase + 1) % 3
                }
            }
        }
    }
}

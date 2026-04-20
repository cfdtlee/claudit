import SwiftUI

struct SessionDetailView: View {
    @Environment(AppState.self) private var appState
    @Environment(\.dismiss) private var dismiss
    @State private var viewModel = SessionViewModel()
    @State private var isTerminalMode = false
    @State private var messageText = ""
    @State private var keyboardVisible = false
    @State private var isSending = false
    @State private var sendStatus: String?
    @State private var reloadWorkItem: DispatchWorkItem?
    @State private var pendingUserMessage: String?
    @State private var chatResumed = false
    @State private var sessionLocked = false
    @State private var showScrollToBottom = false

    let projectHash: String
    let sessionId: String
    let slug: String?
    let slugPartCount: Int?

    // Stable ID for the pending/typing indicators at the bottom
    private let pendingMessageId = "__pending__"
    private let typingIndicatorId = "__typing__"
    private let bottomAnchorId = "__bottom__"

    var body: some View {
        ZStack {
            // Chat layer
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
            .opacity(isTerminalMode ? 0 : 1)

            // Terminal layer (always in memory)
            TerminalView(sessionId: sessionId, projectPath: viewModel.selectedDetail?.projectPath ?? "")
                .environment(appState)
                .opacity(isTerminalMode ? 1 : 0)
        }
        .background(Color.bgPrimary)
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .principal) {
                LiquidGlassSwitch(isOn: Binding(
                    get: { isTerminalMode },
                    set: { newValue in
                        if newValue && sessionLocked {
                            sendStatus = "Session in use by another process"
                            DispatchQueue.main.asyncAfter(deadline: .now() + 2) { sendStatus = nil }
                        } else {
                            isTerminalMode = newValue
                        }
                    }
                ))
            }
        }
        .toolbar(.hidden, for: .tabBar)
        .navigationBarBackButtonHidden(true)
        .toolbar {
            ToolbarItem(placement: .topBarLeading) {
                Button { dismiss() } label: {
                    Image(systemName: "chevron.left")
                        .font(.system(size: 16, weight: .semibold))
                        .foregroundStyle(.white)
                }
            }
        }
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
                                .transition(.opacity.combined(with: .move(edge: .bottom)))
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
                    .animation(.spring(response: 0.3, dampingFraction: 0.8), value: detail.recentMessages.count)
                }
                .scrollDismissesKeyboard(.interactively)
                .onAppear {
                    // Delay to let LazyVStack finish layout before scrolling
                    DispatchQueue.main.asyncAfter(deadline: .now() + 0.1) {
                        scrollToBottom(proxy)
                        showScrollToBottom = false
                    }
                }
                .onChange(of: viewModel.selectedDetail?.messages.count) {
                    scrollToBottom(proxy)
                    showScrollToBottom = false
                }
                .onChange(of: pendingUserMessage) {
                    scrollToBottom(proxy)
                    showScrollToBottom = false
                }
                .onChange(of: keyboardVisible) {
                    if keyboardVisible {
                        proxy.scrollTo(bottomAnchorId, anchor: .bottom)
                        showScrollToBottom = false
                    }
                }
                .overlay(alignment: .bottomTrailing) {
                    if showScrollToBottom && !isTerminalMode && !detail.messages.isEmpty {
                        Button {
                            withAnimation {
                                proxy.scrollTo(bottomAnchorId, anchor: .bottom)
                                showScrollToBottom = false
                            }
                        } label: {
                            Image(systemName: "chevron.down")
                                .font(.system(size: 14, weight: .semibold))
                                .foregroundStyle(.textPrimary)
                                .frame(width: 36, height: 36)
                                .background(Color.bgSecondary)
                                .clipShape(Circle())
                                .shadow(color: .black.opacity(0.3), radius: 4, y: 2)
                        }
                        .padding(.trailing, 16)
                        .padding(.bottom, 8)
                        .transition(.opacity.combined(with: .scale))
                    }
                }
                .onScrollGeometryChange(for: Bool.self) { geometry in
                    let distanceFromBottom = geometry.contentSize.height - geometry.contentOffset.y - geometry.containerSize.height
                    return distanceFromBottom > 200
                } action: { _, isScrolledUp in
                    withAnimation(.easeInOut(duration: 0.2)) {
                        showScrollToBottom = isScrolledUp
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

        // Check if session is locked
        if sessionLocked {
            sendStatus = "Session in use by another process"
            DispatchQueue.main.asyncAfter(deadline: .now() + 2) { sendStatus = nil }
            return
        }

        pendingUserMessage = text
        isSending = true
        sendStatus = nil
        messageText = ""
        UIImpactFeedbackGenerator(style: .light).impactOccurred()

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
                        sendStatus = "Session in use by another process"
                        sessionLocked = true
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
                    UINotificationFeedbackGenerator().notificationOccurred(.success)
                }
            }
        }
    }

    private func stopWatchingSession() {
        try? appState.tunnel?.watchSession(projectHash: projectHash, sessionId: sessionId, start: false)
    }

    // MARK: - Terminal Data Listener

    private func setupTerminalDataListener() {
        appState.tunnel?.onTerminalDataSecondary = { data in
            // Detect session lock from terminal output
            if let text = String(data: data, encoding: .utf8),
               text.contains("No conversation found") || text.contains("session is in use") {
                sessionLocked = true
            }

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

// MARK: - Liquid Glass Switch

struct LiquidGlassSwitch: View {
    @Binding var isOn: Bool
    @State private var dragX: CGFloat = 0
    @State private var isDragging = false

    private let trackWidth: CGFloat = 75
    private let trackHeight: CGFloat = 30
    private let thumbRest: CGFloat = 26
    private let thumbDrag: CGFloat = 32

    // Thumb resting positions (center offsets)
    private var leftX: CGFloat { -(trackWidth / 2 - thumbRest / 2 - 2) }
    private var rightX: CGFloat { trackWidth / 2 - thumbRest / 2 - 2 }
    private var restX: CGFloat { isOn ? rightX : leftX }

    // Clamped thumb position during drag
    private var thumbX: CGFloat {
        if isDragging {
            return min(max(restX + dragX, leftX), rightX)
        }
        return restX
    }

    private var thumbDiameter: CGFloat {
        isDragging ? thumbDrag : thumbRest
    }

    // Determine which side the thumb is visually closer to
    private var showingCLI: Bool {
        if isDragging {
            return thumbX > 0
        }
        return isOn
    }

    var body: some View {
        ZStack {
            // Track
            Capsule()
                .fill(Color.black.opacity(0.55))
                .overlay(
                    Capsule()
                        .stroke(
                            LinearGradient(
                                colors: [.white.opacity(0.18), .white.opacity(0.04)],
                                startPoint: .top,
                                endPoint: .bottom
                            ),
                            lineWidth: 0.5
                        )
                )
                .shadow(color: .black.opacity(0.4), radius: 6, y: 3)

            // Label — centered in the space opposite to the thumb
            Text(showingCLI ? "CLI" : "Chat")
                .font(.caption2.weight(.semibold))
                .foregroundStyle(.white.opacity(0.55))
                .frame(width: trackWidth - thumbRest - 4, height: trackHeight)
                .offset(x: showingCLI ? -(thumbRest / 2 + 2) : (thumbRest / 2 + 2))

            // Thumb — glass circle
            Circle()
                .fill(
                    RadialGradient(
                        colors: [.white.opacity(0.3), .white.opacity(0.06)],
                        center: .topLeading,
                        startRadius: 0,
                        endRadius: thumbDiameter
                    )
                )
                .overlay(
                    Circle()
                        .stroke(
                            LinearGradient(
                                colors: [.white.opacity(0.45), .white.opacity(0.08)],
                                startPoint: .topLeading,
                                endPoint: .bottomTrailing
                            ),
                            lineWidth: 0.8
                        )
                )
                .shadow(color: .white.opacity(0.12), radius: isDragging ? 12 : 6)
                .shadow(color: .black.opacity(0.35), radius: 4, y: 2)
                .frame(width: thumbDiameter, height: thumbDiameter)
                .overlay(
                    // Icon inside thumb — matches current mode
                    Group {
                        if showingCLI {
                            Image(systemName: "terminal.fill")
                                .font(.system(size: 10, weight: .medium))
                        } else {
                            Image(systemName: "bubble.left.fill")
                                .font(.system(size: 10, weight: .medium))
                        }
                    }
                    .foregroundStyle(.white.opacity(0.9))
                )
                .offset(x: thumbX)
                .animation(.spring(response: isDragging ? 0.1 : 0.4, dampingFraction: isDragging ? 1 : 0.65), value: thumbX)
                .animation(.spring(response: 0.25, dampingFraction: 0.7), value: thumbDiameter)
        }
        .frame(width: trackWidth, height: max(trackHeight, thumbDrag + 4))
        .contentShape(Capsule())
        .onTapGesture {
            withAnimation(.spring(response: 0.4, dampingFraction: 0.65)) {
                isOn.toggle()
            }
        }
        .highPriorityGesture(
            DragGesture(minimumDistance: 5)
                .onChanged { value in
                    isDragging = true
                    dragX = value.translation.width
                }
                .onEnded { value in
                    isDragging = false
                    let finalX = restX + value.translation.width
                    let switchThreshold: CGFloat = 0
                    isOn = finalX > switchThreshold
                    dragX = 0
                }
        )
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

import SwiftUI

struct TerminalView: View {
    @Environment(AppState.self) private var appState
    @State private var viewModel: TerminalViewModel

    let projectPath: String

    init(sessionId: String, projectPath: String = "") {
        self.projectPath = projectPath
        _viewModel = State(initialValue: TerminalViewModel(sessionId: sessionId, projectPath: projectPath))
    }

    var body: some View {
        VStack(spacing: 0) {
            // Terminal output
            ScrollViewReader { proxy in
                ScrollView {
                    LazyVStack(alignment: .leading, spacing: 0) {
                        ForEach(viewModel.lines) { line in
                            HStack(spacing: 0) {
                                ForEach(line.segments) { segment in
                                    Text(segment.text)
                                        .foregroundStyle(segment.foreground)
                                        .fontWeight(segment.bold ? .bold : .regular)
                                }
                            }
                            .id(line.id)
                        }
                    }
                    .padding(8)
                    .frame(maxWidth: .infinity, alignment: .leading)
                }
                .font(.system(.caption, design: .monospaced))
                .background(Color.black)
                .onChange(of: viewModel.lines.count) {
                    if let last = viewModel.lines.last {
                        withAnimation(.easeOut(duration: 0.1)) {
                            proxy.scrollTo(last.id, anchor: .bottom)
                        }
                    }
                }
            }

            Divider()

            // Input bar
            HStack(spacing: 8) {
                Text("$")
                    .font(.system(.body, design: .monospaced))
                    .foregroundStyle(.terminalGreen)

                TextField("Command...", text: $viewModel.inputText)
                    .font(.system(.body, design: .monospaced))
                    .textInputAutocapitalization(.never)
                    .autocorrectionDisabled()
                    .submitLabel(.send)
                    .onSubmit {
                        viewModel.sendInput()
                    }

                // Quick keys
                HStack(spacing: 4) {
                    quickKeyButton("Tab", key: "\t")
                    quickKeyButton("^C", key: "\u{03}")
                    quickKeyButton("^D", key: "\u{04}")
                }
            }
            .padding(.horizontal, 12)
            .padding(.vertical, 8)
            .background(Color.bgSecondary)
        }
        .onAppear {
            viewModel.setTunnel(appState.tunnel)
            if viewModel.lines.isEmpty {
                viewModel.appendOutput("Connected to session \(viewModel.sessionId.prefix(8))...\n")
            }
        }
    }

    private func quickKeyButton(_ label: String, key: String) -> some View {
        Button(label) {
            viewModel.sendKeypress(key)
        }
        .font(.system(.caption2, design: .monospaced))
        .padding(.horizontal, 8)
        .padding(.vertical, 4)
        .background(Color.bgTertiary)
        .clipShape(RoundedRectangle(cornerRadius: 4))
        .foregroundStyle(.textSecondary)
    }
}

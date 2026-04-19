import SwiftUI
import SwiftTerm

/// Terminal view using SwiftTerm for proper xterm-256color rendering.
struct TerminalView: View {
    @Environment(AppState.self) private var appState
    let sessionId: String
    let projectPath: String

    var body: some View {
        SwiftTermWrapper(
            tunnel: appState.tunnel,
            sessionId: sessionId,
            projectPath: projectPath
        )
        // Don't ignore keyboard safe area — let SwiftUI push terminal up when keyboard appears
        .background(Color.black)
    }
}

/// UIViewRepresentable wrapper for SwiftTerm's TerminalView.
struct SwiftTermWrapper: UIViewRepresentable {
    let tunnel: TunnelProtocol?
    let sessionId: String
    let projectPath: String

    func makeCoordinator() -> Coordinator {
        Coordinator(tunnel: tunnel, sessionId: sessionId, projectPath: projectPath)
    }

    func makeUIView(context: Context) -> SwiftTerm.TerminalView {
        let tv = SwiftTerm.TerminalView(frame: .zero)
        tv.backgroundColor = .black
        tv.nativeForegroundColor = .init(red: 0.9, green: 0.9, blue: 0.9, alpha: 1)
        tv.nativeBackgroundColor = .black
        tv.terminalDelegate = context.coordinator
        context.coordinator.terminalView = tv

        // Feed terminal data from relay
        tunnel?.onTerminalData = { [weak tv] data in
            guard let tv else { return }
            let slice = ArraySlice<UInt8>(data)
            DispatchQueue.main.async {
                tv.feed(byteArray: slice)
            }
        }

        return tv
    }

    func updateUIView(_ uiView: SwiftTerm.TerminalView, context: Context) {
        // After layout, SwiftTerm knows its real size. Resume once.
        if !context.coordinator.hasResumed && uiView.frame.width > 0 {
            context.coordinator.hasResumed = true

            // Get cols/rows from SwiftTerm's actual terminal dimensions
            let cols = uiView.getTerminal().cols
            let rows = uiView.getTerminal().rows
            print("[Terminal] Resuming with \(cols)x\(rows) (frame: \(uiView.frame.size))")

            tunnel?.prepareForReady()
            let resume = "{\"type\":\"resume\",\"sessionId\":\"\(sessionId)\",\"projectPath\":\"\(projectPath)\",\"cols\":\(cols),\"rows\":\(rows)}"
            try? tunnel?.sendTerminalControl(resume)
        }
    }

    class Coordinator: NSObject, TerminalViewDelegate {
        weak var terminalView: SwiftTerm.TerminalView?
        let tunnel: TunnelProtocol?
        let sessionId: String
        let projectPath: String
        var hasResumed = false

        init(tunnel: TunnelProtocol?, sessionId: String, projectPath: String) {
            self.tunnel = tunnel
            self.sessionId = sessionId
            self.projectPath = projectPath
        }

        func send(source: SwiftTerm.TerminalView, data: ArraySlice<UInt8>) {
            let str = String(bytes: data, encoding: .utf8) ?? ""
            try? tunnel?.sendTerminalInput(str)
        }

        func scrolled(source: SwiftTerm.TerminalView, position: Double) {}
        func setTerminalTitle(source: SwiftTerm.TerminalView, title: String) {}
        func sizeChanged(source: SwiftTerm.TerminalView, newCols: Int, newRows: Int) {
            // Only send resize after initial resume
            guard hasResumed else { return }
            let resize = "{\"type\":\"resize\",\"cols\":\(newCols),\"rows\":\(newRows)}"
            try? tunnel?.sendTerminalControl(resize)
        }
        func hostCurrentDirectoryUpdate(source: SwiftTerm.TerminalView, directory: String?) {}
        func requestOpenLink(source: SwiftTerm.TerminalView, link: String, params: [String: String]) {
            if let url = URL(string: link) {
                UIApplication.shared.open(url)
            }
        }
        func bell(source: SwiftTerm.TerminalView) {}
        func clipboardCopy(source: SwiftTerm.TerminalView, content: Data) {
            UIPasteboard.general.setData(content, forPasteboardType: "public.utf8-plain-text")
        }
        func clipboardRead(source: SwiftTerm.TerminalView) -> Data? { nil }
        func iTermContent(source: SwiftTerm.TerminalView, content: ArraySlice<UInt8>) {}
        func rangeChanged(source: SwiftTerm.TerminalView, startY: Int, endY: Int) {}
    }
}

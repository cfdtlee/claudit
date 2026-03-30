import SwiftUI

struct MessageBubble: View {
    let message: ParsedMessage
    @State private var expandedThinking = false
    @State private var expandedTools: Set<String> = []

    var body: some View {
        HStack(alignment: .top) {
            if message.role == .user {
                Spacer(minLength: 60)
            }

            VStack(alignment: message.role == .user ? .trailing : .leading, spacing: 6) {
                // Role label
                HStack(spacing: 4) {
                    Image(systemName: message.role == .user ? "person.fill" : "cpu")
                        .font(.caption2)
                    Text(message.role == .user ? "You" : "Assistant")
                        .font(.caption2.weight(.medium))

                    if let model = message.model {
                        Text("(\(shortModelName(model)))")
                            .font(.caption2)
                            .foregroundStyle(.textSecondary)
                    }
                }
                .foregroundStyle(.textSecondary)

                // Content blocks
                ForEach(Array(message.content.enumerated()), id: \.offset) { index, block in
                    contentBlockView(block, index: index)
                }
            }
            .padding(12)
            .background(bubbleBackground)
            .clipShape(RoundedRectangle(cornerRadius: 12))

            if message.role == .assistant {
                Spacer(minLength: 20)
            }
        }
    }

    // MARK: - Content Block Rendering

    @ViewBuilder
    private func contentBlockView(_ block: ContentBlock, index: Int) -> some View {
        switch block.type {
        case .text:
            if let text = block.text, !text.isEmpty {
                MarkdownRenderer(text: text)
            }

        case .thinking:
            thinkingBlock(block.thinking ?? "")

        case .toolUse:
            toolUseBlock(block, index: index)

        case .toolResult:
            toolResultBlock(block)
        }
    }

    private func thinkingBlock(_ text: String) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            Button {
                withAnimation { expandedThinking.toggle() }
            } label: {
                HStack(spacing: 4) {
                    Image(systemName: expandedThinking ? "chevron.down" : "chevron.right")
                        .font(.caption2)
                    Image(systemName: "brain")
                        .font(.caption)
                    Text("Thinking")
                        .font(.caption.weight(.medium))
                    Spacer()
                }
                .foregroundStyle(.textSecondary)
            }
            .buttonStyle(.plain)

            if expandedThinking {
                Text(text)
                    .font(.caption)
                    .foregroundStyle(.textSecondary)
                    .padding(8)
                    .background(Color.bgPrimary.opacity(0.5))
                    .clipShape(RoundedRectangle(cornerRadius: 6))
            }
        }
    }

    private func toolUseBlock(_ block: ContentBlock, index: Int) -> some View {
        let toolId = "\(index)"
        let isExpanded = expandedTools.contains(toolId)

        return VStack(alignment: .leading, spacing: 4) {
            Button {
                withAnimation {
                    if isExpanded {
                        expandedTools.remove(toolId)
                    } else {
                        expandedTools.insert(toolId)
                    }
                }
            } label: {
                HStack(spacing: 4) {
                    Image(systemName: isExpanded ? "chevron.down" : "chevron.right")
                        .font(.caption2)
                    Image(systemName: toolIcon(block.name ?? ""))
                        .font(.caption)
                    Text(block.name ?? "Tool")
                        .font(.caption.weight(.medium))
                    Spacer()
                }
                .foregroundStyle(.accentBlue)
            }
            .buttonStyle(.plain)

            if isExpanded, let input = block.input {
                VStack(alignment: .leading, spacing: 2) {
                    ForEach(Array(input.keys.sorted()), id: \.self) { key in
                        HStack(alignment: .top, spacing: 4) {
                            Text("\(key):")
                                .font(.system(.caption2, design: .monospaced))
                                .foregroundStyle(.textSecondary)
                            Text("\(String(describing: input[key]?.value ?? ""))")
                                .font(.system(.caption2, design: .monospaced))
                                .foregroundStyle(.textPrimary)
                                .lineLimit(5)
                        }
                    }
                }
                .padding(8)
                .background(Color.bgPrimary.opacity(0.5))
                .clipShape(RoundedRectangle(cornerRadius: 6))
            }
        }
    }

    private func toolResultBlock(_ block: ContentBlock) -> some View {
        Group {
            if let content = block.content {
                let text = content.text
                if !text.isEmpty {
                    Text(text)
                        .font(.system(.caption2, design: .monospaced))
                        .foregroundStyle(.textSecondary)
                        .lineLimit(8)
                        .padding(8)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .background(Color.bgPrimary.opacity(0.5))
                        .clipShape(RoundedRectangle(cornerRadius: 6))
                }
            }
        }
    }

    // MARK: - Helpers

    private var bubbleBackground: Color {
        message.role == .user ? .accentBlue.opacity(0.2) : .bgSecondary
    }

    private func shortModelName(_ model: String) -> String {
        if model.contains("opus") { return "Opus" }
        if model.contains("sonnet") { return "Sonnet" }
        if model.contains("haiku") { return "Haiku" }
        return model.split(separator: "-").last.map(String.init) ?? model
    }

    private func toolIcon(_ name: String) -> String {
        switch name.lowercased() {
        case let n where n.contains("read"): return "doc.text"
        case let n where n.contains("write"): return "pencil"
        case let n where n.contains("edit"): return "square.and.pencil"
        case let n where n.contains("bash"): return "terminal"
        case let n where n.contains("search"), let n where n.contains("grep"): return "magnifyingglass"
        case let n where n.contains("glob"): return "folder"
        default: return "wrench"
        }
    }
}

import SwiftUI

/// Markdown renderer using AttributedString (no recursive Text concatenation).
struct MarkdownRenderer: View {
    let text: String
    @State private var copiedCodeIndex: Int?

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            ForEach(Array(parseBlocks().enumerated()), id: \.offset) { index, block in
                renderBlock(block, index: index)
            }
        }
    }

    // MARK: - Block Parsing

    private enum MarkdownBlock {
        case paragraph(String)
        case heading(Int, String)
        case codeBlock(String, String?)
        case listItem(String, Int?)
        case divider
    }

    private func parseBlocks() -> [MarkdownBlock] {
        var blocks: [MarkdownBlock] = []
        let lines = text.split(separator: "\n", omittingEmptySubsequences: false).map(String.init)
        var i = 0
        var currentParagraph = ""

        while i < lines.count {
            let line = lines[i]

            // Code block
            if line.hasPrefix("```") {
                if !currentParagraph.isEmpty {
                    blocks.append(.paragraph(currentParagraph.trimmingCharacters(in: .whitespaces)))
                    currentParagraph = ""
                }
                let lang = String(line.dropFirst(3)).trimmingCharacters(in: .whitespaces)
                var code = ""
                i += 1
                while i < lines.count && !lines[i].hasPrefix("```") {
                    if !code.isEmpty { code += "\n" }
                    code += lines[i]
                    i += 1
                }
                blocks.append(.codeBlock(code, lang.isEmpty ? nil : lang))
                i += 1
                continue
            }

            // Heading
            if line.hasPrefix("### ") {
                flushParagraph(&currentParagraph, &blocks)
                blocks.append(.heading(3, String(line.dropFirst(4))))
                i += 1; continue
            }
            if line.hasPrefix("## ") {
                flushParagraph(&currentParagraph, &blocks)
                blocks.append(.heading(2, String(line.dropFirst(3))))
                i += 1; continue
            }
            if line.hasPrefix("# ") {
                flushParagraph(&currentParagraph, &blocks)
                blocks.append(.heading(1, String(line.dropFirst(2))))
                i += 1; continue
            }

            // Horizontal rule
            if line.trimmingCharacters(in: .whitespaces).allSatisfy({ $0 == "-" }) && line.count >= 3 {
                flushParagraph(&currentParagraph, &blocks)
                blocks.append(.divider)
                i += 1; continue
            }

            // List item
            if line.hasPrefix("- ") || line.hasPrefix("* ") {
                flushParagraph(&currentParagraph, &blocks)
                blocks.append(.listItem(String(line.dropFirst(2)), nil))
                i += 1; continue
            }

            // Numbered list
            if let match = line.range(of: #"^\d+\.\s"#, options: .regularExpression) {
                flushParagraph(&currentParagraph, &blocks)
                let numStr = String(line[line.startIndex..<line.firstIndex(of: ".")!])
                let num = Int(numStr) ?? 1
                blocks.append(.listItem(String(line[match.upperBound...]), num))
                i += 1; continue
            }

            // Empty line = paragraph break
            if line.trimmingCharacters(in: .whitespaces).isEmpty {
                flushParagraph(&currentParagraph, &blocks)
                i += 1; continue
            }

            // Regular text
            if !currentParagraph.isEmpty { currentParagraph += " " }
            currentParagraph += line
            i += 1
        }

        flushParagraph(&currentParagraph, &blocks)
        return blocks
    }

    private func flushParagraph(_ para: inout String, _ blocks: inout [MarkdownBlock]) {
        if !para.isEmpty {
            blocks.append(.paragraph(para.trimmingCharacters(in: .whitespaces)))
            para = ""
        }
    }

    // MARK: - Block Rendering

    @ViewBuilder
    private func renderBlock(_ block: MarkdownBlock, index: Int) -> some View {
        switch block {
        case .paragraph(let text):
            Text(renderInline(text))
                .font(.subheadline)
                .foregroundStyle(.textPrimary)

        case .heading(let level, let text):
            Text(text)
                .font(headingFont(level))
                .foregroundStyle(.textPrimary)

        case .codeBlock(let code, let lang):
            VStack(alignment: .leading, spacing: 0) {
                // Header bar with language label and copy button
                HStack {
                    Text(lang ?? "code")
                        .font(.caption2)
                        .foregroundStyle(.textSecondary)
                    Spacer()
                    Button {
                        UIPasteboard.general.string = code
                        // copied
                        copiedCodeIndex = index
                        DispatchQueue.main.asyncAfter(deadline: .now() + 1.5) {
                            if copiedCodeIndex == index {
                                copiedCodeIndex = nil
                            }
                        }
                    } label: {
                        Image(systemName: copiedCodeIndex == index ? "checkmark" : "doc.on.doc")
                            .font(.caption2)
                            .foregroundStyle(copiedCodeIndex == index ? .green : .textSecondary)
                    }
                    .buttonStyle(.plain)
                }
                .padding(.horizontal, 8)
                .padding(.vertical, 6)

                Text(code)
                    .font(.system(.caption, design: .monospaced))
                    .foregroundStyle(.textPrimary)
                    .padding(8)
                    .textSelection(.enabled)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(Color(white: 0.12))
            .clipShape(RoundedRectangle(cornerRadius: 8))

        case .listItem(let text, let number):
            HStack(alignment: .top, spacing: 6) {
                if let num = number {
                    Text("\(num).")
                        .font(.subheadline)
                        .foregroundStyle(.textSecondary)
                        .frame(minWidth: 16, alignment: .trailing)
                } else {
                    Text("\u{2022}")
                        .foregroundStyle(.textSecondary)
                }
                Text(renderInline(text))
                    .font(.subheadline)
                    .foregroundStyle(.textPrimary)
            }

        case .divider:
            Divider()
        }
    }

    /// Render inline markdown using AttributedString — O(n), no stack recursion.
    private func renderInline(_ text: String) -> AttributedString {
        var result = AttributedString()
        var i = text.startIndex

        while i < text.endIndex {
            // Inline code: `code`
            if text[i] == "`" {
                let start = text.index(after: i)
                if let end = text[start...].firstIndex(of: "`") {
                    var attr = AttributedString(text[start..<end])
                    attr.font = .system(.caption, design: .monospaced)
                    attr.foregroundColor = .accentBlue
                    result += attr
                    i = text.index(after: end)
                    continue
                }
            }

            // Bold: **text**
            if text[i...].hasPrefix("**") {
                let start = text.index(i, offsetBy: 2)
                if let range = text[start...].range(of: "**") {
                    var attr = AttributedString(text[start..<range.lowerBound])
                    attr.font = .subheadline.bold()
                    result += attr
                    i = range.upperBound
                    continue
                }
            }

            // Italic: *text* (not **)
            if text[i] == "*" && !text[i...].hasPrefix("**") {
                let start = text.index(after: i)
                if let end = text[start...].firstIndex(of: "*") {
                    var attr = AttributedString(text[start..<end])
                    attr.font = .subheadline.italic()
                    result += attr
                    i = text.index(after: end)
                    continue
                }
            }

            // Regular character — collect a run of plain text for efficiency
            var runEnd = text.index(after: i)
            while runEnd < text.endIndex && text[runEnd] != "`" && text[runEnd] != "*" {
                runEnd = text.index(after: runEnd)
            }
            result += AttributedString(text[i..<runEnd])
            i = runEnd
        }

        return result
    }

    private func headingFont(_ level: Int) -> Font {
        switch level {
        case 1: return .title2.bold()
        case 2: return .title3.bold()
        default: return .headline
        }
    }
}

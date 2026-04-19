import SwiftUI

/// Markdown renderer using AttributedString (no recursive Text concatenation).
struct MarkdownRenderer: View {
    let text: String

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            ForEach(Array(parseBlocks().enumerated()), id: \.offset) { _, block in
                renderBlock(block)
            }
        }
    }

    // MARK: - Block Parsing

    private enum MarkdownBlock {
        case paragraph(String)
        case heading(Int, String)
        case codeBlock(String, String?)
        case listItem(String)
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
                blocks.append(.listItem(String(line.dropFirst(2))))
                i += 1; continue
            }

            // Numbered list
            if let match = line.range(of: #"^\d+\.\s"#, options: .regularExpression) {
                flushParagraph(&currentParagraph, &blocks)
                blocks.append(.listItem(String(line[match.upperBound...])))
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
    private func renderBlock(_ block: MarkdownBlock) -> some View {
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
            VStack(alignment: .leading, spacing: 4) {
                if let lang, !lang.isEmpty {
                    Text(lang)
                        .font(.caption2)
                        .foregroundStyle(.textSecondary)
                        .padding(.horizontal, 8)
                        .padding(.top, 6)
                }
                Text(code)
                    .font(.system(.caption, design: .monospaced))
                    .foregroundStyle(.textPrimary)
                    .padding(8)
                    .textSelection(.enabled)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(Color.bgPrimary)
            .clipShape(RoundedRectangle(cornerRadius: 8))

        case .listItem(let text):
            HStack(alignment: .top, spacing: 6) {
                Text("\u{2022}")
                    .foregroundStyle(.textSecondary)
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

import SwiftUI

/// Simple markdown renderer that converts common markdown to styled Text views.
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
        case codeBlock(String, String?) // code, language
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
            if line.hasPrefix("# ") {
                if !currentParagraph.isEmpty {
                    blocks.append(.paragraph(currentParagraph.trimmingCharacters(in: .whitespaces)))
                    currentParagraph = ""
                }
                blocks.append(.heading(1, String(line.dropFirst(2))))
                i += 1
                continue
            }
            if line.hasPrefix("## ") {
                if !currentParagraph.isEmpty {
                    blocks.append(.paragraph(currentParagraph.trimmingCharacters(in: .whitespaces)))
                    currentParagraph = ""
                }
                blocks.append(.heading(2, String(line.dropFirst(3))))
                i += 1
                continue
            }
            if line.hasPrefix("### ") {
                if !currentParagraph.isEmpty {
                    blocks.append(.paragraph(currentParagraph.trimmingCharacters(in: .whitespaces)))
                    currentParagraph = ""
                }
                blocks.append(.heading(3, String(line.dropFirst(4))))
                i += 1
                continue
            }

            // Horizontal rule
            if line.trimmingCharacters(in: .whitespaces).allSatisfy({ $0 == "-" }) && line.count >= 3 {
                if !currentParagraph.isEmpty {
                    blocks.append(.paragraph(currentParagraph.trimmingCharacters(in: .whitespaces)))
                    currentParagraph = ""
                }
                blocks.append(.divider)
                i += 1
                continue
            }

            // List item
            if line.hasPrefix("- ") || line.hasPrefix("* ") {
                if !currentParagraph.isEmpty {
                    blocks.append(.paragraph(currentParagraph.trimmingCharacters(in: .whitespaces)))
                    currentParagraph = ""
                }
                blocks.append(.listItem(String(line.dropFirst(2))))
                i += 1
                continue
            }

            // Numbered list
            if let match = line.range(of: #"^\d+\.\s"#, options: .regularExpression) {
                if !currentParagraph.isEmpty {
                    blocks.append(.paragraph(currentParagraph.trimmingCharacters(in: .whitespaces)))
                    currentParagraph = ""
                }
                blocks.append(.listItem(String(line[match.upperBound...])))
                i += 1
                continue
            }

            // Empty line = paragraph break
            if line.trimmingCharacters(in: .whitespaces).isEmpty {
                if !currentParagraph.isEmpty {
                    blocks.append(.paragraph(currentParagraph.trimmingCharacters(in: .whitespaces)))
                    currentParagraph = ""
                }
                i += 1
                continue
            }

            // Regular text
            if !currentParagraph.isEmpty {
                currentParagraph += " "
            }
            currentParagraph += line
            i += 1
        }

        if !currentParagraph.isEmpty {
            blocks.append(.paragraph(currentParagraph.trimmingCharacters(in: .whitespaces)))
        }

        return blocks
    }

    // MARK: - Block Rendering

    @ViewBuilder
    private func renderBlock(_ block: MarkdownBlock) -> some View {
        switch block {
        case .paragraph(let text):
            renderInlineMarkdown(text)
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
                renderInlineMarkdown(text)
                    .font(.subheadline)
                    .foregroundStyle(.textPrimary)
            }

        case .divider:
            Divider()
        }
    }

    private func renderInlineMarkdown(_ text: String) -> Text {
        // Handle inline code, bold, italic
        var result = Text("")
        var remaining = text[text.startIndex...]

        while !remaining.isEmpty {
            // Inline code: `code`
            if remaining.hasPrefix("`"), let end = remaining.dropFirst().firstIndex(of: "`") {
                let code = remaining[remaining.index(after: remaining.startIndex)..<end]
                result = result + Text(String(code))
                    .font(.system(.caption, design: .monospaced))
                    .foregroundColor(.accentBlue)
                remaining = remaining[remaining.index(after: end)...]
                continue
            }

            // Bold: **text**
            if remaining.hasPrefix("**"), let end = remaining.dropFirst(2).range(of: "**") {
                let bold = remaining[remaining.index(remaining.startIndex, offsetBy: 2)..<end.lowerBound]
                result = result + Text(String(bold)).bold()
                remaining = remaining[end.upperBound...]
                continue
            }

            // Italic: *text* (but not **)
            if remaining.hasPrefix("*") && !remaining.hasPrefix("**"),
               let end = remaining.dropFirst().firstIndex(of: "*") {
                let italic = remaining[remaining.index(after: remaining.startIndex)..<end]
                result = result + Text(String(italic)).italic()
                remaining = remaining[remaining.index(after: end)...]
                continue
            }

            // Regular character
            result = result + Text(String(remaining.first!))
            remaining = remaining.dropFirst()
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

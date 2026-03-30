import SwiftUI

struct StatusBadge: View {
    let status: TaskStatus

    var body: some View {
        HStack(spacing: 4) {
            Image(systemName: icon)
                .font(.caption2)
            Text(status.rawValue.capitalized)
                .font(.caption2.weight(.medium))
        }
        .padding(.horizontal, 8)
        .padding(.vertical, 3)
        .background(backgroundColor)
        .foregroundStyle(foregroundColor)
        .clipShape(Capsule())
    }

    private var icon: String {
        switch status {
        case .pending: return "clock"
        case .running: return "play.fill"
        case .waiting: return "hourglass"
        case .draft: return "doc"
        case .paused: return "pause.fill"
        case .done: return "checkmark"
        case .failed: return "xmark"
        case .cancelled: return "minus.circle"
        }
    }

    private var foregroundColor: Color {
        switch status {
        case .pending: return .textSecondary
        case .running: return .statusSuccess
        case .waiting: return .statusWarning
        case .draft: return .textSecondary
        case .paused: return .statusWarning
        case .done: return .statusSuccess
        case .failed: return .statusError
        case .cancelled: return .textSecondary
        }
    }

    private var backgroundColor: Color {
        foregroundColor.opacity(0.15)
    }
}

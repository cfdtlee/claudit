import SwiftUI

extension Color {
    // Background colors (matching web UI dark theme)
    static let bgPrimary = Color(red: 0.039, green: 0.039, blue: 0.039)   // #0a0a0a
    static let bgSecondary = Color(red: 0.102, green: 0.102, blue: 0.102) // #1a1a1a
    static let bgTertiary = Color(red: 0.165, green: 0.165, blue: 0.165) // #2a2a2a

    // Border
    static let borderColor = Color(red: 0.165, green: 0.165, blue: 0.165) // #2a2a2a

    // Text
    static let textPrimary = Color(red: 0.898, green: 0.898, blue: 0.898)  // #e5e5e5
    static let textSecondary = Color(red: 0.451, green: 0.451, blue: 0.451) // #737373

    // Accent
    static let accentBlue = Color(red: 0.231, green: 0.510, blue: 0.965) // #3b82f6

    // Status
    static let statusSuccess = Color(red: 0.133, green: 0.773, blue: 0.369) // #22c55e
    static let statusWarning = Color(red: 0.918, green: 0.702, blue: 0.031) // #eab308
    static let statusError = Color(red: 0.937, green: 0.267, blue: 0.267)   // #ef4444

    // Terminal
    static let terminalGreen = Color(red: 0.133, green: 0.773, blue: 0.369) // #22c55e
}

extension ShapeStyle where Self == Color {
    static var bgPrimary: Color { .bgPrimary }
    static var bgSecondary: Color { .bgSecondary }
    static var bgTertiary: Color { .bgTertiary }
    static var borderColor: Color { .borderColor }
    static var textPrimary: Color { .textPrimary }
    static var textSecondary: Color { .textSecondary }
    static var accentBlue: Color { .accentBlue }
    static var statusSuccess: Color { .statusSuccess }
    static var statusWarning: Color { .statusWarning }
    static var statusError: Color { .statusError }
    static var terminalGreen: Color { .terminalGreen }
}

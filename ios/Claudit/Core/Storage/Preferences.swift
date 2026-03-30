import Foundation
import SwiftUI

/// UserDefaults wrapper for non-sensitive preferences.
@Observable
final class Preferences {
    static let shared = Preferences()

    private let defaults = UserDefaults.standard
    private let prefix = "claudit_"

    private init() {}

    // MARK: - Relay

    var relayURL: String? {
        get { defaults.string(forKey: key("relay_url")) }
        set { defaults.set(newValue, forKey: key("relay_url")) }
    }

    // MARK: - Display

    var hideEmptySessions: Bool {
        get { defaults.object(forKey: key("hide_empty")) as? Bool ?? true }
        set { defaults.set(newValue, forKey: key("hide_empty")) }
    }

    var showManagedOnly: Bool {
        get { defaults.bool(forKey: key("managed_only")) }
        set { defaults.set(newValue, forKey: key("managed_only")) }
    }

    var theme: AppTheme {
        get {
            guard let raw = defaults.string(forKey: key("theme")),
                  let t = AppTheme(rawValue: raw) else { return .system }
            return t
        }
        set { defaults.set(newValue.rawValue, forKey: key("theme")) }
    }

    // MARK: - Private

    private func key(_ name: String) -> String {
        "\(prefix)\(name)"
    }
}

enum AppTheme: String, CaseIterable, Identifiable {
    case system
    case dark
    case light

    var id: String { rawValue }

    var displayName: String {
        switch self {
        case .system: return "System"
        case .dark: return "Dark"
        case .light: return "Light"
        }
    }

    var colorScheme: ColorScheme? {
        switch self {
        case .system: return nil
        case .dark: return .dark
        case .light: return .light
        }
    }
}

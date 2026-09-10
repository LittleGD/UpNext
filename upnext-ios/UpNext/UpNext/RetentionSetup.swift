import Combine
import SwiftUI
import UserNotifications
import WidgetKit

enum RetentionSetupKind: String, Identifiable, Codable {
    case notifications, widget
    var id: String { rawValue }
}

/// Device settings stay on this device. Only a completed challenge can enqueue an
/// automatic invitation; cloud hydration, XP, and app launches cannot trigger one.
@MainActor
final class RetentionSetup: ObservableObject {
    @Published private(set) var queue: [RetentionSetupKind]
    @Published var presented: RetentionSetupKind?
    private(set) var manualRequest: RetentionSetupKind?
    private let defaults: UserDefaults
    private let prefix = "retentionSetup.v1."

    init(defaults: UserDefaults = .standard) {
        self.defaults = defaults
        queue = (defaults.stringArray(forKey: "retentionSetup.v1.queue") ?? [])
            .compactMap(RetentionSetupKind.init(rawValue:))
        #if DEBUG
        if ProcessInfo.processInfo.arguments.contains("UITestResetRetentionSetup") {
            for key in defaults.dictionaryRepresentation().keys where key.hasPrefix(prefix) {
                defaults.removeObject(forKey: key)
            }
            queue = []
        }
        #endif
    }

    var hasPendingPresentation: Bool { !queue.isEmpty || presented != nil }

    func challengeCompleted(total: Int) {
        #if DEBUG
        let args = ProcessInfo.processInfo.arguments
        if args.contains("UITestBypassAuth"), !args.contains("UITestRetentionSetup") { return }
        #endif
        let kind: RetentionSetupKind
        switch total {
        case 1: kind = .notifications
        case 2:
            // The existing widget extension's deployment target is iOS 17.
            guard #available(iOS 17, *) else { return }
            kind = .widget
        default: return
        }
        guard !defaults.bool(forKey: prefix + kind.rawValue) else { return }
        defaults.set(true, forKey: prefix + kind.rawValue)
        enqueue(kind)
    }

    func openFromSettings(_ kind: RetentionSetupKind) {
        manualRequest = kind
        enqueue(kind)
    }

    private func enqueue(_ kind: RetentionSetupKind) {
        guard !queue.contains(kind) else { return }
        queue.append(kind)
        persistQueue()
    }

    func dismiss() {
        guard let kind = presented else { return }
        finish(kind)
        presented = nil
    }

    /// Clear only the completed or dismissed invitation, preserving the next one.
    func finish(_ kind: RetentionSetupKind) {
        queue.removeAll { $0 == kind }
        if manualRequest == kind { manualRequest = nil }
        if kind == .widget { defaults.removeObject(forKey: prefix + "widgetStep") }
        if kind == .notifications {
            defaults.removeObject(forKey: prefix + "reminderTime")
            defaults.removeObject(forKey: prefix + "waitingForNotificationSettings")
        }
        persistQueue()
    }

    var widgetStep: Int {
        get { defaults.integer(forKey: prefix + "widgetStep") }
        set { defaults.set(newValue, forKey: prefix + "widgetStep") }
    }

    var reminderTime: String? {
        get { defaults.string(forKey: prefix + "reminderTime") }
        set { defaults.set(newValue, forKey: prefix + "reminderTime") }
    }

    var waitingForNotificationSettings: Bool {
        get { defaults.bool(forKey: prefix + "waitingForNotificationSettings") }
        set { defaults.set(newValue, forKey: prefix + "waitingForNotificationSettings") }
    }

    private func persistQueue() {
        defaults.set(queue.map(\.rawValue), forKey: prefix + "queue")
    }

    static func homeWidgetInstalled() async throws -> Bool {
        try await withCheckedThrowingContinuation { continuation in
            WidgetCenter.shared.getCurrentConfigurations { result in
                continuation.resume(with: result.map { configurations in
                    configurations.contains { $0.kind == "UpNextHomeWidget" }
                })
            }
        }
    }
}

/// Use the same central overlay as the other app prompts. Wait for rewards,
/// photo capture, and pack presentations before showing an invitation.
struct RetentionSetupPresenter: ViewModifier {
    @ObservedObject var setup: RetentionSetup
    @EnvironmentObject private var store: GameStore
    @Environment(\.scenePhase) private var scenePhase
    let blocked: Bool

    private var canPresent: Bool {
        !blocked && scenePhase == .active && setup.presented == nil && !setup.queue.isEmpty
    }

    func body(content: Content) -> some View {
        content
            .allowsHitTesting(setup.presented == nil)
            .accessibilityHidden(setup.presented != nil)
            .overlay {
                if let kind = setup.presented {
                    RetentionSetupView(kind: kind, setup: setup)
                        .environmentObject(store)
                        .transition(.opacity)
                }
            }
            .task(id: canPresent ? setup.queue.first : nil) {
                guard canPresent, let kind = setup.queue.first else { return }
                // Let the completion feedback and any photo presentation settle.
                do { try await Task.sleep(for: .milliseconds(850)) } catch { return }
                guard !Task.isCancelled, canPresent else { return }
                if setup.manualRequest != kind, kind == .notifications, store.progress?.notificationsEnabled == true,
                   await NotificationManager.hasScheduledReminder() {
                    guard !Task.isCancelled else { return }
                    setup.finish(kind)
                    return
                }
                if setup.manualRequest != kind, kind == .widget,
                   (try? await RetentionSetup.homeWidgetInstalled()) == true {
                    guard !Task.isCancelled else { return }
                    setup.finish(kind)
                    return
                }
                guard !Task.isCancelled, canPresent else { return }
                setup.presented = kind
            }
    }
}

enum RetentionSetupCopy {
    static func text(_ key: String.LocalizationValue) -> String {
        String(localized: key, table: "RetentionSetup",
               bundle: AppConfig.inAppBundle ?? .main, locale: AppConfig.currentLocale)
    }
}

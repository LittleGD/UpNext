//
//  NotificationManager.swift
//  UpNext — 로컬 알림 (Phase 5 슬라이스 2 · Phase 5.3).
//
//  웹 src/lib/notifications.ts 는 Service Worker push 를 썼다 — 네이티브는
//  UserNotifications 의 로컬 알림으로 교체 (Service Worker 폐기).
//
//  매일 같은 시각(설정의 notificationTime)에 챌린지 리마인더를 반복 발화한다.
//  로컬 알림이라 APNs 엔트리먼트 불필요 — UNUserNotificationCenter 직통.
//

import UserNotifications

enum NotificationManager {
    private enum ReminderError: Error { case invalidTime }

    /// 매일 챌린지 리마인더 식별자 — 갱신 시 이 id 로 제거 후 재등록.
    private static let dailyReminderID = "upnext.dailyChallengeReminder"

    /// 알림 권한 요청 — 사용자가 알림을 켤 때 호출. 반환: 허용 여부.
    static func requestAuthorization() async -> Bool {
        do {
            return try await UNUserNotificationCenter.current()
                .requestAuthorization(options: [.alert, .sound, .badge])
        } catch {
            return false
        }
    }

    static func authorizationStatus() async -> UNAuthorizationStatus {
        await UNUserNotificationCenter.current().notificationSettings().authorizationStatus
    }

    static func hasScheduledReminder() async -> Bool {
        let status = await authorizationStatus()
        guard status == .authorized || status == .provisional || status == .ephemeral else { return false }
        return await UNUserNotificationCenter.current().pendingNotificationRequests()
            .contains { $0.identifier == dailyReminderID }
    }

    /// Await registration before the tutorial reports that setup succeeded.
    static func scheduleDailyReminder(time: String) async throws {
        guard let request = dailyReminderRequest(time: time) else {
            throw ReminderError.invalidTime
        }
        try await UNUserNotificationCenter.current().add(request)
    }

    /// 설정에 맞춰 매일 챌린지 리마인더를 갱신한다.
    ///  - enabled=false → 예약 취소.
    ///  - enabled=true  → notificationTime("HH:mm")에 매일 반복 알림 등록.
    /// 항상 기존 예약을 먼저 제거하므로 시각 변경 시 재호출하면 갱신된다.
    /// 등록은 비동기지만 caller 가 결과를 기다릴 필요가 없어 Task 로 wrap (best-effort).
    static func syncDailyReminder(enabled: Bool, time: String) {
        let center = UNUserNotificationCenter.current()
        center.removePendingNotificationRequests(withIdentifiers: [dailyReminderID])
        guard enabled, let request = dailyReminderRequest(time: time) else { return }

        Task {
            do {
                try await center.add(request)
            } catch {
                #if DEBUG
                print("[NotificationManager] add(request) failed: \(error)")
                #endif
            }
        }
    }

    private static func dailyReminderRequest(time: String) -> UNNotificationRequest? {
        guard let (hour, minute) = parseTime(time) else { return nil }

        // 알림은 시스템이 SwiftUI 환경 밖에서 표시하므로 `.environment(\.locale)` 가
        // 닿지 않는다. 인앱 언어(AppConfig.currentLocale)로 명시 해석해 설정 언어와 일치.
        let content = UNMutableNotificationContent()
        content.title = AppConfig.loc("오늘의 챌린지")
        content.body = AppConfig.loc("오늘의 카드를 뽑고 갓생을 이어가세요.")
        content.sound = .default

        var when = DateComponents()
        when.hour = hour
        when.minute = minute
        let trigger = UNCalendarNotificationTrigger(dateMatching: when, repeats: true)
        return UNNotificationRequest(
            identifier: dailyReminderID, content: content, trigger: trigger)
    }

    /// "HH:mm" → (시, 분). 형식이 어긋나면 nil.
    private static func parseTime(_ s: String) -> (Int, Int)? {
        let parts = s.split(separator: ":")
        guard parts.count == 2,
              let h = Int(parts[0]), let m = Int(parts[1]),
              (0..<24).contains(h), (0..<60).contains(m) else { return nil }
        return (h, m)
    }
}

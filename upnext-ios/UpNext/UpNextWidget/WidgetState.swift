//
//  WidgetState.swift
//  WidgetKit Timeline용 데이터 모델 + App Group UserDefaults 디코더.
//
//  Target Membership: UpNext ✅ (App 타깃은 plugin이 raw payload 쓰므로 불필요)
//
//  다국어: levelTitle / mainChallengeTitle 은 앱이 publish 할 때 이미 사용자
//  시스템 언어로 해석된 문자열 — 위젯은 그대로 표시. 빈 문자열·payload 부재 시
//  fallback 은 위젯 자체 String Catalog (UpNextWidget/Localizable.xcstrings) 의
//  키 (widget.daily.empty 등) 를 LocalizedStringKey 로 렌더링.
//

import Foundation
import SwiftUI  // LocalizedStringKey

/// 오늘의 태스크 한 줄(위젯 체크리스트). 제목은 앱이 인앱 언어로 해석해 publish.
struct WidgetTask: Codable, Equatable {
    let title: String
    let done: Bool
}

struct WidgetState: Codable, Equatable {
    let date: String
    let streak: Int
    let todayCount: Int
    let todayDone: Int
    let xp: Int
    let xpForNext: Int
    let level: Int
    let levelTitle: String
    let mainChallengeTitle: String
    let tasks: [WidgetTask]
    let updatedAt: TimeInterval

    /// 갤러리 프리뷰용 기본값(태스크 중심 레이아웃이 보이도록 샘플 태스크 포함).
    static var placeholder: WidgetState {
        WidgetState(
            date: Self.widgetTodayString(),
            streak: 12,
            todayCount: 3,
            todayDone: 1,
            xp: 80,
            xpForNext: 140,
            level: 3,
            levelTitle: "",
            mainChallengeTitle: AppConfig.locBundled("widget.sample.2"),
            tasks: [
                WidgetTask(title: AppConfig.locBundled("widget.sample.1"), done: true),
                WidgetTask(title: AppConfig.locBundled("widget.sample.2"), done: false),
                WidgetTask(title: AppConfig.locBundled("widget.sample.3"), done: false),
            ],
            updatedAt: 0
        )
    }

    static let empty = WidgetState(
        date: Self.widgetTodayString(),
        streak: 0,
        todayCount: 0,
        todayDone: 0,
        xp: 0,
        xpForNext: 140,
        level: 1,
        levelTitle: "",
        mainChallengeTitle: "",
        tasks: [],
        updatedAt: 0
    )

    static func load() -> WidgetState {
        guard let defaults = AppConfig.sharedDefaults,
              let data = defaults.data(forKey: "widgetState") else {
            return .empty
        }
        if let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any] {
            let date = (json["date"] as? String) ?? ""
            let updatedAt = (json["updatedAt"] as? NSNumber)?.doubleValue
                ?? (json["updatedAt"] as? TimeInterval)
                ?? 0
            guard isFreshPayload(date: date, updatedAt: updatedAt) else { return .empty }
            let rawTasks = (json["tasks"] as? [[String: Any]]) ?? []
            let tasks = rawTasks.map {
                WidgetTask(title: ($0["title"] as? String) ?? "", done: ($0["done"] as? Bool) ?? false)
            }
            return WidgetState(
                date: date,
                streak: (json["streak"] as? Int) ?? 0,
                todayCount: (json["todayCount"] as? Int) ?? 0,
                todayDone: (json["todayDone"] as? Int) ?? 0,
                xp: (json["xp"] as? Int) ?? 0,
                xpForNext: (json["xpForNext"] as? Int) ?? 140,
                level: (json["level"] as? Int) ?? 1,
                levelTitle: (json["levelTitle"] as? String) ?? "",
                mainChallengeTitle: (json["mainChallengeTitle"] as? String) ?? "",
                tasks: tasks,
                updatedAt: updatedAt
            )
        }
        return .empty
    }

    var progressRatio: Double {
        guard todayCount > 0 else { return 0 }
        return min(1.0, Double(todayDone) / Double(todayCount))
    }

    var xpRatio: Double {
        guard xpForNext > 0 else { return 0 }
        return min(1.0, Double(xp) / Double(xpForNext))
    }

    /// 메인 챌린지 제목 — payload 가 비어있으면 fallback 안내 문구.
    /// 위젯은 별도 프로세스라 Text(LocalizedStringKey)+ .environment(\.locale) 로는 인앱
    /// 언어 해석이 안 된다(시스템 언어로 떨어짐). 그래서 fallback 도 AppConfig.loc 로
    /// 인앱 언어 String 을 직접 구해 반환 → Text(String) 은 그대로 표시(검증됨).
    var displayChallengeTitle: String {
        mainChallengeTitle.isEmpty
            ? AppConfig.locBundled("widget.daily.start_prompt")
            : mainChallengeTitle
    }

    private static func isFreshPayload(date: String, updatedAt: TimeInterval) -> Bool {
        guard date == widgetTodayString() else { return false }
        guard updatedAt > 0 else { return false }
        return Date().timeIntervalSince1970 - updatedAt < 30 * 60 * 60
    }

    /// Mirrors the web app's `getTodayString`: roll the product day at 01:00
    /// local time so midnight widget snapshots do not drift from the app.
    private static func widgetTodayString(now: Date = Date()) -> String {
        let shifted = now.addingTimeInterval(-60 * 60)
        let c = Calendar.current.dateComponents([.year, .month, .day], from: shifted)
        return String(format: "%04d-%02d-%02d", c.year ?? 1970, c.month ?? 1, c.day ?? 1)
    }
}

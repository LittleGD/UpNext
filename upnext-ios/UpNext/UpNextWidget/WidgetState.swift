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

struct WidgetState: Codable, Equatable {
    let streak: Int
    let todayCount: Int
    let todayDone: Int
    let xp: Int
    let xpForNext: Int
    let level: Int
    let levelTitle: String
    let mainChallengeTitle: String
    let updatedAt: TimeInterval

    /// 데이터 없을 때 placeholder/snapshot 에 쓰는 기본값. levelTitle/title 은 빈 문자열로
    /// 두고 위젯 측에서 displayChallengeTitle / displayLevelTitle 로 다국어 fallback.
    static let placeholder = WidgetState(
        streak: 7,
        todayCount: 6,
        todayDone: 2,
        xp: 80,
        xpForNext: 140,
        level: 3,
        levelTitle: "",
        mainChallengeTitle: "",
        updatedAt: 0
    )

    static let empty = WidgetState(
        streak: 0,
        todayCount: 0,
        todayDone: 0,
        xp: 0,
        xpForNext: 140,
        level: 1,
        levelTitle: "",
        mainChallengeTitle: "",
        updatedAt: 0
    )

    static func load() -> WidgetState {
        guard let defaults = AppConfig.sharedDefaults,
              let data = defaults.data(forKey: "widgetState") else {
            return .empty
        }
        if let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any] {
            return WidgetState(
                streak: (json["streak"] as? Int) ?? 0,
                todayCount: (json["todayCount"] as? Int) ?? 0,
                todayDone: (json["todayDone"] as? Int) ?? 0,
                xp: (json["xp"] as? Int) ?? 0,
                xpForNext: (json["xpForNext"] as? Int) ?? 140,
                level: (json["level"] as? Int) ?? 1,
                levelTitle: (json["levelTitle"] as? String) ?? "",
                mainChallengeTitle: (json["mainChallengeTitle"] as? String) ?? "",
                updatedAt: (json["updatedAt"] as? TimeInterval) ?? 0
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

    /// 메인 챌린지 제목 — payload 가 비어있으면 위젯 번들의 다국어 fallback 키를 반환.
    /// SwiftUI Text(_:) 가 LocalizedStringKey 를 받아 위젯 extension 번들의
    /// Localizable.xcstrings 에서 자동 해석.
    var displayChallengeTitle: LocalizedStringKey {
        mainChallengeTitle.isEmpty
            ? LocalizedStringKey("widget.daily.start_prompt")
            : LocalizedStringKey(mainChallengeTitle)
    }
}

//
//  WidgetState.swift
//  WidgetKit Timeline용 데이터 모델 + App Group UserDefaults 디코더.
//
//  Target Membership: UpNextWidget ✅ (App 타깃은 plugin이 raw payload 쓰므로 불필요)
//

import Foundation

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

    /// 데이터 없을 때 placeholder/snapshot에 쓰는 기본값
    static let placeholder = WidgetState(
        streak: 7,
        todayCount: 6,
        todayDone: 2,
        xp: 80,
        xpForNext: 140,
        level: 3,
        levelTitle: "수련생",
        mainChallengeTitle: "30분 산책하기",
        updatedAt: 0
    )

    static let empty = WidgetState(
        streak: 0,
        todayCount: 0,
        todayDone: 0,
        xp: 0,
        xpForNext: 140,
        level: 1,
        levelTitle: "뉴비",
        mainChallengeTitle: "오늘의 카드를 뽑아보세요",
        updatedAt: 0
    )

    static func load() -> WidgetState {
        guard let defaults = UserDefaults(suiteName: "group.com.littlegd.upnext"),
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
                levelTitle: (json["levelTitle"] as? String) ?? "뉴비",
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
}

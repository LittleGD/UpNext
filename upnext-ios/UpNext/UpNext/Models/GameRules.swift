//
//  GameRules.swift
//  UpNext 모델 — XP/레벨/칭호 게임 규칙 (순수 함수).
//
//  웹 src/types/game.ts의 결정론적 함수를 1:1 포팅.
//  Phase 2.5 동치성 검증 대상 — 같은 입력에 웹과 동일 출력 보장 필수.
//
//  Phase 2.1 (타입 시스템 Swift 포팅) 산출물.
//

import Foundation

enum GameRules {

    // MARK: - XP 커브

    /// XP / 레벨 상한 — Int 오버플로 방어선.
    ///  - `totalXPForLevel(level)` 가 `level * (80 + 20·level)` 라 level² 스케일.
    ///  - Int 64bit 에선 level ≈ 3.27e9 부터 오버플로 — Swift 는 trap → 앱 크래시.
    ///  - 실용적 게임 한도(Lv 100)의 1000배인 9999 를 상한으로 잡고, 손상 Firestore
    ///    데이터(과거 버그/악성 클라이언트)가 이 경로를 타도 크래시 대신 cap 으로 종료.
    static let maxLevel = 9999
    /// `totalXPForLevel(maxLevel)` = 9999 * (80 + 199_980) = ~2_000_000_000 (Int32 한도 근처).
    /// XP 도 같은 상한 — UserProgress.xp 가 손상 데이터로 Int.max 가 들어와도 안전.
    static let maxTotalXP = maxLevel * (80 + 20 * maxLevel)

    /// 특정 레벨까지 필요한 총 누적 XP. 웹 `totalXPForLevel`.
    /// 공식: level * (80 + 20 * level)
    static func totalXPForLevel(_ level: Int) -> Int {
        let capped = max(0, min(maxLevel, level))
        return capped * (80 + 20 * capped)
    }

    /// 레벨업에 필요한 XP. 웹 `xpToNextLevel`.
    /// Level 0→1: 100, 1→2: 140, 2→3: 180, ...
    static func xpToNextLevel(_ level: Int) -> Int {
        totalXPForLevel(level + 1) - totalXPForLevel(level)
    }

    /// 누적 XP에서 레벨 계산. 웹 `getLevelFromXP`.
    /// 손상 데이터로 거대 xp(Int.max 근처)가 들어와도 maxLevel 에서 종료해 무한 루프 방지.
    static func levelFromXP(_ totalXP: Int) -> Int {
        let capped = max(0, min(maxTotalXP, totalXP))
        var level = 0
        while level < maxLevel, totalXPForLevel(level + 1) <= capped {
            level += 1
        }
        return level
    }

    /// 현재 레벨에서의 XP 진행도. 웹 `getXPProgress`.
    /// current는 Math.max(0,…) 클램프 — 구-커브 cloud snapshot의 음수 노출 방어.
    static func xpProgress(totalXP: Int, level: Int) -> (current: Int, needed: Int) {
        let xpAtCurrentLevel = totalXPForLevel(level)
        let needed = xpToNextLevel(level)
        let current = max(0, totalXP - xpAtCurrentLevel)
        return (current, needed)
    }

    /// 유저 XP/레벨 정규화. 웹 `normalizeProgressXpLevel`.
    ///
    /// 정책 (idempotent — 여러 번 호출해도 같은 결과):
    ///  1) Grandfather level — 현재 레벨 floor보다 xp가 낮으면 floor로 보정 (강등 안 함).
    ///  2) Level 승급 — xp가 다음 임계치 이상이면 승급 + pendingPacks 적립.
    ///  3) 음수 클램프 — xp < 0 은 0으로.
    static func normalizeXpLevel(_ progress: UserProgress) -> (progress: UserProgress, levelsGained: Int) {
        // 손상 데이터 방어 — level/xp 상한 클램프 (H4).
        var level = max(0, min(maxLevel, progress.level))
        var xp = max(0, min(maxTotalXP, progress.xp))

        // 1) grandfather: 현재 레벨 floor보다 xp가 낮으면 floor로 보정
        let floor = totalXPForLevel(level)
        if xp < floor { xp = floor }

        // 2) xp가 다음 임계치 이상이면 level 승급
        let correct = levelFromXP(xp)
        var levelsGained = 0
        if correct > level {
            levelsGained = correct - level
            level = correct
        }

        if xp == progress.xp && level == progress.level && levelsGained == 0 {
            return (progress, 0)
        }

        var updated = progress
        updated.xp = xp
        updated.level = level
        updated.pendingPacks = progress.pendingPacks + levelsGained
        return (updated, levelsGained)
    }

    // MARK: - 칭호 시스템

    /// 언어별 레벨 칭호 7단계. 웹 `LEVEL_TITLES_*`.
    private static let levelTitles: [Language: [String]] = [
        .ko: ["입문자", "뉴비", "도전자", "실천가", "갓생러", "마스터", "레전드"],
        .en: ["Beginner", "Newbie", "Challenger", "Achiever", "Go-getter", "Master", "Legend"],
        .ja: ["入門者", "ニュービー", "チャレンジャー", "実践者", "努力家", "マスター", "レジェンド"],
        .zh: ["入门者", "新手", "挑战者", "实践者", "奋斗者", "大师", "传奇"],
    ]

    /// 레벨에 해당하는 칭호. 웹 `getTitleForLevel`.
    /// 구간: ≤0 / ≤1 / ≤3 / ≤5 / ≤8 / ≤12 / 그 이상.
    static func titleForLevel(_ level: Int, lang: Language = .ko) -> String {
        let titles = levelTitles[lang] ?? levelTitles[.ko]!
        switch level {
        case ..<1:    return titles[0]
        case 1:       return titles[1]
        case 2...3:   return titles[2]
        case 4...5:   return titles[3]
        case 6...8:   return titles[4]
        case 9...12:  return titles[5]
        default:      return titles[6]
        }
    }
}

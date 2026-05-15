//
//  Game.swift
//  UpNext 모델 — 게임 상태 (일일 상태, 기록, 유저 진행도).
//
//  웹 src/types/game.ts의 interface/type/const를 1:1 포팅.
//  Codable 필드명은 웹과 동일 (Firestore JSON 호환). XP 수학은 GameRules.swift.
//
//  Phase 2.1 (타입 시스템 Swift 포팅) 산출물.
//

import Foundation

// MARK: - 기본 enum

/// 지원 언어. 웹 `Language` union.
enum Language: String, Codable, CaseIterable {
    case ko, en, ja, zh
}

/// 게임 모드 — 하루 선택 카드 수 결정. 웹 `GameMode` union.
enum GameMode: String, Codable, CaseIterable {
    case normal    // 1장
    case godlife   // 갓생 — 2장
    case ultra     // 초갓생 — 3장

    /// 모드별 선택 카드 수. 웹 `MODE_CARD_COUNT`.
    var cardCount: Int {
        switch self {
        case .normal:  return 1
        case .godlife: return 2
        case .ultra:   return 3
        }
    }
}

/// 챌린지 단계. 웹 `ChallengePhase` union.
enum ChallengePhase: String, Codable, CaseIterable {
    case daily
    case extra
    case `super`

    /// 단계별 고정 선택 카드 수. 웹 `PHASE_MIN_CARDS` / `PHASE_MAX_CARDS` (동일값).
    var cardCount: Int {
        switch self {
        case .daily:   return 0
        case .extra:   return 2
        case .`super`: return 3
        }
    }
}

// MARK: - 게임 상수 (웹 game.ts const)

enum GameConstants {
    /// 하루 드로우 카드 수. 웹 `DRAW_COUNT`.
    static let drawCount = 6
    /// 미니게임 티켓 상한. 웹 `MINIGAME_TICKET_CAP`.
    static let minigameTicketCap = 10
    /// 카드매치 티켓 하루 구매 cap. 웹 `DAILY_CARDMATCH_TICKET_CAP`.
    static let dailyCardmatchTicketCap = 2
    /// completionHistory 보존 상한 (일). 웹 `COMPLETION_HISTORY_CAP`.
    static let completionHistoryCap = 365
    /// 등급별 XP 보상. 웹 `XP_PER_RARITY`.
    static let xpPerRarity: [Rarity: Int] = [
        .normal: 10, .rare: 25, .unique: 50, .legend: 100,
    ]
}

// MARK: - 하루 기록

/// 과거 하루의 기록. 웹 `DayRecord` interface.
struct DayRecord: Codable, Hashable {
    let date: String                  // "2026-04-01"
    var selectedCardIds: [String]
    var completedCardIds: [String]
    var wasFullClear: Bool
    var mode: GameMode
    var extraCompleted: Bool?
    var superCompleted: Bool?
    var wasFailed: Bool?
}

// MARK: - 오늘의 상태

/// 하루 단위 게임 진행 상태. 웹 `DailyState` interface.
struct DailyState: Codable {
    var date: String                       // "2026-04-01"
    var drawnCards: [ChallengeCard]        // 드로우된 6장
    var selectedCards: [ChallengeCard]     // 유저 선택 카드
    var completedIds: [String]
    var isDrawComplete: Bool
    var isSelectionComplete: Bool
    var rerollUsed: Bool

    // 추가 챌린지 시스템
    var challengePhase: ChallengePhase

    // Extra 챌린지
    var extraDrawnCards: [ChallengeCard]
    var extraSelectedCards: [ChallengeCard]
    var extraCompletedIds: [String]
    var extraDrawComplete: Bool
    var extraSelectionComplete: Bool

    // Super 초갓생챌린지
    var superDrawnCards: [ChallengeCard]
    var superSelectedCards: [ChallengeCard]
    var superCompletedIds: [String]
    var superDrawComplete: Bool
    var superSelectionComplete: Bool

    // 실패 패널티
    var hasPenalty: Bool
    var penaltyCardId: String?

    // 알림
    var extraNudgeScheduled: Bool
}

// MARK: - 유저 진행도

/// 전체 게임 진행 상태. 웹 `UserProgress` interface.
/// Firestore /users/{uid} 문서의 progress 필드에 직렬화됨.
struct UserProgress: Codable {
    /// cardmatchShopDaily 중첩 구조.
    struct CardmatchShopDaily: Codable {
        var date: String
        var bought: Int
    }

    var currentStreak: Int
    var longestStreak: Int
    var totalDaysCompleted: Int
    var unlockedCardIds: [String]
    var completionHistory: [DayRecord]
    /// 카테고리별 완료 횟수. Firestore object 호환 위해 [String: Int]
    /// (Swift는 enum-key 딕셔너리를 배열로 인코딩하므로 String 키 사용).
    var categoryCompletions: [String: Int]
    var mode: GameMode
    var level: Int
    var xp: Int
    var daysTowardNextLevel: Int
    var pendingPacks: Int
    var pendingBonusCards: Int
    /// 카드별 완수 횟수.
    var cardCompletions: [String: Int]
    var extraChallengesCompleted: Int
    var superChallengesCompleted: Int
    var equippedTitleId: String?
    var seenTitleIds: [String]
    var pendingMode: GameMode?
    var hasPendingPenalty: Bool
    var language: Language
    var soundEnabled: Bool
    var hapticEnabled: Bool
    var notificationsEnabled: Bool
    var notificationTime: String           // "HH:MM"

    // 미니게임
    var tickets: Int
    var minigameRunsPlayed: Int
    var minigameBestMatches: Int
    var cardmatchShopDaily: CardmatchShopDaily?

    // 패치 노트
    var lastSeenPatchVersion: String?

    // 컬렉션 완료
    var collectionCompletedAt: String?
}

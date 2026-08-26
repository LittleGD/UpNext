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

    /// 카탈로그 로케일 식별자 — 중국어는 카탈로그가 "zh-Hans" 로 저장하므로 매핑.
    /// AppConfig.catalogLocaleIdentifier 와 동일 규칙(단일 진실의 원천).
    var localeIdentifier: String { AppConfig.catalogLocaleIdentifier(rawValue) }

    /// SwiftUI `.environment(\.locale)` 주입 및 `String(localized:locale:)` 용 Locale.
    var locale: Locale { Locale(identifier: localeIdentifier) }

    /// 저장된 인앱 언어 — 뷰 store 플러밍 없이 접근(카드 `localizedTitle` 등 데이터
    /// 필드 다국어 선택에 사용). AppConfig.currentLocale 과 동일 소스(App Group).
    /// 뷰는 store.progress 변경 시 재렌더되므로 언어 전환이 자연히 반영된다.
    static var current: Language {
        Language(rawValue: AppConfig.sharedDefaults?.string(forKey: AppConfig.languageKey) ?? "ko") ?? .ko
    }
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

    // 앱 평가 요청 — 모달을 띄운 시각(ms). 값이 있으면 다시 띄우지 않는다.
    // progress 는 Firestore 로 동기화되므로 재설치·기기 변경 후에도 중복 노출되지 않고,
    // 웹(reviewPromptShownAt)과 같은 키라 플랫폼을 오가도 한 번만 뜬다.
    var reviewPromptShownAt: Int?
}

// MARK: - Firestore 관대 디코딩 (Phase 3.1)
//
// 웹은 `data.progress as UserProgress` — 런타임 검증 0의 무검증 cast. 필드가
// 없으면 그냥 undefined 이고, 기본값은 store 초기화/사용처의 `??` 가 채운다.
// Swift 합성 Codable 은 키 1개 누락에도 throw — 옛 웹 버전이 쓴 문서가 native
// 에서 로드 실패하면 안 되므로(웹 sunset 안전망), 디코더를 웹의 암묵적 cast
// 만큼 관대하게 만든다: 누락/null/타입불일치 → 기본값.
//
// 예외 — totalDaysCompleted / unlockedCardIds 2필드는 strict. 웹 isValidProgress
// 가드와 동일하게, 이 둘이 없거나 타입이 틀리면 throw → UserProgress(따라서
// UserDoc) 디코딩 전체가 실패 → 호출부가 "유효한 클라우드 데이터 없음" 으로
// 처리한다(웹 getCloudData 가 !isValidProgress 시 null 반환하는 것과 동치).
//
// init(from:) 을 확장(extension)에 두어 멤버와이즈 init 은 보존된다.

extension UserProgress {
    init(from decoder: any Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        // 필수 — 웹 isValidProgress 가드 (누락·타입불일치 시 throw)
        totalDaysCompleted = try c.decode(Int.self, forKey: .totalDaysCompleted)
        unlockedCardIds = try c.decode([String].self, forKey: .unlockedCardIds)
        // 이하 관대 — 누락/null/타입불일치 → 기본값
        currentStreak = (try? c.decode(Int.self, forKey: .currentStreak)) ?? 0
        longestStreak = (try? c.decode(Int.self, forKey: .longestStreak)) ?? 0
        completionHistory = (try? c.decode([DayRecord].self, forKey: .completionHistory)) ?? []
        categoryCompletions = (try? c.decode([String: Int].self, forKey: .categoryCompletions)) ?? [:]
        mode = GameMode(rawValue: (try? c.decode(String.self, forKey: .mode)) ?? "") ?? .normal
        level = (try? c.decode(Int.self, forKey: .level)) ?? 0
        xp = (try? c.decode(Int.self, forKey: .xp)) ?? 0
        daysTowardNextLevel = (try? c.decode(Int.self, forKey: .daysTowardNextLevel)) ?? 0
        pendingPacks = (try? c.decode(Int.self, forKey: .pendingPacks)) ?? 0
        pendingBonusCards = (try? c.decode(Int.self, forKey: .pendingBonusCards)) ?? 0
        cardCompletions = (try? c.decode([String: Int].self, forKey: .cardCompletions)) ?? [:]
        extraChallengesCompleted = (try? c.decode(Int.self, forKey: .extraChallengesCompleted)) ?? 0
        superChallengesCompleted = (try? c.decode(Int.self, forKey: .superChallengesCompleted)) ?? 0
        equippedTitleId = try? c.decode(String.self, forKey: .equippedTitleId)
        seenTitleIds = (try? c.decode([String].self, forKey: .seenTitleIds)) ?? []
        pendingMode = GameMode(rawValue: (try? c.decode(String.self, forKey: .pendingMode)) ?? "")
        hasPendingPenalty = (try? c.decode(Bool.self, forKey: .hasPendingPenalty)) ?? false
        language = Language(rawValue: (try? c.decode(String.self, forKey: .language)) ?? "") ?? .ko
        soundEnabled = (try? c.decode(Bool.self, forKey: .soundEnabled)) ?? true
        hapticEnabled = (try? c.decode(Bool.self, forKey: .hapticEnabled)) ?? true
        notificationsEnabled = (try? c.decode(Bool.self, forKey: .notificationsEnabled)) ?? false
        notificationTime = (try? c.decode(String.self, forKey: .notificationTime)) ?? "21:00"
        tickets = (try? c.decode(Int.self, forKey: .tickets)) ?? 0
        minigameRunsPlayed = (try? c.decode(Int.self, forKey: .minigameRunsPlayed)) ?? 0
        minigameBestMatches = (try? c.decode(Int.self, forKey: .minigameBestMatches)) ?? 0
        cardmatchShopDaily = try? c.decode(CardmatchShopDaily.self, forKey: .cardmatchShopDaily)
        lastSeenPatchVersion = try? c.decode(String.self, forKey: .lastSeenPatchVersion)
        collectionCompletedAt = try? c.decode(String.self, forKey: .collectionCompletedAt)
        reviewPromptShownAt = try? c.decode(Int.self, forKey: .reviewPromptShownAt)
    }
}

extension DayRecord {
    /// completionHistory 원소는 수년치 누적 — 옛 버전이 쓴 레코드도 견디게 관대 디코딩.
    /// 한 레코드가 throw 하면 [DayRecord] 디코딩 전체가 실패하므로(배열은 all-or-nothing),
    /// 원소 단위 기본값으로 throw 자체를 차단한다.
    init(from decoder: any Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        date = (try? c.decode(String.self, forKey: .date)) ?? ""
        selectedCardIds = (try? c.decode([String].self, forKey: .selectedCardIds)) ?? []
        completedCardIds = (try? c.decode([String].self, forKey: .completedCardIds)) ?? []
        wasFullClear = (try? c.decode(Bool.self, forKey: .wasFullClear)) ?? false
        mode = GameMode(rawValue: (try? c.decode(String.self, forKey: .mode)) ?? "") ?? .normal
        extraCompleted = try? c.decode(Bool.self, forKey: .extraCompleted)
        superCompleted = try? c.decode(Bool.self, forKey: .superCompleted)
        wasFailed = try? c.decode(Bool.self, forKey: .wasFailed)
    }
}

//
//  FirestoreModels.swift
//  UpNext 모델 — Firestore /users/{uid} 문서 스키마 + hydrate/dehydrate.
//
//  웹 src/lib/sync.ts (hydrateDaily / dehydrateDaily / 문서 쓰기 형식)를 1:1 포팅.
//  스키마는 무변경 — 기존 웹 유저의 Firestore 데이터가 native 에서 그대로 읽혀야
//  한다(웹 sunset 의 핵심 안전망). iOS 가 진실의 원천이 되기 전(Phase 6)까지
//  필드 추가·이름 변경 금지.
//
//  Phase 3.1 (Firestore Codable 모델) 산출물.
//

import Foundation

// MARK: - 문서 하위 구조

/// /users/{uid}.daily — dehydrated 형식 (카드 = ID 배열). 웹 dehydrateDaily 출력 형태.
///
/// 인메모리 DailyState 와 다르다: DailyState 는 드로우 카드를 ChallengeCard 객체로
/// 들고, DailyDoc 은 ID 문자열만 저장(Firestore 경량화). hydrate/dehydrate 가 변환.
struct DailyDoc: Codable {
    var date: String
    var drawnCardIds: [String]
    var selectedCardIds: [String]
    var completedIds: [String]
    var isDrawComplete: Bool
    var isSelectionComplete: Bool
    var rerollUsed: Bool
    var challengePhase: ChallengePhase
    var extraDrawnCardIds: [String]
    var extraSelectedCardIds: [String]
    var extraCompletedIds: [String]
    var extraDrawComplete: Bool
    var extraSelectionComplete: Bool
    var superDrawnCardIds: [String]
    var superSelectedCardIds: [String]
    var superCompletedIds: [String]
    var superDrawComplete: Bool
    var superSelectionComplete: Bool
    var hasPenalty: Bool
    var penaltyCardId: String?
    var extraNudgeScheduled: Bool
}

extension DailyDoc {
    /// 관대 디코더 — 웹 hydrateDaily 의 필드별 `|| default` 를 그대로 재현.
    /// (DailyState 가 아니라 DailyDoc 단계에서 기본값을 채운다 — 웹의 hydrateCards
    ///  앞 단계인 `|| default` 와 동일 위치.) init(from:) 을 확장에 둬 멤버와이즈
    ///  init 보존 — dehydrateDaily 가 그 init 으로 DailyDoc 을 만든다.
    init(from decoder: any Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        let rawDate = (try? c.decode(String.self, forKey: .date)) ?? ""
        // 웹: (data.date as string) || <오늘-1h fallback> — 빈 문자열도 falsy → fallback.
        date = rawDate.isEmpty ? FirestoreSchema.fallbackDateString() : rawDate
        drawnCardIds = (try? c.decode([String].self, forKey: .drawnCardIds)) ?? []
        selectedCardIds = (try? c.decode([String].self, forKey: .selectedCardIds)) ?? []
        completedIds = (try? c.decode([String].self, forKey: .completedIds)) ?? []
        isDrawComplete = (try? c.decode(Bool.self, forKey: .isDrawComplete)) ?? false
        isSelectionComplete = (try? c.decode(Bool.self, forKey: .isSelectionComplete)) ?? false
        rerollUsed = (try? c.decode(Bool.self, forKey: .rerollUsed)) ?? false
        challengePhase = ChallengePhase(
            rawValue: (try? c.decode(String.self, forKey: .challengePhase)) ?? "") ?? .daily
        extraDrawnCardIds = (try? c.decode([String].self, forKey: .extraDrawnCardIds)) ?? []
        extraSelectedCardIds = (try? c.decode([String].self, forKey: .extraSelectedCardIds)) ?? []
        extraCompletedIds = (try? c.decode([String].self, forKey: .extraCompletedIds)) ?? []
        extraDrawComplete = (try? c.decode(Bool.self, forKey: .extraDrawComplete)) ?? false
        extraSelectionComplete = (try? c.decode(Bool.self, forKey: .extraSelectionComplete)) ?? false
        superDrawnCardIds = (try? c.decode([String].self, forKey: .superDrawnCardIds)) ?? []
        superSelectedCardIds = (try? c.decode([String].self, forKey: .superSelectedCardIds)) ?? []
        superCompletedIds = (try? c.decode([String].self, forKey: .superCompletedIds)) ?? []
        superDrawComplete = (try? c.decode(Bool.self, forKey: .superDrawComplete)) ?? false
        superSelectionComplete = (try? c.decode(Bool.self, forKey: .superSelectionComplete)) ?? false
        hasPenalty = (try? c.decode(Bool.self, forKey: .hasPenalty)) ?? false
        let rawPenalty = try? c.decode(String.self, forKey: .penaltyCardId)
        // 웹: (data.penaltyCardId as string) || null — 빈 문자열 → null.
        penaltyCardId = (rawPenalty?.isEmpty ?? true) ? nil : rawPenalty
        extraNudgeScheduled = (try? c.decode(Bool.self, forKey: .extraNudgeScheduled)) ?? false
    }
}

/// /users/{uid}.meta — 동기화 메타데이터. 웹 sync.ts 의 meta 객체.
///
/// createdAt / lastSyncedAt 은 Firestore serverTimestamp() 로 쓰여 Timestamp 로
/// 저장된다. Firestore.Decoder 는 Timestamp→Date 를 자동 처리하므로 Date? 로 둔다
/// (순수 JSON 경로 — 검증기 — 에선 부재 → nil).
struct MetaDoc: Codable {
    var lastDeviceId: String?
    var createdAt: Date?
    var lastSyncedAt: Date?
}

/// /users/{uid} 문서 전체. 웹 uploadLocalData / flushSync 가 쓰는 형식.
///
/// 모든 필드 Optional — 부분 문서(merge write, 신규/손상 문서)를 견딘다.
/// progress 가 구조적으로 불가능하면(필수 2필드 누락) UserProgress.init(from:) 이
/// throw → UserDoc 디코딩 전체가 throw → 호출부는 `try?` 로 nil 을 받아 "유효한
/// 클라우드 데이터 없음" 으로 처리한다. 웹 getCloudData 가 !isValidProgress 시
/// null 을 반환하는 것과 동치 — 즉 디코더 자체가 검증기 역할을 겸한다.
struct UserDoc: Codable {
    var progress: UserProgress?
    var daily: DailyDoc?
    var onboardingComplete: Bool?
    var meta: MetaDoc?
}

// MARK: - hydrate / dehydrate

/// 웹 sync.ts 의 스키마 변환 함수 모음. 인메모리 모델 ↔ Firestore 문서.
enum FirestoreSchema {

    /// Firestore daily 문서 → 인메모리 DailyState (카드 ID → 풀 ChallengeCard 객체).
    /// 웹 hydrateDaily 대응. catalog 는 ID→카드 조회 — 앱은 CardCatalog.card(id:),
    /// 검증기는 스텁을 주입한다(Phase 2 의 rng/flavor 주입과 같은 패턴).
    /// 알 수 없는 ID 는 compactMap 으로 탈락 — 웹 hydrateCards 의 .filter 와 동치.
    static func hydrateDaily(
        _ doc: DailyDoc,
        catalog: (String) -> ChallengeCard?
    ) -> DailyState {
        DailyState(
            date: doc.date,
            drawnCards: doc.drawnCardIds.compactMap(catalog),
            selectedCards: doc.selectedCardIds.compactMap(catalog),
            completedIds: doc.completedIds,
            isDrawComplete: doc.isDrawComplete,
            isSelectionComplete: doc.isSelectionComplete,
            rerollUsed: doc.rerollUsed,
            challengePhase: doc.challengePhase,
            extraDrawnCards: doc.extraDrawnCardIds.compactMap(catalog),
            extraSelectedCards: doc.extraSelectedCardIds.compactMap(catalog),
            extraCompletedIds: doc.extraCompletedIds,
            extraDrawComplete: doc.extraDrawComplete,
            extraSelectionComplete: doc.extraSelectionComplete,
            superDrawnCards: doc.superDrawnCardIds.compactMap(catalog),
            superSelectedCards: doc.superSelectedCardIds.compactMap(catalog),
            superCompletedIds: doc.superCompletedIds,
            superDrawComplete: doc.superDrawComplete,
            superSelectionComplete: doc.superSelectionComplete,
            hasPenalty: doc.hasPenalty,
            penaltyCardId: doc.penaltyCardId,
            extraNudgeScheduled: doc.extraNudgeScheduled
        )
    }

    /// 인메모리 DailyState → Firestore daily 문서 (카드 → ID). 웹 dehydrateDaily 대응.
    static func dehydrateDaily(_ daily: DailyState) -> DailyDoc {
        DailyDoc(
            date: daily.date,
            drawnCardIds: daily.drawnCards.map(\.id),
            selectedCardIds: daily.selectedCards.map(\.id),
            completedIds: daily.completedIds,
            isDrawComplete: daily.isDrawComplete,
            isSelectionComplete: daily.isSelectionComplete,
            rerollUsed: daily.rerollUsed,
            challengePhase: daily.challengePhase,
            extraDrawnCardIds: daily.extraDrawnCards.map(\.id),
            extraSelectedCardIds: daily.extraSelectedCards.map(\.id),
            extraCompletedIds: daily.extraCompletedIds,
            extraDrawComplete: daily.extraDrawComplete,
            extraSelectionComplete: daily.extraSelectionComplete,
            superDrawnCardIds: daily.superDrawnCards.map(\.id),
            superSelectedCardIds: daily.superSelectedCards.map(\.id),
            superCompletedIds: daily.superCompletedIds,
            superDrawComplete: daily.superDrawComplete,
            superSelectionComplete: daily.superSelectionComplete,
            hasPenalty: daily.hasPenalty,
            penaltyCardId: daily.penaltyCardId,
            extraNudgeScheduled: daily.extraNudgeScheduled
        )
    }

    /// 웹 hydrateDaily 의 date fallback — new Date() 에서 1시간 뺀 로컬 날짜 YYYY-MM-DD.
    /// 비결정론(벽시계) — date 키가 비었을 때만 발동하며 동치 검증 대상이 아니다.
    static func fallbackDateString() -> String {
        let d = Date().addingTimeInterval(-3600)
        let comp = Calendar.current.dateComponents([.year, .month, .day], from: d)
        return String(format: "%04d-%02d-%02d", comp.year ?? 1970, comp.month ?? 1, comp.day ?? 1)
    }
}

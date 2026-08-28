//
//  UpHeroPersistence.swift
//  UpNext 모델 — Up Hero 로컬 영속화 (Phase 4 슬라이스 15).
//
//  웹 useUpHeroStore 의 localStorage["uphero"] 영속화를 네이티브로 포팅.
//  Up Hero 는 웹에서도 Firestore 동기화 대상이 아니다 (localStorage 전용) —
//  네이티브도 동일하게 기기 로컬 파일에만 저장한다 (계정 간 공유 안 함).
//
//  설계:
//   - 도메인 타입의 Codable 준수는 UpHero.swift 에 둔다 (struct 합성은 타입 선언과
//     같은 파일이어야 함). 이 파일은 영속 스냅샷 구조와 변환만 담당.
//   - 영속 대상은 PersistedUpHeroState 로 명시한다 (웹 pickPersisted 대응).
//     transient 필드(idleReward·pendingClassAwaken·pendingClassChoice·isLoaded)는 제외.
//   - currentSession(CombatSession) 그래프는 discriminated-union 의 custom decoder
//     (ChoiceEffect/SimpleChoiceEffect/NarrativeValue — flavor JSON 용)와 얽혀 있어
//     전투 슬라이스로 유보한다. 슬라이스 15 는 비-세션 상태만 영속화 — 세션은 아직
//     생성 경로 자체가 없다. 전투 슬라이스에서 PersistedUpHeroState 에 currentSession
//     (Optional)을 덧붙이면 구 저장 파일과도 호환된다.
//

import Foundation

// MARK: - 영속 스냅샷

/// UpHeroState 중 디스크에 저장하는 부분 집합. 웹 `pickPersisted` 대응.
/// transient 필드와 currentSession 은 제외 (파일 헤더 노트 참고).
struct PersistedUpHeroState: Codable {
    var hero: Hero
    var inventory: [Equipment]
    var coins: Int
    var passes: [DungeonId: Int]
    var dungeons: [DungeonId: DungeonProgress]
    var pendingDungeon: PendingDungeonPrep?
    var codex: Codex
    var cosmetics: Cosmetics
    var lastIdleAccrualAt: Int
    var lastSeenAt: Int?
    var heroStartLevel: Int?
    var shopDaily: ShopDaily?
    var ngPlusLevel: Int?
    var weeklyVariant: WeeklyVariant?
    var schemaVersion: Int?
    var hasSeenCampTutorial: Bool?
    var welcomeGiftClaimed: Bool?
    // currentSession 은 전투 슬라이스에서 Optional 필드로 추가 (구 저장 파일 호환).
}

extension PersistedUpHeroState {

    /// 살아있는 상태 → 영속 스냅샷 (dehydrate). transient·currentSession 은 버린다.
    init(_ s: UpHeroState) {
        hero = s.hero
        inventory = s.inventory
        coins = s.coins
        passes = s.passes
        dungeons = s.dungeons
        pendingDungeon = s.pendingDungeon
        codex = s.codex
        cosmetics = s.cosmetics
        lastIdleAccrualAt = s.lastIdleAccrualAt
        lastSeenAt = s.lastSeenAt
        heroStartLevel = s.heroStartLevel
        shopDaily = s.shopDaily
        ngPlusLevel = s.ngPlusLevel
        weeklyVariant = s.weeklyVariant
        schemaVersion = s.schemaVersion
        hasSeenCampTutorial = s.hasSeenCampTutorial
        welcomeGiftClaimed = s.welcomeGiftClaimed
    }

    /// 영속 스냅샷 → 살아있는 상태 (hydrate). currentSession 은 nil, transient 필드는
    /// 기본값, isLoaded 는 false — 로드 직후 initialize() 가 처리하도록 둔다.
    func toState() -> UpHeroState {
        UpHeroState(
            hero: hero,
            inventory: inventory,
            coins: coins,
            passes: passes,
            dungeons: dungeons,
            currentSession: nil,
            pendingDungeon: pendingDungeon,
            codex: codex,
            cosmetics: cosmetics,
            lastIdleAccrualAt: lastIdleAccrualAt,
            lastSeenAt: lastSeenAt,
            heroStartLevel: heroStartLevel,
            shopDaily: shopDaily,
            ngPlusLevel: ngPlusLevel,
            weeklyVariant: weeklyVariant,
            schemaVersion: schemaVersion,
            hasSeenCampTutorial: hasSeenCampTutorial,
            welcomeGiftClaimed: welcomeGiftClaimed,
            pendingWelcomeGift: nil,   // initialize() 가 미수령이면 다시 예약한다
            idleReward: nil,
            pendingClassAwaken: nil,
            pendingClassChoice: nil,
            isLoaded: false
        )
    }
}

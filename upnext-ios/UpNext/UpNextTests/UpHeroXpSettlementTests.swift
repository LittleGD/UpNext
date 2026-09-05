//
//  UpHeroXpSettlementTests.swift
//  UpNextTests — Phase 2-A (Track A, 피드백 7/20/32/34a) 영웅 XP 풀 정산 / 시드 / 병합 / SP 파생.
//
//  웹 src/store/upHeroXpSettlement.test.ts · upHeroHeroXpMigration.test.ts ·
//  upHeroSkillPoints.test.ts 의 iOS 미러. GameStore(Firebase 의존)는 단위 테스트에서
//  띄우지 않으므로 "progress 불변" 은 UpHeroStore 가 progress 를 알지도 못한다는 사실
//  (acknowledgeSessionEnd → Void, GameStore.finishUpHeroSession 이 mutateProgress 를 안 함)
//  로 보장한다 — 여기서는 스토어 경계 안의 계약만 검증한다.
//
//  UpHeroStore 는 Application Support 의 uphero.json 을 읽고 쓴다 — UpHeroEnhanceTests 와
//  같은 sharedStore 패턴 + 매 테스트 resetAllData 로 격리한다.
//

import XCTest
@testable import UpNext

@MainActor
final class UpHeroXpSettlementTests: XCTestCase {

    private static var sharedStore: UpHeroStore?

    private func makeStore() -> UpHeroStore {
        if let s = Self.sharedStore { return s }
        let s = UpHeroStore()
        Self.sharedStore = s
        return s
    }

    private func freshStore() -> UpHeroStore {
        let s = makeStore()
        s.resetAllData()
        return s
    }

    override func tearDown() {
        Self.sharedStore?.resetAllData()
        super.tearDown()
    }

    /// 완료된 세션 — rewards.xp 만 중요. 웹 completedSession(xp, died).
    private func completedSession(xp: Int, died: Bool = false) -> CombatSession {
        var rng = Mulberry32(seed: 4242)
        var s = UpHeroSession.createSession(
            dungeonId: .fitness, hero: UpHeroRules.createDefaultHero(), startFloor: 1,
            activeBuffs: nil, options: CreateSessionOptions(heroLevel: 1), rng: &rng)
        s.rewards.xp = xp
        if died { s.hero.hp = 0 }
        s.status = .completed
        return s
    }

    private func legacyCloudDoc(_ json: String) throws -> CloudUpHeroState {
        try JSONDecoder().decode(CloudUpHeroState.self, from: Data(json.utf8))
    }

    // MARK: - 정산 → 영웅 XP 풀

    func testSettlementAddsToHeroXpAndRaisesLevelUpEvent() {
        let store = freshStore()
        store.ensureHeroXp(gameLevel: 1)              // 신규 영웅 — Lv1 → heroXp 0
        XCTAssertEqual(store.state.heroXp, 0)
        store.debugSetCurrentSession(completedSession(xp: 5000))

        // 반환값이 없다 — XP 는 GameStore 로 흘러가지 않는다.
        let _: Void = store.acknowledgeSessionEnd()

        XCTAssertEqual(store.state.heroXp, 5000)
        let expectedLevel = UpHeroRules.heroLevelFromXP(5000)
        XCTAssertEqual(store.heroLevel, expectedLevel)
        XCTAssertGreaterThan(expectedLevel, 1)
        XCTAssertEqual(store.state.pendingHeroLevelUp, HeroLevelUpEvent(from: 1, to: expectedLevel))
        XCTAssertNil(store.state.currentSession)
    }

    func testDeathStillPaysXp() {
        let store = freshStore()
        store.ensureHeroXp(gameLevel: 1)
        store.debugSetCurrentSession(completedSession(xp: 300, died: true))
        store.acknowledgeSessionEnd()
        XCTAssertEqual(store.state.heroXp, 300)
    }

    func testNoLevelUpMeansNoPendingEvent() {
        let store = freshStore()
        store.ensureHeroXp(gameLevel: 1)
        store.debugSetCurrentSession(completedSession(xp: 50))   // gap(1) = 121 미만
        store.acknowledgeSessionEnd()
        XCTAssertEqual(store.state.heroXp, 50)
        XCTAssertEqual(store.heroLevel, 1)
        XCTAssertNil(store.state.pendingHeroLevelUp)
    }

    /// 미시드(heroXp nil) + 시드 소스 없음 → heroXp 를 0 + gain 으로 굳히지 않는다.
    func testUnseededSettlementNeverSeedsZero() {
        let store = freshStore()
        XCTAssertNil(store.state.heroXp)
        store.debugSetCurrentSession(completedSession(xp: 5000))
        store.acknowledgeSessionEnd()                 // gameLevel 없음 → 시드 불가
        XCTAssertNil(store.state.heroXp, "미시드 풀에 gain 을 더해 0 시드로 굳히면 레거시 레벨을 잃는다")
        XCTAssertNil(store.state.currentSession)      // 코인·세션 정리는 정상 진행
        XCTAssertNil(store.state.pendingHeroLevelUp)
    }

    /// 미시드 + gameLevel 47 (heroStartLevel 없음 = 레거시 Lv47) → 39,031 + gain.
    func testUnseededSettlementSeedsFromGameLevelFirst() {
        let store = freshStore()
        store.debugSetCurrentSession(completedSession(xp: 1000))
        store.acknowledgeSessionEnd(gameLevel: 47)
        XCTAssertEqual(store.state.heroXp, 39031 + 1000)
        XCTAssertEqual(store.heroLevel, 47)
        XCTAssertNil(store.state.pendingHeroLevelUp)  // 1000 < gap(47)=2329
    }

    func testSettlementClampsAtCap() {
        let store = freshStore()
        store.debugSetHeroLevel(999)
        store.debugSetCurrentSession(completedSession(xp: 10_000_000))
        store.acknowledgeSessionEnd()
        XCTAssertEqual(store.state.heroXp, UpHeroRules.heroXpCap)
        XCTAssertEqual(store.heroLevel, UpHeroRules.heroLevelCap)
    }

    // MARK: - 레벨 마일스톤

    func testNoviceSkillsGrantedAtLv1AndLv5AndLv15() {
        let store = freshStore()
        store.initialize(gameLevel: 41)               // 신규 영웅 Lv1 → T0 novice 1개
        XCTAssertEqual(store.state.heroXp, 0)
        XCTAssertEqual(store.state.hero.learnedSkills, ["novice_heal"])

        store.debugSetCurrentSession(completedSession(xp: UpHeroRules.heroTotalXPForLevel(5)))
        store.acknowledgeSessionEnd()
        XCTAssertEqual(store.heroLevel, 5)
        XCTAssertEqual(store.state.hero.learnedSkills, ["novice_heal", "novice_focus"])

        store.debugSetCurrentSession(completedSession(
            xp: UpHeroRules.heroTotalXPForLevel(15) - UpHeroRules.heroTotalXPForLevel(5)))
        store.acknowledgeSessionEnd()
        XCTAssertEqual(store.heroLevel, 15)
        XCTAssertEqual(store.state.hero.learnedSkills, ["novice_heal", "novice_focus", "novice_brace"])
    }

    /// Lv30 을 넘기면 오버레이 먼저, 전직 제안은 acknowledgeHeroLevelUp 뒤.
    func testCrossing30DefersClassProposalUntilOverlayAcknowledged() {
        let store = freshStore()
        store.debugSetHeroLevel(29)
        XCTAssertNil(store.state.pendingClassChoice)
        store.debugSetCurrentSession(completedSession(
            xp: UpHeroRules.heroTotalXPForLevel(31) - UpHeroRules.heroTotalXPForLevel(29)))
        store.acknowledgeSessionEnd()
        XCTAssertEqual(store.state.pendingHeroLevelUp, HeroLevelUpEvent(from: 29, to: 31))
        XCTAssertNil(store.state.pendingClassChoice, "오버레이가 닫히기 전엔 전직 제안이 뜨지 않는다")

        store.acknowledgeHeroLevelUp()
        XCTAssertNil(store.state.pendingHeroLevelUp)
        XCTAssertNotNil(store.state.pendingClassChoice)
    }

    /// 이미 Lv30+ 인데 전직 전이면 (30 을 넘긴 레벨업이 아닐 때) 곧바로 제안.
    func testAlready30PlusProposesImmediately() {
        let store = freshStore()
        store.debugSetHeroLevel(35)                   // prev == new → 안전망 경로
        XCTAssertNotNil(store.state.pendingClassChoice)
        XCTAssertNil(store.state.pendingHeroLevelUp)
    }

    // MARK: - 스킬 포인트 파생

    func testDeriveSkillPointsHelpers() {
        var hero = UpHeroRules.createDefaultHero()
        hero.learnedSkills = ["warrior_smash_t1", "warrior_berserk_t2", "unknown_skill"]
        XCTAssertEqual(UpHeroStore.spentSkillPoints(hero), 1)              // T1 0 + T2 1 + 모르는 id 0
        XCTAssertEqual(UpHeroStore.deriveSkillPoints(hero, level: 35), 4)  // 5 - 1
        XCTAssertEqual(UpHeroStore.deriveSkillPoints(hero, level: 30), 0)  // 음수 없음
        hero.learnedSkills = ["warrior_smash_t1", "warrior_berserk_t2", "warrior_crush_t3", "warrior_rage_burst_t4"]
        XCTAssertEqual(UpHeroStore.deriveSkillPoints(hero, level: 45), 11) // 15 - 4
    }

    func testSkillPointsDeriveFromLevelAndLearnSkillSpends() {
        let store = freshStore()
        store.assignClass(.warrior)                   // learnedSkills = [T1]
        store.debugSetHeroLevel(31)
        XCTAssertEqual(store.state.hero.skillPoints, 1)
        store.debugSetHeroLevel(35)
        XCTAssertEqual(store.state.hero.skillPoints, 5)

        XCTAssertEqual(store.learnSkill("warrior_berserk_t2"), .ok)
        XCTAssertEqual(store.state.hero.learnedSkills, ["warrior_smash_t1", "warrior_berserk_t2"])
        XCTAssertEqual(store.state.hero.skillPoints, 4)
        XCTAssertEqual(store.learnSkill("warrior_berserk_t2"), .already)
        XCTAssertEqual(store.learnSkill("warrior_crush_t3"), .needLevel)   // requiredLevel 40
        XCTAssertEqual(store.learnSkill("mage_lightning_t1"), .noClass)     // 다른 클래스의 T1

        // 레벨이 내려갈 일은 없지만, reconcile 은 항상 파생값으로 덮는다 (멱등).
        store.reconcileSkillPoints()
        XCTAssertEqual(store.state.hero.skillPoints, 4)
    }

    func testNoPointsWhenDerivedIsZero() {
        let store = freshStore()
        store.assignClass(.warrior)
        store.debugSetHeroLevel(30)
        XCTAssertEqual(store.state.hero.skillPoints, 0)
        XCTAssertEqual(store.learnSkill("warrior_berserk_t2"), .needLevel)  // 35 필요
        store.debugSetHeroLevel(35)
        XCTAssertEqual(store.learnSkill("warrior_berserk_t2"), .ok)
        store.debugSetHeroLevel(40)                   // T3 (1) 가능, 그 뒤 T4 (2) 는 40-4 = 6 → ok
        XCTAssertEqual(store.learnSkill("warrior_crush_t3"), .ok)
        XCTAssertEqual(store.state.hero.skillPoints, 8)
    }

    // MARK: - 시드 (레거시 저장본 / 클라우드 구 문서)

    /// adoptCloudState(heroXp 없는 구 문서) + ensureHeroXp(gameLevel: 47) → 39,031, Lv47.
    func testLegacyCloudDocSeedsFromGameLevel() throws {
        let store = freshStore()
        let cloud = try legacyCloudDoc(#"{"coins": 5, "heroStartLevel": 1}"#)
        store.adoptCloudState(cloud)
        XCTAssertNil(store.state.heroXp)
        XCTAssertTrue(store.state.isLoaded)
        store.ensureHeroXp(gameLevel: 47)
        XCTAssertEqual(store.state.heroXp, 39031)
        XCTAssertEqual(store.heroLevel, 47)
        XCTAssertNil(store.state.pendingHeroLevelUp, "시드는 레벨업이 아니다")
        XCTAssertNotNil(store.state.pendingClassChoice, "Lv47 미전직 → 전직 안전망")
        // 멱등 — 다시 불러도 값이 안 바뀐다.
        store.ensureHeroXp(gameLevel: 99)
        XCTAssertEqual(store.state.heroXp, 39031)
    }

    /// heroStartLevel 41 + 계정 Lv43 → 영웅 Lv3 → 245.
    func testLegacySeedRespectsHeroStartLevel() throws {
        let store = freshStore()
        store.adoptCloudState(try legacyCloudDoc(#"{"coins": 5, "heroStartLevel": 41}"#))
        store.ensureHeroXp(gameLevel: 43)
        XCTAssertEqual(store.state.heroXp, 245)
        XCTAssertEqual(store.heroLevel, 3)
    }

    /// 클라우드 문서에 heroXp 가 있으면 채택하고 (clamp), 레거시 공식은 쓰지 않는다.
    func testCloudDocWithHeroXpIsAdoptedNotReseeded() throws {
        let store = freshStore()
        store.adoptCloudState(try legacyCloudDoc(#"{"coins": 5, "heroStartLevel": 1, "heroXp": 50000}"#))
        XCTAssertEqual(store.state.heroXp, 50000)
        store.ensureHeroXp(gameLevel: 47)
        XCTAssertEqual(store.state.heroXp, 50000)
        store.adoptCloudState(try legacyCloudDoc(#"{"coins": 5, "heroXp": -7}"#))
        XCTAssertEqual(store.state.heroXp, 0)
    }

    /// 시드 전엔 표시 레벨이 레거시 공식으로 폴백한다 (Lv47 이 Lv1 로 깜빡이지 않는다).
    func testHeroLevelFallsBackToLegacyFormulaWhileUnseeded() throws {
        let store = freshStore()
        store.adoptCloudState(try legacyCloudDoc(#"{"coins": 5, "heroStartLevel": 1}"#))
        XCTAssertNil(store.state.heroXp)
        XCTAssertEqual(store.heroLevel, 1)            // 아직 gameLevel 을 모른다
        store.acknowledgeSessionEnd(gameLevel: 47)   // 세션 없음 — 시드만 일어난다
        XCTAssertEqual(store.heroLevel, 47)
    }

    /// 방치 보상은 heroXp 로 간다 (initialize). 웹 "방치 XP 는 heroXp 로, 계정 XP 는 불변".
    func testIdleRewardGoesToHeroXp() {
        let store = freshStore()
        store.initialize(gameLevel: 1)
        XCTAssertEqual(store.state.heroXp, 0)
        XCTAssertNil(store.state.idleReward)          // 방금 리셋 → 방치 시간 없음
        XCTAssertTrue(store.state.isLoaded)
    }

    // MARK: - 클라우드 단조 병합 (mergeCloudHeroXp)

    func testMergeAdoptsLargerCloudValue() {
        let store = freshStore()
        store.debugSetHeroLevel(5)                    // 510
        store.mergeCloudHeroXp(1365)
        XCTAssertEqual(store.state.heroXp, 1365)
        XCTAssertEqual(store.heroLevel, 10)
        XCTAssertNil(store.state.pendingHeroLevelUp, "다른 기기가 이미 본 레벨업 — 오버레이 없음")
    }

    func testMergeIgnoresSmallerCloudValue() {
        let store = freshStore()
        store.debugSetHeroLevel(10)                   // 1365
        store.mergeCloudHeroXp(510)
        XCTAssertEqual(store.state.heroXp, 1365)
    }

    func testMergeNoOpWhenCloudAbsentAndAdoptsWhenLocalUnseeded() {
        let store = freshStore()
        store.mergeCloudHeroXp(nil)
        XCTAssertNil(store.state.heroXp)
        store.mergeCloudHeroXp(39031)
        XCTAssertEqual(store.state.heroXp, 39031)
        XCTAssertEqual(store.heroLevel, 47)
    }

    // MARK: - 영속 / 로그아웃

    func testHeroXpPersistsAndLegacyFileDecodesNil() throws {
        var state = UpHeroStore.makeDefaultState()
        state.heroXp = 39031
        state.pendingHeroLevelUp = HeroLevelUpEvent(from: 1, to: 2)
        let data = try JSONEncoder().encode(PersistedUpHeroState(state))
        let restored = try JSONDecoder().decode(PersistedUpHeroState.self, from: data).toState()
        XCTAssertEqual(restored.heroXp, 39031)
        XCTAssertNil(restored.pendingHeroLevelUp, "transient 는 영속되지 않는다")

        let legacy = try JSONEncoder().encode(PersistedUpHeroState(UpHeroStore.makeDefaultState()))
        let legacyJson = try XCTUnwrap(String(data: legacy, encoding: .utf8))
        XCTAssertFalse(legacyJson.contains("heroXp"), "nil 은 키를 싣지 않는다")
        XCTAssertNil(try JSONDecoder().decode(PersistedUpHeroState.self, from: legacy).toState().heroXp)
    }

    func testResetForSignOutClearsHeroXp() {
        let store = freshStore()
        store.debugSetHeroLevel(47)
        XCTAssertEqual(store.state.heroXp, 39031)
        store.resetForSignOut()
        XCTAssertNil(store.state.heroXp)
        XCTAssertNil(store.state.pendingHeroLevelUp)
    }
}

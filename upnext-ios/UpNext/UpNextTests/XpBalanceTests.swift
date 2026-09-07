import XCTest
@testable import UpNext

@MainActor
final class XpBalanceTests: XCTestCase {
    // Xcode 26.6 / iOS 26.2의 MainActor back-deploy 해제 충돌을 피한다.
    // 앱의 루트 스토어처럼 프로세스 동안 유지한다. 각 테스트의 진행도는 별개다.
    private static var retainedStores: [GameStore] = []

    private func makeStore(_ progress: UserProgress) -> GameStore {
        let store = GameStore(testProgress: progress)
        Self.retainedStores.append(store)
        return store
    }

    private func card(_ id: String, _ rarity: Rarity) -> ChallengeCard {
        ChallengeCard(id: id, title: id, description: "", category: .fitness,
                      rarity: rarity, icon: "", verifyType: .self)
    }

    /// 웹 `useMinigameStore.pickRunReward` 와 같은 숫자여야 한다 — XP 는 클라우드로
    /// 동기화되는 계정 값이라 플랫폼마다 다르면 같은 런이 다른 결과를 남긴다.
    /// 배율은 카드별 반올림 **안에서** 곱하고, 더블 루트는 XP 에 영향이 없다.
    func testCardMatchUsesReducedRewardsAndCapsBuffs() {
        let cards = [card("n", .normal), card("r", .rare), card("u", .unique), card("l", .legend)]
        let ids = cards.map(\.id)
        // 3 + 8 + 15 + 30
        XCTAssertEqual(GameRules.minigameRewardXP(matchedCards: cards, unlockedCardIds: ids), 56)
        // round(base × 1.5 × 1.5) = 7 + 18 + 34 + 68 = 127 → 런 상한 100.
        XCTAssertEqual(GameRules.minigameRewardXP(
            matchedCards: cards, unlockedCardIds: ids, xpBoostedCardIds: Set(ids),
            duplicateStash: true), 100)
        // 전설 1장 + 경험 개화 + 중복 보관함: round(30 × 1.5 × 1.5) = 68 (웹과 동일).
        XCTAssertEqual(GameRules.minigameRewardXP(
            matchedCards: [cards[3]], unlockedCardIds: ids,
            xpBoostedCardIds: ["l"], duplicateStash: true), 68)
        // 중복 보관함만: round(30 × 1.5) = 45.
        XCTAssertEqual(GameRules.minigameRewardXP(
            matchedCards: [cards[3]], unlockedCardIds: ids, duplicateStash: true), 45)
        // 경험 개화만: round(30 × 1.5) = 45.
        XCTAssertEqual(GameRules.minigameRewardXP(
            matchedCards: [cards[3]], unlockedCardIds: ids, xpBoostedCardIds: ["l"]), 45)
        XCTAssertEqual(GameConstants.xpPerRarity[.legend], 100)
    }

    func testNewAndRepeatedCardsDoNotGenerateExtraXP() {
        let known = card("known", .legend)
        let new = card("new", .legend)
        XCTAssertEqual(GameRules.minigameRewardXP(matchedCards: [new], unlockedCardIds: []), 0)
        XCTAssertEqual(GameRules.minigameRewardXP(
            matchedCards: [known, known, new], unlockedCardIds: [known.id]), 30)
    }

    func testAllDungeonMinigamesWaitForCompletionAndPayOnce() {
        var count = 0
        // Keep the existing floor and NG+ progression; these are base reward reductions.
        let scenarios: [(floor: Int, ng: Int, xpScale: Double)] = [
            (1, 0, 26.0 / 15), (50, 0, 320.0 / 15), (50, 2, 576.0 / 15),
        ]
        for scenario in scenarios {
            for events in FlavorPool.bundled.eventPool.values {
                for event in events {
                    for option in event.options {
                        guard case let .startMinigame(_, _, successEffects, _) = option.effect else { continue }
                        let baseXp = successEffects.reduce(0) { total, effect in
                            if case let .reward(_, xp, _) = effect { return total + (xp ?? 0) }
                            return total
                        }
                        XCTAssertTrue((18...36).contains(baseXp))
                        let expectedXp = Int((Double(baseXp) * scenario.xpScale).rounded())
                        let previousXp = Int((Double(baseXp) * 2.5 * scenario.xpScale).rounded())
                        XCTAssertEqual(Double(expectedXp) / Double(previousXp), 0.4, accuracy: 0.01)
                        var rng = Mulberry32(seed: 42)
                        var s = UpHeroSession.createSession(
                            dungeonId: .fitness, hero: UpHeroRules.createDefaultHero(), startFloor: scenario.floor,
                            options: CreateSessionOptions(ngPlusLevel: scenario.ng), rng: &rng)
                        s.log.append(.choice(
                            prompt: event.prompt, promptKey: event.promptKey, promptParams: nil,
                            options: [option], resolvedIndex: nil, variant: nil, timeoutMs: nil,
                            defaultOptionIndex: nil, isMystery: nil, timestamp: 0))
                        s.pendingChoiceIndex = s.log.count - 1
                        s.status = .awaitingChoice
                        let playing = UpHeroSession.resolveChoice(s, optionIndex: 0, rng: &rng)
                        XCTAssertEqual(playing.status, .awaitingMinigame)
                        XCTAssertEqual(playing.rewards.xp, 0)
                        let won = UpHeroSession.resolveMinigame(playing, success: true, rng: &rng)
                        XCTAssertEqual(won.rewards.xp, expectedXp)
                        let displayedXp = won.log.reversed().compactMap { entry -> Int? in
                            if case let .choiceResult(_, _, data, _, _, _, _, _, _) = entry { return data?.xp }
                            return nil
                        }.first
                        XCTAssertEqual(displayedXp, expectedXp)
                        XCTAssertEqual(UpHeroSession.resolveMinigame(won, success: true, rng: &rng).rewards.xp, won.rewards.xp)
                        XCTAssertEqual(UpHeroSession.resolveMinigame(playing, success: false, rng: &rng).rewards.xp, 0)
                        count += 1
                    }
                }
            }
        }
        XCTAssertEqual(count, 90)
    }

    func testIdleXPIsHalvedWithoutChangingCoinsOrCap() {
        XCTAssertNil(IdleAccrual.calculateIdleReward(elapsedMs: 4 * 60_000, level: 1))
        let capped = IdleAccrual.calculateIdleReward(elapsedMs: 24 * 60 * 60_000, level: 1)
        XCTAssertEqual(capped?.xp, 120)
        XCTAssertEqual(capped?.coins, 144)
        XCTAssertEqual(capped?.elapsedMin, 480)
    }

    func testActualPayoutMatchesPreviewAndPreservesExistingProgress() {
        let cards = Rarity.allCases.compactMap { rarity in
            CardCatalog.allCards.first { $0.rarity == rarity }
        }
        let ids = Set(cards.map(\.id))
        var p = GameStore.makeDefaultProgress()
        p.level = 1
        p.xp = 100
        p.unlockedCardIds = Array(ids)
        let store = makeStore(p)
        let preview = GameRules.minigameRewardXP(
            matchedCards: cards, unlockedCardIds: p.unlockedCardIds,
            xpBoostedCardIds: ids, duplicateStash: true)
        store.awardMinigameWin(
            matchedCardIds: ids, xpBoostedCardIds: ids, duplicateStash: true)
        XCTAssertEqual(store.progress?.xp, p.xp + preview)
        XCTAssertEqual(store.progress?.level, 1)
        XCTAssertEqual(store.progress?.minigameRunsPlayed, 1)
    }

    func testActualNewCardPayoutDoesNotFallBackToDisplayXP() {
        var p = GameStore.makeDefaultProgress()
        p.unlockedCardIds = []
        p.level = 1
        p.xp = 100
        let store = makeStore(p)
        let id = CardCatalog.allCards[0].id
        store.awardMinigameWin(matchedCardIds: [id])
        XCTAssertEqual(store.progress?.xp, 100)
        XCTAssertEqual(store.progress?.unlockedCardIds, [id])
    }
}

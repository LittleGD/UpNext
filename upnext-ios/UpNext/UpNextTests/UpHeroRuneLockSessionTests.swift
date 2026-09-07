//
//  UpHeroRuneLockSessionTests.swift
//  UpNextTests — 룬 자물쇠 해소가 세션에 붙는 방식 (UpHeroCombat.resolveRuneLock).
//
//  기본 보상은 `spinSlot` 이 이미 지급했다. `resolveRuneLock` 은 등급을 적고
//  **코인 차액만** 얹는다. 그래서:
//   - 조작을 안 해도(= plain) 낸 코인만큼의 기본 보상은 이미 손에 있다.
//   - 같은 엔트리를 두 번 해소해도 보너스가 두 번 붙지 않는다 (멱등).
//   - 세션 상태 머신에 새 대기 상태가 생기지 않는다 — 모달을 닫거나 화면이 사라져
//     조작이 끝나지 않아도 세션이 어중간하게 멈추지 않는다.
//

import XCTest
@testable import UpNext

/// 같은 값만 내놓는 난수 스텁 — 원하는 결과 구간을 정확히 겨눈다.
private struct ConstantRandom: RandomSource {
    let value: Double
    mutating func unit() -> Double { value }
}

/// 원시 표에서 coinSmall(490..684) 에 떨어지는 난수.
private let rollCoinSmall = 0.6
/// 원시 표에서 blank(0..490) 에 떨어지는 난수.
private let rollBlank = 0.1
/// 원시 표에서 rankProtect(795..900) 에 떨어지는 난수.
private let rollRankProtect = 0.85

final class UpHeroRuneLockSessionTests: XCTestCase {

    // MARK: - 픽스처

    private func newSession(coins: Int) -> CombatSession {
        var rng = Mulberry32(seed: 1)
        var s = UpHeroSession.createSession(
            dungeonId: .fitness,
            hero: UpHeroRules.createDefaultHero(),
            startFloor: 1,
            rng: &rng)
        s.rewards.coins = coins
        s.slotBlankStreak = 0
        return s
    }

    /// 룬 상자 이벤트를 실제로 골라 상자 하나를 연다. `roll` 로 결과를 고정한다.
    private func openChest(coins: Int = 1000, roll: Double) -> (CombatSession, Int) {
        var s = newSession(coins: coins)
        let ev = UpHeroSlotEvent.event
        s.log.append(.choice(
            prompt: ev.prompt, promptKey: ev.promptKey, promptParams: nil,
            options: ev.options, resolvedIndex: nil, variant: nil, timeoutMs: nil,
            defaultOptionIndex: nil, isMystery: nil, timestamp: 0))
        s.pendingChoiceIndex = s.log.count - 1
        s.status = .awaitingChoice
        var rng = ConstantRandom(value: roll)
        let next = UpHeroSession.resolveChoice(
            s, optionIndex: 0, slotSpinsToday: 0, rng: &rng)
        return (next, lastChestIndex(next))
    }

    private func lastChestIndex(_ s: CombatSession) -> Int {
        for i in stride(from: s.log.count - 1, through: 0, by: -1) {
            if case .choiceResult(_, _, _, _, _, _, _, .some(_), _) = s.log[i] { return i }
        }
        return -1
    }

    private func chest(_ s: CombatSession, _ idx: Int) -> SlotResultPayload? {
        guard s.log.indices.contains(idx),
              case let .choiceResult(_, _, _, _, _, _, _, slot, _) = s.log[idx] else { return nil }
        return slot
    }

    private func summaryCoins(_ s: CombatSession, _ idx: Int) -> Int? {
        guard case let .choiceResult(_, _, data, _, _, _, _, _, _) = s.log[idx] else { return nil }
        return data?.coins
    }

    // MARK: - 등급 보너스

    func testCoinChestGainsExactlyTheTierDelta() {
        let expected: [RuneLockTier: Int] = [.plain: 100, .good: 115, .perfect: 130]
        for (tier, amount) in expected {
            let (opened, idx) = openChest(roll: rollCoinSmall)
            XCTAssertGreaterThanOrEqual(idx, 0, "상자 결과가 없다")
            XCTAssertEqual(chest(opened, idx)?.outcome, .coinSmall)
            let before = opened.rewards.coins

            let after = UpHeroCombat.resolveRuneLock(opened, logIndex: idx, tier: tier)
            XCTAssertEqual(after.rewards.coins - before, amount - 100,
                           "\(tier.rawValue) 차액")
            XCTAssertEqual(chest(after, idx)?.lockTier, tier)
            XCTAssertEqual(chest(after, idx)?.coins, amount)
            XCTAssertEqual(summaryCoins(after, idx), amount)
        }
    }

    /// plain 은 배율 1 이라 차액이 0 이다. 그래도 등급은 **적힌다** — 그래야 이 상자가
    /// 해소됐다는 사실이 남고 다시 보너스를 받을 수 없다.
    func testPlainRecordsTierWithoutChangingCoins() {
        let (opened, idx) = openChest(roll: rollCoinSmall)
        let after = UpHeroCombat.resolveRuneLock(opened, logIndex: idx, tier: .plain)
        XCTAssertEqual(after.rewards.coins, opened.rewards.coins)
        XCTAssertEqual(chest(after, idx)?.lockTier, .plain)
    }

    /// 멱등 — 두 번째 해소는 아무 일도 하지 않는다 (모달 재등장·중복 탭·닫기 경로).
    func testSecondResolveIsIgnored() {
        let (opened, idx) = openChest(roll: rollCoinSmall)
        let once = UpHeroCombat.resolveRuneLock(opened, logIndex: idx, tier: .perfect)
        let twice = UpHeroCombat.resolveRuneLock(once, logIndex: idx, tier: .perfect)
        XCTAssertEqual(twice, once)
        // 닫기 경로가 뒤늦게 plain 을 불러도 perfect 보너스를 깎지 않는다.
        let dismissed = UpHeroCombat.resolveRuneLock(once, logIndex: idx, tier: .plain)
        XCTAssertEqual(dismissed, once)
        XCTAssertEqual(chest(dismissed, idx)?.lockTier, .perfect)
    }

    /// 코인이 아닌 보상은 개수까지 그대로다 — 등급만 적힌다.
    func testNonCoinChestKeepsItsCount() {
        let (opened, idx) = openChest(roll: rollRankProtect)
        XCTAssertEqual(chest(opened, idx)?.outcome, .rankProtect)
        let guardsBefore = opened.rewards.downGuards
        let after = UpHeroCombat.resolveRuneLock(opened, logIndex: idx, tier: .perfect)
        XCTAssertEqual(after.rewards.coins, opened.rewards.coins)
        XCTAssertEqual(after.rewards.downGuards, guardsBefore)
        XCTAssertEqual(chest(after, idx)?.downGuards, 1)
        XCTAssertEqual(chest(after, idx)?.lockTier, .perfect)
    }

    /// 빈 상자도 등급이 적히고 코인은 그대로다.
    func testBlankChestResolvesWithoutCoins() {
        let (opened, idx) = openChest(roll: rollBlank)
        XCTAssertEqual(chest(opened, idx)?.outcome, .blank)
        let after = UpHeroCombat.resolveRuneLock(opened, logIndex: idx, tier: .perfect)
        XCTAssertEqual(after.rewards.coins, opened.rewards.coins)
        XCTAssertEqual(chest(after, idx)?.lockTier, .perfect)
    }

    // MARK: - 세션 불변식

    /// 상태 머신을 건드리지 않는다 — 새 대기 상태도, 새 로그 줄도 없다.
    func testSessionShapeIsUntouched() {
        let (opened, idx) = openChest(roll: rollCoinSmall)
        let after = UpHeroCombat.resolveRuneLock(opened, logIndex: idx, tier: .good)
        XCTAssertEqual(after.status, opened.status)
        XCTAssertEqual(after.pendingChoiceIndex, opened.pendingChoiceIndex)
        XCTAssertEqual(after.log.count, opened.log.count)
        XCTAssertEqual(after.currentFloor, opened.currentFloor)
        XCTAssertEqual(after.slotBlankStreak, opened.slotBlankStreak)
    }

    /// 이미 정산된 세션에는 붙지 않는다 — 수입이 지갑으로 넘어간 뒤다.
    func testCompletedSessionIsNotTouched() {
        let (chestSession, idx) = openChest(roll: rollCoinSmall)
        var opened = chestSession
        opened.status = .completed
        XCTAssertEqual(UpHeroCombat.resolveRuneLock(opened, logIndex: idx, tier: .perfect), opened)
        XCTAssertNil(chest(opened, idx)?.lockTier)
        XCTAssertGreaterThanOrEqual(idx, 0)
    }

    /// 상자가 아닌 인덱스(범위 밖·다른 엔트리)는 무시된다.
    func testNonChestIndexIsIgnored() {
        let (opened, idx) = openChest(roll: rollCoinSmall)
        for bad in [-1, opened.log.count, max(0, idx - 1)] where bad != idx {
            XCTAssertEqual(
                UpHeroCombat.resolveRuneLock(opened, logIndex: bad, tier: .perfect), opened,
                "logIndex \(bad)")
        }
    }
}

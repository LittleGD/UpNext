//
//  UpHeroSlotSessionTests.swift
//  UpNextTests — 굴림틀이 세션에 붙은 뒤의 계약 (UpHeroSession.swift 배선).
//
//  UpHeroSlotTests 가 확률 테이블의 웹 동치성을 잡는다면, 여기는 그 결과가
//  세션에 **어떻게 반영되는지** 를 잡는다: 비용 차감, 상한, 지급 경로, pity
//  스트릭, 그리고 "결과 모달이 두 번 뜨지 않는다" 는 구조적 계약.
//
//  하루 상한 카운터는 세션에 없다 — 스토어가 `shopDaily.slotSpins` 스냅샷을
//  `slotSpinsToday` 로 넘기고, 세션은 그 값으로 게이트만 건다 (일일 카운터 자체의
//  계약은 UpHeroSlotDailyCapTests).
//

import XCTest
@testable import UpNext

final class UpHeroSlotSessionTests: XCTestCase {

    /// 굴림을 돌릴 수 있는 최소 조건을 갖춘 세션. 런 수입만 채워 둔다
    /// (지갑이 아니라 rewards.coins 에서 걷는 것이 계약이다).
    private func session(coins: Int, blankStreak: Int = 0) -> CombatSession {
        var rng = Mulberry32(seed: 1)
        var s = UpHeroSession.createSession(
            dungeonId: .fitness,
            hero: UpHeroRules.createDefaultHero(),
            startFloor: 1,
            rng: &rng)
        s.rewards.coins = coins
        s.slotBlankStreak = blankStreak
        return s
    }

    /// 로그 마지막의 굴림 결과 페이로드.
    private func lastSlot(_ s: CombatSession) -> SlotResultPayload? {
        for entry in s.log.reversed() {
            if case let .choiceResult(_, _, _, _, _, _, _, slot, _) = entry { return slot }
        }
        return nil
    }

    private func choiceResultCount(_ s: CombatSession) -> Int {
        s.log.filter { if case .choiceResult = $0 { return true }; return false }.count
    }

    /// 굴림틀 이벤트를 실제로 선택했을 때의 전체 경로 (resolveChoice 경유).
    /// `slotSpinsToday` 는 스토어가 넘겨주는 오늘 굴림 횟수 스냅샷 (기본 0 = 오늘 첫 굴림).
    private func spin<R: RandomSource>(
        _ s: CombatSession, slotSpinsToday: Int = 0, rng: inout R
    ) -> CombatSession {
        var out = s
        let ev = UpHeroSlotEvent.event
        out.log.append(.choice(
            prompt: ev.prompt, promptKey: ev.promptKey, promptParams: nil,
            options: ev.options, resolvedIndex: nil, variant: nil, timeoutMs: nil,
            defaultOptionIndex: nil, isMystery: nil, timestamp: 0))
        out.pendingChoiceIndex = out.log.count - 1
        out.status = .awaitingChoice
        return UpHeroSession.resolveChoice(
            out, optionIndex: 0, slotSpinsToday: slotSpinsToday, rng: &rng)
    }

    // MARK: - 게이트

    func testCanSpinRequiresRunIncomeAndUnderCap() {
        XCTAssertTrue(UpHeroSession.canSpinSlot(session(coins: 100), slotSpinsToday: 0))
        // 1코인 모자라면 못 돌린다.
        XCTAssertFalse(UpHeroSession.canSpinSlot(session(coins: 99), slotSpinsToday: 0))
        // 상한 직전(오늘 2회)까지는 열려 있고,
        XCTAssertTrue(UpHeroSession.canSpinSlot(
            session(coins: 100), slotSpinsToday: UpHeroSlot.dailySpinCap - 1))
        // 상한에 닿으면 잔액이 넉넉해도 못 돌린다 — 세션이 아니라 오늘 횟수가 기준.
        XCTAssertFalse(UpHeroSession.canSpinSlot(
            session(coins: 9999), slotSpinsToday: UpHeroSlot.dailySpinCap))
        XCTAssertFalse(UpHeroSession.canSpinSlot(
            session(coins: 9999), slotSpinsToday: UpHeroSlot.dailySpinCap + 5))
    }

    /// 하루 상한에 닿은 채 굴림을 시도해도 **비용이 빠지지 않고 드럼도 돌지 않는다.**
    /// 새 탐험이라도 오늘 3회를 다 썼으면 막힌다 (탐험 1회당이 아니라 하루 기준).
    func testSpinBlockedByDailyCapDoesNotChargeOrRoll() {
        var rng = Mulberry32(seed: 5)
        let before = session(coins: 1000)
        let after = spin(before, slotSpinsToday: UpHeroSlot.dailySpinCap, rng: &rng)

        XCTAssertEqual(after.rewards.coins, 1000, "상한인데 코인이 빠졌다")
        XCTAssertNil(lastSlot(after), "상한인데 드럼 페이로드가 생겼다")
        if case let .choiceResult(_, _, _, _, _, key, _, _, _) = after.log.last {
            XCTAssertEqual(key, "uphero.slot.result.unavailable")
        } else {
            XCTFail("안내 로그가 없다")
        }
    }

    /// 돌릴 수 없을 때 굴림을 시도해도 **비용이 빠지지 않는다.** 잔액이 모자란 채
    /// 코인만 사라지는 것이 가장 나쁜 실패 모드다.
    func testSpinBlockedDoesNotChargeOrRoll() {
        var rng = Mulberry32(seed: 5)
        let before = session(coins: 40)
        let after = spin(before, rng: &rng)

        XCTAssertEqual(after.rewards.coins, 40, "돌리지 못했는데 코인이 빠졌다")
        XCTAssertNil(lastSlot(after), "굴림이 없었는데 드럼 페이로드가 생겼다")
        // 안내는 남긴다 — 아무 반응 없이 삼키면 유저가 버그로 읽는다.
        if case let .choiceResult(_, _, _, _, _, key, _, _, _) = after.log.last {
            XCTAssertEqual(key, "uphero.slot.result.unavailable")
        } else {
            XCTFail("안내 로그가 없다")
        }
    }

    // MARK: - 비용 / 지급

    func testSpinChargesCostExactlyOnce() {
        var rng = Mulberry32(seed: 1337)   // 첫 굴림이 blank 인 시드
        let after = spin(session(coins: 500), rng: &rng)

        // 굴림은 slot 페이로드 하나로 드러난다 — 스토어가 이걸 보고 오늘 횟수를 +1 한다.
        XCTAssertNotNil(lastSlot(after))
        XCTAssertEqual(lastSlot(after)?.outcome, .blank)
        // 꽝이면 비용만큼만 줄어 있다.
        XCTAssertEqual(after.rewards.coins, 400)
    }

    /// **결과 모달은 한 번만 뜬다.** 굴림 선택지는 resultText 를 비워 일반
    /// choiceResult 가 push 되지 않게 해 두었다 — 그 구조적 계약을 고정한다.
    func testSpinEmitsExactlyOneChoiceResult() {
        var rng = Mulberry32(seed: 1337)
        let after = spin(session(coins: 500), rng: &rng)
        XCTAssertEqual(choiceResultCount(after), 1,
                       "굴림 한 번에 결과 로그가 두 개면 모달이 두 번 뜬다")
    }

    /// 지나가는 선택지는 굴림도 비용도 없다.
    func testSkipOptionCostsNothing() {
        var rng = Mulberry32(seed: 1)
        var s = session(coins: 500)
        let ev = UpHeroSlotEvent.event
        s.log.append(.choice(
            prompt: ev.prompt, promptKey: ev.promptKey, promptParams: nil,
            options: ev.options, resolvedIndex: nil, variant: nil, timeoutMs: nil,
            defaultOptionIndex: nil, isMystery: nil, timestamp: 0))
        s.pendingChoiceIndex = s.log.count - 1
        s.status = .awaitingChoice
        let after = UpHeroSession.resolveChoice(s, optionIndex: 1, rng: &rng)

        XCTAssertEqual(after.rewards.coins, 500)
        XCTAssertNil(lastSlot(after))
    }

    // MARK: - 결과별 지급 경로

    /// 각 결과가 **선언된 곳(SLOT_GRANTS)과 같은 것을 실제로 준다.** 표만 고치고
    /// 지급을 안 고치는 어긋남을 잡는 테스트다. 시드를 훑어 8종을 전부 만난다.
    func testEveryOutcomeGrantsWhatTheTableDeclares() {
        var seen = Set<SlotOutcomeId>()
        for seed in 1...400 where seen.count < SlotOutcomeId.allCases.count {
            var rng = Mulberry32(seed: seed)
            let before = session(coins: 1000)
            let after = spin(before, rng: &rng)
            guard let slot = lastSlot(after) else { continue }
            seen.insert(slot.outcome)

            let spent = before.rewards.coins - after.rewards.coins
            switch UpHeroSlot.grant(slot.outcome) {
            case .none:
                XCTAssertEqual(spent, UpHeroSlot.spinCost)
            case let .coins(amount):
                XCTAssertEqual(spent, UpHeroSlot.spinCost - amount)
                XCTAssertEqual(slot.coins, amount)
            case let .destroyGuards(count):
                XCTAssertEqual(after.rewards.destroyGuards, count)
                XCTAssertEqual(slot.destroyGuards, count)
            case let .downGuards(count):
                XCTAssertEqual(after.rewards.downGuards, count)
                XCTAssertEqual(slot.downGuards, count)
            case .itemBox:
                XCTAssertEqual(after.rewards.drops.count, 1, "상자인데 장비가 안 나왔다")
            case let .combatBuff(pct, battles):
                XCTAssertEqual(after.combatBuff,
                               CombatBuff(pct: Double(pct), battlesLeft: battles))
                XCTAssertEqual(slot.buffPct, pct)
                XCTAssertEqual(slot.buffBattles, battles)
            }
        }
        XCTAssertEqual(seen, Set(SlotOutcomeId.allCases),
                       "400 시드 안에서 못 만난 결과가 있다: \(Set(SlotOutcomeId.allCases).subtracting(seen))")
    }

    /// 드럼 세 칸은 언제나 결과와 모순되지 않는다 — 보상이면 같은 룬 셋, 꽝이면 셋이
    /// 다 같을 수 없다 (near-miss 는 두 개 동일 + 하나 다름까지만 허용). 표시가 결과를
    /// 배신하지 않는다는 계약.
    func testDrumFacesAlwaysAgreeWithOutcome() {
        var sawNearMiss = false
        for seed in 1...300 {
            var rng = Mulberry32(seed: seed)
            let after = spin(session(coins: 1000), rng: &rng)
            guard let slot = lastSlot(after) else { continue }
            XCTAssertEqual(slot.symbols.count, 3)
            if UpHeroSlot.isWin(slot.outcome) {
                XCTAssertEqual(Set(slot.symbols).count, 1, "보상인데 룬이 안 맞았다")
                XCTAssertEqual(slot.symbols[0], UpHeroSlot.def(slot.outcome).symbol)
                XCTAssertFalse(UpHeroSlot.isNearMiss(slot.symbols))
            } else {
                XCTAssertGreaterThanOrEqual(Set(slot.symbols).count, 2, "꽝인데 셋이 다 같다")
                if UpHeroSlot.isNearMiss(slot.symbols) { sawNearMiss = true }
            }
        }
        XCTAssertTrue(sawNearMiss, "300 시드 안에 near-miss 꽝이 한 번은 있어야 한다 (30%)")
    }

    /// 세션의 `slotBlankStreak` 는 운반용 사본 — 스토어가 넣어준 값을 롤 입력으로 읽고,
    /// 굴림 뒤 값(꽝 +1 / 보상 0)은 `UpHeroSlot.nextBlankStreak` 와 일치한다.
    func testSessionStreakCarrierAgreesWithNextBlankStreak() throws {
        for seed in 1...60 {
            for prev in [0, 2, UpHeroSlot.pityThreshold - 1] {
                var rng = Mulberry32(seed: seed)
                let after = spin(session(coins: 1000, blankStreak: prev), rng: &rng)
                let slot = try XCTUnwrap(lastSlot(after))
                XCTAssertEqual(after.slotBlankStreak,
                               UpHeroSlot.nextBlankStreak(prev: prev, outcome: slot.outcome))
            }
        }
    }

    // MARK: - pity 스트릭

    /// 꽝이면 스트릭이 쌓이고, 보상이 나오면 0 으로 끊긴다.
    func testBlankStreakAccumulatesAndResets() throws {
        var rng = Mulberry32(seed: 1337)          // 첫 굴림 blank
        let blank = spin(session(coins: 1000, blankStreak: 2), rng: &rng)
        XCTAssertEqual(lastSlot(blank)?.outcome, .blank)
        XCTAssertEqual(blank.slotBlankStreak, 3)

        var rng2 = Mulberry32(seed: 42)           // 첫 굴림 coinSmall
        let win = spin(session(coins: 1000, blankStreak: 3), rng: &rng2)
        XCTAssertTrue(UpHeroSlot.isWin(try XCTUnwrap(lastSlot(win)).outcome))
        XCTAssertEqual(win.slotBlankStreak, 0)
    }

    /// 스트릭이 임계값에 닿으면 그 굴림은 반드시 보상이다.
    func testPityGuaranteesRewardAtThreshold() {
        for seed in 1...40 {
            var rng = Mulberry32(seed: seed)
            let after = spin(
                session(coins: 1000, blankStreak: UpHeroSlot.pityThreshold - 1), rng: &rng)
            let slot = lastSlot(after)
            XCTAssertNotEqual(slot?.outcome, .blank, "pity 인데 꽝이 나왔다 (seed \(seed))")
        }
    }

    // MARK: - 전투 버프

    /// 버프는 `sessionStats` 한 곳에서만 곱한다 — 두 곳이면 +10% 가 +21% 로 먹는다.
    func testCombatBuffMultipliesStatsOnceAndDecays() {
        var s = session(coins: 0)
        let base = UpHeroRules.computeEffectiveStats(s.hero)

        s.combatBuff = CombatBuff(pct: 10, battlesLeft: 3)
        let buffed = UpHeroSession.sessionStats(s)
        XCTAssertEqual(buffed.str, UpHeroCombat.jsRound(Double(base.str) * 1.1))
        XCTAssertEqual(buffed.agi, UpHeroCombat.jsRound(Double(base.agi) * 1.1))
        // crit / slotBonus 는 퍼센트 포인트·카운터라 곱하지 않는다.
        XCTAssertEqual(buffed.crit, base.crit)
        XCTAssertEqual(buffed.slotBonus, base.slotBonus)

        UpHeroSession.consumeCombatBuff(&s)
        XCTAssertEqual(s.combatBuff?.battlesLeft, 2)
        UpHeroSession.consumeCombatBuff(&s)
        UpHeroSession.consumeCombatBuff(&s)
        XCTAssertNil(s.combatBuff, "만료된 버프는 껍데기를 남기지 않는다")
        XCTAssertEqual(UpHeroSession.sessionStats(s).str, base.str)
    }

    /// 굴림을 두 번 해서 버프가 두 번 나와도 **중첩되지 않는다** (덮어쓰기).
    func testCombatBuffDoesNotStack() {
        var s = session(coins: 0)
        s.combatBuff = CombatBuff(pct: 10, battlesLeft: 1)
        s.combatBuff = CombatBuff(pct: 10, battlesLeft: 3)
        XCTAssertEqual(s.combatBuff, CombatBuff(pct: 10, battlesLeft: 3))
    }

    /// 탐험 밖으로 넘어온 버프를 세션이 들여온다. 잔여 0 짜리는 버린다.
    func testCreateSessionAdoptsCarriedBuff() {
        var rng = Mulberry32(seed: 1)
        let carried = UpHeroSession.createSession(
            dungeonId: .fitness, hero: UpHeroRules.createDefaultHero(), startFloor: 1,
            options: CreateSessionOptions(combatBuff: CombatBuff(pct: 10, battlesLeft: 2)),
            rng: &rng)
        XCTAssertEqual(carried.combatBuff, CombatBuff(pct: 10, battlesLeft: 2))

        var rng2 = Mulberry32(seed: 1)
        let spent = UpHeroSession.createSession(
            dungeonId: .fitness, hero: UpHeroRules.createDefaultHero(), startFloor: 1,
            options: CreateSessionOptions(combatBuff: CombatBuff(pct: 10, battlesLeft: 0)),
            rng: &rng2)
        XCTAssertNil(spent.combatBuff, "소진된 버프를 들여왔다")
    }

    // MARK: - 이벤트 게이트

    /// 돌릴 수 없으면 굴림틀은 **후보에 오르지도 않는다** — 선택지 없는 선택지를
    /// 띄우지 않기 위한 게이트다.
    func testSlotEventNeverAppearsWhenUnavailable() {
        for seed in 1...300 {
            var rng = Mulberry32(seed: seed)
            let ev = FlavorPool.pickEvent(
                FlavorPool.bundled, dungeonId: .fitness,
                recentPrompts: [], slotAvailable: false, rng: &rng)
            XCTAssertFalse(UpHeroSlotEvent.isSlotEvent(ev.prompt),
                           "돌릴 수 없는데 굴림틀이 떴다 (seed \(seed))")
        }
    }

    /// 최근에 떴으면 LRU 가 막는다 — 같은 장치를 연달아 만나지 않게.
    func testSlotEventSuppressedByRecentPrompts() {
        for seed in 1...300 {
            var rng = Mulberry32(seed: seed)
            let ev = FlavorPool.pickEvent(
                FlavorPool.bundled, dungeonId: .fitness,
                recentPrompts: [UpHeroSlotEvent.prompt], slotAvailable: true, rng: &rng)
            XCTAssertFalse(UpHeroSlotEvent.isSlotEvent(ev.prompt),
                           "LRU 에 있는데 굴림틀이 또 떴다 (seed \(seed))")
        }
    }

    /// 열려 있으면 실제로 등장한다 (게이트가 항상 닫혀 있으면 기능이 죽은 것이다).
    func testSlotEventAppearsWhenAvailable() {
        var appeared = 0
        for seed in 1...400 {
            var rng = Mulberry32(seed: seed)
            let ev = FlavorPool.pickEvent(
                FlavorPool.bundled, dungeonId: .fitness,
                recentPrompts: [], slotAvailable: true, rng: &rng)
            if UpHeroSlotEvent.isSlotEvent(ev.prompt) { appeared += 1 }
        }
        XCTAssertGreaterThan(appeared, 0, "게이트가 열렸는데 한 번도 안 떴다")
        // 등장률 12% 근방 — pool 을 잠식할 만큼 흔하면 안 된다.
        XCTAssertLessThan(Double(appeared) / 400, 0.25)
    }

    /// 굴림틀 선택지가 i18n 키와 효과를 제대로 달고 있는가 (문구가 새면 전 언어에서 샌다).
    func testSlotEventOptionsCarryKeysAndEffect() {
        let ev = UpHeroSlotEvent.event
        XCTAssertEqual(ev.promptKey, "uphero.slot.event.prompt")
        XCTAssertEqual(ev.options.count, 2)
        XCTAssertEqual(ev.options[0].labelKey, "uphero.slot.option.spin")
        XCTAssertEqual(ev.options[0].effect, .spinSlot(cost: UpHeroSlot.spinCost))
        // 굴림 쪽 resultText 는 반드시 비어 있어야 한다 — 결과 모달 이중 표시 방지.
        XCTAssertNil(ev.options[0].resultText)
        XCTAssertEqual(ev.options[1].effect, .nothing)
        XCTAssertEqual(ev.options[1].resultTextKey, "uphero.slot.result.skip")
    }
}

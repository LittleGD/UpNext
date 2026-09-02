//
//  UpHeroSlotPityTests.swift
//  UpNextTests — 굴림틀 pity 영속화 (상태 층위 계약).
//
//  스트릭은 `UpHeroState.slotBlankStreak` 에 살고 스토어 `resolveChoice` 가 굴림마다
//  갱신한다 (웹 `useUpHeroStore.resolveChoice` / upHeroSlotPity.test.ts). 세션의
//  같은 이름 필드는 운반용 사본이다. 여기서는 스토어 밖에서 검증 가능한 축을 잡는다:
//   - 로컬 영속 스냅샷 왕복 (앱 재시작에서 스트릭이 사라지지 않는다)
//   - 레거시 저장본(필드 없음) → 0
//   - 스토어가 새 굴림을 찾는 규칙 (`findNewSlotSpin`) — 건너가기·잔액 부족은 nil
//

import XCTest
@testable import UpNext

@MainActor
final class UpHeroSlotPityTests: XCTestCase {

    // MARK: - 로컬 영속

    func testStreakSurvivesLocalPersistence() throws {
        var state = UpHeroStore.makeDefaultState()
        state.slotBlankStreak = 3
        let data = try JSONEncoder().encode(PersistedUpHeroState(state))
        let restored = try JSONDecoder().decode(PersistedUpHeroState.self, from: data).toState()
        XCTAssertEqual(restored.slotBlankStreak, 3)
    }

    /// 구 저장본에는 키가 없다 — 0 으로 읽혀야 하고, 손상 값은 접힌다.
    func testLegacyAndCorruptLocalSaveNormalize() throws {
        let legacy = try JSONEncoder().encode(PersistedUpHeroState(UpHeroStore.makeDefaultState()))
        var obj = try XCTUnwrap(JSONSerialization.jsonObject(with: legacy) as? [String: Any])
        obj.removeValue(forKey: "slotBlankStreak")
        let noKey = try JSONDecoder().decode(
            PersistedUpHeroState.self, from: JSONSerialization.data(withJSONObject: obj))
        XCTAssertNil(noKey.slotBlankStreak)
        XCTAssertEqual(noKey.toState().slotBlankStreak, 0)

        obj["slotBlankStreak"] = 99999
        let huge = try JSONDecoder().decode(
            PersistedUpHeroState.self, from: JSONSerialization.data(withJSONObject: obj))
        XCTAssertEqual(huge.toState().slotBlankStreak, UpHeroSlot.blankStreakMax)

        obj["slotBlankStreak"] = -5
        let negative = try JSONDecoder().decode(
            PersistedUpHeroState.self, from: JSONSerialization.data(withJSONObject: obj))
        XCTAssertEqual(negative.toState().slotBlankStreak, 0)
    }

    /// 기본 상태는 스트릭 0 (nil) — 상태 사본이 nil 이어도 클라우드 페이로드는 0 을 싣는다.
    func testDefaultStateEncodesZero() throws {
        let state = UpHeroStore.makeDefaultState()
        XCTAssertNil(state.slotBlankStreak)
        let payload = try XCTUnwrap(CloudUpHeroState(state).firestoreValue())
        XCTAssertEqual(payload["slotBlankStreak"] as? Int, 0)
    }

    // MARK: - 스토어가 새 굴림을 찾는 규칙

    private func session(coins: Int) -> CombatSession {
        var rng = Mulberry32(seed: 1)
        var s = UpHeroSession.createSession(
            dungeonId: .fitness, hero: UpHeroRules.createDefaultHero(), startFloor: 1, rng: &rng)
        s.rewards.coins = coins
        return s
    }

    private func armed(_ s: CombatSession) -> CombatSession {
        var out = s
        let ev = UpHeroSlotEvent.event
        out.log.append(.choice(
            prompt: ev.prompt, promptKey: ev.promptKey, promptParams: nil,
            options: ev.options, resolvedIndex: nil, variant: nil, timeoutMs: nil,
            defaultOptionIndex: nil, isMystery: nil, timestamp: 0))
        out.pendingChoiceIndex = out.log.count - 1
        out.status = .awaitingChoice
        return out
    }

    func testFindNewSlotSpinSeesOnlyTheNewSpin() {
        var rng = Mulberry32(seed: 1337)
        let before = armed(session(coins: 500))
        let after = UpHeroSession.resolveChoice(before, optionIndex: 0, rng: &rng)
        let spin = UpHeroStore.findNewSlotSpin(prev: before, next: after)
        XCTAssertNotNil(spin)
        XCTAssertEqual(spin?.outcome, .blank)
        // 같은 로그를 다시 비교하면(새 엔트리 없음) nil — 스트릭이 두 번 오르지 않는다.
        XCTAssertNil(UpHeroStore.findNewSlotSpin(prev: after, next: after))
    }

    func testFindNewSlotSpinIgnoresSkipAndBlockedSpin() {
        var rng = Mulberry32(seed: 1)
        let before = armed(session(coins: 500))
        let skipped = UpHeroSession.resolveChoice(before, optionIndex: 1, rng: &rng)
        XCTAssertNil(UpHeroStore.findNewSlotSpin(prev: before, next: skipped), "건너가기는 굴림이 아니다")

        let poor = armed(session(coins: UpHeroSlot.spinCost - 1))
        let blocked = UpHeroSession.resolveChoice(poor, optionIndex: 0, rng: &rng)
        XCTAssertNil(UpHeroStore.findNewSlotSpin(prev: poor, next: blocked), "잔액 부족은 굴림이 아니다")
    }

    /// 상태 스트릭을 세션 사본에 실어 넘기면 pity 가 실제로 발동한다 — 스토어 `resolveChoice`
    /// 가 하는 일을 세션 층위에서 재현 (스토어는 디스크에 붙어 있어 여기서 직접 만들지 않는다).
    func testCarrierStreakArmsPityInSession() {
        for seed in 1...40 {
            var rng = Mulberry32(seed: seed)
            var s = armed(session(coins: 1000))
            s.slotBlankStreak = UpHeroSlot.pityThreshold - 1   // 스토어가 넣어주는 값
            let after = UpHeroSession.resolveChoice(s, optionIndex: 0, rng: &rng)
            let spin = UpHeroStore.findNewSlotSpin(prev: s, next: after)
            XCTAssertNotEqual(spin?.outcome, .blank, "pity 인데 꽝 (seed \(seed))")
            XCTAssertEqual(UpHeroSlot.nextBlankStreak(prev: UpHeroSlot.pityThreshold - 1,
                                                     outcome: spin?.outcome ?? .blank), 0)
        }
    }
}

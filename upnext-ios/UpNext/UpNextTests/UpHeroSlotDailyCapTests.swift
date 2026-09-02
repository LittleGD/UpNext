//
//  UpHeroSlotDailyCapTests.swift
//  UpNextTests — 굴림틀 **하루 3회** 상한 (상태 층위 계약).
//
//  카운터는 `UpHeroState.shopDaily.slotSpins` 에 산다 — 탐험권·코인 주머니와 같은
//  날짜 키로 리셋되고, 세션은 카운터를 갖지 않는다 (웹 upHeroSlotDailyCap.test.ts /
//  sync.test.ts 의 slotSpins 축). 여기서 잡는 것:
//   - 롤오버: 날짜가 바뀌면 shopDaily 의 모든 일일 카운터가 함께 0
//   - slotSpinsToday / slotSpinsLeft: 부재 = 0, 남은 횟수는 0 미만으로 내려가지 않는다
//   - 세션 게이트는 오늘 횟수 스냅샷을 읽는다 (새 탐험이어도 오늘 3회면 막힌다)
//   - 클라우드: 와이어 키 "slotSpins" 관용 디코드 [0, 100] · 항상 인코드
//   - 로컬 영속 왕복 · 구 저장본 부재 = 0
//   - 확률 공개 UI 의 포맷/표가 계산값과 일치한다
//

import XCTest
@testable import UpNext

@MainActor
final class UpHeroSlotDailyCapTests: XCTestCase {

    private let today = "2026-09-01"
    private let yesterday = "2026-08-31"

    // MARK: - 롤오버 / 스냅샷

    func testCurrentShopDailyRollsOverEveryCounterTogether() {
        let old = ShopDaily(date: yesterday, passesBought: 3, coinPouchClaimed: true, slotSpins: 2)
        let rolled = UpHeroStore.currentShopDaily(old, today: today)
        XCTAssertEqual(rolled.date, today)
        XCTAssertEqual(rolled.passesBought, 0)
        XCTAssertNil(rolled.coinPouchClaimed)
        XCTAssertNil(rolled.slotSpins)
        XCTAssertEqual(UpHeroStore.slotSpinsToday(old, today: today), 0, "어제 횟수가 오늘로 넘어왔다")

        // 같은 날이면 그대로.
        let same = ShopDaily(date: today, passesBought: 1, coinPouchClaimed: nil, slotSpins: 2)
        XCTAssertEqual(UpHeroStore.currentShopDaily(same, today: today), same)
        // 없으면 빈 오늘.
        XCTAssertEqual(UpHeroStore.currentShopDaily(nil, today: today),
                       ShopDaily(date: today, passesBought: 0, coinPouchClaimed: nil, slotSpins: nil))
    }

    func testSpinsTodayAndLeft() {
        func daily(_ n: Int?) -> ShopDaily {
            ShopDaily(date: today, passesBought: 0, coinPouchClaimed: nil, slotSpins: n)
        }
        XCTAssertEqual(UpHeroStore.slotSpinsToday(nil, today: today), 0)
        XCTAssertEqual(UpHeroStore.slotSpinsLeft(nil, today: today), UpHeroSlot.dailySpinCap)
        XCTAssertEqual(UpHeroStore.slotSpinsToday(daily(nil), today: today), 0)     // 구 저장본
        XCTAssertEqual(UpHeroStore.slotSpinsLeft(daily(2), today: today), 1)
        XCTAssertEqual(UpHeroStore.slotSpinsLeft(daily(UpHeroSlot.dailySpinCap), today: today), 0)
        // 손상 값 — 남은 횟수는 음수가 되지 않고, 과대 값은 와이어 상한에서 접힌다.
        XCTAssertEqual(UpHeroStore.slotSpinsLeft(daily(7), today: today), 0)
        XCTAssertEqual(UpHeroStore.slotSpinsToday(daily(-4), today: today), 0)
        XCTAssertEqual(UpHeroStore.slotSpinsToday(daily(10_000), today: today), UpHeroSlot.spinsWireMax)
    }

    func testNormalizeSpinsMatchesWebClamp() {
        XCTAssertEqual(UpHeroSlot.spinsWireMax, 100)
        XCTAssertEqual(UpHeroSlot.normalizeSpins(nil), 0)
        XCTAssertEqual(UpHeroSlot.normalizeSpins(-1), 0)
        XCTAssertEqual(UpHeroSlot.normalizeSpins(0), 0)
        XCTAssertEqual(UpHeroSlot.normalizeSpins(3), 3)
        XCTAssertEqual(UpHeroSlot.normalizeSpins(100), 100)
        XCTAssertEqual(UpHeroSlot.normalizeSpins(101), 100)
    }

    // MARK: - 세션 게이트는 오늘 횟수 스냅샷을 읽는다

    private func armedSession(coins: Int) -> CombatSession {
        var rng = Mulberry32(seed: 1)
        var s = UpHeroSession.createSession(
            dungeonId: .fitness, hero: UpHeroRules.createDefaultHero(), startFloor: 1, rng: &rng)
        s.rewards.coins = coins
        let ev = UpHeroSlotEvent.event
        s.log.append(.choice(
            prompt: ev.prompt, promptKey: ev.promptKey, promptParams: nil,
            options: ev.options, resolvedIndex: nil, variant: nil, timeoutMs: nil,
            defaultOptionIndex: nil, isMystery: nil, timestamp: 0))
        s.pendingChoiceIndex = s.log.count - 1
        s.status = .awaitingChoice
        return s
    }

    /// 새 세션(이번 탐험 굴림 0회)이라도 오늘 3회를 다 썼으면 굴림이 일어나지 않는다 —
    /// "탐험 1회당 3회" 로 새던 구 동작의 회귀 가드.
    func testFreshSessionIsStillBlockedWhenTodayIsCapped() {
        for seed in 1...20 {
            var rng = Mulberry32(seed: seed)
            let before = armedSession(coins: 1000)
            let capped = UpHeroSession.resolveChoice(
                before, optionIndex: 0, slotSpinsToday: UpHeroSlot.dailySpinCap, rng: &rng)
            XCTAssertNil(UpHeroStore.findNewSlotSpin(prev: before, next: capped),
                         "오늘 상한인데 새 탐험에서 굴림이 일어났다 (seed \(seed))")
            XCTAssertEqual(capped.rewards.coins, 1000)

            var rng2 = Mulberry32(seed: seed)
            let open = UpHeroSession.resolveChoice(
                before, optionIndex: 0, slotSpinsToday: UpHeroSlot.dailySpinCap - 1, rng: &rng2)
            XCTAssertNotNil(UpHeroStore.findNewSlotSpin(prev: before, next: open),
                            "오늘 2회면 세 번째는 돌아야 한다 (seed \(seed))")
        }
    }

    /// 이벤트 등장 게이트도 같은 스냅샷을 읽는다 — 상한인 날은 굴림틀이 후보에서 빠진다.
    func testTickGateUsesDailySnapshot() {
        var appearedWhenOpen = 0
        for seed in 1...300 {
            var rng = Mulberry32(seed: seed)
            var s = UpHeroSession.createSession(
                dungeonId: .fitness, hero: UpHeroRules.createDefaultHero(), startFloor: 2, rng: &rng)
            s.rewards.coins = 1000
            let capped = UpHeroSession.tickSession(
                s, flavor: FlavorPool.bundled, slotSpinsToday: UpHeroSlot.dailySpinCap, rng: &rng)
            for entry in capped.log {
                if case let .choice(prompt, _, _, _, _, _, _, _, _, _) = entry {
                    XCTAssertFalse(UpHeroSlotEvent.isSlotEvent(prompt),
                                   "오늘 상한인데 굴림틀 이벤트가 떴다 (seed \(seed))")
                }
            }
            var rng2 = Mulberry32(seed: seed)
            let open = UpHeroSession.tickSession(
                s, flavor: FlavorPool.bundled, slotSpinsToday: 0, rng: &rng2)
            for entry in open.log {
                if case let .choice(prompt, _, _, _, _, _, _, _, _, _) = entry,
                   UpHeroSlotEvent.isSlotEvent(prompt) { appearedWhenOpen += 1 }
            }
        }
        XCTAssertGreaterThan(appearedWhenOpen, 0, "게이트가 열렸는데 300 시드에서 한 번도 안 떴다")
    }

    // MARK: - 클라우드 와이어 (웹 normalizeShopDaily / encodeUpHeroForCloud)

    private func decodeShopDaily(_ slotSpinsJSON: String?) throws -> ShopDaily? {
        let field = slotSpinsJSON.map { ", \"slotSpins\": \($0)" } ?? ""
        let json = """
        { "coins": 0, "shopDaily": { "date": "\(today)", "passesBought": 1\(field) } }
        """
        return try JSONDecoder().decode(CloudUpHeroState.self, from: Data(json.utf8)).shopDaily
    }

    func testCloudDecodeIsLenientLikeWeb() throws {
        XCTAssertEqual(try decodeShopDaily(nil)?.slotSpins, 0, "옛 문서(키 없음)는 0")
        XCTAssertEqual(try decodeShopDaily("2")?.slotSpins, 2)
        XCTAssertEqual(try decodeShopDaily("2.7")?.slotSpins, 2, "소수는 내림")
        XCTAssertEqual(try decodeShopDaily("-3")?.slotSpins, 0)
        XCTAssertEqual(try decodeShopDaily("500")?.slotSpins, UpHeroSlot.spinsWireMax)
        XCTAssertEqual(try decodeShopDaily("\"x\"")?.slotSpins, 0, "비숫자는 0")
        XCTAssertEqual(try decodeShopDaily("true")?.slotSpins, 0)
        XCTAssertEqual(try decodeShopDaily("null")?.slotSpins, 0)
        // 다른 필드는 그대로.
        XCTAssertEqual(try decodeShopDaily("2")?.passesBought, 1)
    }

    func testCloudEncodeAlwaysEmitsSlotSpins() throws {
        var state = UpHeroStore.makeDefaultState()
        state.shopDaily = ShopDaily(date: today, passesBought: 0, coinPouchClaimed: nil, slotSpins: nil)
        var payload = try XCTUnwrap(CloudUpHeroState(state).firestoreValue())
        var sd = try XCTUnwrap(payload["shopDaily"] as? [String: Any])
        XCTAssertEqual(sd["slotSpins"] as? Int, 0, "nil 이어도 0 을 실어 merge 에 어제 값이 남지 않게")
        XCTAssertEqual(Set(sd.keys), ["date", "passesBought", "coinPouchClaimed", "slotSpins"])

        state.shopDaily?.slotSpins = 2
        payload = try XCTUnwrap(CloudUpHeroState(state).firestoreValue())
        sd = try XCTUnwrap(payload["shopDaily"] as? [String: Any])
        XCTAssertEqual(sd["slotSpins"] as? Int, 2)

        state.shopDaily?.slotSpins = 500
        payload = try XCTUnwrap(CloudUpHeroState(state).firestoreValue())
        sd = try XCTUnwrap(payload["shopDaily"] as? [String: Any])
        XCTAssertEqual(sd["slotSpins"] as? Int, UpHeroSlot.spinsWireMax, "손상 값은 와이어에서도 접힌다")
    }

    /// 웹이 쓴 shopDaily 를 읽고 다시 쓰면 같은 구조다 (키 4개, 값 동일).
    func testCloudShopDailyRoundTrip() throws {
        let json = """
        { "coins": 0, "shopDaily": { "date": "\(today)", "passesBought": 2, "coinPouchClaimed": true, "slotSpins": 3 } }
        """
        let decoded = try JSONDecoder().decode(CloudUpHeroState.self, from: Data(json.utf8))
        let payload = try XCTUnwrap(decoded.firestoreValue())
        let sd = try XCTUnwrap(payload["shopDaily"] as? [String: Any])
        XCTAssertEqual(sd["date"] as? String, today)
        XCTAssertEqual(sd["passesBought"] as? Int, 2)
        XCTAssertEqual(sd["coinPouchClaimed"] as? Bool, true)
        XCTAssertEqual(sd["slotSpins"] as? Int, 3)
    }

    // MARK: - 로컬 영속

    func testLocalPersistenceRoundTripsSlotSpins() throws {
        var state = UpHeroStore.makeDefaultState()
        state.shopDaily = ShopDaily(date: today, passesBought: 1, coinPouchClaimed: true, slotSpins: 2)
        let data = try JSONEncoder().encode(PersistedUpHeroState(state))
        let restored = try JSONDecoder().decode(PersistedUpHeroState.self, from: data).toState()
        XCTAssertEqual(restored.shopDaily?.slotSpins, 2)
        XCTAssertEqual(UpHeroStore.slotSpinsToday(restored.shopDaily, today: today), 2)
    }

    /// 구 저장본의 shopDaily 에는 slotSpins 키가 없다 — 0 으로 읽힌다.
    func testLegacyLocalSaveWithoutSlotSpinsReadsZero() throws {
        var state = UpHeroStore.makeDefaultState()
        state.shopDaily = ShopDaily(date: today, passesBought: 1, coinPouchClaimed: nil, slotSpins: 2)
        let data = try JSONEncoder().encode(PersistedUpHeroState(state))
        var obj = try XCTUnwrap(JSONSerialization.jsonObject(with: data) as? [String: Any])
        var sd = try XCTUnwrap(obj["shopDaily"] as? [String: Any])
        sd.removeValue(forKey: "slotSpins")
        obj["shopDaily"] = sd
        let legacy = try JSONDecoder().decode(
            PersistedUpHeroState.self, from: JSONSerialization.data(withJSONObject: obj)).toState()
        XCTAssertNil(legacy.shopDaily?.slotSpins)
        XCTAssertEqual(UpHeroStore.slotSpinsToday(legacy.shopDaily, today: today), 0)
        XCTAssertEqual(UpHeroStore.slotSpinsLeft(legacy.shopDaily, today: today), UpHeroSlot.dailySpinCap)
    }

    // MARK: - 확률 공개 UI (숫자는 계산값, 웹과 글자 단위로 같다)

    func testFormatPercentMatchesWeb() {
        XCTAssertEqual(UpHeroSlot.formatPercent(0.49), "49%")
        XCTAssertEqual(UpHeroSlot.formatPercent(0.194), "19.4%")
        XCTAssertEqual(UpHeroSlot.formatPercent(0.112), "11.2%")
        XCTAssertEqual(UpHeroSlot.formatPercent(0.017), "1.7%")
        XCTAssertEqual(UpHeroSlot.formatPercent(0.105), "10.5%")
        XCTAssertEqual(UpHeroSlot.formatPercent(0.039), "3.9%")
        XCTAssertEqual(UpHeroSlot.formatPercent(0.034), "3.4%")
        XCTAssertEqual(UpHeroSlot.formatPercent(0.009), "0.9%")
        XCTAssertEqual(UpHeroSlot.formatPercent(0.9275), "92.75%")
        XCTAssertEqual(UpHeroSlot.formatPercent(0), "0%")
        XCTAssertEqual(UpHeroSlot.formatPercent(1), "100%")
        XCTAssertEqual(UpHeroSlot.formatPercent(0.123456), "12.35%")
        // 환수율 표기는 rtp() 계산값을 그대로 포맷한다.
        XCTAssertEqual(UpHeroSlot.formatPercent(UpHeroSlot.rtp()), "92.75%")
    }

    func testOddsRowsFollowTableOrderAndSumToOne() {
        let rows = UpHeroSlot.oddsRows()
        XCTAssertEqual(rows.map(\.id), UpHeroSlot.outcomes.map(\.id), "표 순서 = 테이블 순서")
        XCTAssertEqual(rows.first?.id, .blank, "꽝이 첫 줄")
        XCTAssertEqual(rows.reduce(0) { $0 + $1.probability }, 1.0, accuracy: 1e-12)
        for row in rows {
            XCTAssertEqual(row.probability, UpHeroSlot.odds()[row.id] ?? -1, accuracy: 1e-12)
            XCTAssertEqual(row.grant, UpHeroSlot.grant(row.id))
        }
    }

    /// 표의 모든 줄이 라벨을 갖고, 라벨은 결과 모달과 같은 보상 키에서 나온다 (빈 줄 없음).
    func testEveryOddsRowHasALabel() {
        for row in UpHeroSlot.oddsRows() {
            let label = slotOddsLabel(row)
            XCTAssertFalse(label.isEmpty, "\(row.id.rawValue) 라벨이 비었다")
        }
        // 꽝은 전용 키, 코인은 액면가가 라벨에 들어간다.
        XCTAssertFalse(slotOddsLabel(UpHeroSlot.oddsRows()[0]).contains("%"))
        XCTAssertTrue(slotOddsLabel(UpHeroSlot.OddsRow(id: .coinMid, probability: 0, grant: .coins(amount: 250)))
                        .contains("250"))
    }
}

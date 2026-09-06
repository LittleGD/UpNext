//
//  UpHeroInventoryTests.swift
//  UpNextTests — Phase 6-E (Track E, 피드백 22/24) 인벤토리 경제: 판매가 · 합성 · 정산.
//  격자 가방 병합 뒤 정산은 settleBagAfterSession (first-fit + 트레이 캡 10 초과분 자동 판매,
//  이번 드롭만) 이 맡고, 30칸 상한(INVENTORY_CAP)·splitDropsByCap 은 레거시다.
//
//  웹 src/types/uphero.test.ts (sellPrice/NEXT_RARITY) ·
//  src/lib/sessionReward.test.ts (splitDropsByCap, 레거시) · src/data/upHeroEquipment.test.ts
//  (synthesizeEquipment) · src/store/upHeroInventoryCap.test.ts 의 iOS 미러.
//  합성 시드 픽스처는 scripts/datalayer-check.mjs 섹션 8 의 웹 출력에서 가져왔다.
//

import XCTest
@testable import UpNext

@MainActor
final class UpHeroInventoryTests: XCTestCase {

    private static var sharedStore: UpHeroStore?

    private func freshStore() -> UpHeroStore {
        let s = Self.sharedStore ?? UpHeroStore()
        Self.sharedStore = s
        s.resetAllData()
        return s
    }

    override func tearDown() {
        Self.sharedStore?.resetAllData()
        super.tearDown()
    }

    private func item(_ n: Int, rarity: Rarity = .normal, category: DungeonId = .fitness,
                      dropFloor: Int? = 3, enhanceLevel: Int? = nil, photoId: String? = nil,
                      type: EquipSlot = .weapon, baseId: String? = "self_control_sword",
                      bagX: Int? = nil, bagY: Int? = nil, bagRot: Int? = nil) -> Equipment {
        Equipment(id: "inv-\(n)", name: "자기절제의 검", baseId: baseId, type: type, rarity: rarity,
                  category: category, iconName: "Sword", stats: [.str: 5], effects: nil, flavor: nil,
                  photoId: photoId, enhanceLevel: enhanceLevel, enhanceFailStreak: nil, affix: nil,
                  affixes: nil, talismanSkills: nil, dropFloor: dropFloor,
                  bagX: bagX, bagY: bagY, bagRot: bagRot)
    }

    /// 4행 보드(확장 0)의 십자를 뺀 빈 칸 15개 — 1x1 장신구로 전부 채운다 (웹 FREE_CELLS).
    private static let freeCells: [(Int, Int)] = [
        (0, 0), (1, 0), (3, 0), (4, 0),
        (0, 1), (4, 1),
        (0, 2), (1, 2), (3, 2), (4, 2),
        (0, 3), (1, 3), (2, 3), (3, 3), (4, 3),
    ]
    private func filledBoard() -> [Equipment] {
        Self.freeCells.enumerated().map { i, c in
            item(i, type: .accessory, bagX: c.0, bagY: c.1, bagRot: 0)
        }
    }

    /// 완료된 세션 (시간 만료) — 드롭 N개. 웹 completedSession(drops).
    private func completedSession(drops: [Equipment]) -> CombatSession {
        var rng = Mulberry32(seed: 7)
        var s = UpHeroSession.createSession(
            dungeonId: .fitness, hero: UpHeroRules.createDefaultHero(), startFloor: 1, rng: &rng)
        s.rewards.drops = drops
        s.status = .completed
        s.log.append(.sessionEnd(reason: .timeExpired, detail: nil, detailKey: nil,
                                 detailMonsterTemplateId: nil, detailMonsterFallback: nil,
                                 detailFloor: nil, timestamp: 0))
        return s
    }

    // MARK: - 상수 / 판매가 (웹 uphero.test.ts)

    func testEconomyConstantsMatchWeb() {
        XCTAssertEqual(UpHeroRules.inventoryCap, 30)
        XCTAssertEqual(UpHeroRules.synthesisInputCount, 3)
        XCTAssertEqual(UpHeroRules.nextRarity[.normal], .rare)
        XCTAssertEqual(UpHeroRules.nextRarity[.rare], .unique)
        XCTAssertEqual(UpHeroRules.nextRarity[.unique], .legend)
        XCTAssertNil(UpHeroRules.nextRarity[.legend])
        XCTAssertEqual(UpHeroRules.sellPriceBase, [.normal: 5, .rare: 15, .unique: 50, .legend: 200])
    }

    /// 여섯 개 공유 픽스처 — 웹 sellPrice 와 동일 (마지막은 층 99 · 단계 20 clamp → 1792).
    func testSellPriceSharedFixtures() {
        XCTAssertEqual(UpHeroRules.sellPrice(rarity: .normal, dropFloor: 0, enhanceLevel: 0), 5)
        XCTAssertEqual(UpHeroRules.sellPrice(rarity: .normal, dropFloor: 30, enhanceLevel: 0), 35)
        XCTAssertEqual(UpHeroRules.sellPrice(rarity: .rare, dropFloor: 12, enhanceLevel: 3), 57)
        XCTAssertEqual(UpHeroRules.sellPrice(rarity: .unique, dropFloor: 20, enhanceLevel: 10), 280)
        XCTAssertEqual(UpHeroRules.sellPrice(rarity: .legend, dropFloor: 30, enhanceLevel: 10), 840)
        XCTAssertEqual(UpHeroRules.sellPrice(rarity: .legend, dropFloor: 120, enhanceLevel: 25), 1792)
        // nil / 음수는 0 으로 (사진 부적·손상본).
        XCTAssertEqual(UpHeroRules.sellPrice(rarity: .rare, dropFloor: nil, enhanceLevel: nil), 15)
        XCTAssertEqual(UpHeroRules.sellPrice(rarity: .rare, dropFloor: -4, enhanceLevel: -1), 15)
    }

    // MARK: - splitDropsByCap (웹 sessionReward.test.ts)

    func testSplitDropsByCap() {
        let drops = (0..<5).map { item(100 + $0) }
        let a = SessionReward.splitDropsByCap(inventoryCount: 28, drops: drops, cap: 30)
        XCTAssertEqual(a.fits.map(\.id), ["inv-100", "inv-101"])
        XCTAssertEqual(a.overflow.map(\.id), ["inv-102", "inv-103", "inv-104"])
        let b = SessionReward.splitDropsByCap(inventoryCount: 30, drops: drops, cap: 30)
        XCTAssertEqual(b.fits, [])
        XCTAssertEqual(b.overflow.count, 5)
        let c = SessionReward.splitDropsByCap(inventoryCount: 33, drops: drops, cap: 30)
        XCTAssertEqual(c.fits, [])
        let d = SessionReward.splitDropsByCap(inventoryCount: 0, drops: drops, cap: 30)
        XCTAssertEqual(d.fits.count, 5)
        XCTAssertEqual(d.overflow, [])
    }

    // MARK: - synthesizeEquipment (웹 upHeroEquipment.test.ts + datalayer 섹션 8 픽스처)

    private func synthSources(_ rarity: Rarity) -> [Equipment] {
        [item(1, rarity: rarity, category: .fitness, dropFloor: 12, enhanceLevel: 4),
         item(2, rarity: rarity, category: .learning, dropFloor: 20, enhanceLevel: 9),
         item(3, rarity: rarity, category: .learning, dropFloor: 15)]
    }

    func testSynthesizeMatchesWebSeededFixture() throws {
        // datalayer-check.mjs: synth:rare:s1 = wisdom_glasses|unique|f20|... |crit:3,int:33,slotBonus:1,str:4|affix:str
        var rng = Mulberry32(seed: 1)
        let out = try XCTUnwrap(EquipmentPool.synthesizeEquipment(synthSources(.rare), rng: &rng))
        XCTAssertEqual(out.baseId, "wisdom_glasses")
        XCTAssertEqual(out.rarity, .unique)
        XCTAssertEqual(out.dropFloor, 20)
        XCTAssertEqual(out.stats, [.crit: 3, .int: 33, .slotBonus: 1, .str: 4])
        XCTAssertEqual(out.affix, .str)
        XCTAssertNil(out.enhanceLevel)
        XCTAssertNil(out.enhanceFailStreak)
        XCTAssertEqual(out.name, "전설적 지혜의 안경 of 힘")

        // synth:normal:s4 = bookmark_charm|rare|f20|빛나는 책갈피의 부적 of 지성|dex:21,int:2,slotBonus:1|affix:int
        var rng4 = Mulberry32(seed: 4)
        let charm = try XCTUnwrap(EquipmentPool.synthesizeEquipment(synthSources(.normal), rng: &rng4))
        XCTAssertEqual(charm.baseId, "bookmark_charm")
        XCTAssertEqual(charm.rarity, .rare)
        XCTAssertEqual(charm.stats, [.dex: 21, .int: 2, .slotBonus: 1])  // 부적은 rare 에서도 slotBonus 1

        // synth:unique:s2 = memo_pen|legend|f20|... |crit:7,int:42,str:6,vit:6|affixes:vit+str
        var rng2 = Mulberry32(seed: 2)
        let pen = try XCTUnwrap(EquipmentPool.synthesizeEquipment(synthSources(.unique), rng: &rng2))
        XCTAssertEqual(pen.baseId, "memo_pen")
        XCTAssertEqual(pen.rarity, .legend)
        XCTAssertEqual(pen.affixes, [.vit, .str])
        XCTAssertEqual(pen.stats, [.crit: 7, .int: 42, .str: 6, .vit: 6])
    }

    func testSynthesizePoolIsCategoryUnionAndSeedDeterministic() throws {
        let allowed = Set(EquipmentPool.templates.filter { [.fitness, .learning].contains($0.category) }.map(\.baseId))
        for seed in 1...12 {
            var rng = Mulberry32(seed: seed)
            let out = try XCTUnwrap(EquipmentPool.synthesizeEquipment(synthSources(.rare), rng: &rng))
            XCTAssertTrue(allowed.contains(out.baseId ?? ""), "seed \(seed): \(out.baseId ?? "-")")
            XCTAssertEqual(out.dropFloor, 20)
        }
        var a = Mulberry32(seed: 99), b = Mulberry32(seed: 99)
        var x = try XCTUnwrap(EquipmentPool.synthesizeEquipment(synthSources(.rare), rng: &a))
        var y = try XCTUnwrap(EquipmentPool.synthesizeEquipment(synthSources(.rare), rng: &b))
        x.id = ""; y.id = ""
        XCTAssertEqual(x, y)
    }

    func testSynthesizeRejectsLegendMismatchPhotoAndCount() {
        var rng = Mulberry32(seed: 1)
        XCTAssertNil(EquipmentPool.synthesizeEquipment(synthSources(.legend), rng: &rng))
        var mixed = synthSources(.rare)
        mixed[1].rarity = .unique
        XCTAssertNil(EquipmentPool.synthesizeEquipment(mixed, rng: &rng))
        var photo = synthSources(.rare)
        photo[2].photoId = "p1"; photo[2].type = .talisman
        XCTAssertNil(EquipmentPool.synthesizeEquipment(photo, rng: &rng))
        XCTAssertNil(EquipmentPool.synthesizeEquipment(Array(synthSources(.rare).prefix(2)), rng: &rng))
        XCTAssertNil(EquipmentPool.synthesizeEquipment(synthSources(.rare) + [item(4, rarity: .rare)], rng: &rng))
    }

    // MARK: - 정산 — 격자 가방 반영 (웹 upHeroInventoryCap.test.ts settleBagAfterSession)

    func testSettlementPlacesDropsFirstFitAndKeepsLegacyOverflow() {
        let store = freshStore()
        store.debugSetState { s in
            s.inventory = [self.item(1)]
            s.overflowDrops = [self.item(50)]
            s.coins = 0
        }
        store.debugSetCurrentSession(completedSession(drops: (0..<3).map { item(100 + $0, dropFloor: 7) }))
        store.acknowledgeSessionEnd()
        XCTAssertEqual(store.state.inventory.map(\.id), ["inv-1", "inv-100", "inv-101", "inv-102"])
        XCTAssertTrue(store.state.inventory.dropFirst().allSatisfy { $0.bagX != nil && $0.bagY != nil },
                      "드롭은 first-fit 으로 보드에 들어간다")
        // 레거시 필드는 정산이 더 이상 늘리지 않는다 — 남아 있던 것만 그대로.
        XCTAssertEqual(store.state.overflowDrops.map(\.id), ["inv-50"])
        XCTAssertEqual(store.state.coins, 0)
        XCTAssertNil(store.state.currentSession)
    }

    func testSettlementAutoSellsOnlyThisDropWhenTrayOverflows() {
        // 기존 트레이 10개는 캡을 넘어도 절대 팔리지 않는다 (격자 도입 전 저장본 보호).
        let tray = (0..<UpHeroBag.trayCap).map { item(200 + $0, rarity: .rare) }
        let drops = [
            item(300, rarity: .rare, dropFloor: 12, enhanceLevel: 3),
            item(301, rarity: .normal, dropFloor: 30),
            item(302, rarity: .unique, dropFloor: 20),
        ]
        let store = freshStore()
        store.debugSetState { s in
            s.inventory = self.filledBoard() + tray
            s.overflowDrops = []
            s.coins = 0
        }
        store.debugSetCurrentSession(completedSession(drops: drops))
        store.acknowledgeSessionEnd()
        let ids = Set(store.state.inventory.map(\.id))
        for t in tray { XCTAssertTrue(ids.contains(t.id)) }
        for d in drops { XCTAssertFalse(ids.contains(d.id)) }
        XCTAssertEqual(store.state.inventory.count, 25)
        XCTAssertEqual(store.state.overflowDrops, [])
        XCTAssertEqual(
            store.state.coins,
            UpHeroRules.sellPrice(rarity: .rare, dropFloor: 12, enhanceLevel: 3)
                + UpHeroRules.sellPrice(rarity: .normal, dropFloor: 30, enhanceLevel: nil)
                + UpHeroRules.sellPrice(rarity: .unique, dropFloor: 20, enhanceLevel: nil))
    }

    func testSettlementUnionsRewardDropsIntoCodex() {
        let store = freshStore()
        store.debugSetCurrentSession(completedSession(drops: [
            item(1, type: .armor, baseId: "grain_armor"),
        ]))
        store.acknowledgeSessionEnd()
        XCTAssertTrue(store.state.codex.equipment.contains("곡물의 갑옷"))
    }

    // MARK: - overflow 처리

    func testResolveOverflowSellPaysSellPriceAndRemoves() {
        let store = freshStore()
        store.debugSetState { s in
            s.overflowDrops = [self.item(1, rarity: .rare, dropFloor: 12, enhanceLevel: 3), self.item(2)]
            s.coins = 10
        }
        XCTAssertEqual(store.resolveOverflowItem("inv-1", sell: true), 57)
        XCTAssertEqual(store.state.coins, 67)
        XCTAssertEqual(store.state.overflowDrops.map(\.id), ["inv-2"])
        XCTAssertEqual(store.resolveOverflowItem("inv-2", sell: false), 0)
        XCTAssertEqual(store.state.coins, 67)
        XCTAssertEqual(store.state.overflowDrops, [])
        XCTAssertEqual(store.resolveOverflowItem("nope", sell: true), 0)
    }

    func testSellAllOverflowReturnsTotalAndClears() {
        let store = freshStore()
        store.debugSetState { s in
            s.overflowDrops = [self.item(1, rarity: .legend, dropFloor: 30, enhanceLevel: 10),
                               self.item(2, rarity: .normal, dropFloor: 30)]
            s.coins = 0
        }
        XCTAssertEqual(store.sellAllOverflow(), 840 + 35)
        XCTAssertEqual(store.state.coins, 875)
        XCTAssertEqual(store.state.overflowDrops, [])
        XCTAssertEqual(store.sellAllOverflow(), 0)
    }

    func testSellItemUsesFloorAndEnhanceBonus() {
        let store = freshStore()
        store.debugSetState { s in
            s.inventory = [self.item(1, rarity: .legend, dropFloor: 30, enhanceLevel: 10)]
            s.coins = 0
        }
        XCTAssertEqual(store.sellItem("inv-1"), 840)
        XCTAssertEqual(store.state.coins, 840)
    }

    // MARK: - synthesizeItems (스토어)

    private func rares() -> [Equipment] {
        [item(1, rarity: .rare, dropFloor: 12),
         item(2, rarity: .rare, category: .learning, dropFloor: 20),
         item(3, rarity: .rare, dropFloor: 15)]
    }

    func testSynthesizeItemsShrinksInventoryAndAppendsCodex() throws {
        let store = freshStore()
        store.debugSetState { s in s.inventory = self.rares() + [self.item(4)] }
        var rng = Mulberry32(seed: 11)
        let result = store.synthesizeItems(["inv-1", "inv-2", "inv-3"], rng: &rng)
        guard case .ok(let made) = result else { return XCTFail("\(result)") }
        XCTAssertEqual(store.state.inventory.count, 2)
        XCTAssertTrue(store.state.inventory.map(\.id).contains("inv-4"))
        XCTAssertEqual(made.rarity, .unique)
        XCTAssertEqual(made.dropFloor, 20)
        XCTAssertEqual(store.state.inventory.last?.id, made.id)
        XCTAssertEqual(store.state.codex.equipment, [EquipmentPool.equipmentBaseName(made)])
    }

    func testSynthesizeItemsFailureReasons() {
        let store = freshStore()
        store.debugSetState { s in s.inventory = self.rares() }
        XCTAssertEqual(store.synthesizeItems(["inv-1", "inv-2", "equipped-x"]), .fail(.notFound))
        XCTAssertEqual(store.synthesizeItems(["inv-1", "inv-2"]), .fail(.count))
        XCTAssertEqual(store.synthesizeItems(["inv-1", "inv-1", "inv-2"]), .fail(.count))
        XCTAssertEqual(store.state.inventory.count, 3)

        var mixed = rares(); mixed[2] = item(3, rarity: .unique)
        store.debugSetState { s in s.inventory = mixed }
        XCTAssertEqual(store.synthesizeItems(["inv-1", "inv-2", "inv-3"]), .fail(.rarity))
        store.debugSetState { s in s.inventory = self.rares().map { var e = $0; e.rarity = .legend; return e } }
        XCTAssertEqual(store.synthesizeItems(["inv-1", "inv-2", "inv-3"]), .fail(.legend))
        var photo = rares(); photo[0] = item(1, rarity: .rare, photoId: "p", type: .talisman)
        store.debugSetState { s in s.inventory = photo }
        XCTAssertEqual(store.synthesizeItems(["inv-1", "inv-2", "inv-3"]), .fail(.photo))
    }

    // MARK: - BagOverflowSheet 게이트 (웹 isBagOverflowVisible)

    func testOverflowSheetGate() {
        var s = UpHeroStore.makeDefaultState()
        XCTAssertFalse(BagOverflowSheet.isVisible(s))
        s.overflowDrops = [item(1)]
        XCTAssertTrue(BagOverflowSheet.isVisible(s))
        s.pendingHeroLevelUp = HeroLevelUpEvent(from: 3, to: 4)
        XCTAssertFalse(BagOverflowSheet.isVisible(s), "레벨업 오버레이가 먼저")
        s.pendingHeroLevelUp = nil
        s.pendingClassChoice = PendingClassChoice(recommended: .warrior)
        XCTAssertFalse(BagOverflowSheet.isVisible(s), "전직 제안이 먼저")
        s.pendingClassChoice = nil
        s.currentSession = completedSession(drops: [])
        XCTAssertFalse(BagOverflowSheet.isVisible(s), "캠프에서만")
    }

    // MARK: - 사진 부적 의식 — 보드 가득 (격자 계약: 거절하지 않고 트레이로)

    func testPhotoTalismanInsertsIntoTrayWhenBoardFull() {
        let store = freshStore()
        store.debugSetState { s in
            s.inventory = (0..<30).map { self.item($0) }
            s.coins = 9999
        }
        let photo = PhotoMeta(id: "ph-1", kind: .challengeLog, challengeTitle: "달리기",
                              category: .fitness, date: "2026-09-05", timestamp: 1, memo: "")
        let r = store.bindPhotoAsTalisman(photo: photo)
        XCTAssertTrue(r.ok, r.error ?? "")
        XCTAssertEqual(store.state.inventory.count, 31)
        XCTAssertEqual(store.state.coins, 9999 - PhotoTalisman.ritualCost)
    }

    // MARK: - 영속 스냅샷

    func testPersistedSnapshotRoundTripsOverflowDropsAndLegacyNilBecomesEmpty() throws {
        var s = UpHeroStore.makeDefaultState()
        s.overflowDrops = [item(1, dropFloor: 31)]
        let data = try JSONEncoder().encode(PersistedUpHeroState(s))
        let back = try JSONDecoder().decode(PersistedUpHeroState.self, from: data).toState()
        XCTAssertEqual(back.overflowDrops.map(\.id), ["inv-1"])
        XCTAssertEqual(back.overflowDrops.first?.dropFloor, 31)

        // 구 저장본 — overflowDrops / dropFloor 키 없음.
        var legacy = try XCTUnwrap(JSONSerialization.jsonObject(with: data) as? [String: Any])
        legacy["overflowDrops"] = nil
        let legacyData = try JSONSerialization.data(withJSONObject: legacy)
        let old = try JSONDecoder().decode(PersistedUpHeroState.self, from: legacyData)
        XCTAssertNil(old.overflowDrops)
        XCTAssertEqual(old.toState().overflowDrops, [])
    }
}

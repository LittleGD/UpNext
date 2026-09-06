//
//  UpHeroBagStoreTests.swift
//  UpNextTests — 격자 가방이 스토어 액션에 접히는 방식 (Stores/UpHeroStore.swift).
//
//  순수 로직(UpHeroBag)의 규칙표는 `UpHeroBagTests` 가 지키고, 여기서는 **스토어 왕복**만
//  본다: 어떤 액션이 좌표를 벗기고, 물려주고, 첫 자리를 찾고, 넘침을 판매하는가.
//  웹 정본은 `src/store/upHeroBagRoundtrip.test.ts` + `src/store/useUpHeroStore.ts` 다
//  (2026-09-04, 플랜 ultracode-adaptive-scroll Phase 3).
//
//  스토어에 상태를 심는 통로는 `adoptCloudState` 하나뿐이다 (`state` 는 private(set),
//  `loadPersisted` 는 private static). 클라우드 채택은 로컬 로드와 **같은 정규화·팩 계약**을
//  쓰므로, 좌표 없는 인벤토리를 심는 테스트가 곧 loadPersisted 의 마이그레이션 테스트다.
//

import XCTest
@testable import UpNext

/// 테스트 보드는 5행으로 고정한다 — 상점에서 행 1개를 산 상태.
/// 기본 4행이면 좌표 기대값((4,4) 등)이 규칙이 아니라 보드 크기 때문에 깨진다.
private let testRowsBought = 1
private let testRows = UpHeroBag.bagRows(rowsBought: testRowsBought)

@MainActor
final class UpHeroBagStoreTests: XCTestCase {

    // MARK: - 픽스처 헬퍼

    private func eq(
        _ id: String,
        type: EquipSlot = .accessory,
        rarity: Rarity = .normal,
        category: DungeonId = .fitness,
        stats: [StatKey: Int] = [:],
        photoId: String? = nil,
        x: Int? = nil,
        y: Int? = nil,
        rot: Int? = nil
    ) -> Equipment {
        Equipment(
            id: id, name: id, baseId: nil, type: type, rarity: rarity,
            category: category, iconName: "icon", stats: stats,
            photoId: photoId, bagX: x, bagY: y, bagRot: rot)
    }

    /// 5행 보드의 가방칸 20개를 1x1 로 가득 채운다 (십자 5칸 제외).
    private func fullBoard(prefix: String = "f") -> [Equipment] {
        var out: [Equipment] = []
        for y in 0..<testRows {
            for x in 0..<UpHeroBag.cols where !UpHeroBag.isCrossCell(x: x, y: y) {
                out.append(eq("\(prefix)-\(x)-\(y)", x: x, y: y, rot: 0))
            }
        }
        return out
    }

    /// 원하는 인벤토리·착용으로 채운 스토어. `adoptCloudState` 가 유일한 주입 통로다.
    /// 보드 크기는 레벨이 아니라 산 행 수에서 나오므로 `bagRowsBought` 로 고정한다.
    private func makeStore(
        inventory: [Equipment],
        equipped: [EquipSlot: Equipment] = [:],
        coins: Int = 0,
        rowsBought: Int = testRowsBought
    ) -> UpHeroStore {
        let store = UpHeroStore()
        var seed = UpHeroStore.makeDefaultState()
        seed.heroStartLevel = 1
        seed.hero.equipped = equipped
        seed.inventory = inventory
        seed.coins = coins
        seed.bagRowsBought = rowsBought
        store.adoptCloudState(CloudUpHeroState(seed))
        return store
    }

    private func placement(_ store: UpHeroStore, _ id: String) -> BagPlacement? {
        guard let item = store.state.inventory.first(where: { $0.id == id }) else { return nil }
        return UpHeroBag.readPlacement(item)
    }

    // MARK: - placeItem

    func testPlaceItemRejectsAndCommitsWithoutTouchingStateOnFailure() {
        // a1 = 1x1 @(0,0), w1 = 무기 1x2 @(0,2) → (0,2),(0,3) 점유.
        let store = makeStore(inventory: [
            eq("a1", x: 0, y: 0, rot: 0),
            eq("w1", type: .weapon, x: 0, y: 2, rot: 0),
        ])
        let before = store.state.inventory

        XCTAssertEqual(store.placeItem(itemId: "ghost", x: 0, y: 4, rot: 0), .notFound)
        // 보드는 5행 — y=5 는 밖이다.
        XCTAssertEqual(store.placeItem(itemId: "a1", x: 4, y: 5, rot: 0), .outOfBounds)
        // 십자(영웅 칸)는 겹침으로 취급한다.
        XCTAssertEqual(store.placeItem(itemId: "a1", x: 2, y: 1, rot: 0), .overlap)
        // 다른 아이템의 footprint 아래 칸.
        XCTAssertEqual(store.placeItem(itemId: "a1", x: 0, y: 3, rot: 0), .overlap)
        XCTAssertEqual(store.state.inventory, before, "거절된 배치는 상태를 건드리지 않는다")

        XCTAssertEqual(store.placeItem(itemId: "a1", x: 4, y: 4, rot: 0), .placed)
        XCTAssertEqual(placement(store, "a1"), BagPlacement(x: 4, y: 4, rot: 0))

        // 제자리 회전 — 자기 자신의 현재 칸은 겹침으로 세지 않는다.
        XCTAssertEqual(store.placeItem(itemId: "w1", x: 0, y: 2, rot: 1), .placed)
        XCTAssertEqual(placement(store, "w1"), BagPlacement(x: 0, y: 2, rot: 1))
    }

    // MARK: - equipItem / unequipItem

    func testEquipStripsPlacementAndSwapInheritsAtSameIndex() {
        // 착용 중인 w1(좌표 없음)과 가방의 w2(0,2). 배열 index 1 이 유지돼야 한다.
        let w1 = eq("w1", type: .weapon)
        let store = makeStore(
            inventory: [
                eq("a1", x: 0, y: 0, rot: 0),
                eq("w2", type: .weapon, x: 0, y: 2, rot: 1),
                eq("a2", x: 4, y: 4, rot: 0),
            ],
            equipped: [.weapon: w1])

        store.equipItem("w2")

        XCTAssertEqual(store.state.hero.equipped[.weapon]?.id, "w2")
        XCTAssertNil(store.state.hero.equipped[.weapon]?.bagX, "착용 아이템은 좌표를 갖지 않는다")
        XCTAssertNil(store.state.hero.equipped[.weapon]?.bagY)
        XCTAssertNil(store.state.hero.equipped[.weapon]?.bagRot)

        XCTAssertEqual(store.state.inventory.map(\.id), ["a1", "w1", "a2"],
                       "교체된 아이템은 같은 배열 index 를 차지한다 (append 아님)")
        XCTAssertEqual(placement(store, "w1"), BagPlacement(x: 0, y: 2, rot: 1),
                       "벗겨진 아이템이 방금 비운 footprint 를 회전까지 물려받는다")
    }

    func testEquipWithEmptySlotRemovesItemFromInventory() {
        let store = makeStore(inventory: [eq("w1", type: .weapon, x: 0, y: 0, rot: 0)])
        store.equipItem("w1")
        XCTAssertTrue(store.state.inventory.isEmpty)
        XCTAssertNil(store.state.hero.equipped[.weapon]?.bagX)
    }

    func testUnequipUsesFirstFitThenFallsBackToTray() {
        // (1) 빈 보드 — 좌상단 첫 칸.
        let empty = makeStore(inventory: [], equipped: [.talisman: eq("t1", type: .talisman)])
        empty.unequipItem(.talisman)
        XCTAssertEqual(placement(empty, "t1"), BagPlacement(x: 0, y: 0, rot: 0))

        // (2) 가방칸 20개가 모두 찬 보드 — 정리 대기 트레이(좌표 없음)로 떨어진다.
        let full = makeStore(inventory: fullBoard(), equipped: [.accessory: eq("e1")])
        full.unequipItem(.accessory)
        XCTAssertEqual(full.state.inventory.count, 21)
        XCTAssertEqual(full.state.inventory.last?.id, "e1")
        XCTAssertNil(placement(full, "e1"), "자리가 없으면 미배치 — 실패하지 않는다")
        XCTAssertNil(full.state.hero.equipped[.accessory])
    }

    // MARK: - 세션 종료 정산 (트레이 넘침 자동 판매)

    func testSettleBagAfterSessionCapsTrayAndRefundsLowestRarityFirst() {
        // 보드는 이미 가득 → 드롭 12개가 전부 트레이로 간다 (cap 10 → 2개 자동 판매).
        // 등급이 낮은 것 먼저, 같은 등급이면 배열 index 가 이른 것 먼저.
        let inventory = fullBoard()
        let drops: [Equipment] = (0..<12).map { i in
            let rarity: Rarity = (i == 0 || i == 5 || i == 11) ? .normal : .rare
            return eq("d\(i)", rarity: rarity)
        }

        let settled = SessionReward.settleBagAfterSession(
            inventory: inventory, keptDrops: drops, rows: testRows)

        XCTAssertEqual(settled.sold.map(\.id), ["d0", "d5"],
                       "최저 등급 먼저, 같은 등급이면 오래된 index 먼저")
        XCTAssertEqual(settled.coins, 10, "normal 판매가 5 × 2")
        XCTAssertEqual(settled.inventory.count, 30, "보드 20 + 트레이 cap 10")
        XCTAssertEqual(
            settled.inventory.map(\.id),
            (inventory.map(\.id) + drops.map(\.id)).filter { $0 != "d0" && $0 != "d5" },
            "남는 쪽은 원래 순서를 유지한다")
        // d11 은 normal 이지만 cap 안에 들어와 살아남는다 (넘친 2개만 팔린다).
        XCTAssertTrue(settled.inventory.contains { $0.id == "d11" })
    }

    func testSettleBagAfterSessionPlacesDropsWhenBoardHasRoom() {
        let settled = SessionReward.settleBagAfterSession(
            inventory: [], keptDrops: [eq("d0"), eq("d1")], rows: testRows)
        XCTAssertTrue(settled.sold.isEmpty)
        XCTAssertEqual(settled.coins, 0)
        XCTAssertEqual(
            settled.inventory.compactMap { UpHeroBag.readPlacement($0) },
            [BagPlacement(x: 0, y: 0, rot: 0), BagPlacement(x: 1, y: 0, rot: 0)])
    }

    // MARK: - 로드/채택 마이그레이션 (좌표 없는 저장본 팩)

    func testCoordinateFreeInventoryIsPackedOnAdopt() {
        // v6 이전 저장본 = 세 키가 전부 없는 인벤토리. 배열 순서 first-fit 로 한 번 배치된다.
        //   무기 1x2 → (0,0)-(0,1) / 갑옷 2x2 → 십자를 피해 (0,2) / 장신구 1x1 → (1,0)
        let store = makeStore(inventory: [
            eq("w", type: .weapon),
            eq("a", type: .armor),
            eq("c"),
        ])
        XCTAssertEqual(placement(store, "w"), BagPlacement(x: 0, y: 0, rot: 0))
        XCTAssertEqual(placement(store, "a"), BagPlacement(x: 0, y: 2, rot: 0))
        XCTAssertEqual(placement(store, "c"), BagPlacement(x: 1, y: 0, rot: 0))
    }

    func testAdoptDoesNotRepackWhenSomethingIsAlreadyPlaced() {
        // 배치가 하나라도 있으면 팩하지 않는다 — 유저가 정리해 둔 배치를 흔들지 않는다.
        let store = makeStore(inventory: [
            eq("placed", x: 4, y: 4, rot: 0),
            eq("tray"),
        ])
        XCTAssertEqual(placement(store, "placed"), BagPlacement(x: 4, y: 4, rot: 0))
        XCTAssertNil(placement(store, "tray"))
    }

    func testAdoptDropsInvalidCoordinatesAndOverlaps() {
        // 범위 밖 좌표는 세 키를 함께 버리고, 나중 index 의 겹침도 미배치가 된다.
        let store = makeStore(inventory: [
            eq("ok", x: 0, y: 0, rot: 0),
            eq("dup", x: 0, y: 0, rot: 0),
            eq("bad", x: 9, y: 0, rot: 0),
        ])
        XCTAssertEqual(placement(store, "ok"), BagPlacement(x: 0, y: 0, rot: 0))
        XCTAssertNil(placement(store, "dup"), "겹치면 나중 index 가 좌표를 잃는다")
        XCTAssertNil(placement(store, "bad"))
    }

    // MARK: - 세션 시작 시너지 폴드

    func testSessionSnapshotFoldsBagSynergyOnce() {
        // 착용 무기(str 10, fitness) 앵커 (2,0) 기준:
        //   S1 — 같은 카테고리 가방 무기를 rot 1(2x1)로 (0,0) 에 두면 (1,0) 이 앵커에
        //        직교 인접 → 2칸 × 5% = 10% → round(10 × 10 / 100) = +1 str
        //   S2 — 가방 장신구를 (3,0) 에 두면 앵커에 직교 인접 → crit +3
        //        (카테고리를 다르게 줘서 S1 에는 참여하지 않게 한다)
        let worn = eq("worn", type: .weapon, stats: [.str: 10])
        let store = makeStore(
            inventory: [
                eq("bagWeapon", type: .weapon, category: .fitness, x: 0, y: 0, rot: 1),
                eq("bagAcc", type: .accessory, category: .learning, x: 3, y: 0, rot: 0),
            ],
            equipped: [.weapon: worn])

        // Track A — 영웅 레벨은 heroXp 풀 기준 (store.heroLevel); confirmDungeon 은 gameLevel 을 받지 않는다.
        let baseline = UpHeroRules.computeHeroForLevel(store.state.hero, level: store.heroLevel)

        store.prepareBuffDraw(dungeonId: .fitness, ownedCardIds: [])
        store.confirmDungeon(selectedCardIds: [])

        let snapshot = store.state.currentSession?.hero
        XCTAssertNotNil(snapshot)
        XCTAssertEqual(snapshot?.baseStats.str, baseline.baseStats.str + 1)
        XCTAssertEqual(snapshot?.baseStats.crit, baseline.baseStats.crit + 3)
        XCTAssertEqual(store.state.hero.baseStats, baseline.baseStats,
                       "폴드는 세션 스냅샷에만 — 저장된 영웅은 그대로다")
    }

    func testApplyBagSynergyIsPureAndRowsAware() {
        // 같은 배치라도 보드가 작아 아이템이 밖으로 나가면(suspended) 시너지에 참여하지 않는다.
        let worn = eq("worn", type: .weapon, stats: [.str: 10])
        let hero = Hero(
            name: "테오", hp: 100, maxHp: 100,
            baseStats: HeroBaseStats(str: 5, int: 5, vit: 5, dex: 5, agi: 5, crit: 0, slotBonus: 0),
            equipped: [.weapon: worn], classType: nil, appearanceVariant: 0)
        let inventory = [eq("far", type: .accessory, category: .learning, x: 3, y: 0, rot: 0)]

        let folded = UpHeroBag.applyBagSynergy(hero, inventory: inventory, rows: testRows)
        XCTAssertEqual(folded.baseStats.crit, hero.baseStats.crit + 3)
        // 두 번 접어도 입력 hero 는 불변 — 폴드가 상태를 오염시키지 않는다.
        XCTAssertEqual(hero.baseStats.crit, 0)
    }

    // MARK: - 사진 삭제 캐스케이드 배선

    func testRemovePhotoBindingsClearsInventoryAndEquippedSlot() {
        let store = makeStore(
            inventory: [
                eq("t-photo", type: .talisman, photoId: "p1", x: 0, y: 0, rot: 0),
                eq("keep", x: 1, y: 0, rot: 0),
            ],
            equipped: [.talisman: eq("worn-photo", type: .talisman, photoId: "p1")])

        // GrowthStore.deletePhoto 가 잡는 참조 — 마지막으로 만든 스토어가 current 다.
        XCTAssertTrue(UpHeroStore.current === store)

        store.removePhotoBindings(photoId: "p1")
        XCTAssertEqual(store.state.inventory.map(\.id), ["keep"])
        XCTAssertNil(store.state.hero.equipped[.talisman])
    }

    // MARK: - 상점 가방 확장 (purchaseBagRow)

    /// 가격은 산 행 수를 따라 오르고, 코인은 그만큼만 빠진다.
    func testPurchaseBagRowGrowsBoardAndChargesEscalatingPrice() {
        let store = makeStore(inventory: [], coins: 600, rowsBought: 0)
        XCTAssertEqual(store.currentBagRows(), 4, "행을 사기 전에는 시작 크기")

        XCTAssertEqual(store.purchaseBagRow(), .ok)
        XCTAssertEqual(store.state.bagRowsBought, 1)
        XCTAssertEqual(store.currentBagRows(), 5)
        XCTAssertEqual(store.state.coins, 400, "첫 행 200")

        XCTAssertEqual(store.purchaseBagRow(), .ok)
        XCTAssertEqual(store.currentBagRows(), 6)
        XCTAssertEqual(store.state.coins, 0, "둘째 행 400")
    }

    func testPurchaseBagRowRejectsWhenCoinsShort() {
        let store = makeStore(inventory: [], coins: 199, rowsBought: 0)
        XCTAssertEqual(store.purchaseBagRow(), .noCoin)
        XCTAssertEqual(store.state.coins, 199, "실패는 코인을 건드리지 않는다")
        XCTAssertEqual(store.currentBagRows(), 4)
    }

    func testPurchaseBagRowRejectsAtMaxSize() {
        let store = makeStore(inventory: [], coins: 99_999,
                              rowsBought: UpHeroBag.rowsBuyable)
        XCTAssertEqual(store.currentBagRows(), UpHeroBag.rowsMax)
        XCTAssertEqual(store.purchaseBagRow(), .atCap, "코인이 넘쳐도 8행이 상한")
        XCTAssertEqual(store.state.coins, 99_999)
        XCTAssertEqual(store.state.bagRowsBought, UpHeroBag.rowsBuyable)
    }

    // MARK: - 가방 화면 열림 신호

    func testSetBagOpenTogglesTransientFlag() {
        let store = makeStore(inventory: [])
        XCTAssertFalse(store.isBagOpen, "비영속 — 항상 닫힌 상태로 시작한다")
        store.setBagOpen(true)
        XCTAssertTrue(store.isBagOpen)
        store.setBagOpen(false)
        XCTAssertFalse(store.isBagOpen)
    }
}

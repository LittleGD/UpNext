//
//  UpHeroBagTests.swift
//  UpNextTests — Up Hero 격자 가방 순수 로직 (Models/UpHeroBag.swift).
//
//  기대값은 웹 정본 `src/lib/upHeroBag.ts` / `src/lib/upHeroBag.test.ts` 계약을
//  그대로 옮긴 것이다 (2026-09-04, 플랜 ultracode-adaptive-scroll Phase 3/4).
//  `scripts/verify-equivalence.sh` 의 bag 스위트가 stdout diff 로 같은 규칙을 다시
//  검증하지만, CI 가 도는 것은 XCTest 쪽뿐이라 여기가 실질 회귀 방어선이다.
//

import XCTest
@testable import UpNext

final class UpHeroBagTests: XCTestCase {

    // MARK: - 픽스처 헬퍼

    private func eq(
        _ id: String,
        type: EquipSlot = .accessory,
        rarity: Rarity = .normal,
        category: DungeonId = .fitness,
        stats: [StatKey: Int] = [:],
        baseId: String? = nil,
        photoId: String? = nil,
        enhanceLevel: Int? = nil,
        x: Int? = nil,
        y: Int? = nil,
        rot: Int? = nil
    ) -> Equipment {
        Equipment(
            id: id, name: id, baseId: baseId, type: type, rarity: rarity,
            category: category, iconName: "icon", stats: stats,
            photoId: photoId, enhanceLevel: enhanceLevel,
            bagX: x, bagY: y, bagRot: rot)
    }

    private func hero(equipped: [EquipSlot: Equipment]) -> Hero {
        Hero(
            name: "테오", hp: 100, maxHp: 100,
            baseStats: HeroBaseStats(str: 5, int: 5, vit: 5, dex: 5, agi: 5, crit: 0, slotBonus: 0),
            equipped: equipped, classType: nil, appearanceVariant: 0)
    }

    private func placement(_ item: Equipment) -> BagPlacement? {
        UpHeroBag.readPlacement(item)
    }

    // MARK: - 보드 크기

    /// 행 수 = 4 + 상점에서 산 행 수. 레벨은 근거가 아니다 (2026-09-05 결정).
    func testBagRowsComeFromPurchasedRowsOnly() {
        XCTAssertEqual(UpHeroBag.bagRows(rowsBought: nil), 4, "행을 사기 전 저장본은 시작 크기")
        XCTAssertEqual(UpHeroBag.bagRows(rowsBought: 0), 4)
        XCTAssertEqual(UpHeroBag.bagRows(rowsBought: 1), 5)
        XCTAssertEqual(UpHeroBag.bagRows(rowsBought: 4), 8)
        XCTAssertEqual(UpHeroBag.bagRows(rowsBought: 5), 8, "상한 8 을 넘지 않는다")
        XCTAssertEqual(UpHeroBag.bagRows(rowsBought: -1), 4, "음수는 0 으로 접는다")
    }

    /// 가격은 "다음 행" 값이다 — index = 이미 산 행 수. 다 사면 nil(더 살 게 없다).
    func testBagRowPriceEscalatesThenStops() {
        XCTAssertEqual(UpHeroBag.bagRowPrice(rowsBought: nil), 200)
        XCTAssertEqual(UpHeroBag.bagRowPrice(rowsBought: 0), 200)
        XCTAssertEqual(UpHeroBag.bagRowPrice(rowsBought: 1), 400)
        XCTAssertEqual(UpHeroBag.bagRowPrice(rowsBought: 2), 800)
        XCTAssertEqual(UpHeroBag.bagRowPrice(rowsBought: 3), 1500)
        XCTAssertNil(UpHeroBag.bagRowPrice(rowsBought: 4), "최대 크기면 가격이 없다")
        XCTAssertNil(UpHeroBag.bagRowPrice(rowsBought: 9), "손상된 값도 상한으로 접힌다")
    }

    /// 판독 규칙 — 유한/내림/클램프. 보드 크기의 유일한 입구다.
    func testNormalizeBagRowsBoughtClamps() {
        XCTAssertEqual(UpHeroBag.normalizeBagRowsBought(nil), 0)
        XCTAssertEqual(UpHeroBag.normalizeBagRowsBought(2), 2)
        XCTAssertEqual(UpHeroBag.normalizeBagRowsBought(-3), 0)
        XCTAssertEqual(UpHeroBag.normalizeBagRowsBought(7), UpHeroBag.rowsBuyable)
    }

    func testBagCellCountExcludesCross() {
        XCTAssertEqual(UpHeroBag.bagCellCount(rows: 4), 15, "시작 4행 = 20칸 − 십자 5칸")
        XCTAssertEqual(UpHeroBag.bagCellCount(rows: 5), 20)
        XCTAssertEqual(UpHeroBag.bagCellCount(rows: 6), 25)
        XCTAssertEqual(UpHeroBag.bagCellCount(rows: 7), 30)
        XCTAssertEqual(UpHeroBag.bagCellCount(rows: 8), 35)
    }

    /// 십자 5칸은 어느 티어에서도 같은 자리다.
    func testCrossCellsAndAnchors() {
        XCTAssertTrue(UpHeroBag.isCrossCell(x: 2, y: 0))
        XCTAssertTrue(UpHeroBag.isCrossCell(x: 1, y: 1))
        XCTAssertTrue(UpHeroBag.isCrossCell(x: 2, y: 1))   // HERO
        XCTAssertTrue(UpHeroBag.isCrossCell(x: 3, y: 1))
        XCTAssertTrue(UpHeroBag.isCrossCell(x: 2, y: 2))
        XCTAssertFalse(UpHeroBag.isCrossCell(x: 0, y: 0))
        XCTAssertFalse(UpHeroBag.isCrossCell(x: 4, y: 4))

        XCTAssertEqual(UpHeroBag.anchorAt(x: 2, y: 0), .weapon)
        XCTAssertEqual(UpHeroBag.anchorAt(x: 1, y: 1), .armor)
        XCTAssertEqual(UpHeroBag.anchorAt(x: 3, y: 1), .accessory)
        XCTAssertEqual(UpHeroBag.anchorAt(x: 2, y: 2), .talisman)
        XCTAssertNil(UpHeroBag.anchorAt(x: 2, y: 1), "영웅 칸은 앵커가 아니다")
    }

    /// 렌더는 데이터 row 를 뒤집어 십자를 엄지 영역(아래)에 둔다.
    func testVisualRowFlipsBoard() {
        XCTAssertEqual(UpHeroBag.visualRow(bagY: 0, rows: 5), 4)
        XCTAssertEqual(UpHeroBag.visualRow(bagY: 4, rows: 5), 0)
        XCTAssertEqual(UpHeroBag.visualRow(bagY: 0, rows: 8), 7)
    }

    /// 셀은 44 아래로 내려가지 않고 56 을 넘지 않는다 (360x640 세로 예산).
    func testBagCellSizeClamps() {
        // 폭 360 - gap 16 = 344 / 5 = 68 → 높이가 결정: 431 - gap 16 = 415 / 5 = 83 → 56 상한.
        XCTAssertEqual(UpHeroBag.bagCellSize(width: 360, height: 431, rows: 5), 56)
        // 좁은 보드는 하한 44 에서 멈춘다.
        XCTAssertEqual(UpHeroBag.bagCellSize(width: 200, height: 200, rows: 8), 44)
        // 중간 구간은 폭·높이 중 작은 쪽이 그대로.
        XCTAssertEqual(UpHeroBag.bagCellSize(width: 270, height: 1000, rows: 5), 50)
    }

    // MARK: - 모양·회전

    func testShapesDeriveFromSlotType() {
        XCTAssertEqual(
            UpHeroBag.shapeFor(type: .weapon, rot: 0),
            [BagCell(x: 0, y: 0), BagCell(x: 0, y: 1)], "weapon rot0 = 세로 1x2")
        XCTAssertEqual(
            UpHeroBag.shapeFor(type: .weapon, rot: 1),
            [BagCell(x: 0, y: 0), BagCell(x: 1, y: 0)], "weapon rot1 = 가로 2x1")
        XCTAssertEqual(UpHeroBag.shapeFor(type: .weapon, rot: 2).count, 2)
        XCTAssertEqual(UpHeroBag.shapeFor(type: .weapon, rot: 2), UpHeroBag.shapeFor(type: .weapon, rot: 0))
        XCTAssertEqual(UpHeroBag.shapeFor(type: .weapon, rot: 3), UpHeroBag.shapeFor(type: .weapon, rot: 1))
        XCTAssertEqual(UpHeroBag.shapeFor(type: .armor, rot: 1).count, 4, "armor 는 회전해도 2x2")
        XCTAssertEqual(UpHeroBag.shapeFor(type: .accessory, rot: 3).count, 1)
        XCTAssertEqual(UpHeroBag.shapeFor(type: .talisman, rot: 0).count, 1)

        XCTAssertEqual(UpHeroBag.shapeCellCount(type: .weapon), 2)
        XCTAssertEqual(UpHeroBag.shapeCellCount(type: .armor), 4)
        XCTAssertEqual(UpHeroBag.shapeCellCount(type: .accessory), 1)

        XCTAssertTrue(UpHeroBag.canRotate(type: .weapon))
        XCTAssertFalse(UpHeroBag.canRotate(type: .armor))
        XCTAssertFalse(UpHeroBag.canRotate(type: .talisman))
    }

    func testFootprintOffsetsFromOrigin() {
        XCTAssertEqual(
            UpHeroBag.footprint(type: .weapon, x: 3, y: 2, rot: 1),
            [BagCell(x: 3, y: 2), BagCell(x: 4, y: 2)])
        XCTAssertEqual(
            UpHeroBag.footprint(type: .armor, x: 0, y: 3, rot: 0),
            [BagCell(x: 0, y: 3), BagCell(x: 1, y: 3), BagCell(x: 0, y: 4), BagCell(x: 1, y: 4)])
    }

    // MARK: - 좌표 정규화 계약

    /// bagX 0..4, bagY 0..7, bagRot 0..3(아니면 0), x·y 중 하나라도 무효면 셋 다 버린다.
    func testPlacementNormalizationContract() {
        XCTAssertEqual(UpHeroBag.normalizeCoord(0, max: 5), 0)
        XCTAssertEqual(UpHeroBag.normalizeCoord(4, max: 5), 4)
        XCTAssertNil(UpHeroBag.normalizeCoord(5, max: 5))
        XCTAssertNil(UpHeroBag.normalizeCoord(-1, max: 5))
        XCTAssertNil(UpHeroBag.normalizeCoord(nil, max: 5))
        XCTAssertNil(UpHeroBag.normalizeCoord(8, max: 8), "bagY 는 0..7")

        XCTAssertEqual(UpHeroBag.normalizeRot(0), 0)
        XCTAssertEqual(UpHeroBag.normalizeRot(3), 3)
        XCTAssertEqual(UpHeroBag.normalizeRot(7), 0, "범위 밖 rot 은 0 으로 접는다")
        XCTAssertEqual(UpHeroBag.normalizeRot(-1), 0)
        XCTAssertEqual(UpHeroBag.normalizeRot(nil), 0)

        XCTAssertEqual(placement(eq("a", x: 1, y: 2, rot: 1)), BagPlacement(x: 1, y: 2, rot: 1))
        XCTAssertEqual(placement(eq("b", x: 1, y: 2, rot: 7)), BagPlacement(x: 1, y: 2, rot: 0))
        XCTAssertNil(placement(eq("c", x: 5, y: 2)), "열 밖")
        XCTAssertNil(placement(eq("d", x: 1, y: 8)), "행 밖")
        XCTAssertNil(placement(eq("e", x: 1)), "y 없으면 미배치")
        XCTAssertFalse(UpHeroBag.hasPlacement(eq("f")))
    }

    /// 무효 좌표는 세 값을 함께 버린다. 이미 계약을 만족하면 값이 그대로다(멱등).
    func testNormalizeEquipmentPlacementStripsAndIsIdempotent() {
        let bad = UpHeroBag.normalizeEquipmentPlacement(eq("a", x: 9, y: 2, rot: 1))
        XCTAssertNil(bad.bagX)
        XCTAssertNil(bad.bagY)
        XCTAssertNil(bad.bagRot, "x 가 무효면 rot 도 남기지 않는다")

        let fixedRot = UpHeroBag.normalizeEquipmentPlacement(eq("b", x: 1, y: 1, rot: 9))
        XCTAssertEqual(fixedRot.bagRot, 0)

        let good = eq("c", x: 2, y: 3, rot: 1)
        let once = UpHeroBag.normalizeEquipmentPlacement(good)
        let twice = UpHeroBag.normalizeEquipmentPlacement(once)
        XCTAssertEqual(once, good)
        XCTAssertEqual(twice, once)
    }

    /// 착용 교체 — 벗겨지는 아이템이 새 착용 아이템이 비운 자리를 그대로 받는다.
    func testInheritPlacement() {
        let worn = eq("new", type: .weapon, x: 3, y: 4, rot: 1)
        let taken = UpHeroBag.inheritPlacement(from: worn, to: eq("old", type: .weapon))
        XCTAssertEqual(placement(taken), BagPlacement(x: 3, y: 4, rot: 1))

        let fromTray = UpHeroBag.inheritPlacement(from: eq("tray"), to: eq("old2", x: 1, y: 1))
        XCTAssertNil(fromTray.bagX, "트레이 아이템을 착용하면 상속할 자리가 없다")
    }

    // MARK: - 점유·first-fit

    /// 빈 5행 보드의 first-fit — 좌상→우하 스캔, 십자는 막힌 칸.
    func testFirstFitOnEmptyBoard() {
        let occ = UpHeroBag.emptyOccupancy(rows: 5)
        XCTAssertEqual(occ[UpHeroBag.cellIndex(x: 2, y: 1)], UpHeroBag.crossMark)
        XCTAssertNil(occ[UpHeroBag.cellIndex(x: 0, y: 0)])

        XCTAssertEqual(
            UpHeroBag.firstFit(occ: occ, rows: 5, type: .accessory),
            BagPlacement(x: 0, y: 0, rot: 0))
        XCTAssertEqual(
            UpHeroBag.firstFit(occ: occ, rows: 5, type: .weapon, preferRot: 0),
            BagPlacement(x: 0, y: 0, rot: 0), "weapon 1x2 는 (0,0)-(0,1) 에 들어간다")
        // armor 2x2 는 십자를 피해 y=2 까지 내려간다.
        XCTAssertEqual(
            UpHeroBag.firstFit(occ: occ, rows: 5, type: .armor),
            BagPlacement(x: 0, y: 2, rot: 0))
    }

    /// 회전 순서: preferRot 먼저, 막히면 반대 방향을 한 번 더 본다.
    func testFirstFitFallsBackToOtherRotation() {
        // 가로 2x1 이 들어갈 자리가 없도록 각 행의 인접 쌍을 막는다: 세로 1x2 만 가능한 판.
        var occ = UpHeroBag.emptyOccupancy(rows: 5)
        for y in 0..<5 {
            for x in [1, 3] where occ[UpHeroBag.cellIndex(x: x, y: y)] == nil {
                occ[UpHeroBag.cellIndex(x: x, y: y)] = "blocker"
            }
        }
        let p = UpHeroBag.firstFit(occ: occ, rows: 5, type: .weapon, preferRot: 1)
        // 대체 회전은 웹과 같이 `(rot + 1) % 4` 라서 1 → 2 다. 2 는 짝수 = 세로 모양.
        XCTAssertEqual(p, BagPlacement(x: 0, y: 0, rot: 2), "가로가 막히면 세로로 돌려 넣는다")
        XCTAssertEqual(
            UpHeroBag.shapeFor(type: .weapon, rot: 2), UpHeroBag.shapeFor(type: .weapon, rot: 0))
    }

    // MARK: - 레이아웃 정규화

    /// 겹치면 나중 index 가 진다 — 좌표를 잃고 트레이로 간다.
    func testNormalizeBagLayoutStripsOverlap() {
        let first = eq("a", x: 0, y: 0)
        let second = eq("b", x: 0, y: 0)
        let result = UpHeroBag.normalizeBagLayout([first, second], rows: 5)

        XCTAssertEqual(result.layout.placed.map(\.id), ["a"])
        XCTAssertEqual(result.layout.unplaced.map(\.id), ["b"])
        XCTAssertEqual(result.layout.statusById["b"], .unplaced)
        XCTAssertNil(result.inventory[1].bagX, "겹친 아이템의 좌표는 삭제한다")
        XCTAssertEqual(result.inventory.map(\.id), ["a", "b"], "배열 순서는 유지")
    }

    /// 십자 칸 위에는 놓이지 않는다 (overlap 취급).
    func testCrossCellsBlockPlacement() {
        let onHero = eq("a", x: 2, y: 1)
        let result = UpHeroBag.normalizeBagLayout([onHero], rows: 5)
        XCTAssertEqual(result.layout.statusById["a"], .unplaced)
    }

    /// 레벨이 내려가 보드 밖이 된 아이템은 좌표를 **지키고** 트레이에 뜬다.
    func testNormalizeBagLayoutSuspendsOutOfBounds() {
        let deep = eq("a", x: 0, y: 6)
        let result = UpHeroBag.normalizeBagLayout([deep], rows: 5)

        XCTAssertEqual(result.layout.suspended.map(\.id), ["a"])
        XCTAssertEqual(result.layout.statusById["a"], .suspended)
        XCTAssertEqual(result.inventory[0].bagY, 6, "suspended 는 좌표를 잃지 않는다")

        // 보드가 다시 커지면 그대로 배치된다 — 멱등이라 값이 바뀌지 않는다.
        let grown = UpHeroBag.normalizeBagLayout(result.inventory, rows: 8)
        XCTAssertEqual(grown.layout.placed.map(\.id), ["a"])
    }

    func testNormalizeBagLayoutIsIdempotent() {
        let inv = [eq("a", x: 0, y: 0), eq("b", x: 0, y: 0), eq("c", type: .armor, x: 3, y: 3)]
        let once = UpHeroBag.normalizeBagLayout(inv, rows: 5).inventory
        let twice = UpHeroBag.normalizeBagLayout(once, rows: 5).inventory
        XCTAssertEqual(once, twice)
    }

    // MARK: - 삽입·팩

    func testPlaceIntoBagAppendsAtFirstFreeSlot() {
        let inv = [eq("a", x: 0, y: 0)]
        let next = UpHeroBag.placeIntoBag(inv, eq("b"), rows: 5)
        XCTAssertEqual(next.map(\.id), ["a", "b"])
        XCTAssertEqual(placement(next[1]), BagPlacement(x: 1, y: 0, rot: 0))
    }

    /// 자리가 없으면 좌표 없이 트레이로 간다 (조용히 잃지 않는다).
    func testPlaceIntoBagFallsBackToTray() {
        // 5행 보드의 가방칸 20개를 1x1 로 모두 채운다.
        var inv: [Equipment] = []
        var occ = UpHeroBag.emptyOccupancy(rows: 5)
        var n = 0
        for y in 0..<5 {
            for x in 0..<5 where occ[UpHeroBag.cellIndex(x: x, y: y)] == nil {
                inv.append(eq("f\(n)", x: x, y: y))
                occ[UpHeroBag.cellIndex(x: x, y: y)] = "f\(n)"
                n += 1
            }
        }
        XCTAssertEqual(inv.count, 20)

        let next = UpHeroBag.placeIntoBag(inv, eq("overflow"), rows: 5)
        XCTAssertNil(next.last?.bagX)
        XCTAssertEqual(UpHeroBag.normalizeBagLayout(next, rows: 5).layout.unplaced.map(\.id),
                       ["overflow"])
    }

    /// 유효 배치가 하나도 없는 인벤(레거시 저장본·구버전 iOS 가 벗긴 클라우드)만 통째로 팩한다.
    func testPackAllIfNonePlaced() {
        let legacy = [eq("a"), eq("b", type: .weapon), eq("c", type: .armor)]
        let packed = UpHeroBag.packAllIfNonePlaced(legacy)
        XCTAssertEqual(placement(packed[0]), BagPlacement(x: 0, y: 0, rot: 0))
        XCTAssertTrue(packed.allSatisfy { UpHeroBag.hasPlacement($0) })

        // 하나라도 배치돼 있으면 손대지 않는다 (유저 정리를 덮어쓰지 않는다).
        let partly = [eq("a", x: 4, y: 4), eq("b")]
        XCTAssertEqual(UpHeroBag.packAllIfNonePlaced(partly), partly)

        XCTAssertEqual(UpHeroBag.packAllIfNonePlaced([]), [])

        // 멱등 — 두 번 돌려도 같은 배치.
        XCTAssertEqual(UpHeroBag.packAllIfNonePlaced(packed), packed)
    }

    // MARK: - 트레이 넘침

    /// 초과분은 최저 등급 먼저, 같은 등급이면 오래된 index 먼저 판매한다.
    func testTrayOverflowOrdersByRarityThenIndex() {
        let inv = [
            eq("rare1", rarity: .rare),
            eq("normal1", rarity: .normal),
            eq("normal2", rarity: .normal),
            eq("legend1", rarity: .legend),
        ]
        let result = UpHeroBag.trayOverflow(inv, rows: 5, cap: 2)

        XCTAssertEqual(result.sell.map(\.id), ["normal1", "normal2"])
        XCTAssertEqual(result.keep.map(\.id), ["rare1", "legend1"], "keep 은 원래 순서를 지킨다")
    }

    /// cap 이하면 아무것도 팔지 않는다. 배치된 아이템은 트레이 계산에 들어가지 않는다.
    func testTrayOverflowIgnoresPlacedItems() {
        let inv = [eq("placed", x: 0, y: 0), eq("t1"), eq("t2")]
        let result = UpHeroBag.trayOverflow(inv, rows: 5, cap: 2)
        XCTAssertTrue(result.sell.isEmpty)
        XCTAssertEqual(result.keep.count, 3)
    }

    /// F1 — 격자 도입 전 저장본은 트레이가 이미 cap 을 넘긴 채로 마이그레이션된다. 그 상태에서
    /// 초과분만큼 팔면 후보(이번 드롭)가 늘 초과분 이하라 새 전리품이 매 정산마다 전부 증발한다.
    /// 웹 upHeroBag.test.ts "후보가 아닌 트레이 아이템만으로 이미 캡이면 한 개도 팔지 않는다".
    func testTrayOverflowSellsNothingWhenPreTrayAlreadyFillsCap() {
        let legacyTray = (0..<12).map { eq("L\($0)") }
        let drops = [eq("d0"), eq("d1", rarity: .rare)]
        let inv = legacyTray + drops
        let result = UpHeroBag.trayOverflow(
            inv, rows: 5, cap: UpHeroBag.trayCap, candidateIds: drops.map(\.id))

        XCTAssertTrue(result.sell.isEmpty, "기존 트레이만으로 캡이면 한 개도 팔지 않는다")
        XCTAssertEqual(result.keep.count, inv.count)
    }

    /// F1 — 기존 트레이 8 + 신규 5, 캡 10 이면 초과 3개를 신규 중에서만 판다.
    /// 웹 upHeroBag.test.ts "기존 트레이 8 + 신규 5, 캡 10 이면 신규 중 3개만 판다".
    func testTrayOverflowSellsOnlyExcessFromCandidatesWhenPreTrayUnderCap() {
        let preTray = (0..<8).map { eq("P\($0)", rarity: .unique) }
        let drops = [
            eq("n0"),
            eq("n1", rarity: .rare),
            eq("n2"),
            eq("n3", rarity: .legend),
            eq("n4"),
        ]
        let inv = preTray + drops
        let result = UpHeroBag.trayOverflow(
            inv, rows: 5, cap: UpHeroBag.trayCap, candidateIds: drops.map(\.id))

        // 트레이 13 - 캡 10 = 3. 최저 등급(normal) 먼저, 같은 등급이면 오래된 index 먼저.
        XCTAssertEqual(result.sell.map(\.id), ["n0", "n2", "n4"])
        XCTAssertEqual(result.keep.count, inv.count - 3)
    }

    // MARK: - 시너지 S1 (동류 인접)

    /// 1x1 = 5%, 최소 1. round 는 양수 도메인이라 웹 Math.round 와 같다.
    func testSynergyS1OneByOneIsFivePercent() {
        let worn = eq("w", type: .weapon, category: .fitness, stats: [.str: 20])
        let bag = [eq("a", type: .accessory, category: .fitness, x: 1, y: 0)]
        let syn = UpHeroBag.computeBagSynergy(equipped: [.weapon: worn], inventory: bag, rows: 5)

        XCTAssertEqual(syn.bonuses[.str], 1, "20 의 5% = 1")
        XCTAssertEqual(syn.links.filter { $0.rule == .s1 }.count, 1)
        XCTAssertEqual(syn.perAnchor[.weapon]?[.str], 1)
    }

    /// 2x2 = 20%. armor 앵커 (1,1) 에 (1,2) 로 닿는다.
    func testSynergyS1TwoByTwoIsTwentyPercent() {
        let worn = eq("w", type: .armor, category: .wellness, stats: [.vit: 20])
        let bag = [eq("a", type: .armor, category: .wellness, x: 0, y: 2)]
        let syn = UpHeroBag.computeBagSynergy(equipped: [.armor: worn], inventory: bag, rows: 5)

        XCTAssertEqual(syn.bonuses[.vit], 4, "20 의 20% = 4")
    }

    /// 앵커당 30% 상한 — 20 + 10 + 5 = 35% 가 30% 로 접힌다.
    func testSynergyS1CapsAtThirtyPercent() {
        let worn = eq("w", type: .armor, category: .fitness, stats: [.vit: 100])
        let bag = [
            eq("armor2x2", type: .armor, category: .fitness, x: 0, y: 2),   // (1,2) → 20%
            eq("weapon1x2", type: .weapon, category: .fitness, x: 0, y: 0), // (0,1) → 10%
            eq("acc", type: .accessory, category: .fitness, x: 1, y: 0),    // (1,0) → 5%
        ]
        let syn = UpHeroBag.computeBagSynergy(equipped: [.armor: worn], inventory: bag, rows: 5)

        XCTAssertEqual(syn.links.filter { $0.rule == .s1 }.count, 3, "링크는 3개 다 남는다")
        XCTAssertEqual(syn.bonuses[.vit], 30, "35% 가 아니라 상한 30%")
    }

    /// 반올림이 0 이 되어도 최소 1 은 준다.
    func testSynergyS1MinimumIsOne() {
        let worn = eq("w", type: .weapon, category: .fitness, stats: [.str: 1])
        let bag = [eq("a", type: .accessory, category: .fitness, x: 1, y: 0)]
        let syn = UpHeroBag.computeBagSynergy(equipped: [.weapon: worn], inventory: bag, rows: 5)
        XCTAssertEqual(syn.bonuses[.str], 1)
    }

    /// 카테고리가 다르면 S1 은 붙지 않는다.
    func testSynergyS1RequiresSameCategory() {
        let worn = eq("w", type: .weapon, category: .fitness, stats: [.str: 20])
        let bag = [eq("a", type: .accessory, category: .learning, x: 1, y: 0)]
        let syn = UpHeroBag.computeBagSynergy(equipped: [.weapon: worn], inventory: bag, rows: 5)
        XCTAssertNil(syn.bonuses[.str])
    }

    // MARK: - 시너지 S2 (무기 + 장신구)

    /// weapon 앵커 (2,0) 의 직교 후보는 (1,0)/(3,0) 둘뿐 — 상한 2 와 정확히 맞는다.
    func testSynergyS2GivesCritUpToTwo() {
        let worn = eq("w", type: .weapon, category: .fitness, stats: [.str: 20])
        let bag = [
            eq("a1", type: .accessory, category: .learning, x: 1, y: 0),
            eq("a2", type: .accessory, category: .learning, x: 3, y: 0),
            eq("a3", type: .accessory, category: .learning, x: 0, y: 3),   // 인접 아님
        ]
        let syn = UpHeroBag.computeBagSynergy(equipped: [.weapon: worn], inventory: bag, rows: 5)

        XCTAssertEqual(syn.bonuses[.crit], 6, "3pp × 2")
        XCTAssertEqual(syn.links.filter { $0.rule == .s2 }.map(\.sourceId), ["a1", "a2"])
        XCTAssertNil(syn.bonuses[.str], "카테고리가 달라 S1 은 없다")
    }

    // MARK: - 시너지 S3 (갑옷 + 부적)

    /// armor 앵커의 직교 후보는 (1,0)/(0,1)/(1,2) 3칸이라 상한 2 가 실제로 걸린다.
    func testSynergyS3CapsAtTwoTalismans() {
        let worn = eq("w", type: .armor, category: .fitness, stats: [.vit: 20])
        let bag = [
            eq("t1", type: .talisman, category: .learning, x: 1, y: 0),
            eq("t2", type: .talisman, category: .learning, x: 0, y: 1),
            eq("t3", type: .talisman, category: .learning, x: 1, y: 2),
        ]
        let syn = UpHeroBag.computeBagSynergy(equipped: [.armor: worn], inventory: bag, rows: 5)

        XCTAssertEqual(syn.bonuses[.vit], 6, "vit +3 × 상한 2")
        XCTAssertEqual(syn.links.filter { $0.rule == .s3 }.map(\.sourceId), ["t1", "t2"])
    }

    /// 사진 부적은 S1·S3 에서 빠지고 S4 로만 센다.
    func testSynergyS3ExcludesPhotoTalisman() {
        let worn = eq("w", type: .armor, category: .fitness, stats: [.vit: 20])
        let photo = eq(
            "p1", type: .talisman, category: .fitness, photoId: "photo_abc", x: 1, y: 0)
        let syn = UpHeroBag.computeBagSynergy(equipped: [.armor: worn], inventory: [photo], rows: 5)

        XCTAssertTrue(UpHeroBag.isPhotoTalisman(photo))
        XCTAssertTrue(syn.links.filter { $0.rule == .s1 || $0.rule == .s3 }.isEmpty)
        XCTAssertEqual(syn.bonuses[.vit], 1, "S4 오라(+1) 만 남는다")
        XCTAssertEqual(syn.links.filter { $0.rule == .s4 }.count, 1)
    }

    // MARK: - 시너지 S4 (사진 부적 오라)

    /// 강화 티어: +1 (<5) / +2 (5..9) / +3 (>=10). 강화 +20 확장에도 10 에서 접힌다.
    func testPhotoSynergyAmountTiers() {
        XCTAssertEqual(UpHeroBag.photoSynergyAmount(nil), 1)
        XCTAssertEqual(UpHeroBag.photoSynergyAmount(0), 1)
        XCTAssertEqual(UpHeroBag.photoSynergyAmount(4), 1)
        XCTAssertEqual(UpHeroBag.photoSynergyAmount(5), 2)
        XCTAssertEqual(UpHeroBag.photoSynergyAmount(9), 2)
        XCTAssertEqual(UpHeroBag.photoSynergyAmount(10), 3)
        XCTAssertEqual(UpHeroBag.photoSynergyAmount(20), 3, "강화 +20 도 10 에서 접힌다")
        XCTAssertEqual(UpHeroBag.photoSynergyAmount(-3), 1)
    }

    /// 대각 인접도 세고, 앵커당 2장 상한, tie-break 는 bagY → bagX.
    func testSynergyS4CountsDiagonalsAndCapsWithTieBreak() {
        let worn = eq("w", type: .armor, category: .fitness, stats: [.vit: 20])
        let bag = [
            // 배열 순서를 일부러 뒤집어 둔다 — 정렬이 index 가 아니라 좌표를 따르는지 본다.
            eq("late", type: .talisman, category: .learning, photoId: "p3",
               enhanceLevel: 0, x: 1, y: 2),
            eq("diagFar", type: .talisman, category: .learning, photoId: "p2",
               enhanceLevel: 20, x: 0, y: 2),
            eq("diagNear", type: .talisman, category: .learning, photoId: "p1",
               enhanceLevel: 5, x: 0, y: 0),
        ]
        let syn = UpHeroBag.computeBagSynergy(equipped: [.armor: worn], inventory: bag, rows: 5)

        let s4 = syn.links.filter { $0.rule == .s4 }
        XCTAssertEqual(s4.map(\.sourceId), ["diagNear", "diagFar"], "bagY → bagX 순, 상한 2")
        XCTAssertEqual(syn.bonuses[.vit], 5, "+2 (강화 5) 와 +3 (강화 20 → 10 클램프)")
    }

    // MARK: - 시너지 S6 (합성 작업대)

    /// 같은 baseId·같은 등급이 직교 인접하면 링크 1개. 스탯 효과는 없다.
    func testSynergyS6LinksMatchingPairOnce() {
        let bag = [
            eq("a1", rarity: .rare, baseId: "ring", x: 0, y: 0),
            eq("a2", rarity: .rare, baseId: "ring", x: 1, y: 0),
            eq("b1", rarity: .legend, baseId: "ring", x: 0, y: 1),  // 등급이 달라 짝이 아님
        ]
        let syn = UpHeroBag.computeBagSynergy(equipped: [:], inventory: bag, rows: 5)

        let s6 = syn.links.filter { $0.rule == .s6 }
        XCTAssertEqual(s6.count, 1)
        XCTAssertEqual(s6.first?.sourceId, "a1")
        XCTAssertEqual(s6.first?.partnerId, "a2")
        XCTAssertNil(s6.first?.anchor)
        XCTAssertNil(s6.first?.stat)
        XCTAssertTrue(syn.bonuses.isEmpty, "S6 은 스탯을 주지 않는다")
    }

    // MARK: - 적용

    /// 세션 생성 직전 스냅샷 — baseStats 에 1회 가산한다.
    func testApplyBagSynergyAddsToBaseStatsOnce() {
        let worn = eq("w", type: .weapon, category: .fitness, stats: [.str: 20])
        let h = hero(equipped: [.weapon: worn])
        let bag = [eq("a", type: .accessory, category: .fitness, x: 1, y: 0)]

        let buffed = UpHeroBag.applyBagSynergy(h, inventory: bag, rows: 5)
        XCTAssertEqual(buffed.baseStats.str, h.baseStats.str + 1)
        XCTAssertEqual(buffed.baseStats.crit, h.baseStats.crit + 3)
        XCTAssertEqual(buffed.baseStats.vit, h.baseStats.vit, "관련 없는 스탯은 그대로")

        // 시너지가 없으면 원본을 그대로 돌려준다.
        XCTAssertEqual(UpHeroBag.applyBagSynergy(h, inventory: [], rows: 5), h)
    }
}

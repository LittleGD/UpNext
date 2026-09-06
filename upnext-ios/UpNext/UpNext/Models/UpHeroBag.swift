//
//  UpHeroBag.swift
//  Up Hero — 격자 가방 (Backpack Hero 스타일) 순수 로직.
//
//  웹 정본 `src/lib/upHeroBag.ts` 의 1:1 미러다. `scripts/bag-check.mjs` ↔
//  `scripts/equiv/bag.swift` 가 stdout 을 byte 단위로 diff 하므로, 여기의 모든 함수는
//  **결정적**이어야 한다: 배열 index 순서만 신뢰하고 Set/Dictionary 순회 순서·RNG·시계에
//  의존하지 않는다. 그래서 점유 판은 Dictionary 가 아니라 길이 cols*rows 의 평평한 배열이다.
//
//  SwiftUI 를 import 하지 않는다 — Models/ 안의 순수 값 타입이어야 동치성 검증기가
//  실제 산출물을 그대로 컴파일할 수 있다.
//
//  보드 좌표계 (데이터): 원점 row 0 이 십자. 렌더는 `visualRow` 로 뒤집는다.
//
//         (2,0) weapon
//   (1,1) armor   (2,1) HERO   (3,1) accessory
//         (2,2) talisman
//
//  십자 5칸은 가방칸이 아니다. 착용 아이템은 `hero.equipped` 에 그대로 살고 앵커 칸에
//  1칸으로 그린다(모양 무관). 가방 아이템만 `bagX/bagY/bagRot` 을 가진다.
//
//  용어:
//   - placed     : 유효 좌표 + 보드 안 + 겹침 없음
//   - suspended  : 유효 좌표지만 현재 rows 밖(레벨 하락 등). 좌표를 **지우지 않고** 트레이에 표시
//   - unplaced   : 좌표 없음(트레이). 넘침 전용
//

import Foundation

// MARK: - 값 타입

/// 보드 칸 하나. 웹 `BagCell`.
struct BagCell: Equatable, Hashable {
    var x: Int
    var y: Int
}

/// 배치 = 원점 + 회전. 웹 `BagPlacement`.
struct BagPlacement: Equatable {
    var x: Int
    var y: Int
    var rot: Int
}

/// 배치 가능 판정. 웹 `PlaceCheck` 문자열 union.
enum PlaceCheck: String, Equatable {
    case ok
    case outOfBounds
    case overlap
}

/// 인벤 아이템 하나의 상태. 웹 `PlacementStatus`.
enum PlacementStatus: String, Equatable {
    case placed
    case suspended
    case unplaced
}

/// `normalizeBagLayout` 결과. 웹 `BagLayout`.
struct BagLayout {
    var rows: Int
    /// 길이 cols*rows, index = y * cols + x. nil = 빈 칸, `UpHeroBag.crossMark` = 십자, 그 외 = 아이템 id.
    var occupancy: [String?]
    var placed: [Equipment]
    var suspended: [Equipment]
    var unplaced: [Equipment]
    var statusById: [String: PlacementStatus]
}

/// 시너지 규칙 id. 웹 `SynergyRuleId` (S5 는 설계 단계에서 삭제됐다).
enum SynergyRuleId: String, Equatable {
    case s1 = "S1"
    case s2 = "S2"
    case s3 = "S3"
    case s4 = "S4"
    case s6 = "S6"
}

/// 화면에 연결선 하나로 그려지는 시너지 기여. 웹 `SynergyLink`.
struct SynergyLink: Equatable {
    var rule: SynergyRuleId
    /// 기여하는 가방 아이템 id
    var sourceId: String
    /// S1~S4: 보너스를 받는 앵커. S6: nil
    var anchor: EquipSlot?
    /// S6: 짝이 되는 가방 아이템 id
    var partnerId: String?
    /// 보너스 스탯 키 (S6 없음)
    var stat: StatKey?
    /// 이 링크 하나가 기여한 양 (S1 은 pct, 그 외는 flat)
    var amount: Int?
    /// 연결선을 그릴 두 칸: [가방 칸, 앵커/짝 칸]. 항상 2개다
    /// (웹의 튜플 타입 `[BagCell, BagCell]` 을 Swift 에서 고정 길이로 표현할 방법이 없어 배열).
    var cells: [BagCell]
}

/// 시너지 계산 결과. 웹 `BagSynergy`.
struct BagSynergy: Equatable {
    /// 웹 `Partial<HeroBaseStats>` — 값이 붙은 키만 담는다.
    var bonuses: [StatKey: Int]
    var perAnchor: [EquipSlot: [StatKey: Int]]
    var links: [SynergyLink]
}

// MARK: - 순수 로직 네임스페이스

enum UpHeroBag {

    // MARK: 상수

    static let cols = 5
    static let rowsMin = 4   // 시작 4행(가방칸 15). 상점 구매로만 는다
    static let rowsMax = 8
    /// 상점에서 살 수 있는 행 수 (4 → 8).
    static let rowsBuyable = rowsMax - rowsMin
    /// 가방 확장 가격표 — index = 산 행 수(0..3), 값 = 다음 행 가격. 웹 BAG_ROW_PRICES 와 동일.
    static let rowPrices: [Int] = [200, 400, 800, 1500]
    /// 셀 사이 간격(px/pt). 웹·iOS 공통.
    static let gap = 4
    static let cellMin = 44
    static let cellMax = 56
    static let trayH = 64
    static let actionH = 56
    /// 정리 대기(미배치) 트레이 소프트캡. 초과분은 탐험 정산에서 자동 판매.
    static let trayCap = 10

    static let heroCell = BagCell(x: 2, y: 1)

    static let anchors: [EquipSlot: BagCell] = [
        .weapon: BagCell(x: 2, y: 0),
        .armor: BagCell(x: 1, y: 1),
        .accessory: BagCell(x: 3, y: 1),
        .talisman: BagCell(x: 2, y: 2),
    ]

    /// 앵커 순회 순서 — 결정적 출력을 위해 고정. Dictionary 순회 금지의 이유이기도 하다.
    static let anchorOrder: [EquipSlot] = [.weapon, .armor, .accessory, .talisman]

    private static let rarityRank: [Rarity: Int] = [
        .normal: 0,
        .rare: 1,
        .unique: 2,
        .legend: 3,
    ]

    // MARK: 보드 크기

    /// 산 행 수 정규화: [0, rowsBuyable] 로 접는다 (웹 normalizeBagRowsBought 1:1).
    static func normalizeBagRowsBought(_ v: Int?) -> Int {
        guard let v else { return 0 }
        return min(rowsBuyable, max(0, v))
    }

    /// 행 수 = rowsMin + 산 행 수. 레벨과 무관 — 가방은 상점에서만 커진다 (웹 bagRows 1:1).
    ///   0장: 4행(가방칸 15) · 1장: 5행(20) · 2장: 6행(25) · 3장: 7행(30) · 4장: 8행(35)
    static func bagRows(rowsBought: Int?) -> Int {
        rowsMin + normalizeBagRowsBought(rowsBought)
    }

    /// 다음 행의 가격. 다 샀으면 nil (웹 bagRowPrice 1:1).
    static func bagRowPrice(rowsBought: Int?) -> Int? {
        let n = normalizeBagRowsBought(rowsBought)
        return n >= rowsBuyable ? nil : rowPrices[n]
    }

    /// 가방칸 수 = 전체 - 십자 5칸.
    static func bagCellCount(rows: Int) -> Int {
        cols * rows - 5
    }

    /// 십자(영웅 + 앵커 4) 칸인가.
    static func isCrossCell(x: Int, y: Int) -> Bool {
        if x == heroCell.x && y == heroCell.y { return true }
        return anchorAt(x: x, y: y) != nil
    }

    static func anchorAt(x: Int, y: Int) -> EquipSlot? {
        for slot in anchorOrder {
            guard let a = anchors[slot] else { continue }
            if a.x == x && a.y == y { return slot }
        }
        return nil
    }

    /// 데이터 row → 화면 row. 십자가 아래로 오도록 뒤집는다.
    static func visualRow(bagY: Int, rows: Int) -> Int {
        rows - 1 - bagY
    }

    /// 셀 한 변(px/pt) = clamp(44, min(폭 기준, 높이 기준), 56).
    /// 폭·높이 둘 중 작은 쪽이 결정하며 44 아래로는 내려가지 않는다(보드가 넘치면 UI 가 처리).
    /// 음수 폭에서도 웹 `Math.floor` 와 같도록 `.rounded(.down)` 을 쓴다.
    static func bagCellSize(
        width: Double,
        height: Double,
        rows: Int,
        cols: Int = UpHeroBag.cols
    ) -> Int {
        let byW = ((width - Double(gap * (cols - 1))) / Double(cols)).rounded(.down)
        let byH = ((height - Double(gap * (rows - 1))) / Double(rows)).rounded(.down)
        let raw = min(byW, byH)
        // clamp 안에서만 Int 로 접는다 — raw 가 ±무한대여도 상수 범위로 잘린다.
        if !(raw > Double(cellMin)) { return cellMin }
        if raw >= Double(cellMax) { return cellMax }
        return Int(raw)
    }

    // MARK: 모양

    private static let shape1x1: [BagCell] = [BagCell(x: 0, y: 0)]
    private static let shape1x2: [BagCell] = [BagCell(x: 0, y: 0), BagCell(x: 0, y: 1)]
    private static let shape2x1: [BagCell] = [BagCell(x: 0, y: 0), BagCell(x: 1, y: 0)]
    private static let shape2x2: [BagCell] = [
        BagCell(x: 0, y: 0), BagCell(x: 1, y: 0),
        BagCell(x: 0, y: 1), BagCell(x: 1, y: 1),
    ]

    /// 모양은 슬롯 타입에서 파생한다(저장 안 함).
    ///  weapon: 1x2 (rot 짝수 = 세로, 홀수 = 가로 2x1), armor: 2x2, accessory/talisman: 1x1.
    static func shapeFor(type: EquipSlot, rot: Int) -> [BagCell] {
        switch type {
        case .weapon:
            return normalizeRot(rot) % 2 == 1 ? shape2x1 : shape1x2
        case .armor:
            return shape2x2
        default:
            return shape1x1
        }
    }

    static func shapeCellCount(type: EquipSlot) -> Int {
        shapeFor(type: type, rot: 0).count
    }

    /// 회전이 의미 있는 타입인가 (v1: weapon 만).
    static func canRotate(type: EquipSlot) -> Bool {
        type == .weapon
    }

    /// 절대 칸 목록.
    static func footprint(type: EquipSlot, x: Int, y: Int, rot: Int) -> [BagCell] {
        shapeFor(type: type, rot: rot).map { BagCell(x: x + $0.x, y: y + $0.y) }
    }

    // MARK: 좌표 정규화 계약
    //
    //  bagX 유효 iff 0 <= n < cols,  bagY 유효 iff 0 <= n < rowsMax,
    //  bagRot 유효 iff 0 <= n <= 3, 아니면 0.
    //  bagX 또는 bagY 가 무효면 세 값을 모두 버린다.
    //  `CloudEquipment.init(from:)` 이 와이어 단계에서 같은 규칙을 쓴다 — 한쪽만 고치지 말 것.
    //  (웹은 unknown 을 받아 floor 까지 하지만 iOS 도메인은 이미 Int? 라 범위 판정만 남는다.)

    static func normalizeCoord(_ v: Int?, max: Int) -> Int? {
        guard let n = v, n >= 0, n < max else { return nil }
        return n
    }

    static func normalizeRot(_ v: Int?) -> Int {
        guard let n = v, n >= 0, n <= 3 else { return 0 }
        return n
    }

    /// 아이템의 좌표를 계약대로 읽는다. 무효면 nil (= 미배치).
    static func readPlacement(_ item: Equipment) -> BagPlacement? {
        guard let x = normalizeCoord(item.bagX, max: cols),
              let y = normalizeCoord(item.bagY, max: rowsMax) else { return nil }
        return BagPlacement(x: x, y: y, rot: normalizeRot(item.bagRot))
    }

    static func hasPlacement(_ item: Equipment) -> Bool {
        readPlacement(item) != nil
    }

    static func withPlacement(_ item: Equipment, _ p: BagPlacement) -> Equipment {
        var out = item
        out.bagX = p.x
        out.bagY = p.y
        out.bagRot = normalizeRot(p.rot)
        return out
    }

    /// 미배치로 전환 — 세 값을 **함께** nil 로 만든다. 하나만 남기면 다음 정규화에서
    /// "좌표는 없는데 rot 만 있는" 아이템이 와이어로 나가 웹과 어긋난다.
    static func withoutPlacement(_ item: Equipment) -> Equipment {
        var out = item
        out.bagX = nil
        out.bagY = nil
        out.bagRot = nil
        return out
    }

    /// 좌표를 계약대로 정리한 사본. 무효면 삭제, 유효면 정규화된 rot 으로 덮어쓴다. 멱등.
    static func normalizeEquipmentPlacement(_ item: Equipment) -> Equipment {
        guard let p = readPlacement(item) else {
            if item.bagX == nil && item.bagY == nil && item.bagRot == nil { return item }
            return withoutPlacement(item)
        }
        if item.bagX == p.x && item.bagY == p.y && item.bagRot == p.rot { return item }
        return withPlacement(item, p)
    }

    /// 착용 교체 시 벗겨지는 아이템이 새 착용 아이템의 자리를 그대로 상속한다
    /// (같은 슬롯 = 같은 모양이라 항상 성립).
    static func inheritPlacement(from: Equipment, to: Equipment) -> Equipment {
        guard let p = readPlacement(from) else { return withoutPlacement(to) }
        return withPlacement(to, p)
    }

    // MARK: 점유·배치

    /// 십자 칸 마커. 아이템 id 와 충돌하지 않는 값.
    static let crossMark = "#cross"

    static func cellIndex(x: Int, y: Int) -> Int {
        y * cols + x
    }

    static func emptyOccupancy(rows: Int) -> [String?] {
        var occ = [String?](repeating: nil, count: cols * rows)
        for y in 0..<rows {
            for x in 0..<cols where isCrossCell(x: x, y: y) {
                occ[cellIndex(x: x, y: y)] = crossMark
            }
        }
        return occ
    }

    /// 해당 원점·회전으로 놓을 수 있는가. `ignoreId` 는 이동 중인 자기 자신(현재 자리 무시).
    /// 십자 칸은 overlap 으로 취급한다.
    static func checkPlacement(
        occ: [String?],
        rows: Int,
        type: EquipSlot,
        x: Int,
        y: Int,
        rot: Int,
        ignoreId: String? = nil
    ) -> PlaceCheck {
        let cells = footprint(type: type, x: x, y: y, rot: rot)
        for c in cells where c.x < 0 || c.x >= cols || c.y < 0 || c.y >= rows {
            return .outOfBounds
        }
        for c in cells {
            if let v = occ[cellIndex(x: c.x, y: c.y)], v != ignoreId { return .overlap }
        }
        return .ok
    }

    private static func occupy(_ occ: inout [String?], id: String, cells: [BagCell]) {
        for c in cells { occ[cellIndex(x: c.x, y: c.y)] = id }
    }

    /// 인벤토리를 배열 순서대로 스캔해 레이아웃을 확정한다. 멱등.
    ///  1) 좌표 정규화 (계약) → 무효면 unplaced
    ///  2) footprint 가 현재 rows 밖 → suspended (좌표 유지)
    ///  3) 십자·다른 아이템과 겹침 → unplaced (좌표 삭제, 나중 index 가 진다)
    ///  4) 아니면 placed
    /// 착용 아이템은 여기 들어오지 않는다(`hero.equipped` 는 스캔 대상이 아님).
    static func normalizeBagLayout(
        _ inventory: [Equipment],
        rows: Int
    ) -> (inventory: [Equipment], layout: BagLayout) {
        var occ = emptyOccupancy(rows: rows)
        var placed: [Equipment] = []
        var suspended: [Equipment] = []
        var unplaced: [Equipment] = []
        var statusById: [String: PlacementStatus] = [:]
        var changed = false
        var out: [Equipment] = []
        out.reserveCapacity(inventory.count)

        for raw in inventory {
            let item = normalizeEquipmentPlacement(raw)
            if item != raw { changed = true }
            guard let p = readPlacement(item) else {
                out.append(item)
                unplaced.append(item)
                statusById[item.id] = .unplaced
                continue
            }
            let check = checkPlacement(
                occ: occ, rows: rows, type: item.type, x: p.x, y: p.y, rot: p.rot)
            if check == .outOfBounds {
                out.append(item)
                suspended.append(item)
                statusById[item.id] = .suspended
                continue
            }
            if check == .overlap {
                let stripped = withoutPlacement(item)
                changed = true
                out.append(stripped)
                unplaced.append(stripped)
                statusById[item.id] = .unplaced
                continue
            }
            occupy(
                &occ, id: item.id,
                cells: footprint(type: item.type, x: p.x, y: p.y, rot: p.rot))
            out.append(item)
            placed.append(item)
            statusById[item.id] = .placed
        }

        return (
            inventory: changed ? out : inventory,
            layout: BagLayout(
                rows: rows, occupancy: occ, placed: placed, suspended: suspended,
                unplaced: unplaced, statusById: statusById)
        )
    }

    /// 좌상 → 우하 스캔으로 첫 자리를 찾는다.
    /// 회전 순서: preferRot 먼저, 회전 가능 타입이면 반대 방향 한 번 더.
    /// 탭한 칸 (x,y) 을 **덮는** 모든 원점 후보 (웹 originsCovering 1:1). 첫 후보는 탭한 칸 자체,
    /// 그다음은 모양 오프셋만큼 당긴 원점 — 1x2 세로 무기를 맨 윗줄에 탭해도 들어가게 한다.
    static func originsCovering(type: EquipSlot, rot: Int, x: Int, y: Int) -> [BagCell] {
        var out: [BagCell] = []
        for c in shapeFor(type: type, rot: rot) {
            let o = BagCell(x: x - c.x, y: y - c.y)
            if !out.contains(o) { out.append(o) }
        }
        return out
    }

    /// 탭한 칸을 덮으면서 놓을 수 있는 첫 원점. 없으면 nil (웹 firstValidOriginCovering 1:1).
    static func firstValidOriginCovering(
        occ: [String?], rows: Int, type: EquipSlot, rot: Int, x: Int, y: Int, ignoreId: String? = nil
    ) -> BagCell? {
        for o in originsCovering(type: type, rot: rot, x: x, y: y) {
            if checkPlacement(occ: occ, rows: rows, type: type, x: o.x, y: o.y, rot: rot, ignoreId: ignoreId) == .ok {
                return o
            }
        }
        return nil
    }

    static func firstFit(
        occ: [String?],
        rows: Int,
        type: EquipSlot,
        preferRot: Int = 0
    ) -> BagPlacement? {
        let r0 = normalizeRot(preferRot)
        let rots = canRotate(type: type) ? [r0, (r0 + 1) % 4] : [r0]
        // 같은 방향이 두 번 들어가면 한 번만 본다.
        var seen: [Int] = []
        for rot in rots {
            let parity = canRotate(type: type) ? rot % 2 : 0
            if seen.contains(parity) { continue }
            seen.append(parity)
            for y in 0..<rows {
                for x in 0..<cols
                where checkPlacement(occ: occ, rows: rows, type: type, x: x, y: y, rot: rot) == .ok {
                    return BagPlacement(x: x, y: y, rot: rot)
                }
            }
        }
        return nil
    }

    /// 아이템을 가방에 넣는다: 첫 자리에 배치, 자리가 없으면 미배치(트레이)로 append.
    /// 모든 삽입 지점(정산·해제·사진 부적·합성 결과)은 이 헬퍼만 쓴다.
    static func placeIntoBag(_ inventory: [Equipment], _ item: Equipment, rows: Int) -> [Equipment] {
        let result = normalizeBagLayout(inventory, rows: rows)
        let p = firstFit(
            occ: result.layout.occupancy, rows: rows, type: item.type,
            preferRot: normalizeRot(item.bagRot))
        let next = p.map { withPlacement(item, $0) } ?? withoutPlacement(item)
        return result.inventory + [next]
    }

    /// 여러 개를 순서대로 넣는다.
    static func placeAllIntoBag(
        _ inventory: [Equipment], _ items: [Equipment], rows: Int
    ) -> [Equipment] {
        var inv = inventory
        for it in items { inv = placeIntoBag(inv, it, rows: rows) }
        return inv
    }

    /// 전체 재배치: 기존 좌표를 버리고 배열 순서대로 first-fit. 마이그레이션(v5→v6)과
    /// `packAllIfNonePlaced` 가 쓴다. 자리가 없는 아이템은 미배치.
    static func packInventory(_ inventory: [Equipment], rows: Int) -> [Equipment] {
        var occ = emptyOccupancy(rows: rows)
        return inventory.map { raw in
            let item = withoutPlacement(raw)
            guard let p = firstFit(occ: occ, rows: rows, type: item.type, preferRot: 0) else {
                return item
            }
            occupy(
                &occ, id: item.id,
                cells: footprint(type: item.type, x: p.x, y: p.y, rot: p.rot))
            return withPlacement(item, p)
        }
    }

    /// 인벤토리가 비어 있지 않은데 유효 배치가 하나도 없으면 전부 first-fit 한다.
    /// iOS 는 버전 게이트가 없고, 구버전 iOS 가 좌표를 벗긴 클라우드 문서도 이 규칙으로 복구된다.
    /// 유저가 아이템을 트레이로 옮기는 동작이 없으므로 "0개 배치" 는 정당한 상태가 아니다.
    /// 유효성 판정은 rowsMax 기준(현재 rows 와 무관)이라 레벨 하락으로 suspended 된 보드를
    /// 다시 팩하지 않는다.
    static func packAllIfNonePlaced(_ inventory: [Equipment], rows: Int = rowsMax) -> [Equipment] {
        if inventory.isEmpty { return inventory }
        if inventory.contains(where: { hasPlacement($0) }) { return inventory }
        return packInventory(inventory, rows: rows)
    }

    // MARK: 트레이 넘침

    /// 트레이(미배치, suspended 제외)가 cap 을 넘으면 초과분을 고른다:
    /// 최저 등급 먼저, 같은 등급이면 오래된 index 먼저.
    /// 반환 `keep` 은 원래 순서를 유지한 인벤토리, `sell` 은 판매 순서.
    /// 판매가 계산은 이 모듈 밖이다 — 여기는 "무엇을 남기고 무엇을 파는가" 만 정한다.
    /// `candidateIds` 가 있으면 **그 아이템만** 판매 후보다 (웹 동일). 탐험 정산은 이번 드롭 id 만
    /// 넘겨 이미 갖고 있던 아이템은 절대 자동 판매되지 않게 한다. nil 이면 트레이 전체가 후보.
    ///
    /// 그리고 **후보가 아닌(기존) 트레이 아이템만으로 이미 cap 이 찼다면 한 개도 팔지 않는다.**
    /// 격자 도입 전 저장본은 트레이가 cap 을 넘긴 채로 마이그레이션되는데, 그러면 초과분이 늘
    /// 이번 드롭 수보다 많아 새 전리품이 **매번 전부** 자동 판매된다(8행 35칸을 다 사도 마찬가지).
    /// 기존 트레이는 유저가 직접 정리할 때까지 그대로 두고, 새 드롭은 트레이에 쌓이게 둔다.
    static func trayOverflow(
        _ inventory: [Equipment],
        rows: Int,
        cap: Int = trayCap,
        candidateIds: [String]? = nil
    ) -> (keep: [Equipment], sell: [Equipment]) {
        let result = normalizeBagLayout(inventory, rows: rows)
        let tray = result.layout.unplaced
        if tray.count <= cap { return (keep: result.inventory, sell: []) }
        if let candidateIds {
            // 후보가 아닌(= 이번 정산 전부터 트레이에 있던) 아이템 수. 이것만으로 cap 이면 정지.
            let preTray = tray.filter { !candidateIds.contains($0.id) }.count
            if preTray >= cap { return (keep: result.inventory, sell: []) }
        }
        let excess = tray.count - cap
        // index 를 tie-break 로 들고 정렬 — 비교가 완전 순서라 Swift 의 불안정 정렬에도 결정적이다.
        let indexed = tray.enumerated()
            .map { (item: $0.element, i: $0.offset) }
            .filter { candidateIds == nil || candidateIds!.contains($0.item.id) }
        let sorted = indexed.sorted { a, b in
            let ra = rarityRank[a.item.rarity] ?? 0
            let rb = rarityRank[b.item.rarity] ?? 0
            if ra != rb { return ra < rb }
            return a.i < b.i
        }
        let sell = sorted.prefix(min(excess, indexed.count)).map(\.item)
        let sellIds = sell.map(\.id)
        let keep = result.inventory.filter { !sellIds.contains($0.id) }
        return (keep: keep, sell: sell)
    }

    // MARK: 시너지

    static let synergyS1PctPerCell = 5
    static let synergyS1CapPct = 30
    static let synergyS2Crit = 3
    static let synergyS2Cap = 2
    static let synergyS3Vit = 3
    static let synergyS3Cap = 2
    static let synergyS4CapPerAnchor = 2

    // 웹 `pickPrimaryStatKey` 는 iOS 에 이미 `UpHeroRules.pickPrimaryStatKey` 로 있다
    // (강화 스탯 증가가 같은 키를 써야 왕복이 닫힌다). 여기서 다시 정의하면 두 벌이 갈리므로
    // 그대로 쓴다 — 순서도 str/int/vit/dex/agi/crit/slotBonus 로 웹과 같다.

    static func isPhotoTalisman(_ item: Equipment) -> Bool {
        item.type == .talisman && !(item.photoId ?? "").isEmpty
    }

    /// 사진 부적 S4 티어: +1 (강화 <5), +2 (5..9), +3 (>=10). 강화 +20 확장에도 10 에서 접힌다.
    static func photoSynergyAmount(_ enhanceLevel: Int?) -> Int {
        let lv = max(0, min(10, enhanceLevel ?? 0))
        return 1 + lv / 5
    }

    private static func isOrthoAdjacent(_ a: BagCell, _ b: BagCell) -> Bool {
        abs(a.x - b.x) + abs(a.y - b.y) == 1
    }

    private static func isEightAdjacent(_ a: BagCell, _ b: BagCell) -> Bool {
        let dx = abs(a.x - b.x)
        let dy = abs(a.y - b.y)
        return dx <= 1 && dy <= 1 && !(dx == 0 && dy == 0)
    }

    /// footprint 중 target 에 직교 인접한 첫 칸 (스캔 순서 = 모양 정의 순서).
    private static func orthoTouchCell(_ cells: [BagCell], _ target: BagCell) -> BagCell? {
        cells.first { isOrthoAdjacent($0, target) }
    }

    private static func eightTouchCell(_ cells: [BagCell], _ target: BagCell) -> BagCell? {
        cells.first { isEightAdjacent($0, target) }
    }

    private static func addStat(_ target: inout [StatKey: Int], _ key: StatKey, _ amount: Int) {
        target[key] = (target[key] ?? 0) + amount
    }

    /// 시너지 계산. 결정적: 앵커는 `anchorOrder`, 가방 아이템은 배열 index 순.
    /// S4 의 tie-break 는 bagY 오름차순 → bagX 오름차순.
    /// 입력 inventory 는 여기서 다시 `normalizeBagLayout` 을 타므로 placed 만 계산에 참여한다.
    static func computeBagSynergy(
        equipped: [EquipSlot: Equipment],
        inventory: [Equipment],
        rows: Int
    ) -> BagSynergy {
        let layout = normalizeBagLayout(inventory, rows: rows).layout
        var bonuses: [StatKey: Int] = [:]
        var perAnchor: [EquipSlot: [StatKey: Int]] = [
            .weapon: [:], .armor: [:], .accessory: [:], .talisman: [:],
        ]
        var links: [SynergyLink] = []

        let placed: [(item: Equipment, p: BagPlacement, cells: [BagCell])] =
            layout.placed.compactMap { item in
                guard let p = readPlacement(item) else { return nil }
                return (
                    item: item, p: p,
                    cells: footprint(type: item.type, x: p.x, y: p.y, rot: p.rot)
                )
            }

        for slot in anchorOrder {
            guard let worn = equipped[slot], let anchor = anchors[slot] else { continue }
            let primary = UpHeroRules.pickPrimaryStatKey(worn.stats)
            let wornPrimary = primary.map { worn.stats[$0] ?? 0 } ?? 0

            // S1 — 같은 카테고리(사진 제외), 직교 인접, footprint 칸수 × 5%, 앵커당 30% 상한
            var s1Pct = 0
            if let primary, wornPrimary > 0 {
                for entry in placed {
                    if isPhotoTalisman(entry.item) { continue }
                    if entry.item.category != worn.category { continue }
                    guard let touch = orthoTouchCell(entry.cells, anchor) else { continue }
                    let pct = synergyS1PctPerCell * entry.cells.count
                    s1Pct += pct
                    links.append(SynergyLink(
                        rule: .s1, sourceId: entry.item.id, anchor: slot, partnerId: nil,
                        stat: primary, amount: pct, cells: [touch, anchor]))
                }
                if s1Pct > 0 {
                    let pct = min(synergyS1CapPct, s1Pct)
                    // 곱하는 값이 전부 양수라 JS Math.round 와 .rounded() 가 같다.
                    let amount = max(1, Int((Double(wornPrimary * pct) / 100.0).rounded()))
                    addStat(&perAnchor[slot]!, primary, amount)
                    addStat(&bonuses, primary, amount)
                }
            }

            // S2 — 무기 앵커 옆 가방 장신구: crit +3, 2개
            if slot == .weapon {
                var n = 0
                for entry in placed {
                    if n >= synergyS2Cap { break }
                    if entry.item.type != .accessory { continue }
                    guard let touch = orthoTouchCell(entry.cells, anchor) else { continue }
                    n += 1
                    addStat(&perAnchor[slot]!, .crit, synergyS2Crit)
                    addStat(&bonuses, .crit, synergyS2Crit)
                    links.append(SynergyLink(
                        rule: .s2, sourceId: entry.item.id, anchor: slot, partnerId: nil,
                        stat: .crit, amount: synergyS2Crit, cells: [touch, anchor]))
                }
            }

            // S3 — 갑옷 앵커 옆 가방 드롭 부적(사진 아님): vit +3, 2개
            if slot == .armor {
                var n = 0
                for entry in placed {
                    if n >= synergyS3Cap { break }
                    if entry.item.type != .talisman || isPhotoTalisman(entry.item) { continue }
                    guard let touch = orthoTouchCell(entry.cells, anchor) else { continue }
                    n += 1
                    addStat(&perAnchor[slot]!, .vit, synergyS3Vit)
                    addStat(&bonuses, .vit, synergyS3Vit)
                    links.append(SynergyLink(
                        rule: .s3, sourceId: entry.item.id, anchor: slot, partnerId: nil,
                        stat: .vit, amount: synergyS3Vit, cells: [touch, anchor]))
                }
            }

            // S4 — 사진 부적 8방 인접: 착용 주 스탯 +1/+2/+3, 앵커당 2장 (bagY → bagX 순)
            if let primary {
                let photos = placed
                    .filter { isPhotoTalisman($0.item) && eightTouchCell($0.cells, anchor) != nil }
                    .sorted { a, b in a.p.y != b.p.y ? a.p.y < b.p.y : a.p.x < b.p.x }
                    .prefix(synergyS4CapPerAnchor)
                for entry in photos {
                    let amount = photoSynergyAmount(entry.item.enhanceLevel)
                    addStat(&perAnchor[slot]!, primary, amount)
                    addStat(&bonuses, primary, amount)
                    guard let touch = eightTouchCell(entry.cells, anchor) else { continue }
                    links.append(SynergyLink(
                        rule: .s4, sourceId: entry.item.id, anchor: slot, partnerId: nil,
                        stat: primary, amount: amount, cells: [touch, anchor]))
                }
            }
        }

        // S6 — 같은 baseId·등급 가방 아이템 직교 인접: 합성 작업대 링크(스탯 없음). 각 쌍 1회 (i<j).
        for i in placed.indices {
            let a = placed[i]
            if isPhotoTalisman(a.item) { continue }
            guard let baseId = a.item.baseId, !baseId.isEmpty else { continue }
            for j in placed.index(after: i)..<placed.endIndex {
                let b = placed[j]
                if isPhotoTalisman(b.item) { continue }
                if b.item.baseId != baseId || a.item.rarity != b.item.rarity { continue }
                var pair: [BagCell]?
                outer: for ca in a.cells {
                    for cb in b.cells where isOrthoAdjacent(ca, cb) {
                        pair = [ca, cb]
                        break outer
                    }
                }
                guard let pair else { continue }
                links.append(SynergyLink(
                    rule: .s6, sourceId: a.item.id, anchor: nil, partnerId: b.item.id,
                    stat: nil, amount: nil, cells: pair))
            }
        }

        return BagSynergy(bonuses: bonuses, perAnchor: perAnchor, links: links)
    }

    /// 시너지 보너스를 baseStats 에 가산한 영웅 스냅샷.
    /// 세션 생성 직전(레벨 성장 적용 후)에 1회 적용한다 — 전투는 이 스냅샷만 본다.
    static func applyBagSynergy(_ hero: Hero, inventory: [Equipment], rows: Int) -> Hero {
        let bonuses = computeBagSynergy(
            equipped: hero.equipped, inventory: inventory, rows: rows).bonuses
        if bonuses.isEmpty { return hero }
        var out = hero
        // 키마다 독립 가산이라 Dictionary 순회 순서가 결과를 바꾸지 않는다.
        for (k, v) in bonuses { out.baseStats[k] += v }
        return out
    }
}

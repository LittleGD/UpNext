// bag.swift — 격자 가방(UpHeroBag) 동치성 검증 (Swift 측)
//
// 실제 포팅 산출물(Card.swift + Game.swift + UpHero.swift + UpHeroBag.swift)을 그대로
// 컴파일해 scripts/bag-check.mjs 와 동일한 입력으로 동일한 출력 라인을 찍는다.
// 두 파일은 같은 순서·같은 픽스처를 손으로 미러링한다 — 한쪽만 고치지 말 것.
//
// 정규화 계약 섹션만 입력 표현이 다르다: 웹 `normalizeCoord` 는 unknown 을 받아 floor 까지
// 하지만 iOS 도메인 `Equipment.bagX` 는 이미 `Int?` 다(소수·거대수 내림은 와이어 단계
// `CloudEquipment.lenientInt` 담당). 그래서 여기서는 "와이어를 통과한 뒤의 정수" 를 넣고
// 라벨만 원본 입력으로 찍는다. 라벨 = 웹 입력, 값 = 도메인 입력.

import Foundation

var lines: [String] = []
func say(_ s: String) { lines.append(s) }

// ── 포맷 헬퍼 (웹 측과 1:1) ──────────────────────────────────────────────
func cell(_ c: BagCell) -> String { "(\(c.x),\(c.y))" }
func cellList(_ list: [BagCell]) -> String { list.map(cell).joined(separator: " ") }

/// 스탯 맵 — 키 오름차순. 빈 맵은 "-".
func statsStr(_ m: [StatKey: Int]) -> String {
    let keys = m.keys.map(\.rawValue).sorted()
    if keys.isEmpty { return "-" }
    return keys.map { k in "\(k)=\(m[StatKey(rawValue: k)!]!)" }.joined(separator: " ")
}

/// HeroBaseStats 전체 — 0 인 키도 찍는다(구조체라 "없는 키" 개념이 없다).
let baseStatKeys: [StatKey] = [.agi, .crit, .dex, .int, .slotBonus, .str, .vit]
func baseStatsStr(_ b: HeroBaseStats) -> String {
    baseStatKeys.map { "\($0.rawValue)=\(b[$0])" }.joined(separator: " ")
}

/// 인벤 한 줄 — placed 는 id@x,y,r / 나머지는 id:상태.
func invStr(_ inv: [Equipment], _ rows: Int) -> String {
    let r = UpHeroBag.normalizeBagLayout(inv, rows: rows)
    return r.inventory.map { it -> String in
        let st = r.layout.statusById[it.id] ?? .unplaced
        guard st == .placed, let p = UpHeroBag.readPlacement(it) else {
            return "\(it.id):\(st.rawValue)"
        }
        return "\(it.id)@\(p.x),\(p.y),\(p.rot)"
    }.joined(separator: " ")
}

func linkStr(_ l: SynergyLink) -> String {
    let anchor = l.anchor?.rawValue ?? "-"
    let partner = l.partnerId ?? "-"
    let stat = l.stat?.rawValue ?? "-"
    let amount = l.amount.map(String.init) ?? "-"
    return "\(l.rule.rawValue):\(l.sourceId)->\(anchor)|\(partner) "
        + "\(stat) \(amount) \(cell(l.cells[0]))-\(cell(l.cells[1]))"
}

// ── 픽스처 팩토리 ────────────────────────────────────────────────────────
func mk(
    _ id: String, _ type: EquipSlot, _ category: Category, _ rarity: Rarity,
    baseId: String? = nil, stats: [StatKey: Int] = [:],
    photoId: String? = nil, enh: Int? = nil
) -> Equipment {
    Equipment(
        id: id, name: id, baseId: baseId, type: type, rarity: rarity,
        category: category, iconName: "x", stats: stats,
        effects: nil, flavor: nil, photoId: photoId, enhanceLevel: enh,
        enhanceFailStreak: nil, affix: nil, affixes: nil, talismanSkills: nil,
        bagX: nil, bagY: nil, bagRot: nil)
}
func at(_ e: Equipment, _ x: Int?, _ y: Int?, _ r: Int?) -> Equipment {
    var o = e
    o.bagX = x
    o.bagY = y
    o.bagRot = r
    return o
}

func mkHero(_ equipped: [EquipSlot: Equipment]) -> Hero {
    Hero(
        name: "Test", hp: 100, maxHp: 100,
        baseStats: HeroBaseStats(str: 10, int: 10, vit: 10, dex: 10, agi: 10, crit: 0, slotBonus: 0),
        equipped: equipped, classType: nil, appearanceVariant: 0,
        autoSkillEnabled: nil, learnedSkills: nil, skillPoints: nil)
}

// ── 1. 보드 크기 ─────────────────────────────────────────────────────────
say("== 1 board ==")
// 행 수는 상점에서 산 행 수로만 정해진다 (4 + bought, 최대 8). 웹은 2.9 를 floor 하므로 여기선 2 로 넣는다.
let boughtCases: [(String, Int?)] = [("undefined", nil), ("0", 0), ("1", 1), ("2", 2), ("3", 3), ("4", 4), ("5", 5), ("-1", -1), ("2.9", 2)]
for (label, b) in boughtCases {
    let price = UpHeroBag.bagRowPrice(rowsBought: b).map { String($0) } ?? "null"
    say("bagRows(\(label)) = \(UpHeroBag.bagRows(rowsBought: b)) price=\(price)")
}
for r in [4, 5, 6, 7, 8] {
    say("bagCellCount(\(r)) = \(UpHeroBag.bagCellCount(rows: r))")
}
let cellSizeCases: [(Int, Int, Int)] = [(336, 431, 5), (336, 431, 8), (300, 300, 8), (390, 520, 6)]
for (w, h, r) in cellSizeCases {
    let v = UpHeroBag.bagCellSize(width: Double(w), height: Double(h), rows: r)
    say("bagCellSize(\(w),\(h),\(r)) = \(v)")
}

// ── 2. 모양·회전 ─────────────────────────────────────────────────────────
say("== 2 footprint ==")
for type in [EquipSlot.weapon, .armor, .accessory, .talisman] {
    for rot in [0, 1, 2, 3] {
        let fp = UpHeroBag.footprint(type: type, x: 1, y: 3, rot: rot)
        say("footprint(\(type.rawValue),1,3,\(rot)) = \(cellList(fp))")
    }
}

// ── 3. 좌표 정규화 계약 ──────────────────────────────────────────────────
say("== 3 normalize ==")
// 라벨은 웹 입력 그대로. 1e300 은 `lenientInt` 크기 가드(abs < 9.0e15)에 걸려 nil 로 온다.
let contractCases: [(String, Int?, Int?, Int?)] = [
    ("2.7,3,7", 2, 3, 7),
    ("-1,3,0", -1, 3, 0),
    ("99,0,0", 99, 0, 0),
    ("0,8,0", 0, 8, 0),
    ("1e300,1,1", nil, 1, 1),
    ("2,2,2.9", 2, 2, 2),
]
for (label, x, y, r) in contractCases {
    let item = at(mk("n", .accessory, .fitness, .normal), x, y, r)
    if let p = UpHeroBag.readPlacement(item) {
        say("normalize(\(label)) = \(p.x)/\(p.y)/\(p.rot)")
    } else {
        say("normalize(\(label)) = unplaced")
    }
}

// ── 4. 14개 인벤토리: pack → normalize ───────────────────────────────────
say("== 4 pack ==")
let INV14: [Equipment] = [
    mk("w1", .weapon, .fitness, .normal, baseId: "swd", stats: [.str: 6]),
    mk("w2", .weapon, .fitness, .normal, baseId: "swd", stats: [.str: 6]),
    mk("am1", .armor, .nutrition, .rare, baseId: "plt", stats: [.vit: 8]),
    mk("am2", .armor, .nutrition, .rare, baseId: "plt", stats: [.vit: 8]),
    mk("ac1", .accessory, .fitness, .unique, baseId: "rng", stats: [.crit: 4]),
    mk("ac2", .accessory, .learning, .normal, baseId: "bnd", stats: [.agi: 3]),
    mk("ac3", .accessory, .social, .legend, baseId: "amu", stats: [.int: 7]),
    mk("tl1", .talisman, .mindfulness, .normal, baseId: "chm", stats: [.vit: 2]),
    mk("tl2", .talisman, .mindfulness, .rare, baseId: "chm", stats: [.vit: 3]),
    mk("ph1", .talisman, .fitness, .normal, stats: [.str: 1], photoId: "p1", enh: 0),
    mk("ph2", .talisman, .fitness, .rare, stats: [.str: 2], photoId: "p2", enh: 5),
    mk("ph3", .talisman, .productivity, .unique, stats: [.int: 3], photoId: "p3", enh: 10),
    mk("w3", .weapon, .learning, .rare, baseId: "stf", stats: [.int: 5]),
    mk("ac4", .accessory, .nutrition, .normal, baseId: "rng", stats: [.dex: 2]),
]
let packed5 = UpHeroBag.packInventory(INV14, rows: 5)
say("pack5 = \(invStr(packed5, 5))")
say("pack5@rows8 = \(invStr(packed5, 8))")
let packed8 = UpHeroBag.packInventory(INV14, rows: 8)
say("pack8 = \(invStr(packed8, 8))")
// rows 가 줄면(레벨 하락) 보드 밖 좌표는 지우지 않고 suspended 로 남는다.
say("pack8@rows5 = \(invStr(packed8, 5))")

// ── 5. placeIntoBag 시퀀스 ───────────────────────────────────────────────
say("== 5 placeIntoBag ==")
var board: [Equipment] = [
    at(mk("am1", .armor, .nutrition, .rare, baseId: "plt", stats: [.vit: 8]), 0, 3, 0),
    at(mk("w1", .weapon, .fitness, .normal, baseId: "swd", stats: [.str: 6]), 0, 0, 0),
    at(mk("ac1", .accessory, .fitness, .unique, baseId: "rng", stats: [.crit: 4]), 1, 0, 0),
    at(mk("tl1", .talisman, .mindfulness, .normal, baseId: "chm", stats: [.vit: 2]), 3, 2, 0),
]
say("start = \(invStr(board, 5))")
let incoming: [Equipment] = [
    mk("w2", .weapon, .fitness, .normal, baseId: "swd", stats: [.str: 6]),
    mk("am2", .armor, .nutrition, .rare, baseId: "plt", stats: [.vit: 8]),
    mk("ac2", .accessory, .learning, .normal, baseId: "bnd", stats: [.agi: 3]),
    mk("ph1", .talisman, .fitness, .normal, stats: [.str: 1], photoId: "p1", enh: 0),
    mk("tl2", .talisman, .mindfulness, .rare, baseId: "chm", stats: [.vit: 3]),
    mk("w3", .weapon, .learning, .rare, baseId: "stf", stats: [.int: 5]),
]
for (i, it) in incoming.enumerated() {
    board = UpHeroBag.placeIntoBag(board, it, rows: 5)
    say("step\(i + 1) = \(invStr(board, 5))")
}

// ── 5b. 탭한 칸을 덮는 원점 후보 ───────────────────────────────────────
say("== 5b originsCovering ==")
let coverCases: [(EquipSlot, Int, Int, Int)] = [(.accessory, 0, 3, 3), (.weapon, 0, 3, 4), (.weapon, 1, 4, 3), (.armor, 0, 1, 1), (.armor, 0, 4, 4)]
for (type, rot, x, y) in coverCases {
    say("\(type.rawValue) r\(rot) @\(cell(BagCell(x: x, y: y))) -> \(cellList(UpHeroBag.originsCovering(type: type, rot: rot, x: x, y: y)))")
}
do {
    let occ = UpHeroBag.emptyOccupancy(rows: 5)
    let cases: [(EquipSlot, Int, Int, Int)] = [(.weapon, 0, 0, 4), (.weapon, 0, 2, 3), (.weapon, 0, 1, 0), (.armor, 0, 4, 4), (.armor, 0, 0, 0), (.accessory, 0, 2, 1)]
    for (type, rot, x, y) in cases {
        let o = UpHeroBag.firstValidOriginCovering(occ: occ, rows: 5, type: type, rot: rot, x: x, y: y)
        say("first \(type.rawValue) r\(rot) @\(cell(BagCell(x: x, y: y))) -> \(o.map { cell($0) } ?? "none")")
    }
}

// ── 6. 트레이 넘침 ───────────────────────────────────────────────────────
say("== 6 trayOverflow ==")
let TRAY13: [Equipment] = [
    mk("t01", .accessory, .fitness, .normal),
    mk("t02", .accessory, .fitness, .rare),
    mk("t03", .talisman, .learning, .normal),
    mk("t04", .weapon, .social, .unique),
    mk("t05", .armor, .nutrition, .normal),
    mk("t06", .accessory, .learning, .legend),
    mk("t07", .talisman, .mindfulness, .rare),
    mk("t08", .weapon, .fitness, .normal),
    mk("t09", .accessory, .productivity, .unique),
    mk("t10", .armor, .social, .rare),
    mk("t11", .talisman, .fitness, .normal),
    mk("t12", .accessory, .nutrition, .unique),
    mk("t13", .weapon, .learning, .rare),
]
do {
    let r = UpHeroBag.trayOverflow(TRAY13, rows: 5, cap: UpHeroBag.trayCap)
    say("sell = \(r.sell.map(\.id).joined(separator: " "))")
    say("keep = \(r.keep.count)")
    say("keepIds = \(r.keep.map(\.id).joined(separator: " "))")
    // 후보 제한: 이번 드롭만 판매 후보 (기존 아이템 보호). 후보가 초과분보다 적으면 후보만 판다.
    let c1 = UpHeroBag.trayOverflow(TRAY13, rows: 5, cap: UpHeroBag.trayCap, candidateIds: ["t11", "t12", "t13", "t01"])
    say("cand sell = \(c1.sell.map(\.id).joined(separator: " "))")
    say("cand keep = \(c1.keep.count)")
    let c2 = UpHeroBag.trayOverflow(TRAY13, rows: 5, cap: UpHeroBag.trayCap, candidateIds: ["t06"])
    say("cand1 sell = \(c2.sell.map(\.id).joined(separator: " "))")
    say("cand1 keep = \(c2.keep.count)")
    let c3 = UpHeroBag.trayOverflow(TRAY13, rows: 5, cap: UpHeroBag.trayCap, candidateIds: [])
    say("cand0 sell = \(c3.sell.count) keep = \(c3.keep.count)")
}

// ── 7. 시너지 ────────────────────────────────────────────────────────────
say("== 7 synergy ==")
// 네 앵커 모두 착용. eqC 는 dex/agi 동률이라 pickPrimaryStatKey 의 정의 순서를 검증한다.
let EQUIPPED: [EquipSlot: Equipment] = [
    .weapon: mk("eqW", .weapon, .fitness, .rare, baseId: "eqswd", stats: [.str: 20, .crit: 2]),
    .armor: mk("eqA", .armor, .nutrition, .rare, baseId: "eqplt", stats: [.vit: 17]),
    .accessory: mk("eqC", .accessory, .learning, .unique, baseId: "eqrng", stats: [.agi: 11, .dex: 11]),
    .talisman: mk("eqT", .talisman, .mindfulness, .rare, baseId: "eqchm", stats: [.int: 9]),
]

// B1 — S1 혼합(1x1 + 1x2 + 2x2)으로 armor 앵커 35% → 30% 캡. b1c 는 무기 앵커 S2 도 낸다.
let B1: [Equipment] = [
    at(mk("b1a", .armor, .nutrition, .rare, baseId: "plt", stats: [.vit: 4]), 0, 2, 0),
    at(mk("b1b", .weapon, .nutrition, .normal, baseId: "swd", stats: [.str: 3]), 0, 0, 0),
    at(mk("b1c", .accessory, .nutrition, .normal, baseId: "rng", stats: [.crit: 1]), 1, 0, 0),
]
// B2 — 십자 둘레: 드롭 부적 3개(S3 캡 2) + 무기 앵커 옆 장신구 1개(S2).
let B2: [Equipment] = [
    at(mk("b2t1", .talisman, .nutrition, .normal, baseId: "chm", stats: [.vit: 2]), 0, 1, 0),
    at(mk("b2t2", .talisman, .nutrition, .rare, baseId: "chm", stats: [.vit: 3]), 1, 0, 0),
    at(mk("b2t3", .talisman, .nutrition, .normal, baseId: "chm", stats: [.vit: 2]), 1, 2, 0),
    at(mk("b2c1", .accessory, .fitness, .rare, baseId: "rng", stats: [.crit: 3]), 3, 0, 0),
]
// B3 — 사진 3장이 talisman 앵커 8방(캡 2, bagY→bagX tie-break) + b3p1 은 armor 앵커도 함께 문다.
let B3: [Equipment] = [
    at(mk("b3p1", .talisman, .fitness, .unique, stats: [.str: 3], photoId: "q1", enh: 10), 1, 2, 0),
    at(mk("b3p2", .talisman, .fitness, .rare, stats: [.str: 2], photoId: "q2", enh: 5), 3, 2, 0),
    at(mk("b3p3", .talisman, .fitness, .normal, stats: [.str: 1], photoId: "q3", enh: 0), 1, 3, 0),
]
// B4 — S6 전용: 같은 baseId·등급 3개 일렬(인접 쌍 2개), 등급 다른 이웃 1개, 멀리 떨어진 1개.
let B4: [Equipment] = [
    at(mk("b4x", .accessory, .fitness, .rare, baseId: "rng", stats: [.crit: 1]), 0, 3, 0),
    at(mk("b4y", .accessory, .fitness, .rare, baseId: "rng", stats: [.crit: 1]), 1, 3, 0),
    at(mk("b4z", .accessory, .fitness, .rare, baseId: "rng", stats: [.crit: 1]), 2, 3, 0),
    at(mk("b4w", .accessory, .fitness, .unique, baseId: "rng", stats: [.crit: 2]), 3, 3, 0),
    at(mk("b4v", .accessory, .fitness, .rare, baseId: "rng", stats: [.crit: 1]), 4, 0, 0),
]

let BOARDS: [(String, [Equipment])] = [("B1", B1), ("B2", B2), ("B3", B3), ("B4", B4)]
for (name, inv) in BOARDS {
    let syn = UpHeroBag.computeBagSynergy(equipped: EQUIPPED, inventory: inv, rows: 5)
    say("\(name) board = \(invStr(inv, 5))")
    say("\(name) bonuses = \(statsStr(syn.bonuses))")
    for slot in UpHeroBag.anchorOrder {
        say("\(name) anchor \(slot.rawValue) = \(statsStr(syn.perAnchor[slot] ?? [:]))")
    }
    say("\(name) links = \(syn.links.count)")
    for l in syn.links { say("\(name) link \(linkStr(l))") }
}

// ── 8. applyBagSynergy ───────────────────────────────────────────────────
say("== 8 applyBagSynergy ==")
for (name, inv) in BOARDS {
    let hero = UpHeroBag.applyBagSynergy(mkHero(EQUIPPED), inventory: inv, rows: 5)
    say("\(name) baseStats = \(baseStatsStr(hero.baseStats))")
}

print(lines.joined(separator: "\n"))

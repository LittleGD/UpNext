//
//  EquipmentStats.swift
//  UpNext 모델 — 장비 스탯 표시 순서의 단일 출처.
//
//  웹 src/lib/equipmentStats.ts 1:1 (Phase 6-E, Track E, 피드백 17).
//  `[StatKey: Int]` 딕셔너리 순서는 계약이 아니다. 주스탯은 템플릿 `statBoost` (baseId 로
//  조회) 로 정하고, 그 다음 str/int/vit/dex/agi 순, crit, slotBonus 로 고정한다.
//  Foundation 만 — 뷰 없이 테스트·동치 harness 에서 컴파일된다.
//

import Foundation

enum EquipmentStats {

    /// 주스탯 후보 순서 (crit / slotBonus 제외). 웹 `CORE_ORDER`.
    static let coreOrder: [StatKey] = [.str, .int, .vit, .dex, .agi]

    /// 주스탯 key. 템플릿이 있으면 `statBoost`; 없으면(사진 부적·손상본) affix 가 아닌
    /// core 스탯 중 값이 가장 큰 것 (동률은 coreOrder 앞). 스탯이 없으면 nil.
    /// 웹 `getPrimaryStatKey`.
    static func primaryStatKey(_ eq: Equipment) -> StatKey? {
        if let baseId = eq.baseId, let t = EquipmentPool.findTemplate(baseId: baseId) {
            return t.statBoost
        }
        var affixSet = Set<StatKey>()
        if let a = eq.affix { affixSet.insert(a) }
        for a in eq.affixes ?? [] { affixSet.insert(a) }
        var best: StatKey? = nil
        var bestVal = 0
        for k in coreOrder where !affixSet.contains(k) {
            let v = eq.stats[k] ?? 0
            if v > bestVal { best = k; bestVal = v }
        }
        if let best { return best }
        // affix 뿐인 손상본 — 그래도 값이 있는 첫 core 스탯.
        for k in coreOrder where (eq.stats[k] ?? 0) > 0 { return k }
        return nil
    }

    /// 표시 순서로 정렬된 (key, value) 목록. 0 값은 뺀다. 웹 `orderedStatEntries`.
    ///   1. 주스탯 · 2. 나머지 str/int/vit/dex/agi · 3. crit · 4. slotBonus
    static func orderedEntries(_ eq: Equipment) -> [(key: StatKey, value: Int)] {
        let primary = primaryStatKey(eq)
        var order: [StatKey] = []
        if let primary { order.append(primary) }
        for k in coreOrder where k != primary { order.append(k) }
        order.append(.crit)
        order.append(.slotBonus)
        var out: [(key: StatKey, value: Int)] = []
        for k in order {
            guard let v = eq.stats[k], v != 0 else { continue }
            out.append((k, v))
        }
        return out
    }

    /// "+7%" (crit) / "+N" (그 외). 웹 `formatStat`.
    static func format(_ k: StatKey, _ v: Int) -> String {
        k == .crit ? "+\(v)%" : "+\(v)"
    }
}

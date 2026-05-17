//
//  WeeklyAffixes.swift
//  UpNext 데이터 — Up Hero 주간 악몽 던전 affix 풀.
//
//  웹 src/data/weeklyAffixes.ts (183줄) 1:1 포팅.
//  Phase 2.4 (RPG 엔진) 오케스트레이션 데이터 레이어 산출물.
//
//  매주 ISO week id 를 seed 로 하나 pick — 전 유저 동일 affix. 모든 affix 에
//  명확한 페널티 포함 (순수 버프 없음). apply 는 createSession 직후 session mutate.
//

import Foundation

/// 주간 악몽 affix 1종. 웹 `WeeklyAffix`.
struct WeeklyAffix {
    let id: String
    let name: String
    let description: String
    /// createSession 직후 호출 — session 자유 mutate.
    let apply: (inout CombatSession) -> Void
}

enum WeeklyAffixes {

    /// 11개 affix — 모두 트레이드오프 또는 순수 페널티. 웹 `WEEKLY_AFFIX_POOL`.
    static let pool: [WeeklyAffix] = [
        WeeklyAffix(id: "glass_cannon", name: "유리 대포",
            description: "영웅 공격 +40%, 최대 HP -25%",
            apply: { s in
                s.hero.maxHp = UpHeroCombat.jsRound(Double(s.hero.maxHp) * 0.75)
                s.hero.hp = min(s.hero.hp, s.hero.maxHp)
                s.hero.baseStats.str = UpHeroCombat.jsRound(Double(s.hero.baseStats.str) * 1.4)
            }),
        WeeklyAffix(id: "enemy_frenzy", name: "적의 광란",
            description: "모든 몬스터 공격 +25%",
            apply: { s in s.monsterAtkMult = 1.25 }),
        WeeklyAffix(id: "time_pressure", name: "시간의 압박",
            description: "탐험 시간 -30%",
            apply: { s in
                s.maxTime = UpHeroCombat.jsRound(Double(s.maxTime) * 0.7)
                s.time = min(s.time, s.maxTime)
            }),
        WeeklyAffix(id: "blessing_of_haste", name: "바람의 축복",
            description: "회피 +15%, 민첩 +10, 단 체력 -20%",
            apply: { s in
                s.hero.maxHp = UpHeroCombat.jsRound(Double(s.hero.maxHp) * 0.8)
                s.hero.hp = min(s.hero.hp, s.hero.maxHp)
                s.hero.baseStats.agi += 10
                if s.talismanMods == nil { s.talismanMods = TalismanModifiers() }
                s.talismanMods?.dodgeBonus += 0.15
            }),
        WeeklyAffix(id: "bountiful_harvest", name: "풍요의 수확",
            description: "드롭률 +50%, 코인 +20%, 단 몬스터 HP +20%",
            apply: { s in
                s.monsterHpMult = (s.monsterHpMult ?? 1) * 1.2
                s.activeBuffs = (s.activeBuffs ?? []) + [
                    CardBuff(effects: [
                        .special(type: .dropRate, value: 50),
                        .special(type: .coinBoost, value: 20),
                    ], description: "풍요의 수확 (주간 악몽)"),
                ]
            }),
        WeeklyAffix(id: "fragile_world", name: "깨지기 쉬운 세계",
            description: "모든 치명타 확률 +15% (양측)",
            apply: { s in
                s.hero.baseStats.crit += 15
                s.monsterCritBonus = 0.15
            }),
        WeeklyAffix(id: "dense_encounters", name: "빽빽한 조우",
            description: "몬스터 조우율 +20%, 이벤트·보물 감소",
            apply: { s in
                s.activeBuffs = (s.activeBuffs ?? []) + [
                    CardBuff(effects: [.special(type: .monsterFrequency, value: 20)],
                             description: "빽빽한 조우 (주간 악몽)"),
                ]
            }),
        WeeklyAffix(id: "iron_will", name: "강철 의지",
            description: "체력 +30%, 단 적 공격 +35%",
            apply: { s in
                s.hero.maxHp = UpHeroCombat.jsRound(Double(s.hero.maxHp) * 1.3)
                s.hero.hp = s.hero.maxHp
                s.monsterAtkMult = (s.monsterAtkMult ?? 1) * 1.35
            }),
        WeeklyAffix(id: "chaos_treasures", name: "혼돈의 보물",
            description: "드롭 등급이 무작위 (저등급·고등급 모두 동일 확률)",
            apply: { s in s.flattenDropRarity = true }),
        WeeklyAffix(id: "weakened_start", name: "무너진 출발",
            description: "시작 체력 70%, 몬스터 공격 +15%",
            apply: { s in
                s.hero.hp = UpHeroCombat.jsRound(Double(s.hero.maxHp) * 0.7)
                s.monsterAtkMult = (s.monsterAtkMult ?? 1) * 1.15
            }),
        WeeklyAffix(id: "long_march", name: "긴 행군",
            description: "휴식처 확률 +20%, 단 몬스터 HP +25%",
            apply: { s in
                s.monsterHpMult = 1.25
                s.restChanceBonus = 0.2
            }),
    ]

    /// week id 기반 결정론적 pick (hash % pool). 웹 `pickWeeklyAffix`.
    static func pickWeeklyAffix(weekId: String) -> WeeklyAffix {
        var hash: Int32 = 0
        for scalar in weekId.unicodeScalars {
            // JS charCodeAt 는 UTF-16 code unit — BMP 범위 week id 는 unicodeScalar 와 동일.
            hash = hash &* 31 &+ Int32(truncatingIfNeeded: Int(scalar.value))
        }
        let idx = abs(Int(hash)) % pool.count
        return pool[idx]
    }

    /// affix id 로 lookup. 웹 `getWeeklyAffixById`.
    static func getWeeklyAffixById(_ id: String) -> WeeklyAffix? {
        pool.first { $0.id == id }
    }
}

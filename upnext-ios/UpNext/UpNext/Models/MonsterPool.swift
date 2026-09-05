//
//  MonsterPool.swift
//  UpNext 데이터 — Up Hero 몬스터 풀 + floor 스케일링.
//
//  웹 src/data/upHeroMonsters.ts (334줄) 1:1 포팅.
//  Phase 2.4 (RPG 엔진) 오케스트레이션 데이터 레이어 산출물.
//
//  결정론: scaleMonster 의 stat 계산은 (template, floor, opts) 만으로 결정 → 검증 가능.
//   createMonsterForFloor 의 템플릿 선택은 Phase 16 (Track C) 부터 웹도 rng() (시드
//   가능) 라 호출 순서가 맞는다: [newbie 풀 roll] → [power 티어 roll] → [티어 내 인덱스 roll].
//   datalayer 동치 suite 섹션 6 이 시드별 템플릿 선택을 대조한다. id 는 UUID.
//

import Foundation

/// 몬스터 템플릿 — 정확한 stats 는 floor 에 따라 스케일링. 웹 `MonsterTemplate`.
struct MonsterTemplate: Equatable {
    let id: String
    let name: String
    let kind: MonsterKind
    let power: Int               // 상대 파워 1|2|3
    var isBoss: Bool = false
    var dungeonId: DungeonId? = nil   // codex 표시용 (scaleMonster 후 부착)
    var isNewbie: Bool = false        // floor ≤ 3 전용 스폰
    var trait: MonsterTrait? = nil
}

/// 던전별 일반/보스 템플릿 묶음. 웹 `TEMPLATES[dungeonId]`.
struct DungeonMonsterPool {
    let normal: [MonsterTemplate]
    let bosses: [MonsterTemplate]
}

/// 몬스터 스케일링 옵션. 웹 `ScaleOptions`.
struct ScaleOptions {
    var ngPlusLevel: Int = 0
    var hpMult: Double = 1
    var atkMult: Double = 1
}

enum MonsterPool {

    /// 던전별 몬스터 템플릿 (normal 9 + boss 3). 웹 `TEMPLATES`.
    static let templates: [DungeonId: DungeonMonsterPool] = [
        .fitness: DungeonMonsterPool(
            normal: [
                MonsterTemplate(id: "fit_newbie_rabbit", name: "겁쟁이 토끼", kind: .creature, power: 1, isNewbie: true, trait: .swift),
                MonsterTemplate(id: "fit_newbie_pebble", name: "뒹구는 돌멩이", kind: .construct, power: 1, isNewbie: true),
                MonsterTemplate(id: "fit_wolf", name: "산악 늑대", kind: .beast, power: 1, trait: .swift),
                MonsterTemplate(id: "fit_bear", name: "돌산 곰", kind: .beast, power: 2, trait: .tough),
                MonsterTemplate(id: "fit_goblin", name: "산악 고블린", kind: .goblin, power: 1, trait: .fragile),
                MonsterTemplate(id: "fit_golem", name: "작은 석상", kind: .construct, power: 3, trait: .shield),
                MonsterTemplate(id: "fit_eagle", name: "절벽 독수리", kind: .creature, power: 2, trait: .burst),
                MonsterTemplate(id: "fit_boar", name: "분노한 멧돼지", kind: .beast, power: 2, trait: .burst),
                MonsterTemplate(id: "fit_serpent", name: "바위 살무사", kind: .creature, power: 2, trait: .poison),
            ],
            bosses: [
                MonsterTemplate(id: "boss_mountain_wolf", name: "알파 늑대", kind: .large, power: 3, isBoss: true, trait: .burst),
                MonsterTemplate(id: "boss_stone_golem", name: "돌의 수호자", kind: .large, power: 3, isBoss: true, trait: .shield),
                MonsterTemplate(id: "boss_mountain_giant", name: "산악의 거인", kind: .large, power: 3, isBoss: true, trait: .tough),
            ]),
        .learning: DungeonMonsterPool(
            normal: [
                MonsterTemplate(id: "lrn_newbie_page", name: "흩날리는 낱장", kind: .book, power: 1, isNewbie: true, trait: .fragile),
                MonsterTemplate(id: "lrn_newbie_ink", name: "작은 잉크 방울", kind: .creature, power: 1, isNewbie: true),
                MonsterTemplate(id: "lrn_book", name: "떠도는 책", kind: .book, power: 1),
                MonsterTemplate(id: "lrn_scroll", name: "고문서 정령", kind: .spirit, power: 1, trait: .swift),
                MonsterTemplate(id: "lrn_inkblot", name: "잉크 괴물", kind: .creature, power: 2, trait: .poison),
                MonsterTemplate(id: "lrn_scholar", name: "고독한 학자", kind: .goblin, power: 2, trait: .burst),
                MonsterTemplate(id: "lrn_riddle", name: "수수께끼 영혼", kind: .spirit, power: 3, trait: .regen),
                MonsterTemplate(id: "lrn_tome", name: "금서의 정령", kind: .book, power: 2, trait: .shield),
                MonsterTemplate(id: "lrn_quill", name: "저주받은 깃펜", kind: .creature, power: 2, trait: .burst),
            ],
            bosses: [
                MonsterTemplate(id: "boss_book_spirit", name: "잊혀진 저자", kind: .large, power: 3, isBoss: true, trait: .regen),
                MonsterTemplate(id: "boss_ancient_scholar", name: "옛 현자", kind: .large, power: 3, isBoss: true, trait: .burst),
                MonsterTemplate(id: "boss_lich_of_ignorance", name: "무지의 리치", kind: .large, power: 3, isBoss: true, trait: .poison),
            ]),
        .mindfulness: DungeonMonsterPool(
            normal: [
                MonsterTemplate(id: "mnd_newbie_bubble", name: "작은 망상 거품", kind: .spirit, power: 1, isNewbie: true),
                MonsterTemplate(id: "mnd_newbie_breeze", name: "살랑 바람", kind: .spirit, power: 1, isNewbie: true, trait: .swift),
                MonsterTemplate(id: "mnd_wisp", name: "그림자 영", kind: .spirit, power: 1, trait: .swift),
                MonsterTemplate(id: "mnd_sprite", name: "빛 정령", kind: .spirit, power: 1, trait: .fragile),
                MonsterTemplate(id: "mnd_echo", name: "마음의 메아리", kind: .spirit, power: 2, trait: .regen),
                MonsterTemplate(id: "mnd_distraction", name: "산만함", kind: .creature, power: 2, trait: .burst),
                MonsterTemplate(id: "mnd_doubt", name: "의심의 그림자", kind: .spirit, power: 3, trait: .poison),
                MonsterTemplate(id: "mnd_mirror", name: "뒤집힌 거울상", kind: .spirit, power: 2, trait: .shield),
                MonsterTemplate(id: "mnd_reverie", name: "몽상의 잔영", kind: .spirit, power: 2, trait: .regen),
            ],
            bosses: [
                MonsterTemplate(id: "boss_shadow_wisp", name: "내면의 그림자", kind: .large, power: 3, isBoss: true, trait: .poison),
                MonsterTemplate(id: "boss_silent_monk", name: "침묵의 수도승", kind: .large, power: 3, isBoss: true, trait: .shield),
                MonsterTemplate(id: "boss_distraction_demon", name: "산만함의 마왕", kind: .large, power: 3, isBoss: true, trait: .swift),
            ]),
        .nutrition: DungeonMonsterPool(
            normal: [
                MonsterTemplate(id: "ntr_newbie_bean", name: "통통 튀는 콩", kind: .creature, power: 1, isNewbie: true, trait: .fragile),
                MonsterTemplate(id: "ntr_newbie_carrot", name: "아기 당근", kind: .goblin, power: 1, isNewbie: true),
                MonsterTemplate(id: "ntr_sprout", name: "성난 새싹", kind: .creature, power: 1, trait: .regen),
                MonsterTemplate(id: "ntr_corn", name: "거대 옥수수", kind: .goblin, power: 2, trait: .tough),
                MonsterTemplate(id: "ntr_pumpkin", name: "썩은 호박", kind: .creature, power: 2, trait: .poison),
                MonsterTemplate(id: "ntr_pepper", name: "불타는 고추", kind: .creature, power: 2, trait: .burst),
                MonsterTemplate(id: "ntr_broccoli", name: "브로콜리 기사", kind: .goblin, power: 3, trait: .shield),
                MonsterTemplate(id: "ntr_mushroom", name: "독버섯 포자", kind: .creature, power: 2, trait: .poison),
                MonsterTemplate(id: "ntr_cabbage", name: "구르는 양배추", kind: .creature, power: 2, trait: .tough),
            ],
            bosses: [
                MonsterTemplate(id: "boss_grain_sprite", name: "곡물의 왕", kind: .large, power: 3, isBoss: true, trait: .tough),
                MonsterTemplate(id: "boss_giant_vegetable", name: "채소 거신", kind: .large, power: 3, isBoss: true, trait: .regen),
                MonsterTemplate(id: "boss_gluttony_titan", name: "폭식의 거인", kind: .large, power: 3, isBoss: true, trait: .tough),
            ]),
        .social: DungeonMonsterPool(
            normal: [
                MonsterTemplate(id: "soc_newbie_whisper", name: "작은 속삭임", kind: .spirit, power: 1, isNewbie: true),
                MonsterTemplate(id: "soc_newbie_pickpocket", name: "서툰 소매치기", kind: .goblin, power: 1, isNewbie: true, trait: .fragile),
                MonsterTemplate(id: "soc_thief", name: "뒷골목 도둑", kind: .goblin, power: 1, trait: .swift),
                MonsterTemplate(id: "soc_clown", name: "떠도는 광대", kind: .goblin, power: 1, trait: .swift),
                MonsterTemplate(id: "soc_gossip", name: "소문꾼", kind: .goblin, power: 2, trait: .poison),
                MonsterTemplate(id: "soc_swindler", name: "사기꾼", kind: .goblin, power: 2, trait: .burst),
                MonsterTemplate(id: "soc_outcast", name: "추방자", kind: .spirit, power: 3, trait: .regen),
                MonsterTemplate(id: "soc_mime", name: "침묵의 마임", kind: .goblin, power: 2, trait: .shield),
                MonsterTemplate(id: "soc_troll", name: "말참견 트롤", kind: .goblin, power: 2, trait: .tough),
            ],
            bosses: [
                MonsterTemplate(id: "boss_street_thief", name: "도둑의 왕", kind: .large, power: 3, isBoss: true, trait: .swift),
                MonsterTemplate(id: "boss_jester", name: "어둠의 광대", kind: .large, power: 3, isBoss: true, trait: .burst),
                MonsterTemplate(id: "boss_loneliness_phantom", name: "외로움의 환영", kind: .large, power: 3, isBoss: true, trait: .poison),
            ]),
        .productivity: DungeonMonsterPool(
            normal: [
                MonsterTemplate(id: "prd_newbie_paperclip", name: "달그락 클립", kind: .construct, power: 1, isNewbie: true, trait: .fragile),
                MonsterTemplate(id: "prd_newbie_stickynote", name: "나풀 포스트잇", kind: .creature, power: 1, isNewbie: true),
                MonsterTemplate(id: "prd_gear", name: "작은 톱니바퀴", kind: .construct, power: 1),
                MonsterTemplate(id: "prd_clockbot", name: "시계 병사", kind: .construct, power: 2, trait: .shield),
                MonsterTemplate(id: "prd_timesink", name: "시간 도둑", kind: .spirit, power: 2, trait: .swift),
                MonsterTemplate(id: "prd_drone", name: "자동인형", kind: .construct, power: 2, trait: .tough),
                MonsterTemplate(id: "prd_pendulum", name: "저주의 추", kind: .construct, power: 3, trait: .burst),
                MonsterTemplate(id: "prd_ledger", name: "산더미 장부", kind: .book, power: 2, trait: .tough),
                MonsterTemplate(id: "prd_inbox", name: "폭주 메일함", kind: .construct, power: 2, trait: .burst),
            ],
            bosses: [
                MonsterTemplate(id: "boss_clockwork_drone", name: "시계탑 수호자", kind: .large, power: 3, isBoss: true, trait: .shield),
                MonsterTemplate(id: "boss_time_thief", name: "시간 도적왕", kind: .large, power: 3, isBoss: true, trait: .swift),
                MonsterTemplate(id: "boss_procrastination_lord", name: "미루기의 시간술사", kind: .large, power: 3, isBoss: true, trait: .regen),
            ]),
        .wellness: DungeonMonsterPool(
            normal: [
                MonsterTemplate(id: "wel_newbie_droplet", name: "작은 물방울", kind: .spirit, power: 1, isNewbie: true, trait: .fragile),
                MonsterTemplate(id: "wel_newbie_petal", name: "떨어진 꽃잎", kind: .creature, power: 1, isNewbie: true),
                MonsterTemplate(id: "wel_mist", name: "안개 정령", kind: .spirit, power: 1, trait: .swift),
                MonsterTemplate(id: "wel_slime", name: "수증기 슬라임", kind: .creature, power: 1, trait: .regen),
                MonsterTemplate(id: "wel_naiad", name: "온천 님프", kind: .spirit, power: 2, trait: .regen),
                MonsterTemplate(id: "wel_lotus", name: "독 연꽃", kind: .creature, power: 2, trait: .poison),
                MonsterTemplate(id: "wel_cold", name: "한기", kind: .spirit, power: 3, trait: .burst),
                MonsterTemplate(id: "wel_ember", name: "숯불 잔광", kind: .spirit, power: 2, trait: .burst),
                MonsterTemplate(id: "wel_moss", name: "쉬쉬 이끼", kind: .creature, power: 2, trait: .poison),
            ],
            bosses: [
                MonsterTemplate(id: "boss_mist_spirit", name: "짙은 안개의 영", kind: .large, power: 3, isBoss: true, trait: .regen),
                MonsterTemplate(id: "boss_river_naiad", name: "온천의 여왕", kind: .large, power: 3, isBoss: true, trait: .regen),
                MonsterTemplate(id: "boss_lethargy_fog", name: "무기력의 안개", kind: .large, power: 3, isBoss: true, trait: .poison),
            ]),
        .trending: DungeonMonsterPool(
            normal: [
                MonsterTemplate(id: "trd_newbie_pixel", name: "말썽꾸러기 픽셀", kind: .creature, power: 1, isNewbie: true, trait: .fragile),
                MonsterTemplate(id: "trd_newbie_bubble", name: "채팅 말풍선", kind: .spirit, power: 1, isNewbie: true),
                MonsterTemplate(id: "trd_mini", name: "랜덤 픽셀", kind: .creature, power: 1, trait: .swift),
                MonsterTemplate(id: "trd_meme", name: "밈 변종", kind: .goblin, power: 1, trait: .burst),
                MonsterTemplate(id: "trd_glitch", name: "글리치", kind: .spirit, power: 2, trait: .swift),
                MonsterTemplate(id: "trd_holo", name: "홀로그램 유령", kind: .spirit, power: 2, trait: .shield),
                MonsterTemplate(id: "trd_viral", name: "바이럴 구체", kind: .creature, power: 3, trait: .regen),
                MonsterTemplate(id: "trd_swipe", name: "무한 스와이프", kind: .spirit, power: 2, trait: .swift),
                MonsterTemplate(id: "trd_algorithm", name: "알고리즘 요괴", kind: .construct, power: 2, trait: .burst),
            ],
            bosses: [
                MonsterTemplate(id: "boss_mutant_minor", name: "작은 카멜레온", kind: .large, power: 3, isBoss: true, trait: .swift),
                MonsterTemplate(id: "boss_mutant_mid", name: "뒤틀린 유행", kind: .large, power: 3, isBoss: true, trait: .regen),
                MonsterTemplate(id: "boss_trend_chameleon", name: "트렌드의 카멜레온", kind: .large, power: 3, isBoss: true, trait: .burst),
            ]),
    ]

    /// Codex 용 flat list (dungeonId 부착). 웹 `ALL_MONSTER_TEMPLATES`.
    static let allTemplates: [MonsterTemplate] = {
        let order: [DungeonId] = [.fitness, .learning, .mindfulness, .nutrition,
                                  .social, .productivity, .wellness, .trending]
        var out: [MonsterTemplate] = []
        for dungeonId in order {
            guard let pool = templates[dungeonId] else { continue }
            for var t in pool.normal { t.dungeonId = dungeonId; out.append(t) }
            for var t in pool.bosses { t.dungeonId = dungeonId; out.append(t) }
        }
        return out
    }()

    /// Phase 16 (Track C, 피드백 33) — 층 구간별 power 티어 가중치 (p1/p2/p3).
    /// 웹 `POWER_WEIGHTS_BY_FLOOR` 와 같은 값. 이전엔 풀에서 균등 추첨이라 F5 에서도
    /// power 3 (ATK ×3) 이 1/7 로 나왔다. 풀에 없는 티어는 버리고 남은 가중치를 재정규화.
    static let powerWeightsByFloor: [[Int: Double]] = [
        [1: 70, 2: 30, 3: 0],    // F1-10
        [1: 50, 2: 40, 3: 10],   // F11-20
        [1: 35, 2: 45, 3: 20],   // F21-30
        [1: 25, 2: 45, 3: 30],   // F31+
    ]

    /// 웹 `powerWeightBand`.
    static func powerWeightBand(_ floor: Int) -> Int {
        floor <= 10 ? 0 : floor <= 20 ? 1 : floor <= 30 ? 2 : 3
    }

    /// rng 두 번 소비: 티어 → 티어 내 균등. 웹 `pickTemplateByFloorWeight` 와 같은 호출 순서.
    private static func pickTemplateByFloorWeight<R: RandomSource>(
        _ pool: [MonsterTemplate], floor: Int, rng: inout R
    ) -> MonsterTemplate {
        let weights = powerWeightsByFloor[powerWeightBand(floor)]
        var tiers: [(items: [MonsterTemplate], w: Double)] = []
        for power in [1, 2, 3] {
            let items = pool.filter { $0.power == power }
            if items.isEmpty { continue }
            tiers.append((items, weights[power] ?? 0))
        }
        let total = tiers.reduce(0.0) { $0 + $1.w }
        var chosen = tiers[tiers.count - 1]
        if total > 0 {
            var roll = rng.unit() * total
            for tier in tiers {
                roll -= tier.w
                if roll < 0 {
                    chosen = tier
                    break
                }
            }
        } else {
            // 모든 가중치 0 — 풀 균등 폴백 (웹과 같이 rng 를 두 번 소비).
            _ = rng.unit()
            return pool[rng.int(below: pool.count)]
        }
        return chosen.items[rng.int(below: chosen.items.count)]
    }

    /// 던전/floor 에 맞는 몬스터 랜덤 선택 후 스케일링. 웹 `createMonsterForFloor`.
    /// 호출 순서: newbie roll → power 티어 roll → 티어 내 인덱스 roll (웹과 동일).
    static func createMonsterForFloor<R: RandomSource>(
        dungeonId: DungeonId, floor: Int, isBoss: Bool = false,
        opts: ScaleOptions = ScaleOptions(), rng: inout R
    ) -> Monster {
        let pool = templates[dungeonId]!
        if isBoss {
            // Phase 16 (Track C, 피드백 28) — 던전의 3 보스를 사이클마다 순서대로 재사용.
            //   F10:0 F20:1 F30:2 F40:0 ... (rng 소비 없음 — revealBoss 미리보기 안전).
            let bossIdx = floor < 10 ? 0 : (((floor / 10) - 1) % 3 + 3) % 3
            return scaleMonster(pool.bosses[bossIdx], dungeonId: dungeonId, floor: floor, opts: opts)
        }
        let newbies = pool.normal.filter { $0.isNewbie }
        let normals = pool.normal.filter { !$0.isNewbie }
        let chosenPool: [MonsterTemplate]
        if floor <= 3 && !newbies.isEmpty {
            chosenPool = newbies
        } else if floor <= 10 && !newbies.isEmpty && rng.chance(0.4) {
            chosenPool = newbies
        } else {
            chosenPool = !normals.isEmpty ? normals : pool.normal
        }
        let template = pickTemplateByFloorWeight(chosenPool, floor: floor, rng: &rng)
        return scaleMonster(template, dungeonId: dungeonId, floor: floor, opts: opts)
    }

    /// Phase 16 (Track C, 피드백 16/33) — 보스 배율을 사이클 (0 = F1-30, 1 = F31-60, ...)
    /// 별로 테이퍼. 웹 `BOSS_HP_MULT_BY_CYCLE` / `BOSS_ATK_MULT_BY_CYCLE` 와 같은 값.
    /// 마지막 원소가 그 이후 모든 사이클에 적용되고, ngMult (NG+) 는 별도로 곱한다.
    /// 확정값 (2026-09-04, 시작 상수 그대로 목표 충족, 튜닝 없음):
    ///   HP [1.2, 1.0, 0.9, 0.85] / ATK [0.9, 0.8, 0.75, 0.7] / bossRegenPct 0.01
    ///   측정 승률 (웹, 8 던전 × 시드 1..25): F10 100% · F20 100% · F30 70% ·
    ///   F40 93% · F50 100% · F60 64%. iOS 측정치는 UpHeroSessionLoopTests 참고.
    static let bossHpMultByCycle: [Double] = [1.2, 1.0, 0.9, 0.85]
    static let bossAtkMultByCycle: [Double] = [0.9, 0.8, 0.75, 0.7]
    /// 보스 XP 배율 — 스탯이 아니라 xpReward 에만. 웹 `BOSS_XP_MULT`.
    static let bossXpMult: Double = 4

    /// 웹 `bossCycleIndex`.
    static func bossCycleIndex(_ floor: Int) -> Int {
        max(0, (floor - 1) / 30)
    }

    private static func cycleMult(_ table: [Double], floor: Int) -> Double {
        table[min(table.count - 1, bossCycleIndex(floor))]
    }

    /// Phase 16 (Track C, 피드백 33) — power 가 ATK/DEF 에 곱하는 배율. HP 는 여전히
    /// ×power (1/2/3). 웹 `POWER_ATK_DEF_MULT` 와 같은 값.
    static let powerAtkDefMult: [Int: Double] = [1: 1, 2: 1.6, 3: 2.2]

    /// floor + power 기반 stat 스케일링 (+ NG+ / affix / trait 보정). 웹 `scaleMonster`.
    /// stat 계산은 결정론 — id 만 UUID 기반 (비결정론).
    static func scaleMonster(
        _ t: MonsterTemplate, dungeonId: DungeonId, floor: Int,
        opts: ScaleOptions = ScaleOptions()
    ) -> Monster {
        // Phase 16 (Track C) — 보스 배율은 사이클 테이퍼 표에서.
        let bossHpMult: Double = t.isBoss ? cycleMult(bossHpMultByCycle, floor: floor) : 1
        let bossAtkMult: Double = t.isBoss ? cycleMult(bossAtkMultByCycle, floor: floor) : 1
        let bossXp: Double = t.isBoss ? bossXpMult : 1
        let powerAtkDef = powerAtkDefMult[t.power] ?? Double(t.power)
        let ngMult = UpHeroRules.ngPlusScaleMult(opts.ngPlusLevel)
        let base = 20 + floor * 5
        let earlyCoinBoost: Double = (!t.isBoss && floor <= 10) ? 1.3 : 1

        // Phase 14 trait stat modifiers.
        var traitHpMult = 1.0
        var traitAtkMult = 1.0
        if t.trait == .tough {
            traitHpMult = 1.5
            traitAtkMult = 0.8
        } else if t.trait == .fragile {
            traitHpMult = 0.7
            traitAtkMult = 1.4
        }
        // floor ≤ 10 너프 — 초반 페이싱 완화.
        let earlyNerf: Double = floor <= 10 ? 0.75 : 1

        let finalHp = UpHeroCombat.jsRound(
            Double(base * t.power) * bossHpMult * ngMult * opts.hpMult * traitHpMult * earlyNerf)
        // Phase 16 (Track C) — ×power → ×powerAtkDefMult[power] (1 / 1.6 / 2.2).
        let finalAtk = UpHeroCombat.jsRound(
            (5 + Double(floor) * 1.3) * powerAtkDef * bossAtkMult * ngMult
                * opts.atkMult * traitAtkMult * earlyNerf)
        let finalDef = UpHeroCombat.jsRound(
            (2 + Double(floor) * 0.5) * powerAtkDef * ngMult * earlyNerf)

        return Monster(
            // UUID — ms%1e4 충돌(같은 tick 다중 spawn) 회피, 로그 트래킹·디버깅 안정.
            id: "\(t.id)_f\(floor)_\(UUID().uuidString)",
            name: t.name,
            templateId: t.id,
            kind: t.kind,
            level: floor,
            hp: finalHp,
            maxHp: finalHp,
            atk: finalAtk,
            def: finalDef,
            xpReward: UpHeroCombat.jsRound(
                (10 + Double(floor) * 3) * Double(t.power) * bossXp * ngMult),
            coinReward: UpHeroCombat.jsRound(
                (3 + Double(floor) * 2) * Double(t.power) * (t.isBoss ? 10 : 1)
                    * ngMult * earlyCoinBoost),
            isBoss: t.isBoss,
            dungeonId: dungeonId,
            trait: t.trait)
    }
}

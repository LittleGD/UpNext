//
//  MonsterPool.swift
//  UpNext 데이터 — Up Hero 몬스터 풀 + floor 스케일링.
//
//  웹 src/data/upHeroMonsters.ts (334줄) 1:1 포팅.
//  Phase 2.4 (RPG 엔진) 오케스트레이션 데이터 레이어 산출물.
//
//  결정론: scaleMonster 의 stat 계산은 (template, floor, opts) 만으로 결정 → 검증 가능.
//   createMonsterForFloor 의 템플릿 선택은 웹이 Math.random (시드 불가) 사용 →
//   Swift 는 RandomSource 를 명시 주입 (구조 동일, 출력은 비결정론). id 는 timestamp.
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

    /// 던전/floor 에 맞는 몬스터 랜덤 선택 후 스케일링. 웹 `createMonsterForFloor`.
    /// 템플릿 선택은 비결정론 (웹 Math.random) — Swift 는 RandomSource 명시 주입.
    static func createMonsterForFloor<R: RandomSource>(
        dungeonId: DungeonId, floor: Int, isBoss: Bool = false,
        opts: ScaleOptions = ScaleOptions(), rng: inout R
    ) -> Monster {
        let pool = templates[dungeonId]!
        if isBoss {
            // 10F/20F/30F 에 각각 다른 보스.
            let bossIdx = min((floor - 1) / 10, 2)
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
        let template = chosenPool[rng.int(below: chosenPool.count)]
        return scaleMonster(template, dungeonId: dungeonId, floor: floor, opts: opts)
    }

    /// floor + power 기반 stat 스케일링 (+ NG+ / affix / trait 보정). 웹 `scaleMonster`.
    /// stat 계산은 결정론 — id 만 timestamp 기반 (비결정론).
    static func scaleMonster(
        _ t: MonsterTemplate, dungeonId: DungeonId, floor: Int,
        opts: ScaleOptions = ScaleOptions()
    ) -> Monster {
        let bossHpMult: Double = t.isBoss ? 4 : 1
        let bossAtkMult: Double = t.isBoss ? 1.7 : 1
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
        let finalAtk = UpHeroCombat.jsRound(
            (5 + Double(floor) * 1.3) * Double(t.power) * bossAtkMult * ngMult
                * opts.atkMult * traitAtkMult * earlyNerf)
        let finalDef = UpHeroCombat.jsRound(
            (2 + Double(floor) * 0.5) * Double(t.power) * ngMult * earlyNerf)

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
                (10 + Double(floor) * 3) * Double(t.power) * bossHpMult * ngMult),
            coinReward: UpHeroCombat.jsRound(
                (3 + Double(floor) * 2) * Double(t.power) * (t.isBoss ? 10 : 1)
                    * ngMult * earlyCoinBoost),
            isBoss: t.isBoss,
            dungeonId: dungeonId,
            trait: t.trait)
    }
}

//
//  UpHeroCombat.swift
//  UpNext 로직 — Up Hero 전투 공식 + 핵심 메커닉.
//
//  웹 src/lib/upHeroCombat.ts (2,006줄) 의 "전투 공식" 부분 포팅.
//  Phase 2.4 (RPG 엔진) 의 "전투" 단계 — 검증 가능한 결정론 함수 우선.
//
//  포팅 범위 (이번 단계):
//   - 데미지 공식 (computeHeroDamage / computeEnemyDamage)
//   - outcome 판정 (rollHeroOutcome / rollEnemyOutcome — miss/dodge/crit/hit)
//   - 버프 적용 (applyStatAndHealBuffs / applyClassStartEffects / getBuffBoost)
//   - 로그 분석 (computeMonsterHp / findLastEncounterIndex)
//   - 선택지 (pickWeighted / amplifyChoiceOptions / summarizeEffects)
//   - 클래스 배율 + mystery floor 생성 + 상수
//
//  유보 (다음 단계 — 데이터 파일·스킬 포팅 후):
//   - 세션 오케스트레이션 (createSession / tickSession / resolveChoice /
//     executeCombatRound / applyChoiceEffect ...) — upHeroMonsters/Equipment/
//     Dungeons/Flavor/classSkills/talismanSkills 의존.
//
//  RNG: 웹은 모듈 전역 `rng()` (setRngSeed 로 결정론 전환). Swift 는 RandomSource
//   를 명시적으로 inout 으로 주입 — 같은 seed 의 Mulberry32 면 웹과 동일 수열.
//
//  Math.round → jsRound: 전투 공식은 음수 가능 도메인이라 JS Math.round
//   (= floor(x + 0.5)) 를 정확히 재현하는 jsRound 사용.
//

import Foundation

enum UpHeroCombat {

    // MARK: - 상수

    /// 탐험 시간 기본값. 웹 `BASE_EXPEDITION_TIME`.
    static let baseExpeditionTime = 220

    /// 단계별 시간 소모. 웹 `TIME_COST`.
    enum TimeCost {
        static let narrative = 1
        static let encounter = 2
        static let treasure = 1
        static let floor = 3
        static let combatRound = 1
        static let boss = 0          // 보스전은 시간 소모 없음 — 정면 승부
        static let choice = 1
    }

    /// mystery "?" 시스템 cycle 당 floor 수. 웹 `CYCLE_SIZE`.
    static let cycleSize = 30

    /// Phase 16 (Track C, 피드백 28) — 보스 케이던스: 10층마다 영원히. 웹 `isBossFloor`.
    /// F30 (cycleSize) 만 "최종 보스" 로 런을 끝내고, F40+ 보스는 드롭 후 계속.
    static func isBossFloor(_ floor: Int) -> Bool {
        floor > 0 && floor % 10 == 0
    }

    /// 현재 층 *이후* 첫 보스층. F9 → 10, F10 → 20, F35 → 40. 웹 `nextBossFloorAfter`.
    static func nextBossFloorAfter(_ floor: Int) -> Int {
        (floor / 10) * 10 + 10
    }

    /// Phase 16 (Track C) — 몬스터 regen trait 상수. 웹 upHeroCombat.ts 동명 const.
    /// 보스만 1% 인 이유: 보스 HP 는 일반몹보다 훨씬 커서 같은 5% 면 절대량이
    /// 영웅 DPS 를 넘어 수학적으로 무적이었다 (F20 보스 1440 HP × 5% = 72/라운드).
    static let monsterRegenPct = 0.05
    static let bossRegenPct = 0.01
    /// 현재 HP 가 최대치의 30% 미만이면 어떤 regen 몬스터도 회복하지 않는다.
    /// executeCombatRound 가 push 자체를 게이트한다 (log 에 없으면 HP 계산·UI 모두 일치).
    static let regenStopBelowHpRatio = 0.3

    /// in-memory log trim 상한. 웹 `SESSION_LOG_RUNTIME_CAP`.
    static let sessionLogRuntimeCap = 600

    /// Phase 4-D (Track D, 피드백 15/35) — 런 한정 빌드 상수. 웹 upHeroCombat.ts 의
    /// RUN_* / CHOICE_* const 와 같은 값.
    ///
    /// 런 보정은 `CombatSession.runStatMods` 에 건별로 쌓이고 `sessionStats()` 가
    /// 스탯별로 pct 를 **합산** (같은 stat + all) 한 뒤 [-50, +100] 으로 clamp 해 한 번만
    /// 곱한다. 곱으로 쌓으면 같은 버프 세 번이 +33% 가 아니라 +52% 가 되어 밸런스가
    /// 무너진다. 건수 상한 8 은 UI 스트립이 읽을 수 있는 한계이자 "오래된 버프가
    /// 밀려난다" 는 규칙. 보스 피해 +5%/reveal (상한 15) 은 revealBoss 를 "정보 + 준비"
    /// 로 만든다. 은신 3 / 장비 확정 2 상한은 한 런에서 쌓아두는 이득이 층 보상 몇 개분을
    /// 넘지 않게 한다.
    enum RunMods {
        static let statPctMin = -50
        static let statPctMax = 100
        static let statModsCap = 8
        static let bossDmgPerReveal = 5
        static let bossDmgCap = 15
        static let stealthCap = 3
        static let guaranteedDropCap = 2
        /// 데이터의 코인 50 / XP 15 가 "그 층 한 층어치" 에 정확히 대응하는 기준값.
        static let rewardRefCoins = 50
        static let rewardRefXp = 15
        /// Lv1 maxHp. 피해/회복 데이터는 이 값 기준으로 쓰여 있다.
        static let riskRefHp = 100
    }

    /// Phase 4-D — 층 f 의 "한 층어치" 보상 (power 2 일반 몬스터 1마리 처치 보상,
    /// `scaleMonster` 의 xp/coin 식에서 power=2, 보스 아님). f 는 1..120 clamp, NG+ 배율
    /// 반영. 웹 `floorRewardScale` (jsRound).
    static func floorRewardScale(floor: Int, ngPlusLevel: Int = 0) -> (coins: Int, xp: Int) {
        let f = max(1, min(120, floor))
        let ngMult = UpHeroRules.ngPlusScaleMult(ngPlusLevel)
        let coins = jsRound(Double(3 + 2 * f) * 2 * (f <= 10 ? 1.3 : 1) * ngMult)
        let xp = jsRound(Double(10 + 3 * f) * 2 * ngMult)
        return (coins, xp)
    }

    /// Phase 4-D — 선택 보상 배율. 1 미만으로는 내려가지 않는다 (데이터가 하한). 웹 `choiceRewardMult`.
    static func choiceRewardMult(floor: Int, ngPlusLevel: Int = 0) -> (coin: Double, xp: Double) {
        let scale = floorRewardScale(floor: floor, ngPlusLevel: ngPlusLevel)
        return (max(1, Double(scale.coins) / Double(RunMods.rewardRefCoins)),
                max(1, Double(scale.xp) / Double(RunMods.rewardRefXp)))
    }

    /// Phase 4-D (피드백 35) — 선택 효과를 현재 층·영웅 기준으로 스케일한다. flavor 데이터의
    /// 숫자는 "F1-F10 기준선" 으로 남기고 적용 직전에 층 보상을 따라가게 한다. 코인/XP 는
    /// `choiceRewardMult`, 피해/회복은 maxHp/100. 그 밖의 kind 는 그대로. startMinigame
    /// 안쪽 배열은 여기서 건드리지 않고 resolveMinigame 이 적용 시점에 같은 식으로 스케일한다.
    /// summarize 보다 먼저 불러야 칩이 실제 수치를 보여준다. 웹 `scaleChoiceEffectsForFloor`.
    static func scaleChoiceEffectsForFloor(
        _ effects: [ChoiceEffect], floor: Int, heroMaxHp: Int, ngPlusLevel: Int = 0
    ) -> [ChoiceEffect] {
        let mult = choiceRewardMult(floor: floor, ngPlusLevel: ngPlusLevel)
        let riskMult = max(1, Double(heroMaxHp) / Double(RunMods.riskRefHp))
        return effects.map { e in
            switch e {
            case let .reward(coins, xp, dropId):
                // 웹 `if (e.coins)` — 0 은 falsy 라 그대로 남는다.
                let c = coins.map { $0 == 0 ? 0 : jsRound(Double($0) * mult.coin) }
                let x = xp.map { $0 == 0 ? 0 : jsRound(Double($0) * mult.xp) }
                return .reward(coins: c, xp: x, dropEquipmentId: dropId)
            case let .damage(amount):
                return .damage(amount: jsRound(Double(amount) * riskMult))
            case let .heal(amount):
                return .heal(amount: jsRound(Double(amount) * riskMult))
            default:
                return e
            }
        }
    }

    /// SimpleChoiceEffect 오버로드 (resolveMinigame). 같은 식.
    static func scaleChoiceEffectsForFloor(
        _ effects: [SimpleChoiceEffect], floor: Int, heroMaxHp: Int, ngPlusLevel: Int = 0
    ) -> [SimpleChoiceEffect] {
        let mult = choiceRewardMult(floor: floor, ngPlusLevel: ngPlusLevel)
        let riskMult = max(1, Double(heroMaxHp) / Double(RunMods.riskRefHp))
        return effects.map { e in
            switch e {
            case let .reward(coins, xp, dropId):
                let c = coins.map { $0 == 0 ? 0 : jsRound(Double($0) * mult.coin) }
                let x = xp.map { $0 == 0 ? 0 : jsRound(Double($0) * mult.xp) }
                return .reward(coins: c, xp: x, dropEquipmentId: dropId)
            case let .damage(amount):
                return .damage(amount: jsRound(Double(amount) * riskMult))
            case let .heal(amount):
                return .heal(amount: jsRound(Double(amount) * riskMult))
            default:
                return e
            }
        }
    }

    /// Phase 4-D — 한 스탯에 걸린 런 보정 합 (같은 stat + all), [-50, +100] clamp. 웹 `runStatPct`.
    static func runStatPct(_ mods: [RunStatMod]?, _ stat: RunModStat) -> Int {
        var sum = 0
        for m in mods ?? [] where m.stat == stat || m.stat == .all {
            sum += m.pct
        }
        return max(RunMods.statPctMin, min(RunMods.statPctMax, sum))
    }

    /// **전투에 쓰이는 영웅 스탯의 단일 출처** 의 순수 본체. 웹 `sessionStats`.
    ///
    /// `computeEffectiveStats` (base + 장비) 위에 세션 한정 `combatBuff` 를 곱하고, 그 **뒤에**
    /// 런 한정 보정을 스탯별 합산 pct 로 한 번 더 곱한다 (2단 반올림: combatBuff 반올림 →
    /// 런 보정 반올림. 웹 Math.round 순서를 jsRound 로 재현해야 1 차이가 안 난다).
    /// crit / slotBonus 는 곱하지 않는다. `UpHeroSession.sessionStats` 가 세션 필드를 넘긴다;
    /// 동치 검증 (scripts/equiv/uphero-combat.swift) 은 이 함수를 직접 부른다.
    static func sessionStats(
        hero: Hero, combatBuff: CombatBuff?, runStatMods: [RunStatMod]?
    ) -> HeroBaseStats {
        let base = UpHeroRules.computeEffectiveStats(hero)
        var out = base
        if let buff = combatBuff, buff.battlesLeft > 0, buff.pct > 0 {
            // 세션 층위의 pct 는 퍼센트 포인트다 (10 = +10%). CombatBuff 주석 참고.
            let m = 1 + buff.pct / 100
            out.str = jsRound(Double(base.str) * m)
            out.int = jsRound(Double(base.int) * m)
            out.vit = jsRound(Double(base.vit) * m)
            out.dex = jsRound(Double(base.dex) * m)
            out.agi = jsRound(Double(base.agi) * m)
        }
        guard let mods = runStatMods, !mods.isEmpty else { return out }
        func apply(_ v: Int, _ stat: RunModStat) -> Int {
            let pct = runStatPct(mods, stat)
            return pct == 0 ? v : jsRound(Double(v) * (1 + Double(pct) / 100))
        }
        out.str = apply(out.str, .str)
        out.int = apply(out.int, .int)
        out.vit = apply(out.vit, .vit)
        out.dex = apply(out.dex, .dex)
        out.agi = apply(out.agi, .agi)
        return out
    }

    /// 런 보정 스탯의 한국어 이름 (엔진 fallback 문자열 전용, UI 는 카탈로그 라벨). 웹 `RUN_STAT_KO`.
    static let runStatKo: [RunModStat: String] = [
        .str: "힘", .int: "지성", .vit: "체력", .dex: "손재주", .agi: "민첩", .all: "전 능력치",
    ]

    // 클래스 패시브 상수 — 웹 upHeroCombat.ts 동명 const.
    static let warriorRegenPerRound = 2     // HP +2/round
    static let mageXpMult = 1.2             // XP +20%
    static let monkDodgeBonus = 0.1         // 회피 +10%
    static let druidHealMult = 1.3          // 회복 +30%
    static let bardCoinMult = 1.25          // 코인 +25%
    static let chronomancerTimeMult = 0.75  // 시간 소모 -25%
    static let priestStartHpMult = 1.2      // 세션 시작 maxHp ×1.2
    static let illusionistCritBonus = 8     // crit +8%p (stats.crit)

    // MARK: - JS 호환 반올림

    /// JS `Math.round` 정확 재현 — `floor(x + 0.5)` (음수 .5 포함 모든 도메인 일치).
    /// Swift `.rounded()` 는 음수 .5 에서 away-from-zero 라 JS 와 불일치 → 전용 헬퍼.
    static func jsRound(_ x: Double) -> Int {
        Int((x + 0.5).rounded(.down))
    }

    // MARK: - 클래스 배율

    /// XP 보상 배율 (mage +20%). 웹 `classXpMult`.
    static func classXpMult(_ cls: ClassType?) -> Double {
        cls == .mage ? mageXpMult : 1.0
    }

    /// coin 보상 배율 (bard +25%). 웹 `classCoinMult`.
    static func classCoinMult(_ cls: ClassType?) -> Double {
        cls == .bard ? bardCoinMult : 1.0
    }

    /// heal 효과 배율 (druid +30%). 웹 `classHealMult`.
    static func classHealMult(_ cls: ClassType?) -> Double {
        cls == .druid ? druidHealMult : 1.0
    }

    /// 시간 소모 배율 (chronomancer 0.75). 웹 `classTimeMult`.
    static func classTimeMult(_ cls: ClassType?) -> Double {
        cls == .chronomancer ? chronomancerTimeMult : 1.0
    }

    /// dodge 가산량 (monk +0.1). 웹 `classDodgeBonus`.
    static func classDodgeBonus(_ cls: ClassType?) -> Double {
        cls == .monk ? monkDodgeBonus : 0.0
    }

    /// round 당 HP regen (warrior +2). 웹 `classHpRegen`.
    static func classHpRegen(_ cls: ClassType?) -> Int {
        cls == .warrior ? warriorRegenPerRound : 0
    }

    // MARK: - 버프 적용

    /// Buff 의 stat / healStart / critBonus 효과를 hero 스냅샷에 반영. 웹 `applyStatAndHealBuffs`.
    ///  - stat: baseStats 합산 (affinity 던전이면 multiplier 배)
    ///  - healStart: maxHp + hp 증가
    ///  - critBonus: baseStats.crit 합산
    static func applyStatAndHealBuffs(
        hero: Hero, buffs: [CardBuff], dungeonId: DungeonId
    ) -> Hero {
        var newBaseStats = hero.baseStats
        var totalHealStart = 0.0

        for buff in buffs {
            // 첫 affinity 효과 — 던전 카테고리 일치 시 mult 적용 (웹 .find 동작).
            var mult = 1.0
            for effect in buff.effects {
                if case let .affinity(category, multiplier) = effect {
                    if category == dungeonId { mult = multiplier }
                    break
                }
            }
            for effect in buff.effects {
                switch effect {
                case let .stat(stats):
                    for (key, value) in stats {
                        newBaseStats[key] += jsRound(Double(value) * mult)
                    }
                case let .special(type, value):
                    if type == .healStart { totalHealStart += value }
                    if type == .critBonus { newBaseStats.crit += Int(value) }
                case .affinity:
                    break
                }
            }
        }

        var result = hero
        result.baseStats = newBaseStats
        // healStart 값은 카드 데이터상 정수 — Int 변환 정확.
        result.maxHp = hero.maxHp + Int(totalHealStart)
        result.hp = result.maxHp   // 세션 시작 시 풀피 + healStart 보너스
        return result
    }

    /// 세션 시작 시점 class 패시브 적용. 웹 `applyClassStartEffects`.
    ///  - priest: maxHp ×1.2 (hp 풀피)
    ///  - illusionist: baseStats.crit +8
    static func applyClassStartEffects(_ hero: Hero) -> Hero {
        guard let cls = hero.classType else { return hero }
        var newHero = hero
        if cls == .priest {
            newHero.maxHp = jsRound(Double(newHero.maxHp) * priestStartHpMult)
            newHero.hp = newHero.maxHp
        }
        if cls == .illusionist {
            newHero.baseStats.crit += illusionistCritBonus
        }
        return newHero
    }

    /// activeBuffs 에서 특정 special effect 값 합산. 웹 `getBuffBoost`.
    /// 반환 0 = 없음, 음수 가능 (monsterFrequency 감소).
    static func getBuffBoost(buffs: [CardBuff]?, type: SpecialEffect) -> Double {
        guard let buffs else { return 0 }
        var total = 0.0
        for buff in buffs {
            for effect in buff.effects {
                if case let .special(t, v) = effect, t == type { total += v }
            }
        }
        return total
    }

    // MARK: - 초보자 버프 / narrative

    /// 초보자 버프 적용 대상 판정 — Lv<5 AND floor≤10. 웹 `isNewbieBuffActive`.
    static func isNewbieBuffActive(heroLevel: Int, floorLevel: Int) -> Bool {
        heroLevel < 5 && floorLevel <= 10
    }

    /// narrative 생성 확률 — hit 33%, 그 외 100%. 웹 `shouldNarrate`.
    static func shouldNarrate(_ outcome: CombatOutcome) -> Double {
        outcome == .hit ? 0.33 : 1.0
    }

    // MARK: - outcome 판정 (miss → dodge → crit → hit 순 독립 롤)

    /// 영웅 공격의 outcome 판정. 웹 `rollHeroOutcome`.
    /// heroLevel nil → 99 (레거시 — 초보자 버프 비활성).
    static func rollHeroOutcome<R: RandomSource>(
        stats: HeroBaseStats, monster: Monster, heroLevel: Int? = nil, rng: inout R
    ) -> CombatOutcome {
        let hl = heroLevel ?? 99
        let newbie = isNewbieBuffActive(heroLevel: hl, floorLevel: monster.level)
        // swift trait — hero miss +8%.
        let swiftMissBonus = monster.trait == .swift ? 0.08 : 0.0
        let missChance = (newbie
            ? max(0.01, 0.02 - Double(stats.dex) * 0.0005)
            : max(0.02, 0.05 - Double(stats.dex) * 0.0005)) + swiftMissBonus
        if rng.chance(missChance) { return .miss }
        // 몬스터 회피 — newbie 면 cap 절반.
        let dodgeCap = newbie ? 0.1 : 0.2
        let dodgeChance = min(dodgeCap, Double(monster.level) * 0.005)
        if rng.chance(dodgeChance) { return .dodge }
        // 영웅 crit — dex scaling + 장비 crit.
        let critBase = newbie ? 0.13 : 0.05
        let critChance = min(0.5, critBase + Double(stats.dex) * 0.003 + Double(stats.crit) * 0.01)
        if rng.chance(critChance) { return .crit }
        return .hit
    }

    /// 몬스터 공격의 outcome 판정. 웹 `rollEnemyOutcome`.
    static func rollEnemyOutcome<R: RandomSource>(
        monster: Monster, stats: HeroBaseStats,
        dodgeBonus: Double = 0, enemyMissBonus: Double = 0,
        monsterCritBonus: Double = 0, heroLevel: Int? = nil, rng: inout R
    ) -> CombatOutcome {
        let hl = heroLevel ?? 99
        let newbie = isNewbieBuffActive(heroLevel: hl, floorLevel: monster.level)
        // 몬스터 실수 — 초반 floor 에서 허당 (base 10%, floor 100 에서 5% 바닥).
        // Phase 16 (Track C, 피드백 33) — 바닥 2% → 5%, 기울기 0.001 → 0.0005.
        //   이전엔 F60 에서 이미 바닥이라 후반 사이클의 적이 거의 빗나가지 않았다.
        let newbieMissBonus = newbie ? 0.05 : 0.0
        let missChance = max(0.05, 0.1 - Double(monster.level) * 0.0005)
            + enemyMissBonus + newbieMissBonus
        if rng.chance(missChance) { return .miss }
        // 영웅 회피 — agi scaling + class/talisman bonus.
        let newbieDodgeBonus = newbie ? 0.06 : 0.0
        let dodgeChance = min(0.5, Double(stats.agi) * 0.006 + dodgeBonus + newbieDodgeBonus)
        if rng.chance(dodgeChance) { return .dodge }
        // 몬스터 crit — level scaling + affix/trait bonus.
        let newbieCritPenalty = newbie ? -0.04 : 0.0
        let burstBonus = monster.trait == .burst ? 0.12 : 0.0
        let critChance = min(0.5, max(0,
            0.03 + Double(monster.level) * 0.004 + monsterCritBonus
                + newbieCritPenalty + burstBonus))
        if rng.chance(critChance) { return .crit }
        return .hit
    }

    // MARK: - 데미지 공식

    /// 영웅 데미지 — DR 기반, crit ×1.8. 웹 `computeHeroDamage`.
    ///   defDR = min(0.6, def/(def+50))
    ///   rawDmg = str + random[0..6] - 3
    ///   base = max(1, round(rawDmg × (1-defDR)))
    static func computeHeroDamage<R: RandomSource>(
        stats: HeroBaseStats, monster: Monster, crit: Bool, rng: inout R
    ) -> Int {
        let def = max(0, monster.def)
        let defDR = min(0.6, Double(def) / Double(def + 50))
        let rawDmg = stats.str + rng.int(below: 7) - 3
        let base = max(1, jsRound(Double(rawDmg) * (1 - defDR)))
        return crit ? Int((Double(base) * 1.8).rounded(.down)) : base
    }

    /// 몬스터 데미지 — DR + flat vit 감산, crit ×1.4 (보스 ×1.25). 웹 `computeEnemyDamage`.
    ///   dr = min(0.75, vit/(vit+25))
    ///   rawDmg = atk + random[0..4] - 2
    ///   finalDmg = max(1, round(rawDmg × (1-dr)) - floor(vit/4))
    static func computeEnemyDamage<R: RandomSource>(
        monster: Monster, stats: HeroBaseStats, crit: Bool, rng: inout R
    ) -> Int {
        let vit = max(0, stats.vit)
        let dr = min(0.75, Double(vit) / Double(vit + 25))
        let rawDmg = monster.atk + rng.int(below: 5) - 2
        let base = max(1, jsRound(Double(rawDmg) * (1 - dr)) - vit / 4)
        let finalDmg = max(1, base)
        if !crit { return finalDmg }
        let critMult = (monster.isBoss == true) ? 1.25 : 1.4
        return Int((Double(finalDmg) * critMult).rounded(.down))
    }

    // MARK: - 로그 분석

    /// 마지막 활성 encounter 의 log index. victory/sessionEnd 만나면 -1. 웹 `findLastEncounterIndex`.
    static func findLastEncounterIndex(_ log: [LogEntry]) -> Int {
        var i = log.count - 1
        while i >= 0 {
            switch log[i] {
            case .encounter: return i
            case .victory, .sessionEnd: return -1
            default: break
            }
            i -= 1
        }
        return -1
    }

    /// encounter 이후 combat 로그를 누적해 monster HP 를 derive. 웹 `computeMonsterHp`.
    static func computeMonsterHp(log: [LogEntry], encounterIdx: Int, monster: Monster) -> Int {
        var monsterHp = monster.hp
        let cap = monster.maxHp ?? monster.hp
        var i = encounterIdx + 1
        while i < log.count {
            switch log[i] {
            case let .combat(attacker, damage, _, _, _, _, _):
                if damage != 0 && attacker == .hero { monsterHp -= damage }
            case let .monsterEffect(effect, amount, _, _, _, _):
                if effect == .regen { monsterHp = min(cap, monsterHp + amount) }
            default:
                break
            }
            i += 1
        }
        return max(0, monsterHp)
    }

    // MARK: - 선택지

    /// weight 기반 랜덤 outcome pick. 웹 `pickWeighted` (호출부가 비어있지 않음을 보장).
    static func pickWeighted<R: RandomSource>(
        _ outcomes: [ChoiceOutcome], rng: inout R
    ) -> ChoiceOutcome {
        let total = outcomes.reduce(0) { $0 + max(0, $1.weight) }
        if total <= 0 { return outcomes[0] }
        var roll = rng.unit() * Double(total)
        for o in outcomes {
            roll -= Double(max(0, o.weight))
            if roll <= 0 { return o }
        }
        return outcomes[outcomes.count - 1]
    }

    /// choice effects 구조 요약. 웹 `summarizeEffectsData`.
    static func summarizeEffectsData(_ effects: [ChoiceEffect]) -> EffectSummaryData {
        var coins = 0, xp = 0, damage = 0, heal = 0, timeDelta = 0
        // Phase 4-D — 런 한정 효과 누적.
        var skip = 0, stealth = 0, guaranteed = 0, bossPct = 0
        var runMods: [RunStatMod] = []
        for e in effects {
            switch e {
            case let .reward(c, x, _):
                if let c { coins += c }
                if let x { xp += x }
            case let .damage(amount):
                damage += amount
            case let .heal(amount):
                heal += amount
            case let .time(delta):
                timeDelta += delta
            case let .skipFloors(count):
                skip += count
            case let .runBuff(stat, pct, floors):
                runMods.append(RunStatMod(stat: stat, pct: pct, floorsLeft: floors))
            case let .runCurse(stat, pct, floors):
                runMods.append(RunStatMod(stat: stat, pct: -pct, floorsLeft: floors))
            case let .stealth(encounters):
                stealth += encounters
            case let .guaranteedDrop(count):
                guaranteed += count ?? 1
            case .revealBoss:
                bossPct += RunMods.bossDmgPerReveal
            default:
                break
            }
        }
        var out = EffectSummaryData()
        if xp > 0 { out.xp = xp }
        if coins > 0 { out.coins = coins }
        if heal > 0 { out.heal = heal }
        if damage > 0 { out.damage = damage }
        if timeDelta != 0 { out.timeDelta = timeDelta }
        if skip > 0 { out.skipFloors = skip }
        if !runMods.isEmpty { out.runMods = runMods }
        if stealth > 0 { out.stealth = stealth }
        if guaranteed > 0 { out.guaranteedDrop = guaranteed }
        if bossPct > 0 { out.bossDmgPct = bossPct }
        return out
    }

    /// choice effects 한 줄 한국어 요약. 웹 `summarizeEffects`.
    static func summarizeEffects(_ effects: [ChoiceEffect]) -> String {
        let data = summarizeEffectsData(effects)
        var parts: [String] = []
        if let xp = data.xp { parts.append("경험치 +\(xp)") }
        if let coins = data.coins { parts.append("코인 +\(coins)") }
        if let heal = data.heal { parts.append("체력 +\(heal)") }
        if let damage = data.damage { parts.append("체력 −\(damage)") }
        if let td = data.timeDelta {
            if td > 0 { parts.append("시간 +\(td)") }
            else if td < 0 { parts.append("시간 \(td)") }
        }
        // Phase 4-D — 런 한정 효과 (ko legacy 문자열. UI 는 ChoiceResultTypes.chips 를 쓴다).
        if let sk = data.skipFloors { parts.append("\(sk)층 건너뜀") }
        for m in data.runMods ?? [] {
            let label = runStatKo[m.stat] ?? m.stat.rawValue
            parts.append("\(label) \(m.pct > 0 ? "+" : "-")\(abs(m.pct))%")
        }
        if let st = data.stealth { parts.append("은신 \(st)") }
        if data.guaranteedDrop != nil { parts.append("장비 확정") }
        if let bp = data.bossDmgPct { parts.append("보스 피해 +\(bp)%") }
        return parts.joined(separator: " · ")
    }

    /// mystery event 발동 시 ChoiceOption 수치 효과 증폭. 웹 `amplifyChoiceOptions`.
    static func amplifyChoiceOptions(_ options: [ChoiceOption], factor: Double) -> [ChoiceOption] {
        func amplify(_ eff: ChoiceEffect) -> ChoiceEffect {
            switch eff {
            case let .reward(coins, xp, dropId):
                return .reward(
                    coins: coins.map { jsRound(Double($0) * factor) },
                    xp: xp.map { jsRound(Double($0) * factor) },
                    dropEquipmentId: dropId)
            case let .damage(amount):
                return .damage(amount: jsRound(Double(amount) * factor))
            case let .heal(amount):
                return .heal(amount: jsRound(Double(amount) * factor))
            case let .time(delta):
                return .time(delta: jsRound(Double(delta) * factor))
            default:
                return eff
            }
        }
        return options.map { opt in
            var o = opt
            o.effect = opt.effect.map(amplify)
            o.outcomes = opt.outcomes.map { outs in
                outs.map { out in
                    var oo = out
                    oo.effects = out.effects.map(amplify)
                    return oo
                }
            }
            return o
        }
    }

    // MARK: - mystery floor / 기타

    /// 특정 cycle 의 mystery "?" floor 생성. 웹 `generateMysteryFloors`.
    /// cycle 0 → 2 floors (첫 gap skip), cycle 1+ → 3 floors.
    static func generateMysteryFloors<R: RandomSource>(
        cycleIndex: Int, rng: inout R
    ) -> [Int] {
        let cycleStart = cycleIndex * cycleSize + 1
        let gaps: [(Int, Int)] = [
            (cycleStart, cycleStart + 8),       // F1-F9
            (cycleStart + 10, cycleStart + 18), // F11-F19
            (cycleStart + 20, cycleStart + 28), // F21-F29
        ]
        var out: [Int] = []
        for (gapIdx, gap) in gaps.enumerated() {
            // cycle 0 의 첫 gap 은 "첫 보스 이전" 이라 skip.
            if cycleIndex == 0 && gapIdx == 0 { continue }
            let floor = gap.0 + rng.int(below: gap.1 - gap.0 + 1)
            out.append(floor)
        }
        return out
    }

    /// 드롭 리스트 중복 제거 (id 기준, 첫 등장 유지). 웹 `dedupeDrops`.
    static func dedupeDrops(_ drops: [Equipment]) -> [Equipment] {
        var seen = Set<String>()
        var out: [Equipment] = []
        for d in drops {
            if seen.contains(d.id) { continue }
            seen.insert(d.id)
            out.append(d)
        }
        return out
    }
}

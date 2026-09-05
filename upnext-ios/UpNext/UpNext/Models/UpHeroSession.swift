//
//  UpHeroSession.swift
//  UpNext 로직 — Up Hero 던전 세션 오케스트레이션.
//
//  웹 src/lib/upHeroCombat.ts 의 세션 진행 부분 (createSession / tickSession /
//  resolveChoice / executeCombatRound / applyChoiceEffect / resolveMinigame 등) 포팅.
//  Phase 2.4 (RPG 엔진) 최종 파일 — 검증된 공식·스킬·데이터 레이어를 엮는 글루.
//
//  RNG: 웹은 모듈 전역 rng() (시드 가능) + Math.random (시드 불가) 혼용.
//   Swift 는 단일 RandomSource 를 명시 주입 — 프로덕션 SystemRandom, 테스트는
//   Mulberry32 로 결정론. 웹보다 일관적이며 스모크 테스트가 가능.
//  flavor 데이터는 FlavorPool.FlavorData 인자로 전달 (순수).
//  값 의미론: 웹의 immutable copy-and-return 을 Swift struct value-semantics 로 대체.
//

import Foundation

/// createSession 옵션. 웹 `CreateSessionOptions`.
struct CreateSessionOptions {
    var ngPlusLevel: Int?
    var isWeeklyVariant: Bool?
    var weeklyAffixId: String?
    var heroLevel: Int?
    /// `UpHeroState.combatBuff` 스냅샷. 탐험 밖(굴림틀 보상이 남은 채 탐험이 끝난
    /// 경우 등)에서 넘어온 버프를 세션 안으로 들여온다.
    ///
    /// 세션 안에서는 `session.combatBuff` 가 유일한 진실이고 전투 종료마다 거기서
    /// 닳는다. 탐험이 끝나면 스토어가 잔여분을 다시 상태로 적어 이어받는다.
    var combatBuff: CombatBuff?
}

enum UpHeroSession {

    /// 현재 시각 ms (웹 Date.now()).
    private static func now() -> Int { Int(Date().timeIntervalSince1970 * 1000) }

    // MARK: - 세션 헬퍼

    /// talismanMods 안전 추출. 웹 `sessionMods`.
    private static func sessionMods(_ s: CombatSession) -> TalismanModifiers {
        s.talismanMods ?? TalismanModifiers.empty
    }

    /// **전투에 쓰이는 영웅 스탯의 단일 출처.** 웹 `sessionStats`.
    ///
    /// `computeEffectiveStats` (base + 장비) 위에 세션 한정 `combatBuff` 를 곱한다.
    /// 이 곱셈은 여기 한 곳에서만 일어난다 — 두 곳에서 곱하면 이중 적용이라
    /// "+10% 버프가 +21% 로 먹는" 버그가 된다. 전투 계산에 스탯이 필요하면 무조건
    /// 이 함수를 거칠 것. `computeEffectiveStats` 직접 호출은 표시용(인벤토리 등)에만.
    ///
    /// crit / slotBonus 는 곱하지 않는다. crit 은 퍼센트 포인트라 곱하면 의미가
    /// 달라지고, slotBonus 는 스탯이 아니라 장비 슬롯 수 카운터다.
    static func sessionStats(_ s: CombatSession) -> HeroBaseStats {
        // Phase 4-D (Track D) — combatBuff 뒤에 런 한정 보정을 한 번 더 곱하는 순수 본체는
        //   UpHeroCombat.sessionStats (동치 검증이 세션 없이 부른다).
        UpHeroCombat.sessionStats(hero: s.hero, combatBuff: s.combatBuff, runStatMods: s.runStatMods)
    }

    /// Phase 4-D — 한 스탯에 걸린 런 보정 합 (같은 stat + all), [-50, +100] clamp. 웹 `runStatPct`.
    static func runStatPct(_ s: CombatSession, _ stat: RunModStat) -> Int {
        UpHeroCombat.runStatPct(s.runStatMods, stat)
    }

    /// Phase 4-D — 층을 `floors` 만큼 지났다. floorsLeft 가 있는 보정을 줄이고 0 이하는
    /// 버린다. 비면 필드째 지운다. 층 진입(tickSession) 과 skipFloors 의 실제 이동 수
    /// (Track C 클램프 뒤) 두 곳에서만 부른다. 웹 `advanceRunModFloors`.
    static func advanceRunModFloors(_ s: inout CombatSession, _ floors: Int) {
        guard let mods = s.runStatMods, !mods.isEmpty, floors > 0 else { return }
        let next = mods
            .map { m -> RunStatMod in
                guard let left = m.floorsLeft else { return m }
                return RunStatMod(stat: m.stat, pct: m.pct, floorsLeft: left - floors)
            }
            .filter { $0.floorsLeft == nil || $0.floorsLeft! > 0 }
        s.runStatMods = next.isEmpty ? nil : next
    }

    /// 전투 1회가 끝났을 때 (몬스터 처치) 버프 잔여 횟수 차감. 0 이면 필드째 제거해
    /// `sessionStats` 가 곧장 base 로 떨어지게 한다. 웹 `consumeCombatBuff`.
    static func consumeCombatBuff(_ s: inout CombatSession) {
        guard let buff = s.combatBuff else { return }
        let left = buff.battlesLeft - 1
        s.combatBuff = left <= 0 ? nil : CombatBuff(pct: buff.pct, battlesLeft: left)
    }

    /// Phase 2-A (Track A) — 세션의 XP 배율 한 곳. 카드 버프 xpBoost × 클래스(mage +20%)
    /// × 주간 affix(`s.xpMult`). 처치 XP(보스 보너스 포함)와 층 진입 XP 가 **같은** 배율을
    /// 탄다 — 한쪽만 곱하면 "XP +20%" 카피가 거짓이 된다. 웹 `sessionXpMult`.
    static func sessionXpMult(_ s: CombatSession) -> Double {
        (1 + UpHeroCombat.getBuffBoost(buffs: s.activeBuffs, type: .xpBoost) / 100)
            * UpHeroCombat.classXpMult(s.hero.classType) * (s.xpMult ?? 1)
    }

    /// 클래스 자원 획득. 웹 `gainClassResource`.
    static func gainClassResource(_ s: inout CombatSession, event: ResourceEvent) {
        guard let cls = s.hero.classType,
              let spec = UpHeroRules.classResource[cls],
              let amount = spec.gain[event], amount != 0 else { return }
        s.classResource = min(UpHeroRules.classResourceMax, (s.classResource ?? 0) + amount)
    }

    /// 세션 종료 — sessionEnd 로그 + status=completed. 웹 `endSession`.
    private static func endSession(
        _ s: inout CombatSession, reason: SessionEndReason, detail: String? = nil,
        detailKey: String? = nil, monsterTemplateId: String? = nil, monsterName: String? = nil
    ) {
        s.log.append(.sessionEnd(
            reason: reason, detail: detail, detailKey: detailKey,
            detailMonsterTemplateId: monsterTemplateId, detailMonsterFallback: monsterName,
            detailFloor: nil, timestamp: now()))
        s.status = .completed
    }

    /// 시간 소모 (음수=소모, 양수=회복). 0 이하 → 세션 종료. 반환 true=종료됨. 웹 `consumeTime`.
    private static func consumeTime(_ s: inout CombatSession, delta: Int) -> Bool {
        var effectiveDelta = delta
        if delta < 0 {
            let mods = sessionMods(s)
            effectiveDelta = UpHeroCombat.jsRound(
                Double(delta) * UpHeroCombat.classTimeMult(s.hero.classType) * mods.timeCostMult)
            if delta < 0 && effectiveDelta == 0 { effectiveDelta = -1 }
        }
        s.time = max(0, min(s.maxTime, s.time + effectiveDelta))
        if s.time <= 0 && s.status == .active {
            endSession(&s, reason: .timeExpired, detail: "탐험 시간이 소진됐다",
                       detailKey: "uphero.session.detail.timeOver")
            return true
        }
        return false
    }

    /// 몬스터 trait runtime state 초기화. 웹 `initMonsterTraitState`.
    private static func initMonsterTraitState(_ s: inout CombatSession, monster: Monster) {
        s.monsterRegenAmount = nil
        s.monsterShieldHits = nil
        guard let trait = monster.trait else { return }
        if trait == .regen {
            let cap = monster.maxHp ?? monster.hp
            // Phase 16 (Track C) — 보스 1% / 일반 5%. 근거는 UpHeroCombat.bossRegenPct 주석.
            let pct = monster.isBoss == true ? UpHeroCombat.bossRegenPct : UpHeroCombat.monsterRegenPct
            s.monsterRegenAmount = max(2, UpHeroCombat.jsRound(Double(cap) * pct))
        } else if trait == .shield {
            s.monsterShieldHits = 2
        }
    }

    // MARK: - createSession

    /// 던전 세션 생성. 웹 `createSession`.
    static func createSession<R: RandomSource>(
        dungeonId: DungeonId, hero: Hero, startFloor: Int,
        activeBuffs: [CardBuff]? = nil, options: CreateSessionOptions? = nil,
        rng: inout R
    ) -> CombatSession {
        let buffedHero = UpHeroCombat.applyStatAndHealBuffs(
            hero: hero, buffs: activeBuffs ?? [], dungeonId: dungeonId)
        let talismanMods = TalismanSkills.collectTalismanMods(buffedHero)
        let maxTime = UpHeroCombat.baseExpeditionTime
        let dungeonName = Dungeons.all[dungeonId]?.name ?? ""

        var session = CombatSession(
            dungeonId: dungeonId, startFloor: startFloor, currentFloor: startFloor,
            log: [
                .narrative(
                    text: "\(dungeonName) — Floor \(startFloor) 에 도착했다.",
                    narrativeKey: "uphero.combat.narrative.floorArrive",
                    narrativeParams: [
                        "dungeon": .text(dungeonName),
                        "dungeonId": .text(dungeonId.rawValue),
                        "floor": .number(Double(startFloor)),
                    ],
                    timestamp: now()),
                .floor(from: 0, to: startFloor, timestamp: now()),
            ],
            hero: buffedHero,
            rewards: SessionRewards(xp: 0, coins: 0, drops: []),
            status: .active, pendingChoiceIndex: nil, speed: 1,
            activeBuffs: (activeBuffs?.isEmpty == false) ? activeBuffs : nil,
            time: maxTime, maxTime: maxTime,
            skillCooldown: nil, classResource: nil, skillCooldowns: nil,
            heroAtkBonusRounds: nil, enemyStunnedRounds: nil, heroDmgReductionRounds: nil,
            guaranteedCritAttacks: nil, heroInvulnerableRounds: nil, revivePending: nil,
            pendingMinigame: nil, recentEventPrompts: nil, nextHeroDamageMult: nil,
            forcedDodgeRounds: nil, forcedEnemyMisses: nil, nextCoinMult: nil,
            talismanMods: talismanMods, extraDropAvailable: talismanMods.extraDropChance > 0,
            talismanAgiStack: 0, roundCounter: 0,
            ngPlusLevel: options?.ngPlusLevel ?? 0,
            isWeeklyVariant: options?.isWeeklyVariant, weeklyAffixId: options?.weeklyAffixId,
            monsterAtkMult: nil, monsterHpMult: nil, xpMult: nil, monsterCritBonus: nil,
            heroPoisonRounds: nil, monsterRegenAmount: nil, monsterShieldHits: nil,
            flattenDropRarity: nil, restChanceBonus: nil, mysteryFloors: nil,
            startedAt: now())
        session.heroLevel = options?.heroLevel
        // 잔여 전투 횟수가 남은 버프만 들여온다. 0 이하는 이미 소진된 것이라 버린다.
        if let carried = options?.combatBuff, carried.battlesLeft > 0 {
            session.combatBuff = carried
        }

        // 주간 affix 적용 (createSession 직후 mutate).
        if options?.isWeeklyVariant == true, let affixId = options?.weeklyAffixId,
           let affix = WeeklyAffixes.getWeeklyAffixById(affixId) {
            affix.apply(&session)
        }
        // class start 효과 (affix 뒤).
        session.hero = UpHeroCombat.applyClassStartEffects(session.hero)
        // talisman start 효과 (class start 뒤 — 최후).
        TalismanSkills.applyTalismanSkillStartEffects(&session, mods: talismanMods)

        // mystery "?" floor seed.
        let initialCycle = (startFloor - 1) / UpHeroCombat.cycleSize
        session.mysteryFloors = UpHeroCombat.generateMysteryFloors(cycleIndex: initialCycle, rng: &rng)
            .filter { $0 > startFloor }

        // 시작층 자체가 보스층이면 보스 + paused 선삽입.
        // Phase 16 (Track C, 피드백 19) — 주간 특례 `isWeeklyVariant && startFloor == 30`
        //   를 "시작층이 보스층" 으로 일반화. 보스층에서 포기/사망 뒤 재진입하면
        //   startFloor 가 10/20/30 이 되는데, tickSession 은 "다음 층" 만 보스 판정하므로
        //   보스가 영구 스킵됐다 (SessionReward.resolveStartFloor 와 짝).
        if UpHeroCombat.isBossFloor(startFloor) {
            let hasBoss = session.log.contains {
                if case let .boss(_, floor, _) = $0 { return floor == startFloor }
                return false
            }
            if !hasBoss {
                let boss = MonsterPool.createMonsterForFloor(
                    dungeonId: dungeonId, floor: startFloor, isBoss: true,
                    opts: ScaleOptions(ngPlusLevel: session.ngPlusLevel ?? 0,
                                       hpMult: session.monsterHpMult ?? 1,
                                       atkMult: session.monsterAtkMult ?? 1),
                    rng: &rng)
                session.log.append(.boss(monster: boss, floor: startFloor, timestamp: now()))
                session.status = .paused
                initMonsterTraitState(&session, monster: boss)
            }
        }
        return session
    }

    // MARK: - tickSession

    /// 세션 진행 — 다음 step 1개 실행. 웹 `tickSession`.
    /// `slotSpinsToday` — 오늘 굴림틀을 돌린 횟수 스냅샷 (`UpHeroState.shopDaily.slotSpins`).
    /// 세션은 스토어를 모르므로 값을 받아 굴림틀 이벤트 등장 게이트(`canSpinSlot`)에 건다.
    /// 웹 `TickContext.slotSpinsToday`.
    static func tickSession<R: RandomSource>(
        _ session: CombatSession, flavor: FlavorPool.FlavorData,
        slotSpinsToday: Int = 0, rng: inout R
    ) -> CombatSession {
        if session.status != .active { return session }

        var s = session
        // in-memory log trim — 활성 encounter 이후 구간은 보존.
        if session.log.count > UpHeroCombat.sessionLogRuntimeCap {
            let encIdx = UpHeroCombat.findLastEncounterIndex(session.log)
            let preserveFrom: Int
            if encIdx >= 0 {
                preserveFrom = min(encIdx,
                    max(0, session.log.count - UpHeroCombat.sessionLogRuntimeCap))
                s.log = Array(session.log[preserveFrom...])
            } else {
                preserveFrom = max(0, session.log.count - UpHeroCombat.sessionLogRuntimeCap)
                s.log = Array(session.log.suffix(UpHeroCombat.sessionLogRuntimeCap))
            }
            // pendingChoiceIndex 는 *절대* 인덱스라 trim 후 stale 됨 — 같이 시프트.
            //   choice 엔트리가 trim 으로 사라지면 nil (resolveChoice 가 recover).
            if let idx = s.pendingChoiceIndex {
                s.pendingChoiceIndex = idx >= preserveFrom ? idx - preserveFrom : nil
            }
        }

        let dungeon = Dungeons.all[s.dungeonId]
        let stats = sessionStats(s)
        let lastEntry = s.log.last

        // ── 진행 중 전투 (encounter/combat/skill/monsterEffect) ──
        var inCombat = false
        if let last = lastEntry {
            switch last {
            case .encounter, .combat, .skill, .monsterEffect: inCombat = true
            default: break
            }
        }
        if inCombat {
            let encIdx = UpHeroCombat.findLastEncounterIndex(s.log)
            if encIdx >= 0, case let .encounter(monster, _) = s.log[encIdx] {
                let monsterHpNow = UpHeroCombat.computeMonsterHp(
                    log: s.log, encounterIdx: encIdx, monster: monster)

                if s.hero.hp <= 0 {
                    if s.revivePending == true {
                        s.revivePending = false
                        let revivedHp = UpHeroCombat.jsRound(Double(s.hero.maxHp) * 0.5)
                        s.hero.hp = revivedHp
                        s.log.append(.skill(
                            classType: .priest, skillId: "priest_revive_t4", skillName: "부활",
                            narrative: "영웅이 부활한다 — HP +\(revivedHp)",
                            narrativeKey: "uphero.combat.narrative.priestRevive",
                            narrativeParams: ["heal": .number(Double(revivedHp))], timestamp: now()))
                    } else {
                        s.hero.hp = 0
                        endSession(&s, reason: .heroDied, detail: "\(monster.name) 에게 쓰러졌다",
                                   detailKey: "uphero.session.detail.killedBy",
                                   monsterTemplateId: monster.templateId, monsterName: monster.name)
                        return s
                    }
                }
                if monsterHpNow <= 0 {
                    let tMods = sessionMods(s)
                    // Phase 2-A — 층 진입 XP 와 같은 배율 (sessionXpMult).
                    let xpMult = sessionXpMult(s)
                    var coinMult = (1 + UpHeroCombat.getBuffBoost(buffs: s.activeBuffs, type: .coinBoost) / 100)
                        * UpHeroCombat.classCoinMult(s.hero.classType) * tMods.coinMult
                    if let ncm = s.nextCoinMult, ncm > 1 {
                        coinMult *= ncm
                        s.nextCoinMult = nil
                    }
                    // Phase 2-A (Track A, 피드백 20) — 보스 처치 보너스 `bossClearXp(층, NG+)` 를
                    //   같은 victory 엔트리에 합산한다 (LogEntry 종류 추가 없음). 영웅 XP 풀로
                    //   정산되는 값이며 계정 XP 는 건드리지 않는다. 웹 tickSession 과 동일.
                    let bossBonus = monster.isBoss == true
                        ? UpHeroRules.bossClearXp(floor: monster.level, ngPlusLevel: s.ngPlusLevel ?? 0)
                        : 0
                    let gainedXp = UpHeroCombat.jsRound(Double(monster.xpReward + bossBonus) * xpMult)
                    let gainedCoin = UpHeroCombat.jsRound(Double(monster.coinReward) * coinMult)
                    s.log.append(.victory(monster: monster, xp: gainedXp, coins: gainedCoin,
                                          narrativeKey: nil, narrativeParams: nil, timestamp: now()))
                    s.rewards.xp += gainedXp
                    s.rewards.coins += gainedCoin
                    gainClassResource(&s, event: .victory)
                    // 전투 1회 종료 — 굴림틀 버프 잔여 횟수 차감 (웹과 같은 지점).
                    consumeCombatBuff(&s)

                    let ngBonus = Double(s.ngPlusLevel ?? 0) * 0.02
                    if monster.isBoss == true {
                        let rarity = EquipmentPool.rollDropRarity(
                            floor: s.currentFloor + 10,
                            legendDropBonus: tMods.legendDropBonus + ngBonus,
                            flatten: s.flattenDropRarity ?? false, rng: &rng)
                        let eq = EquipmentPool.rollEquipmentDrop(
                            dungeonId: s.dungeonId, floor: s.currentFloor, rarity: rarity,
                            affinitySlot: dungeon?.affinity, rng: &rng)
                        s.log.append(.drop(equipment: eq, timestamp: now()))
                        s.rewards.drops.append(eq)
                        // 소실방지권 드롭 — 보스만. 상점에서 살 수 없는 물건이라
                        // 던전이 유일한 공급원이다 (확률 근거는 상수 주석).
                        if rng.chance(bossDestroyGuardDropChance) {
                            grantDestroyGuards(&s, 1)
                            s.log.append(.narrative(
                                text: "소실방지권을 손에 넣었다",
                                narrativeKey: "uphero.slot.drop.destroyGuard",
                                narrativeParams: nil, timestamp: now()))
                        }
                        if tMods.bossTimeRecover > 0 {
                            _ = consumeTime(&s, delta: tMods.bossTimeRecover)
                        }
                        // Phase 16 (Track C, 피드백 28) — 보스가 10층마다 영원히 나오므로
                        //   `>=` 는 F40/F50/... 보스도 런을 끝내버린다. 정확히 F30 에서만
                        //   종료 + NG+, F40+ 보스는 드롭 후 계속. Track A 의 bossClearXp 는
                        //   위 gainedXp 에 붙는다.
                        if s.currentFloor == UpHeroCombat.cycleSize {
                            endSession(&s, reason: .bossDefeated,
                                       detail: "\(monster.name) 을(를) 쓰러뜨렸다",
                                       detailKey: "uphero.session.detail.bossDefeated",
                                       monsterTemplateId: monster.templateId, monsterName: monster.name)
                        }
                        return s
                    }
                    // 일반 몬스터 drop
                    // Phase 4-D (Track D) — guaranteedDrop 이 남아 있으면 드롭을 강제하고 등급은
                    //   floor+5 로 굴린다 (부적 보너스 드롭과 같은 상향). 롤은 강제 여부와
                    //   무관하게 **항상** 소비해 웹과 시드 스트림이 어긋나지 않게 한다.
                    let dropChance = 0.3 + UpHeroCombat.getBuffBoost(buffs: s.activeBuffs, type: .dropRate) / 100
                    let forcedDrop = (s.runGuaranteedDrops ?? 0) > 0
                    let dropRoll = rng.unit()
                    if forcedDrop || dropRoll < dropChance {
                        let rarity = EquipmentPool.rollDropRarity(
                            floor: forcedDrop ? s.currentFloor + 5 : s.currentFloor,
                            legendDropBonus: tMods.legendDropBonus + ngBonus,
                            flatten: s.flattenDropRarity ?? false, rng: &rng)
                        let eq = EquipmentPool.rollEquipmentDrop(
                            dungeonId: s.dungeonId, floor: s.currentFloor, rarity: rarity,
                            affinitySlot: dungeon?.affinity, rng: &rng)
                        s.log.append(.drop(equipment: eq, timestamp: now()))
                        s.rewards.drops.append(eq)
                        if forcedDrop {
                            let left = (s.runGuaranteedDrops ?? 0) - 1
                            s.runGuaranteedDrops = left <= 0 ? nil : left
                        }
                    }
                    // "군중의 총애" 보너스 drop (세션당 1회)
                    if s.extraDropAvailable == true, tMods.extraDropChance > 0,
                       rng.chance(tMods.extraDropChance) {
                        s.extraDropAvailable = false
                        let bonusRarity = EquipmentPool.rollDropRarity(
                            floor: s.currentFloor + 5,
                            legendDropBonus: tMods.legendDropBonus + ngBonus,
                            flatten: s.flattenDropRarity ?? false, rng: &rng)
                        let bonusEq = EquipmentPool.rollEquipmentDrop(
                            dungeonId: s.dungeonId, floor: s.currentFloor, rarity: bonusRarity,
                            affinitySlot: dungeon?.affinity, rng: &rng)
                        s.log.append(.drop(equipment: bonusEq, timestamp: now()))
                        s.rewards.drops.append(bonusEq)
                    }
                    return s
                }

                // encounter 직후 + 일반 몬스터 → encounter choice
                let hasPost = s.log.count > encIdx + 1
                if case .encounter = lastEntry!, monster.isBoss != true, !hasPost {
                    pushEncounterChoice(&s, monster: monster, stats: stats)
                    return s
                }
                // 다음 전투 round
                executeCombatRound(&s, monster: monster, stats: stats, rng: &rng)
                let cost = monster.isBoss == true ? UpHeroCombat.TimeCost.boss : UpHeroCombat.TimeCost.combatRound
                _ = consumeTime(&s, delta: -cost)
                return s
            }
        }

        // ── 전투 중 아님 ──
        // boss 연출 직후 — encounter 진입
        if case let .boss(bossMonster, _, _) = lastEntry {
            s.log.append(.encounter(monster: bossMonster, timestamp: now()))
            initMonsterTraitState(&s, monster: bossMonster)
            return s
        }

        let nextFloor = s.currentFloor + 1
        // 보스층 (10의 배수, 상한 없음) 에 도달 직전이면 boss 로 분기.
        let bossAhead = UpHeroCombat.isBossFloor(nextFloor)

        // 층 이동 (victory/drop/treasure/narrative 뒤)
        var advanceFloor = false
        if let last = lastEntry {
            switch last {
            case .victory, .drop, .treasure, .narrative: advanceFloor = true
            default: break
            }
        }
        if advanceFloor {
            s.log.append(.floor(from: s.currentFloor, to: nextFloor, timestamp: now()))
            s.currentFloor = nextFloor
            // Phase 4-D (Track D) — 런 보정 층 카운트다운 (floorXp 보다 앞, 병합 순서 고정).
            advanceRunModFloors(&s, 1)
            // Phase 2-A (Track A) — 층 진입 XP. 처치 XP 와 같은 배율(sessionXpMult)을 탄다.
            //   skipFloors 로 건너뛴 층은 받지 않는다 (applyChoiceEffect 는 이 줄을 지나지 않음).
            //   로그 엔트리는 추가하지 않는다 — rewards.xp 에만 누적. 웹 tickSession 동일.
            s.rewards.xp += UpHeroCombat.jsRound(
                Double(UpHeroRules.floorXp(floor: nextFloor, ngPlusLevel: s.ngPlusLevel ?? 0))
                    * sessionXpMult(s))
            gainClassResource(&s, event: .floor)
            if consumeTime(&s, delta: -UpHeroCombat.TimeCost.floor) { return s }

            // Track C 블록 — Track A 는 위 currentFloor 갱신 뒤 floorXp 를, Track D 는
            //   advanceRunModFloors(&s, 1) 을 이 앞에 끼운다. 이 블록 자체는 바뀌지 않는다.
            if bossAhead {
                let hasBoss = s.log.contains {
                    if case let .boss(_, floor, _) = $0 { return floor == nextFloor }
                    return false
                }
                if hasBoss { return s }
                let boss = MonsterPool.createMonsterForFloor(
                    dungeonId: s.dungeonId, floor: nextFloor, isBoss: true,
                    opts: ScaleOptions(ngPlusLevel: s.ngPlusLevel ?? 0,
                                       hpMult: s.monsterHpMult ?? 1, atkMult: s.monsterAtkMult ?? 1),
                    rng: &rng)
                s.log.append(.boss(monster: boss, floor: nextFloor, timestamp: now()))
                s.status = .paused
                return s
            }
            // 새 cycle 진입 시 mystery floor lazy 생성
            let newCycle = (s.currentFloor - 1) / UpHeroCombat.cycleSize
            let hasCycle = (s.mysteryFloors ?? []).contains {
                ($0 - 1) / UpHeroCombat.cycleSize == newCycle
            }
            if !hasCycle {
                let fresh = UpHeroCombat.generateMysteryFloors(cycleIndex: newCycle, rng: &rng)
                    .filter { $0 >= s.currentFloor }
                s.mysteryFloors = (s.mysteryFloors ?? []) + fresh
            }
            return s
        }

        // mystery "?" floor 도달
        if (s.mysteryFloors ?? []).contains(s.currentFloor) {
            let ev = FlavorPool.pickMysteryEvent(
                flavor, recentPrompts: s.recentEventPrompts ?? [], rng: &rng)
            let logIdx = s.log.count
            s.log.append(.choice(
                prompt: ev.prompt, promptKey: ev.promptKey, promptParams: nil,
                options: ev.options, resolvedIndex: nil, variant: nil, timeoutMs: nil,
                defaultOptionIndex: nil, isMystery: true, timestamp: now()))
            s.mysteryFloors = (s.mysteryFloors ?? []).filter { $0 != s.currentFloor }
            s.recentEventPrompts = pushLRU(s.recentEventPrompts, ev.prompt)
            s.status = .awaitingChoice
            s.pendingChoiceIndex = logIdx
            return s
        }

        // 일반 층 — choice 25% / narrative 15% / treasure 15% / encounter 45%
        let monsterFreqDelta = UpHeroCombat.getBuffBoost(buffs: s.activeBuffs, type: .monsterFrequency) / 100
        let roll = rng.unit()
        if roll < 0.25 {
            // slotAvailable — 돌릴 수 없는 굴림틀은 아예 뽑히지 않게 게이트를 넘긴다.
            let ev = FlavorPool.pickEvent(
                flavor, dungeonId: s.dungeonId, recentPrompts: s.recentEventPrompts ?? [],
                slotAvailable: canSpinSlot(s, slotSpinsToday: slotSpinsToday), rng: &rng)
            let logIdx = s.log.count
            s.log.append(.choice(
                prompt: ev.prompt, promptKey: ev.promptKey, promptParams: nil,
                options: ev.options, resolvedIndex: nil, variant: nil, timeoutMs: nil,
                defaultOptionIndex: nil, isMystery: nil, timestamp: now()))
            s.recentEventPrompts = pushLRU(s.recentEventPrompts, ev.prompt)
            s.status = .awaitingChoice
            s.pendingChoiceIndex = logIdx
            return s
        }
        if roll < 0.4 {
            let narr = FlavorPool.pickNarrativeWithKey(flavor, dungeonId: s.dungeonId, rng: &rng)
            s.log.append(.narrative(text: narr.text, narrativeKey: narr.key,
                                    narrativeParams: nil, timestamp: now()))
            _ = consumeTime(&s, delta: -UpHeroCombat.TimeCost.narrative)
            return s
        }
        let treasureEnd = max(0.4, min(0.70, 0.55 - monsterFreqDelta))
        if roll < treasureEnd {
            let restChance = 0.35 + (s.restChanceBonus ?? 0)
            if rng.chance(restChance) {
                let recoverAmount = 10 + rng.int(below: 6)
                let rest = FlavorPool.pickRestWithKey(flavor, rng: &rng)
                s.log.append(.treasure(
                    coins: 0, description: "\(rest.text) — 시간 +\(recoverAmount)",
                    narrativeKey: "uphero.combat.narrative.restArea",
                    narrativeParams: [
                        "description": .text(rest.text),
                        "descriptionKey": .text(rest.key),
                        "time": .number(Double(recoverAmount)),
                    ], timestamp: now()))
                _ = consumeTime(&s, delta: recoverAmount)
                return s
            }
            let coinMult = (1 + UpHeroCombat.getBuffBoost(buffs: s.activeBuffs, type: .coinBoost) / 100)
                * UpHeroCombat.classCoinMult(s.hero.classType)
            let coins = UpHeroCombat.jsRound(Double(5 + rng.int(below: 16)) * coinMult)
            let treasure = FlavorPool.pickTreasureWithKey(flavor, rng: &rng)
            s.log.append(.treasure(
                coins: coins, description: treasure.text,
                narrativeKey: "uphero.combat.narrative.treasureFound",
                narrativeParams: [
                    "description": .text(treasure.text),
                    "descriptionKey": .text(treasure.key),
                    "coins": .number(Double(coins)),
                ], timestamp: now()))
            s.rewards.coins += coins
            // 보물상자에 소실방지권이 섞여 나오는 보조 경로 (보스 드롭보다 훨씬 낮다).
            if rng.chance(treasureDestroyGuardDropChance) {
                grantDestroyGuards(&s, 1)
                s.log.append(.narrative(
                    text: "상자 바닥에 소실방지권이 깔려 있었다",
                    narrativeKey: "uphero.slot.drop.destroyGuardChest",
                    narrativeParams: nil, timestamp: now()))
            }
            _ = consumeTime(&s, delta: -UpHeroCombat.TimeCost.treasure)
            return s
        }

        // 나머지 — encounter
        let monster = MonsterPool.createMonsterForFloor(
            dungeonId: s.dungeonId, floor: s.currentFloor, isBoss: false,
            opts: ScaleOptions(ngPlusLevel: s.ngPlusLevel ?? 0,
                               hpMult: s.monsterHpMult ?? 1, atkMult: s.monsterAtkMult ?? 1),
            rng: &rng)
        // Phase 4-D (Track D) — 은신. 몬스터 생성 rng 는 그대로 소비한 뒤 (웹 시드 정렬)
        //   조우 대신 지나침 서사만 남긴다. 보스 분기는 위에서 먼저 갈라지므로 보스는
        //   절대 은신되지 않는다. 시간은 encounter(2) 가 아니라 narrative(1).
        if (s.runStealthLeft ?? 0) > 0 {
            let left = (s.runStealthLeft ?? 0) - 1
            s.runStealthLeft = left <= 0 ? nil : left
            s.log.append(.narrative(
                text: "\(monster.name)의 곁을 소리 없이 지나쳤다.",
                narrativeKey: "uphero.combat.narrative.stealthPass",
                narrativeParams: [
                    "monster": .text(monster.name),
                    "monsterTemplateId": .text(monster.templateId ?? ""),
                ], timestamp: now()))
            _ = consumeTime(&s, delta: -UpHeroCombat.TimeCost.narrative)
            return s
        }
        s.log.append(.encounter(monster: monster, timestamp: now()))
        initMonsterTraitState(&s, monster: monster)
        _ = consumeTime(&s, delta: -UpHeroCombat.TimeCost.encounter)
        return s
    }

    /// recentEventPrompts LRU (cap 3) 갱신.
    private static func pushLRU(_ list: [String]?, _ prompt: String) -> [String] {
        var recent = list ?? []
        recent.append(prompt)
        while recent.count > 3 { recent.removeFirst() }
        return recent
    }

    // MARK: - encounter choice

    /// 일반 몬스터 encounter 직후 삽입 선택지 (싸운다/도망). 웹 `pushEncounterChoice`.
    private static func pushEncounterChoice(
        _ s: inout CombatSession, monster: Monster, stats: HeroBaseStats
    ) {
        let fleeChance = min(0.85, max(0.2,
            0.2 + Double(stats.agi) * 0.03 - Double(monster.level) * 0.02))
        let fleePct = UpHeroCombat.jsRound(fleeChance * 100)
        let options: [ChoiceOption] = [
            ChoiceOption(label: "싸운다", labelKey: "uphero.combat.choice.fight",
                         labelParams: nil, effect: .fight, outcomes: nil,
                         resultText: nil, resultTextKey: nil),
            ChoiceOption(label: "도망간다 (\(fleePct)%)", labelKey: "uphero.combat.choice.fleeWithPct",
                         labelParams: ["pct": .number(Double(fleePct))],
                         effect: .flee(successChance: fleeChance), outcomes: nil,
                         resultText: nil, resultTextKey: nil),
        ]
        let logIdx = s.log.count
        s.log.append(.choice(
            prompt: "\(monster.name) 을(를) 만났다.",
            promptKey: "uphero.combat.encounter.prompt",
            promptParams: [
                "monster": .text(monster.name),
                "monsterTemplateId": .text(monster.templateId ?? ""),
            ],
            options: options, resolvedIndex: nil, variant: .encounter,
            timeoutMs: 5000, defaultOptionIndex: 0, isMystery: nil, timestamp: now()))
        s.status = .awaitingChoice
        s.pendingChoiceIndex = logIdx
    }

    // MARK: - executeCombatRound

    /// 전투 한 round (영웅 공격 + 몬스터 공격). 웹 `executeCombatRound`.
    private static func executeCombatRound<R: RandomSource>(
        _ s: inout CombatSession, monster: Monster, stats: HeroBaseStats, rng: inout R
    ) {
        // monster trait regen — round 시작 시 회복 로그.
        // Phase 16 (Track C, 피드백 16) — 현재 HP 가 최대치의 30% 미만이면 push 자체를
        //   건너뛴다 (regenStopBelowHpRatio). log 에 엔트리가 없으면 computeMonsterHp 도
        //   UI HP 바도 자동으로 일치한다. 비교는 웹과 같은 Double (`hpNow >= cap * 0.3`).
        if let regenAmt = s.monsterRegenAmount, regenAmt > 0 {
            let encIdx = UpHeroCombat.findLastEncounterIndex(s.log)
            let cap = monster.maxHp ?? monster.hp
            let hpNow = encIdx >= 0
                ? UpHeroCombat.computeMonsterHp(log: s.log, encounterIdx: encIdx, monster: monster)
                : cap
            if Double(hpNow) >= Double(cap) * UpHeroCombat.regenStopBelowHpRatio {
                s.log.append(.monsterEffect(
                    effect: .regen, amount: regenAmt, narrative: nil,
                    narrativeKey: "uphero.combat.trait.regen",
                    narrativeParams: [
                        "amount": .number(Double(regenAmt)),
                        "monster": .text(monster.name),
                        "monsterTemplateId": .text(monster.templateId ?? ""),
                    ], timestamp: now()))
            }
        }
        // hero poison DoT
        if let poison = s.heroPoisonRounds, poison.rounds > 0 {
            let tickDmg = max(1, poison.dmgPerRound)
            s.hero.hp = max(0, s.hero.hp - tickDmg)
            s.log.append(.monsterEffect(
                effect: .poisonTick, amount: tickDmg, narrative: nil,
                narrativeKey: "uphero.combat.trait.poisonTick",
                narrativeParams: ["amount": .number(Double(tickDmg))], timestamp: now()))
            let remaining = poison.rounds - 1
            s.heroPoisonRounds = remaining <= 0
                ? nil : PoisonEffect(rounds: remaining, dmgPerRound: poison.dmgPerRound)
        }

        gainClassResource(&s, event: .roundStart)
        let skillCdBefore = s.skillCooldown ?? 0
        // Phase 6-E (Track E, 피드백 21) — 스킬별 쿨다운 맵 스냅샷. canFireSkill / SkillBar 는
        //   `skillCooldowns` 맵을 읽으므로 아래 스칼라 차감만으로는 평정이 죽어 있었다.
        let cdsBefore = s.skillCooldowns ?? [:]
        ClassSkills.maybeFireSkill(&s, monster: monster)
        let tModsEarly = sessionMods(s)
        if tModsEarly.classSkillCdReduce > 0, (s.skillCooldown ?? 0) > skillCdBefore {
            s.skillCooldown = max(0, (s.skillCooldown ?? 0) - tModsEarly.classSkillCdReduce)
        }
        // 맵 diff — 이번 라운드에 늘어난 키(= 방금 발동한 스킬)만 reduce 만큼 줄인다 (min 0).
        //   웹 executeCombatRound 동일.
        if tModsEarly.classSkillCdReduce > 0, var after = s.skillCooldowns {
            var changed = false
            for (key, value) in after where value > (cdsBefore[key] ?? 0) {
                after[key] = max(0, value - tModsEarly.classSkillCdReduce)
                changed = true
            }
            if changed { s.skillCooldowns = after }
        }

        let tMods = sessionMods(s)
        let agiStack = s.talismanAgiStack ?? 0
        var effStats = stats
        effStats.agi = stats.agi + agiStack

        // 영웅 공격
        var heroOutcome = UpHeroCombat.rollHeroOutcome(
            stats: effStats, monster: monster, heroLevel: s.heroLevel, rng: &rng)
        if let gc = s.guaranteedCritAttacks, gc > 0,
           heroOutcome != .miss, heroOutcome != .dodge {
            heroOutcome = .crit
            let next = gc - 1
            s.guaranteedCritAttacks = next <= 0 ? nil : next
        }
        var heroDmg = (heroOutcome == .miss || heroOutcome == .dodge)
            ? 0
            : UpHeroCombat.computeHeroDamage(stats: effStats, monster: monster,
                                             crit: heroOutcome == .crit, rng: &rng)
        if heroDmg > 0, let mult = s.nextHeroDamageMult, mult > 1 {
            heroDmg = UpHeroCombat.jsRound(Double(heroDmg) * mult)
            s.nextHeroDamageMult = nil
        }
        if heroDmg > 0, let ab = s.heroAtkBonusRounds, ab.rounds > 0 {
            heroDmg = UpHeroCombat.jsRound(Double(heroDmg) * ab.mult)
        }
        // Phase 4-D (Track D) — revealBoss 가 쌓은 보스 피해 % (isBoss 몬스터에만).
        //   heroAtkBonusRounds 바로 뒤, crit 보너스 앞 (병합 순서 고정).
        if heroDmg > 0, monster.isBoss == true, let bp = s.runBossDmgPct, bp > 0 {
            heroDmg = UpHeroCombat.jsRound(Double(heroDmg) * (1 + Double(bp) / 100))
        }
        if heroOutcome == .crit, heroDmg > 0, tMods.critDmgBonus > 0 {
            heroDmg = UpHeroCombat.jsRound(Double(heroDmg) * (1 + tMods.critDmgBonus))
        }
        if heroDmg > 0, tMods.lowHpDmgBonus > 0, s.hero.hp > 0,
           Double(s.hero.hp) / Double(s.hero.maxHp) <= 0.2 {
            heroDmg = UpHeroCombat.jsRound(Double(heroDmg) * (1 + tMods.lowHpDmgBonus))
        }
        // monster trait shield
        if heroDmg > 0, let shield = s.monsterShieldHits, shield > 0 {
            let reduced = max(1, Int((Double(heroDmg) * 0.5).rounded(.down)))
            let blocked = heroDmg - reduced
            heroDmg = reduced
            let next = shield - 1
            s.monsterShieldHits = next <= 0 ? nil : next
            s.log.append(.monsterEffect(
                effect: .shieldBlock, amount: blocked, narrative: nil,
                narrativeKey: "uphero.combat.trait.shieldBlock",
                narrativeParams: ["amount": .number(Double(blocked))], timestamp: now()))
        }

        var heroNarr: I18nNarrative?
        if rng.chance(UpHeroCombat.shouldNarrate(heroOutcome)) {
            heroNarr = UpHeroNarrative.heroAttackNarrativeI18n(
                monster: monster, outcome: heroOutcome, damage: heroDmg, rng: &rng)
        }
        s.log.append(.combat(
            attacker: .hero, damage: heroDmg, outcome: heroOutcome,
            narrative: heroNarr?.text, narrativeKey: heroNarr?.key,
            narrativeParams: heroNarr?.params, timestamp: now()))
        if heroOutcome == .hit || heroOutcome == .crit {
            gainClassResource(&s, event: .attack)
            if heroOutcome == .crit { gainClassResource(&s, event: .crit) }
        }

        // 몬스터 공격
        let enemyOutcome: CombatOutcome
        if let stun = s.enemyStunnedRounds, stun > 0 {
            enemyOutcome = .miss
            if monster.isBoss == true, stun > 1 { s.enemyStunnedRounds = 1 }
        } else if let fem = s.forcedEnemyMisses, fem > 0 {
            enemyOutcome = .miss
            let next = fem - 1
            s.forcedEnemyMisses = next <= 0 ? nil : next
        } else if let fdr = s.forcedDodgeRounds, fdr > 0 {
            enemyOutcome = .dodge
        } else {
            enemyOutcome = UpHeroCombat.rollEnemyOutcome(
                monster: monster, stats: effStats,
                dodgeBonus: UpHeroCombat.classDodgeBonus(s.hero.classType) + tMods.dodgeBonus,
                enemyMissBonus: tMods.enemyMissBonus,
                monsterCritBonus: s.monsterCritBonus ?? 0, heroLevel: s.heroLevel, rng: &rng)
        }
        var enemyDmg = (enemyOutcome == .miss || enemyOutcome == .dodge)
            ? 0
            : UpHeroCombat.computeEnemyDamage(monster: monster, stats: effStats,
                                              crit: enemyOutcome == .crit, rng: &rng)
        var finalEnemyOutcome = enemyOutcome
        if let inv = s.heroInvulnerableRounds, inv > 0, enemyDmg > 0 {
            enemyDmg = 0
            finalEnemyOutcome = .miss
            if monster.isBoss == true, inv > 1 { s.heroInvulnerableRounds = 1 }
        }
        if enemyDmg > 0, let dr = s.heroDmgReductionRounds, dr.rounds > 0 {
            enemyDmg = max(1, UpHeroCombat.jsRound(Double(enemyDmg) * (1 - dr.reduction)))
        }

        var counterLogged = false
        if enemyDmg > 0, tMods.counterChance > 0, rng.chance(tMods.counterChance) {
            counterLogged = true
        }

        var enemyNarr: I18nNarrative?
        if rng.chance(UpHeroCombat.shouldNarrate(finalEnemyOutcome)) {
            enemyNarr = UpHeroNarrative.monsterAttackNarrativeI18n(
                monster: monster, outcome: finalEnemyOutcome, damage: enemyDmg, rng: &rng)
        }
        s.log.append(.combat(
            attacker: .enemy, damage: enemyDmg, outcome: finalEnemyOutcome,
            narrative: enemyNarr?.text, narrativeKey: enemyNarr?.key,
            narrativeParams: enemyNarr?.params, timestamp: now()))
        if finalEnemyOutcome == .dodge {
            gainClassResource(&s, event: .dodge)
        } else if finalEnemyOutcome == .hit || finalEnemyOutcome == .crit {
            gainClassResource(&s, event: .hit)
        }

        // monster trait poison — hit 시 영웅 독 부여
        if (finalEnemyOutcome == .hit || finalEnemyOutcome == .crit), monster.trait == .poison {
            let poisonDmg = max(1, Int((Double(monster.level) * 0.5).rounded(.down)))
            s.heroPoisonRounds = PoisonEffect(rounds: 3, dmgPerRound: poisonDmg)
        }
        // counter attack
        if counterLogged {
            var counterDmg = max(1, Int((Double(effStats.str) * 0.5).rounded(.down)))
            if let ab = s.heroAtkBonusRounds, ab.rounds > 0 {
                counterDmg = UpHeroCombat.jsRound(Double(counterDmg) * ab.mult)
            }
            counterDmg = min(counterDmg, Int((Double(effStats.str) * 1.5).rounded(.down)))
            s.log.append(.combat(
                attacker: .hero, damage: counterDmg, outcome: .hit,
                narrative: "영웅이 반사적으로 반격한다 — \(counterDmg) 피해",
                narrativeKey: "uphero.combat.narrative.heroCounter",
                narrativeParams: ["damage": .number(Double(counterDmg))], timestamp: now()))
        }

        // warrior round-end regen
        let regen = UpHeroCombat.classHpRegen(s.hero.classType)
        if regen > 0, s.hero.hp > 0 {
            s.hero.hp = min(s.hero.maxHp, s.hero.hp + regen)
        }
        // roundCounter + "대지의 축복" 2-round regen
        let nextRoundCounter = (s.roundCounter ?? 0) + 1
        s.roundCounter = nextRoundCounter
        let regen2 = tMods.hpRegenEvery2Rounds
        if regen2 > 0, s.hero.hp > 0, nextRoundCounter % 2 == 0 {
            s.hero.hp = min(s.hero.maxHp, s.hero.hp + regen2)
        }
        // agi stack 증가 (다음 round 용)
        if tMods.agiRoundAccum > 0 {
            s.talismanAgiStack = min(tMods.agiRoundCap, agiStack + tMods.agiRoundAccum)
        }
        // 이번 round enemy 피해를 hero.hp 에 반영
        if enemyDmg > 0 {
            s.hero.hp = max(0, s.hero.hp - enemyDmg)
        }
        ClassSkills.advanceSkillCounters(&s)
    }

    // MARK: - resolveChoice / applyChoiceEffect

    /// 사용자 choice 선택 처리. 웹 `resolveChoice`.
    /// 인덱스/타입/optionIndex 부정합 시 *unchanged session 반환 X* — status 가 `.awaitingChoice`
    /// 로 남아 UI 가 영구 데드락. 대신 active 로 복원하고 pendingChoiceIndex 를 비운다
    /// (선택은 silently 스킵 — 사용자는 다시 전투를 진행할 수 있게).
    ///
    /// `slotSpinsToday` — 오늘 굴림 횟수 스냅샷. 굴림틀 선택지의 상한 게이트가 읽는다
    /// (웹 `ResolveChoiceContext.slotSpinsToday`). 카운터 증가는 세션이 아니라 스토어가
    /// 한다 (`UpHeroStore.resolveChoice` 가 새 굴림을 감지하면 `shopDaily.slotSpins` +1).
    static func resolveChoice<R: RandomSource>(
        _ session: CombatSession, optionIndex: Int, slotSpinsToday: Int = 0, rng: inout R
    ) -> CombatSession {
        guard session.status == .awaitingChoice,
              let choiceIdx = session.pendingChoiceIndex,
              choiceIdx >= 0, choiceIdx < session.log.count
        else { return recoverFromInvalidChoice(session) }
        var s = session
        guard case let .choice(prompt, promptKey, promptParams, options, _, variant,
                               timeoutMs, defaultOptionIndex, isMystery, ts) = s.log[choiceIdx],
              optionIndex >= 0, optionIndex < options.count
        else { return recoverFromInvalidChoice(s) }
        let option = options[optionIndex]
        // choice 엔트리에 선택 표시
        s.log[choiceIdx] = .choice(
            prompt: prompt, promptKey: promptKey, promptParams: promptParams, options: options,
            resolvedIndex: optionIndex, variant: variant, timeoutMs: timeoutMs,
            defaultOptionIndex: defaultOptionIndex, isMystery: isMystery, timestamp: ts)

        // Phase 4-D (Track D, 피드백 35) — 효과를 층·영웅 기준으로 스케일한 뒤 요약·적용.
        //   요약보다 먼저라 칩이 실제 지급 수치를 보여준다. 웹 resolveChoice 와 같은 지점.
        func scale(_ effects: [ChoiceEffect]) -> [ChoiceEffect] {
            UpHeroCombat.scaleChoiceEffectsForFloor(
                effects, floor: s.currentFloor, heroMaxHp: s.hero.maxHp,
                ngPlusLevel: s.ngPlusLevel ?? 0)
        }
        if let outcomes = option.outcomes, !outcomes.isEmpty {
            let outcome = UpHeroCombat.pickWeighted(outcomes, rng: &rng)
            let effects = scale(outcome.effects)
            appendChoiceResult(&s, label: option.label, labelKey: option.labelKey,
                               resultText: outcome.resultText, resultTextKey: outcome.resultTextKey,
                               effects: effects)
            for effect in effects {
                applyChoiceEffect(&s, effect: effect, slotSpinsToday: slotSpinsToday, rng: &rng)
                if s.status == .completed { break }
            }
        } else {
            let legacyEffects = scale(option.effect.map { [$0] } ?? [])
            if let resultText = option.resultText {
                appendChoiceResult(&s, label: option.label, labelKey: option.labelKey,
                                   resultText: resultText, resultTextKey: option.resultTextKey,
                                   effects: legacyEffects)
            }
            for effect in legacyEffects {
                applyChoiceEffect(&s, effect: effect, slotSpinsToday: slotSpinsToday, rng: &rng)
            }
        }

        if s.status == .completed { return s }
        if consumeTime(&s, delta: -UpHeroCombat.TimeCost.choice) { return s }
        gainClassResource(&s, event: .choice)
        // Phase 16 (Track C, 피드백 14) — resolveChoice 가 "소유한" 상태만 되돌린다.
        //   이전의 무조건 `.active` 는 startMinigame 효과가 방금 세운 awaitingMinigame 을
        //   덮어써 미니게임 오버레이가 영영 뜨지 않았다. Track D: 여기서 무조건 active 로
        //   되돌리는 코드를 다시 넣지 말 것.
        if s.status == .awaitingChoice { s.status = .active }
        s.pendingChoiceIndex = nil
        return s
    }

    /// stale/부정합 pendingChoiceIndex 로부터 데드락 회피 — 상태 `.active` 복원.
    private static func recoverFromInvalidChoice(_ session: CombatSession) -> CombatSession {
        var s = session
        s.status = .active
        s.pendingChoiceIndex = nil
        return s
    }

    /// choiceResult 로그 push 공용 (resolveChoice 의 outcomes/legacy 양쪽).
    private static func appendChoiceResult(
        _ s: inout CombatSession, label: String, labelKey: String?,
        resultText: String, resultTextKey: String?, effects: [ChoiceEffect]
    ) {
        let summary = UpHeroCombat.summarizeEffects(effects)
        let sd = UpHeroCombat.summarizeEffectsData(effects)
        s.log.append(.choiceResult(
            text: "> \(label) → \(resultText)",
            effectSummary: summary.isEmpty ? nil : summary,
            effectSummaryData: sd.isEmpty ? nil : sd,
            actionLabelKey: labelKey, actionLabelFallback: label,
            resultTextKey: resultTextKey, resultTextFallback: resultText,
            slot: nil, timestamp: now()))
    }

    // MARK: - 굴림틀 (웹 applyChoiceEffect 의 spinSlot 분기)

    /// 보스 처치 시 소실방지권이 떨어질 확률. 웹 BOSS_DESTROY_GUARD_DROP_CHANCE 와 같은 값.
    ///
    /// 왜 0.5 인가: 소실방지권은 상점에서 팔지 않는 물건이라 "던전에서 벌어오는"
    /// 경로가 유일하다. 한 사이클에서 만나는 보스는 F10 / F20 / F30 셋이라 풀 클리어
    /// 기대 수급은 약 1.5장. 강화 상한이 +20 으로 열리면 (Track B) +15 이후 구간은
    /// 시도마다 소실방지권을 태우므로, 이전 0.35 (기대 1.05장) 로는 수급이 수십 런
    /// 단위로 모자랐다 (비평 반영: 0.35 → 0.5).
    static let bossDestroyGuardDropChance = 0.5

    /// 보물상자류 이벤트에서 소실방지권이 섞여 나올 확률. 웹 TREASURE_DESTROY_GUARD_DROP_CHANCE 와 같은 값.
    ///
    /// 왜 0.10 인가: treasure 는 tick 당 10% 로 흔한 편이라 보스 드롭보다 낮게
    /// 잡아야 총 수급이 무너지지 않는다. 풀 클리어 한 런의 treasure 조우를
    /// 대략 8~12회로 보면 기대 0.8~1.2장 — 보스 드롭 (1.5장) 의 보조 경로 수준이다
    /// (비평 반영: 0.06 → 0.10, 굴림틀 RTP 는 건드리지 않음).
    static let treasureDestroyGuardDropChance = 0.1

    /// 세션 보상에 소실방지권 n 장 적립. 정산 때 `UpHeroState.destroyGuards` 로 합산.
    static func grantDestroyGuards(_ s: inout CombatSession, _ count: Int) {
        guard count > 0 else { return }
        s.rewards.destroyGuards += count
    }

    /// 세션 보상에 하락방지권 n 장 적립.
    static func grantDownGuards(_ s: inout CombatSession, _ count: Int) {
        guard count > 0 else { return }
        s.rewards.downGuards += count
    }

    /// 굴림틀을 지금 돌릴 수 있는가 — 이벤트 등장 게이트이자 효과 적용 게이트.
    ///
    /// 두 조건을 본다: (1) 오늘 굴림 횟수(`slotSpinsToday`, `shopDaily.slotSpins` 스냅샷)가
    /// 하루 상한 미만, (2) 이번 탐험에서 번 코인이 비용 이상. 상한은 세션이 아니라
    /// 날짜 단위다 — 하루에 탐험을 몇 번 하든 합산 3회. 지갑(`UpHeroState.coins`)이
    /// 아니라 런 수입(`rewards.coins`)에서 걷는다 — 던전에서 주운 것만 걸 수 있는 닫힌
    /// 고리다 (웹 `canSpinSlot(session, slotSpinsToday, cost)`).
    static func canSpinSlot(
        _ s: CombatSession, slotSpinsToday: Int, cost: Int = UpHeroSlot.spinCost
    ) -> Bool {
        if slotSpinsToday >= UpHeroSlot.dailySpinCap { return false }
        return s.rewards.coins >= cost
    }

    /// 굴림 결과별 한국어 fallback. i18n key 는 `uphero.slot.result.*`.
    private static func slotResultFallback(_ id: SlotOutcomeId) -> String {
        switch id {
        case .blank:          return "드럼이 제각각 멈췄다. 장치가 조용해진다."
        case .coinSmall:      return "룬 셋이 맞물리며 동전이 쏟아졌다."
        case .coinMid:        return "드럼이 깊게 울리더니 동전 무더기가 굴러 나왔다."
        case .coinJackpot:    return "사당 전체가 울렸다. 동전이 발밑까지 밀려온다."
        case .rankProtect:    return "드럼 틈에서 낡은 봉인 조각이 떨어졌다."
        case .destroyProtect: return "재가 엉겨 잿빛 천 한 자락이 되어 흘러나왔다."
        case .itemBox:        return "바닥 판이 열리며 낡은 상자가 밀려 올라왔다."
        case .battleBuff:     return "룬빛이 몸에 스며든다. 한동안 힘이 오른다."
        }
    }

    /// 굴림 1회 — **결과 확정과 지급을 여기서 끝낸다.**
    ///
    /// 드럼 애니메이션은 이미 정해진 결과를 재생하는 표시 계층이라, 연출을
    /// 건너뛰거나 앱이 죽어도 보상이 어긋나지 않는다. 웹 `spinSlot` 분기와 1:1.
    private static func applySpinSlot<R: RandomSource>(
        _ s: inout CombatSession, cost: Int, slotSpinsToday: Int, rng: inout R
    ) {
        // 잔액/상한 게이트는 이벤트 등장 단계에서도 걸리지만, 선택 대기 중에
        // 시간·코인 상태가 바뀔 수 있어 적용 시점에도 한 번 더 본다.
        guard canSpinSlot(s, slotSpinsToday: slotSpinsToday, cost: cost) else {
            s.log.append(.choiceResult(
                text: "> 손잡이를 당긴다 → 드럼은 꿈쩍도 하지 않았다.",
                effectSummary: nil, effectSummaryData: nil,
                actionLabelKey: nil, actionLabelFallback: nil,
                resultTextKey: "uphero.slot.result.unavailable",
                resultTextFallback: "드럼은 꿈쩍도 하지 않았다.",
                slot: nil, timestamp: now()))
            return
        }

        // 오늘 굴림 횟수는 여기서 올리지 않는다 — 세션은 카운터를 갖지 않고, 스토어가
        // 이 굴림의 `slot` 페이로드를 보고 `shopDaily.slotSpins` 를 +1 한다.
        s.rewards.coins -= cost

        let streak = s.slotBlankStreak ?? 0
        let outcome = UpHeroSlot.rollOutcome(blankStreak: streak, rng: &rng)
        s.slotBlankStreak = UpHeroSlot.nextBlankStreak(prev: streak, outcome: outcome)
        let (a, b, c) = UpHeroSlot.renderSymbols(outcome, rng: &rng)

        var coinsWon = 0
        var destroyGuardsWon = 0
        var downGuardsWon = 0
        var buffWon: (pct: Int, battles: Int)?

        switch UpHeroSlot.grant(outcome) {
        case .none:
            break
        case let .coins(amount):
            s.rewards.coins += amount
            coinsWon = amount
        case let .destroyGuards(count):
            grantDestroyGuards(&s, count)
            destroyGuardsWon = count
        case let .downGuards(count):
            grantDownGuards(&s, count)
            downGuardsWon = count
        case .itemBox:
            // 새 아이템 생성기를 만들지 않는다 — 보스 드롭과 같은 경로를 탄다.
            let tMods = sessionMods(s)
            let rarity = EquipmentPool.rollDropRarity(
                floor: UpHeroSlot.itemBoxFloor(currentFloor: s.currentFloor),
                legendDropBonus: tMods.legendDropBonus + Double(s.ngPlusLevel ?? 0) * 0.02,
                flatten: s.flattenDropRarity ?? false, rng: &rng)
            let eq = EquipmentPool.rollEquipmentDrop(
                dungeonId: s.dungeonId, floor: s.currentFloor, rarity: rarity,
                affinitySlot: Dungeons.all[s.dungeonId]?.affinity, rng: &rng)
            s.log.append(.drop(equipment: eq, timestamp: now()))
            s.rewards.drops.append(eq)
        case let .combatBuff(pct, battles):
            // 덮어쓰기다 — 중첩하지 않는다. 중첩을 허용하면 곱이 쌓여 밸런스가
            // 순식간에 무너지고, "한 곳에서만 곱한다" 계약도 해석이 모호해진다.
            s.combatBuff = CombatBuff(pct: Double(pct), battlesLeft: battles)
            buffWon = (pct, battles)
        }

        let fallback = slotResultFallback(outcome)
        s.log.append(.choiceResult(
            text: "> 손잡이를 당긴다 → \(fallback)",
            effectSummary: nil,
            effectSummaryData: coinsWon > 0 ? EffectSummaryData(coins: coinsWon) : nil,
            actionLabelKey: "uphero.slot.option.spin",
            actionLabelFallback: "손잡이를 당긴다",
            resultTextKey: "uphero.slot.result.\(outcome.rawValue)",
            resultTextFallback: fallback,
            slot: SlotResultPayload(
                outcome: outcome, symbols: [a, b, c], cost: cost,
                coins: coinsWon > 0 ? coinsWon : nil,
                destroyGuards: destroyGuardsWon > 0 ? destroyGuardsWon : nil,
                downGuards: downGuardsWon > 0 ? downGuardsWon : nil,
                buffPct: buffWon?.pct, buffBattles: buffWon?.battles),
            timestamp: now()))
    }

    /// ChoiceEffect 적용. 웹 `applyChoiceEffect`.
    private static func applyChoiceEffect<R: RandomSource>(
        _ s: inout CombatSession, effect: ChoiceEffect, slotSpinsToday: Int = 0, rng: inout R
    ) {
        switch effect {
        case let .reward(coins, xp, _):
            if let coins, coins != 0 {
                s.rewards.coins += coins
                s.log.append(.treasure(
                    coins: coins, description: "선택의 대가",
                    narrativeKey: "uphero.combat.narrative.choiceReward",
                    narrativeParams: ["coins": .number(Double(coins))], timestamp: now()))
            }
            if let xp, xp != 0 { s.rewards.xp += xp }
        case let .damage(amount):
            s.hero.hp = max(0, s.hero.hp - amount)
            if s.hero.hp <= 0 {
                endSession(&s, reason: .heroDied, detail: "선택의 대가로 쓰러졌다",
                           detailKey: "uphero.session.detail.choiceCost")
            }
        case let .time(delta):
            _ = consumeTime(&s, delta: delta)
        case let .heal(amount):
            let tMods = sessionMods(s)
            let healed = UpHeroCombat.jsRound(
                Double(amount) * UpHeroCombat.classHealMult(s.hero.classType) * tMods.healEffectMult)
            s.hero.hp = min(s.hero.maxHp, s.hero.hp + healed)
            gainClassResource(&s, event: .heal)
        case let .skipFloors(count):
            // Phase 16 (Track C, 피드백 26) — 다음 보스층 직전까지만 건너뛴다. 이전엔
            //   F19 에서 +3 이 F22 로 가 F20 보스가 통째로 사라졌다. 움직일 곳이 없으면
            //   층 엔트리 대신 narrative 로 피드백만 준다.
            // Track D 블록 — moved > 0 분기 끝에 advanceRunModFloors(&s, moved) 가 붙는다.
            let cur = s.currentFloor
            let target = min(cur + count, UpHeroCombat.nextBossFloorAfter(cur) - 1)
            let moved = target - cur
            if moved <= 0 {
                s.log.append(.narrative(
                    text: "통로가 보스의 문 앞에서 끊겨 있다",
                    narrativeKey: "uphero.combat.narrative.skipBlocked",
                    narrativeParams: nil, timestamp: now()))
                return
            }
            s.currentFloor = target
            s.log.append(.floor(from: cur, to: target, timestamp: now()))
            // Phase 4-D (Track D) — 실제 이동한 층 수만큼 런 보정 만료. 층 XP 는 없다.
            advanceRunModFloors(&s, moved)
        case .revealBoss:
            // Phase 4-D (Track D, 피드백 35) — "보스의 기운" 한 줄이던 효과를 실제 정보로:
            //   다음 보스층의 보스 이름과 trait 를 서사로 밝히고, 남은 런 동안 보스 피해
            //   +5% (상한 15) 를 준다. 보스 템플릿은 층으로 결정되고 createMonsterForFloor
            //   의 보스 분기는 rng 를 소비하지 않으므로 미리보기가 시드를 어긋나게 하지
            //   않는다. Track C 의 nextBossFloorAfter (보스는 10층마다 영원히) 를 쓰며
            //   revealBossNone 은 방어 분기일 뿐이다.
            let nextBossFloor = UpHeroCombat.nextBossFloorAfter(s.currentFloor)
            guard UpHeroCombat.isBossFloor(nextBossFloor) else {
                s.log.append(.narrative(
                    text: "앞길에 더는 보스의 기운이 없다.",
                    narrativeKey: "uphero.combat.narrative.revealBossNone",
                    narrativeParams: nil, timestamp: now()))
                return
            }
            let boss = MonsterPool.createMonsterForFloor(
                dungeonId: s.dungeonId, floor: nextBossFloor, isBoss: true,
                opts: ScaleOptions(ngPlusLevel: s.ngPlusLevel ?? 0,
                                   hpMult: s.monsterHpMult ?? 1, atkMult: s.monsterAtkMult ?? 1),
                rng: &rng)
            let pct = min(UpHeroCombat.RunMods.bossDmgCap,
                          (s.runBossDmgPct ?? 0) + UpHeroCombat.RunMods.bossDmgPerReveal)
            s.runBossDmgPct = pct
            let trait = boss.trait?.rawValue ?? "none"
            s.log.append(.narrative(
                text: "F\(nextBossFloor)의 \(boss.name)가 보인다 (보스 피해 +\(pct)%)",
                narrativeKey: "uphero.combat.narrative.revealBossTrait.\(trait)",
                narrativeParams: [
                    "floor": .number(Double(nextBossFloor)),
                    "monster": .text(boss.name),
                    "monsterTemplateId": .text(boss.templateId ?? ""),
                    "pct": .number(Double(pct)),
                ], timestamp: now()))
        case let .runBuff(stat, pct, floors):
            applyRunStatMod(&s, stat: stat, pct: pct, floors: floors, isBuff: true)
        case let .runCurse(stat, pct, floors):
            applyRunStatMod(&s, stat: stat, pct: pct, floors: floors, isBuff: false)
        case let .stealth(encounters):
            s.runStealthLeft = min(UpHeroCombat.RunMods.stealthCap,
                                   (s.runStealthLeft ?? 0) + encounters)
        case let .guaranteedDrop(count):
            s.runGuaranteedDrops = min(UpHeroCombat.RunMods.guaranteedDropCap,
                                       (s.runGuaranteedDrops ?? 0) + (count ?? 1))
        case let .spinSlot(cost):
            applySpinSlot(&s, cost: cost, slotSpinsToday: slotSpinsToday, rng: &rng)
        case .fight:
            let encIdx = UpHeroCombat.findLastEncounterIndex(s.log)
            guard encIdx >= 0, case let .encounter(monster, _) = s.log[encIdx] else { return }
            let stats = sessionStats(s)
            executeCombatRound(&s, monster: monster, stats: stats, rng: &rng)
        case let .startMinigame(minigame, difficulty, successEffects, failEffects):
            let floor = s.currentFloor
            let floorBoost = floor >= 24 ? 2 : (floor >= 12 ? 1 : 0)
            let adjusted = min(3, difficulty + floorBoost)
            s.pendingMinigame = PendingMinigame(
                minigame: minigame, difficulty: adjusted,
                successEffects: successEffects, failEffects: failEffects)
            s.status = .awaitingMinigame
            s.log.append(.narrative(
                text: "도전이 시작된다...",
                narrativeKey: "uphero.combat.narrative.challengeStart",
                narrativeParams: nil, timestamp: now()))
        case let .flee(successChance):
            let encIdx = UpHeroCombat.findLastEncounterIndex(s.log)
            guard encIdx >= 0, case let .encounter(monster, _) = s.log[encIdx] else { return }
            if rng.chance(successChance) {
                s.log.append(.narrative(
                    text: "영웅이 \(monster.name) 에게서 재빠르게 도망쳤다.",
                    narrativeKey: "uphero.combat.narrative.fleeSuccess",
                    narrativeParams: [
                        "monster": .text(monster.name),
                        "monsterTemplateId": .text(monster.templateId ?? ""),
                    ], timestamp: now()))
            } else {
                s.log.append(.narrative(
                    text: "도망치려 했지만 \(monster.name) 에게 막혔다!",
                    narrativeKey: "uphero.combat.narrative.fleeFail",
                    narrativeParams: [
                        "monster": .text(monster.name),
                        "monsterTemplateId": .text(monster.templateId ?? ""),
                    ], timestamp: now()))
                let stats = sessionStats(s)
                let outcome = UpHeroCombat.rollEnemyOutcome(
                    monster: monster, stats: stats,
                    dodgeBonus: UpHeroCombat.classDodgeBonus(s.hero.classType),
                    enemyMissBonus: 0, monsterCritBonus: s.monsterCritBonus ?? 0,
                    heroLevel: s.heroLevel, rng: &rng)
                let dmg = (outcome == .miss || outcome == .dodge)
                    ? 0
                    : UpHeroCombat.computeEnemyDamage(monster: monster, stats: stats,
                                                      crit: outcome == .crit, rng: &rng)
                var narr: I18nNarrative?
                if rng.chance(UpHeroCombat.shouldNarrate(outcome)) {
                    narr = UpHeroNarrative.monsterAttackNarrativeI18n(
                        monster: monster, outcome: outcome, damage: dmg, rng: &rng)
                }
                s.log.append(.combat(
                    attacker: .enemy, damage: dmg, outcome: outcome,
                    narrative: narr?.text, narrativeKey: narr?.key,
                    narrativeParams: narr?.params, timestamp: now()))
            }
        case .nothing:
            break
        }
    }

    /// Phase 4-D (Track D, 피드백 15) — 런 한정 능력치 보정 적립. 저주는 음수 pct 로 같은
    /// 배열에 쌓인다. 상한 초과면 오래된 것부터 버린다. 웹 applyChoiceEffect 의
    /// runBuff/runCurse 분기.
    private static func applyRunStatMod(
        _ s: inout CombatSession, stat: RunModStat, pct: Int, floors: Int?, isBuff: Bool
    ) {
        var mods = s.runStatMods ?? []
        mods.append(RunStatMod(stat: stat, pct: isBuff ? pct : -pct, floorsLeft: floors))
        while mods.count > UpHeroCombat.RunMods.statModsCap { mods.removeFirst() }
        s.runStatMods = mods
        let statKo = UpHeroCombat.runStatKo[stat] ?? stat.rawValue
        let f = floors ?? 0
        s.log.append(.narrative(
            text: isBuff
                ? "\(statKo)이(가) 오른다 (+\(pct)%, \(f)층)"
                : "\(statKo)이(가) 흔들린다 (-\(pct)%, \(f)층)",
            narrativeKey: isBuff
                ? "uphero.combat.narrative.runBuff"
                : "uphero.combat.narrative.runCurse",
            // stat 은 ko fallback, statId 는 resolveLog 가 현재 언어 라벨로 치환하는 키.
            narrativeParams: [
                "stat": .text(statKo),
                "statId": .text(stat.rawValue),
                "pct": .number(Double(pct)),
                "floors": .number(Double(f)),
            ], timestamp: now()))
    }

    // MARK: - resolveMinigame / abandonSession

    /// 미니게임 결과 해소. 웹 `resolveMinigame`.
    static func resolveMinigame<R: RandomSource>(
        _ session: CombatSession, success: Bool, rng: inout R
    ) -> CombatSession {
        guard session.status == .awaitingMinigame, let pending = session.pendingMinigame else {
            return session
        }
        var s = session
        // Phase 4-D (Track D) — startMinigame 안쪽 배열은 resolveChoice 가 스케일하지
        //   않으므로 여기 적용 시점에 같은 식으로 스케일한다.
        let simpleEffects = UpHeroCombat.scaleChoiceEffectsForFloor(
            success ? pending.successEffects : pending.failEffects,
            floor: s.currentFloor, heroMaxHp: s.hero.maxHp, ngPlusLevel: s.ngPlusLevel ?? 0)
        let effects = simpleEffects.map { $0.asChoiceEffect }
        let summary = UpHeroCombat.summarizeEffects(effects)
        let sd = UpHeroCombat.summarizeEffectsData(effects)
        s.log.append(.choiceResult(
            text: success ? "> 도전 성공" : "> 도전 실패",
            effectSummary: summary.isEmpty ? nil : summary,
            effectSummaryData: sd.isEmpty ? nil : sd,
            actionLabelKey: success ? "uphero.combat.minigame.success" : "uphero.combat.minigame.fail",
            actionLabelFallback: success ? "도전 성공" : "도전 실패",
            resultTextKey: success ? "uphero.combat.minigame.success" : "uphero.combat.minigame.fail",
            resultTextFallback: success ? "도전 성공" : "도전 실패",
            slot: nil, timestamp: now()))
        for e in effects {
            applyChoiceEffect(&s, effect: e, rng: &rng)
            if s.status == .completed { break }
        }
        s.pendingMinigame = nil
        if s.status != .completed { s.status = .active }
        return s
    }

    /// 세션 자발 포기. 웹 `abandonSession`.
    static func abandonSession(_ session: CombatSession) -> CombatSession {
        var s = session
        s.log.append(.sessionEnd(
            reason: .heroAbandoned, detail: "F\(session.currentFloor) 에서 캠프로 복귀",
            detailKey: "uphero.session.detail.abandonedAtFloor",
            detailMonsterTemplateId: nil, detailMonsterFallback: nil,
            detailFloor: session.currentFloor, timestamp: now()))
        s.status = .completed
        return s
    }
}

/// SimpleChoiceEffect → ChoiceEffect 승격 (resolveMinigame 효과 적용용).
private extension SimpleChoiceEffect {
    var asChoiceEffect: ChoiceEffect {
        switch self {
        case let .reward(coins, xp, dropId): return .reward(coins: coins, xp: xp, dropEquipmentId: dropId)
        case let .damage(amount): return .damage(amount: amount)
        case let .heal(amount): return .heal(amount: amount)
        case let .time(delta): return .time(delta: delta)
        case let .skipFloors(count): return .skipFloors(count: count)
        case .revealBoss: return .revealBoss
        case let .runBuff(stat, pct, floors): return .runBuff(stat: stat, pct: pct, floors: floors)
        case let .runCurse(stat, pct, floors): return .runCurse(stat: stat, pct: pct, floors: floors)
        case let .stealth(encounters): return .stealth(encounters: encounters)
        case let .guaranteedDrop(count): return .guaranteedDrop(count: count)
        case .nothing: return .nothing
        }
    }
}

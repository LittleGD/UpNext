//
//  SessionReward.swift
//  UpNext 로직 — Up Hero 세션 종료 보상 순수 헬퍼.
//
//  웹 src/lib/sessionReward.ts (141줄) 1:1 포팅.
//  Phase 2.4 (RPG 엔진) "스킬" 단계 산출물 — 세션 종료 시 drops/codex/던전진행 정산.
//
//  각 함수는 input → output 만 반환 (calculateKeptDrops 의 1-drop 분기만 비결정론).
//

import Foundation

enum SessionReward {

    /// 로그라이크 체크포인트 단위 — 30층마다 진행 저장. 웹 `DUNGEON_CHECKPOINT_INTERVAL`.
    static let dungeonCheckpointInterval = 30

    // MARK: - 세션 종료 헬퍼

    /// 마지막 로그 엔트리에서 sessionEnd reason 추출.
    private static func endReason(_ log: [LogEntry]) -> SessionEndReason? {
        if let last = log.last, case let .sessionEnd(reason, _, _, _, _, _, _) = last {
            return reason
        }
        return nil
    }

    /// 사망 시 drops 유실 계산. 웹 `calculateKeptDrops`.
    ///   heroDied/defeat 면: N≥2 → 절반 유지, N==1 → 50% 확률 유지 (웹 Math.random — 비결정론).
    ///   그 외 reason → 전량 유지.
    static func calculateKeptDrops<R: RandomSource>(
        _ session: CombatSession, rng: inout R
    ) -> [Equipment] {
        let reason = endReason(session.log)
        let heroDied = reason == .heroDied || reason == .defeat
        if !heroDied { return session.rewards.drops }
        let drops = session.rewards.drops
        if drops.count == 1 {
            return rng.unit() < 0.5 ? drops : []
        }
        return Array(drops.prefix(drops.count / 2))
    }

    /// log 를 순회해 실제 처치한 보스 floor 집합. 웹 `calculateBossesDefeated`.
    /// "boss" entry 다음 "victory(isBoss)" 패턴 → 그 floor 기록. 정렬 반환.
    static func calculateBossesDefeated(log: [LogEntry], existing: [Int]) -> [Int] {
        var killed = Set(existing)
        var lastBossFloor: Int?
        for entry in log {
            if case let .boss(_, floor, _) = entry {
                lastBossFloor = floor
            }
            if case let .victory(monster, _, _, _, _, _) = entry,
               monster.isBoss == true, let lbf = lastBossFloor {
                killed.insert(lbf)
                lastBossFloor = nil
            }
        }
        return killed.sorted()
    }

    /// log 에서 발견한 몬스터/보스/장비를 기존 codex 에 누적. 웹 `calculateCodexDelta`.
    /// (웹 Set 은 삽입 순서 보존 — Swift 는 배열+seen-set 으로 동일 순서 재현.)
    /// Phase 6-E (Track E, 피드백 18) — `rewardDrops` (session.rewards.drops) 와 합집합.
    ///   로그는 상한으로 앞부분이 잘리지만 drops 는 전부 남아 있다. 사진 부적은 템플릿이
    ///   없으므로 도감에 넣지 않는다.
    static func calculateCodexDelta(
        log: [LogEntry], current: Codex, rewardDrops: [Equipment] = []
    ) -> Codex {
        var monsters = current.monsters
        var monsterSeen = Set(monsters)
        var bosses = current.bosses
        var bossSeen = Set(bosses)
        var equipment = current.equipment
        var equipSeen = Set(equipment)

        for entry in log {
            if case let .encounter(monster, _) = entry {
                if monster.isBoss == true {
                    if !bossSeen.contains(monster.name) {
                        bossSeen.insert(monster.name)
                        bosses.append(monster.name)
                    }
                } else {
                    if !monsterSeen.contains(monster.name) {
                        monsterSeen.insert(monster.name)
                        monsters.append(monster.name)
                    }
                }
            }
            if case let .drop(equip, _) = entry, equip.photoId == nil {
                let base = EquipmentPool.equipmentBaseName(equip)
                if !equipSeen.contains(base) {
                    equipSeen.insert(base)
                    equipment.append(base)
                }
            }
        }
        for equip in rewardDrops where equip.photoId == nil {
            let base = EquipmentPool.equipmentBaseName(equip)
            if !equipSeen.contains(base) {
                equipSeen.insert(base)
                equipment.append(base)
            }
        }
        return Codex(monsters: monsters, equipment: equipment, bosses: bosses)
    }

    /// Phase 6-E (Track E, 피드백 22) — 가방 상한 분배. 웹 `splitDropsByCap`.
    /// room = max(0, cap - inventoryCount); 앞에서부터 room 개는 가방으로, 나머지는
    /// overflowDrops 로. 순서를 바꾸지 않는다 (드롭 순 = 로그 순).
    static func splitDropsByCap(
        inventoryCount: Int, drops: [Equipment], cap: Int
    ) -> (fits: [Equipment], overflow: [Equipment]) {
        let room = max(0, cap - inventoryCount)
        let cut = min(room, drops.count)
        return (Array(drops[..<cut]), Array(drops[cut...]))
    }

    /// 던전 진행 갱신 — 도달 floor max + 보스 처치 반영. 웹 `calculateDungeonProgress`.
    /// 로그라이크: 사망 시 currentFloor 를 30단위 체크포인트로 내려 저장. best 는 후퇴 X.
    ///
    /// Phase 16 (Track C, 피드백 19/26/31) — 보스층은 그 보스를 처치했을 때만 은행에
    /// 들어간다. 보스층 (10 의 배수) 에서 포기/시간초과/사망으로 끝났는데 그 층의 보스가
    /// bossesDefeated 에 없으면 floorReached 는 한 층 뒤 (bossFloor - 1) 로 저장된다.
    /// 사망 체크포인트 (F30 보스에게 죽으면 30) 도 같은 규칙으로 29. best 는 그대로.
    static func calculateDungeonProgress(
        session: CombatSession, existing: DungeonProgress?, newBossesDefeated: [Int]
    ) -> DungeonProgress {
        let reason = endReason(session.log)
        let heroDied = reason == .heroDied || reason == .defeat

        var sessionFloor = heroDied
            ? (session.currentFloor / dungeonCheckpointInterval) * dungeonCheckpointInterval
            : session.currentFloor
        if UpHeroCombat.isBossFloor(sessionFloor), !newBossesDefeated.contains(sessionFloor) {
            sessionFloor -= 1
        }

        let reached = max(existing?.floorReached ?? 0, sessionFloor)
        // bestFloorReached: 체크포인트 내림과 무관하게 실제 도달 floor 의 역대 최고치.
        let bestBase = existing?.bestFloorReached ?? existing?.floorReached ?? 0
        let best = max(max(bestBase, session.currentFloor), reached)

        return DungeonProgress(
            dungeonId: session.dungeonId,
            floorReached: reached,
            bestFloorReached: best,
            bossesDefeated: newBossesDefeated)
    }

    /// Phase 16 (Track C, 피드백 19/26) — 재진입 시작층. 웹 `resolveStartFloor`.
    /// floorReached 이하의 미처치 보스층 중 가장 낮은 층, 없으면 floorReached + 1.
    /// 이미 보스를 건너뛴 저장본 (floorReached 21, bossesDefeated [10]) 을 마이그레이션
    /// 없이 고친다 — 다음 런이 F20 에서 시작하고 createSession 이 보스를 바로 스폰한다.
    static func resolveStartFloor(_ progress: DungeonProgress?) -> Int {
        let reached = progress?.floorReached ?? 0
        let defeated = progress?.bossesDefeated ?? []
        var b = 10
        while b <= reached {
            if !defeated.contains(b) { return b }
            b += 10
        }
        return reached + 1
    }

    // MARK: - 주간 악몽 보상 (Phase 16, Track C, 피드백 30)

    /// 던전당 주간 첫 F30 클리어 코인. 웹 WEEKLY_FIRST_CLEAR_COINS 와 같은 값.
    static let weeklyFirstClearCoins = 600
    /// 던전당 주간 첫 클리어 소실방지권. 웹 WEEKLY_FIRST_CLEAR_DESTROY_GUARDS 와 같은 값.
    static let weeklyFirstClearDestroyGuards = 1
    /// 8 던전 올클리어 추가 코인. 웹 WEEKLY_ALL_CLEAR_COINS 와 같은 값.
    static let weeklyAllClearCoins = 3000
    /// 올클리어 추가 소실방지권. 웹 WEEKLY_ALL_CLEAR_DESTROY_GUARDS 와 같은 값.
    static let weeklyAllClearDestroyGuards = 2
    /// 올클리어 추가 하락방지권. 웹 WEEKLY_ALL_CLEAR_DOWN_GUARDS 와 같은 값.
    static let weeklyAllClearDownGuards = 3
    /// 던전 수. 웹 WEEKLY_DUNGEON_COUNT 와 같은 값 (Dungeons.list.count 와 테스트로 대조).
    static let weeklyDungeonCount = 8

    /// 웹 `WeeklyClearReward`.
    struct WeeklyClearReward: Equatable {
        let firstClear: Bool
        let allClear: Bool
        let coins: Int
        let destroyGuards: Int
        let downGuards: Int
    }

    /// 주간 악몽 보상 — 저장 필드 없이 파생. 웹 `computeWeeklyClearReward`.
    /// 첫 클리어 = 이 던전이 아직 clearedDungeons 에 없음, 올클리어 = 이번 정산이
    /// clearedDungeons 를 7 → 8 로 넘김. acknowledgeSessionEnd (지급) 와
    /// SessionResultModal (표시) 이 같은 함수를 호출해 "보여준 것 = 준 것" 이 보장된다.
    static func computeWeeklyClearReward(
        session: CombatSession, weekly: WeeklyVariant?
    ) -> WeeklyClearReward? {
        guard session.isWeeklyVariant == true, let weekly else { return nil }
        let clearedF30 = session.log.contains {
            if case let .victory(monster, _, _, _, _, _) = $0 {
                return monster.isBoss == true && monster.level == 30
            }
            return false
        }
        if !clearedF30 { return nil }
        let cleared = Set(weekly.clearedDungeons)
        if cleared.contains(session.dungeonId) { return nil }
        let allClear = cleared.count == weeklyDungeonCount - 1
        return WeeklyClearReward(
            firstClear: true,
            allClear: allClear,
            coins: weeklyFirstClearCoins + (allClear ? weeklyAllClearCoins : 0),
            destroyGuards: weeklyFirstClearDestroyGuards
                + (allClear ? weeklyAllClearDestroyGuards : 0),
            downGuards: allClear ? weeklyAllClearDownGuards : 0)
    }
}

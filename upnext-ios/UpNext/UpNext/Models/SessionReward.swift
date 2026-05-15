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

    // MARK: - 장비 baseName (upHeroEquipment.ts 부분 포팅)

    /// 등급별 이름 접두사. 웹 `RARITY_PREFIX` (upHeroEquipment.ts).
    /// 전체 upHeroEquipment.ts 는 Phase 2.2 장비 데이터 포팅 시 별도 파일로 분리 예정.
    static let rarityPrefix: [Rarity: String] = [
        .normal: "", .rare: "빛나는 ", .unique: "전설적 ", .legend: "신성한 ",
    ]

    /// Equipment.name 에서 rarity 접두사 제거해 baseName 복원. 웹 `getEquipmentBaseName`.
    static func equipmentBaseName(_ eq: Equipment) -> String {
        let prefix = rarityPrefix[eq.rarity] ?? ""
        if !prefix.isEmpty && eq.name.hasPrefix(prefix) {
            return String(eq.name.dropFirst(prefix.count))
        }
        return eq.name
    }

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
    static func calculateCodexDelta(log: [LogEntry], current: Codex) -> Codex {
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
            if case let .drop(equip, _) = entry {
                let base = equipmentBaseName(equip)
                if !equipSeen.contains(base) {
                    equipSeen.insert(base)
                    equipment.append(base)
                }
            }
        }
        return Codex(monsters: monsters, equipment: equipment, bosses: bosses)
    }

    /// 던전 진행 갱신 — 도달 floor max + 보스 처치 반영. 웹 `calculateDungeonProgress`.
    /// 로그라이크: 사망 시 currentFloor 를 30단위 체크포인트로 내려 저장. best 는 후퇴 X.
    static func calculateDungeonProgress(
        session: CombatSession, existing: DungeonProgress?, newBossesDefeated: [Int]
    ) -> DungeonProgress {
        let reason = endReason(session.log)
        let heroDied = reason == .heroDied || reason == .defeat

        let sessionFloor = heroDied
            ? (session.currentFloor / dungeonCheckpointInterval) * dungeonCheckpointInterval
            : session.currentFloor

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
}

import Foundation

/// Audio follows log events, so automatic and manual skill activation share the same cue.
enum UpHeroAudio {
    static func music(_ session: CombatSession?) -> MusicTrack {
        guard let session else { return .main }
        let dungeon = MusicTrack(rawValue: session.dungeonId.rawValue) ?? .main
        if session.status == .completed { return dungeon }
        for entry in session.log.reversed() {
            switch entry {
            case .boss: return .boss
            case let .encounter(monster, _): return monster.isBoss == true ? .boss : dungeon
            case .victory, .floor, .sessionEnd: return dungeon
            default: continue
            }
        }
        return dungeon
    }

    static func cue(_ entry: LogEntry) -> SoundName? {
        switch entry {
        case let .combat(attacker, damage, outcome, _, _, _, _):
            switch outcome {
            case .crit: return .criticalHit
            case .dodge: return .dodge
            case .miss: return .miss
            case .hit: return damage > 0 ? (attacker == .hero ? .heroHit : .enemyHit) : .shieldBlock
            }
        case let .encounter(monster, _): return monster.isBoss == true ? nil : .encounter
        case let .victory(monster, _, _, _, _, _): return monster.isBoss == true ? .fullClear : .battleWin
        case let .drop(equipment, _): return [Rarity.unique, .legend].contains(equipment.rarity) ? .rareLoot : .lootDrop
        case .treasure: return .treasure
        case .floor: return .floorAdvance
        case let .choice(_, _, _, _, resolved, _, _, _, _, _): return resolved == nil ? .choiceOpen : nil
        case let .skill(classType, _, _, _, _, _, _):
            switch classType {
            case .priest, .druid: return .skillHoly
            case .chronomancer: return .skillTime
            case .mage, .illusionist, .bard: return .skillMagic
            default: return .skillMelee
            }
        case let .monsterEffect(effect, _, _, _, _, _):
            switch effect {
            case .regen: return .heal
            case .poisonTick: return .poison
            case .shieldBlock: return .shieldBlock
            }
        case let .choiceResult(_, _, summary, _, _, _, _, slot, _):
            if slot != nil { return nil }
            if (summary?.damage ?? 0) > 0 { return .enemyHit }
            if (summary?.heal ?? 0) > 0 { return .heal }
            if (summary?.coins ?? 0) != 0 || (summary?.xp ?? 0) != 0 { return .rewardChoose }
            return .confirm
        case let .sessionEnd(reason, _, _, _, _, _, _):
            switch reason {
            case .heroDied, .defeat: return .defeat
            case .timeExpired: return .timeWarning
            case .heroAbandoned, .abandoned: return .retreat
            default: return nil
            }
        default: return nil
        }
    }
}

//
//  ChoiceResultTypes.swift
//  UpNext — 이벤트 결과 팝업의 "톤/모티프" 계약 + 효과 칩 빌더.
//
//  웹 src/components/uphero/choiceResultTypes.ts + upHeroI18n.buildSummaryChips 의 포팅.
//  Phase 4-D (Track D, 피드백 15/35): 결과 모달(ChoiceResultModal)과 런 보정 스트립
//  (DungeonView.runModsStrip)이 같은 칩 빌더를 쓴다 (라벨 정본 하나).
//
//  톤: 색·아이콘 색을 결정한다. 모티프: 아이콘. 호출자는 summaryData 만 넘기면
//  둘 다 여기서 추론된다. 굴림틀은 자기 모달(SlotMachineModal)이 따로 있어 이
//  추론 경로를 타지 않는다.
//

import SwiftUI

/// 결과의 정서적 톤. 웹 `ChoiceResultTone`.
///  - jackpot: 대박 (레전드 색)  - boon: 이득 (라임)  - neutral: 무해  - bane: 손해 (위험 신호색)
enum ChoiceResultTone: Equatable {
    case jackpot, boon, neutral, bane
}

/// 결과가 "무엇" 이었는지를 가리키는 아이콘 모티프. 웹 `ChoiceResultMotif`.
enum ChoiceResultMotif: Equatable {
    case coin, protect, preserve, box, buff, blank, gear, heal, damage, time
    /// Phase 4-D — 런 한정 저주 / 은신 / 층 건너뜀
    case curse, stealth, skip
    case generic
}

enum ChoiceResultTypes {

    // MARK: - 톤 가중치 (웹 choiceResultTypes.ts 와 같은 값)

    /// 런 한정 효과의 톤 가중치. 수치가 아닌 효과라 정성적으로 정한다: 버프/스킵 =
    /// 평범한 이벤트 보상(≈40) 하나, 은신/보스 정보 = 그보다 조금 작게, 장비 확정 =
    /// 가장 크게. 저주는 같은 크기의 손해.
    static let runModToneWeight = 40
    static let stealthToneWeight = 30
    static let guaranteedDropToneWeight = 60
    static let skipToneWeight = 40
    static let bossRevealToneWeight = 30

    private static func runModCounts(_ d: EffectSummaryData) -> (pos: Int, neg: Int) {
        var pos = 0, neg = 0
        for m in d.runMods ?? [] {
            if m.pct > 0 { pos += 1 } else if m.pct < 0 { neg += 1 }
        }
        return (pos, neg)
    }

    /// summaryData 수치에서 톤 추론. 웹 `deriveChoiceResultTone`.
    /// HP 손실은 같은 크기의 XP 획득보다 훨씬 아프게 읽힌다 → damage ×3. jackpot 은
    /// "손해 0 + 이득이 평범한 이벤트 보상(≈50)의 두 배 이상" 일 때만.
    static func deriveTone(_ d: EffectSummaryData?) -> ChoiceResultTone {
        guard let d else { return .neutral }
        let timeDelta = d.timeDelta ?? 0
        let (pos, neg) = runModCounts(d)
        let gain = (d.xp ?? 0) + (d.coins ?? 0) + (d.heal ?? 0)
            + max(0, timeDelta) * 2
            + pos * runModToneWeight
            + (d.stealth ?? 0) * stealthToneWeight
            + (d.guaranteedDrop ?? 0) * guaranteedDropToneWeight
            + (d.skipFloors ?? 0) * skipToneWeight
            + ((d.bossDmgPct ?? 0) > 0 ? bossRevealToneWeight : 0)
        let loss = (d.damage ?? 0) * 3 + max(0, -timeDelta) * 2 + neg * runModToneWeight
        if gain == 0 && loss == 0 { return .neutral }
        if loss > gain { return .bane }
        if loss == 0 && gain >= 120 { return .jackpot }
        return .boon
    }

    /// summaryData 에서 모티프 추론. 웹 `deriveChoiceResultMotif`.
    /// 런 한정 효과가 있으면 그 쪽이 결과의 정체다 (시간/코인보다 우선):
    /// 장비 확정 > 저주(양수 보정 없음) > 버프·보스 정보 > 은신 > 스킵 > 기존 규칙.
    static func deriveMotif(_ d: EffectSummaryData?) -> ChoiceResultMotif {
        guard let d else { return .generic }
        let timeDelta = d.timeDelta ?? 0
        let (pos, neg) = runModCounts(d)
        if (d.guaranteedDrop ?? 0) > 0 { return .gear }
        if neg > 0 && pos == 0 { return .curse }
        if pos > 0 || (d.bossDmgPct ?? 0) > 0 { return .buff }
        if (d.stealth ?? 0) > 0 { return .stealth }
        if (d.skipFloors ?? 0) > 0 { return .skip }
        let gain = (d.xp ?? 0) + (d.coins ?? 0) + (d.heal ?? 0)
        if (d.damage ?? 0) > 0 && gain == 0 { return .damage }
        if (d.heal ?? 0) > 0 && (d.xp ?? 0) == 0 && (d.coins ?? 0) == 0 { return .heal }
        if (d.coins ?? 0) > 0 && (d.xp ?? 0) == 0 { return .coin }
        if gain == 0 && timeDelta != 0 { return .time }
        return .generic
    }

    // MARK: - 표현

    /// 톤별 대표 색. 웹 CHOICE_TONE_COLOR 의 앱 토큰 대응 (jackpot 은 드롭 카드의 레전드 색).
    static func toneColor(_ tone: ChoiceResultTone) -> Color {
        switch tone {
        case .jackpot: return Color(red: 0.910, green: 0.722, blue: 0.529)  // #e8b887
        case .boon: return Color.accentPrimary
        case .neutral: return Color.textSecondary
        case .bane: return Color.accentSecondary
        }
    }

    /// 모티프 → PixelIcon. 웹 MOTIF_ICON. 자산이 없는 모티프는 .zap 으로 (플랜 규칙).
    /// generic + jackpot 은 트로피로 승격 (웹 choiceResultIcon).
    static func icon(motif: ChoiceResultMotif, tone: ChoiceResultTone) -> PixelIconName {
        if motif == .generic && tone == .jackpot { return .trophy }
        switch motif {
        case .coin: return .coins
        case .protect: return .shield
        case .preserve: return .lock
        case .box: return .gift
        case .buff: return .sparkle
        case .blank: return .zap
        case .gear: return .sword
        case .heal: return .heart
        case .damage: return .zap
        case .time: return .clock
        case .curse: return .moon
        case .stealth: return .eye
        case .skip: return .zap
        case .generic: return .zap
        }
    }

    // MARK: - 칩

    /// 런 보정 스탯 id 의 현재 언어 라벨. 정본은 UpHeroNarrative.runStatLabel (서사와 공유).
    static func statLabel(_ statId: String) -> String {
        UpHeroNarrative.runStatLabel(statId)
    }

    private static func chip(_ key: String, _ params: NarrativeParams, fallback: String) -> String {
        UpHeroNarrative.resolveLog(key, params, fallback: fallback)
    }

    /// 효과 요약을 칩 문자열 배열로 (효과 하나에 칩 하나). 웹 `buildSummaryChips`.
    /// 순서: xp, coins, heal, damage, time, skipFloors, runMods…, stealth, guaranteedDrop, bossDmgPct.
    /// 앞 다섯 수치 칩은 기존 보간 포맷 키("경험치 +%lld" 등)를, 런 효과 칩은 dotted 키를 쓴다.
    static func chips(_ d: EffectSummaryData) -> [String] {
        var parts: [String] = []
        if let xp = d.xp, xp != 0 { parts.append(AppConfig.loc("경험치 +\(xp)")) }
        if let coins = d.coins, coins != 0 { parts.append(AppConfig.loc("코인 +\(coins)")) }
        if let heal = d.heal, heal != 0 { parts.append(AppConfig.loc("체력 +\(heal)")) }
        if let damage = d.damage, damage != 0 { parts.append(AppConfig.loc("체력 −\(damage)")) }
        if let td = d.timeDelta, td != 0 {
            parts.append(td > 0 ? AppConfig.loc("시간 +\(td)") : AppConfig.loc("시간 \(td)"))
        }
        if let sk = d.skipFloors, sk != 0 {
            parts.append(chip("uphero.choice.effectSummary.skipFloors",
                              ["n": .number(Double(sk))], fallback: "\(sk)층 건너뜀"))
        }
        for m in d.runMods ?? [] {
            let stat = statLabel(m.stat.rawValue)
            let pct = abs(m.pct)
            let isBuff = m.pct > 0
            if let floors = m.floorsLeft {
                parts.append(chip(
                    isBuff ? "uphero.choice.effectSummary.runBuff" : "uphero.choice.effectSummary.runCurse",
                    ["stat": .text(stat), "pct": .number(Double(pct)), "floors": .number(Double(floors))],
                    fallback: "\(stat) \(isBuff ? "+" : "-")\(pct)% (\(floors)층)"))
            } else {
                parts.append(chip(
                    isBuff ? "uphero.choice.effectSummary.runBuffRun" : "uphero.choice.effectSummary.runCurseRun",
                    ["stat": .text(stat), "pct": .number(Double(pct))],
                    fallback: "\(stat) \(isBuff ? "+" : "-")\(pct)% (이번 탐험)"))
            }
        }
        if let st = d.stealth, st != 0 {
            parts.append(chip("uphero.choice.effectSummary.stealth",
                              ["n": .number(Double(st))], fallback: "다음 \(st)회 조우 회피"))
        }
        if let gd = d.guaranteedDrop, gd != 0 {
            parts.append(chip("uphero.choice.effectSummary.guaranteedDrop",
                              ["n": .number(Double(gd))], fallback: "다음 처치 장비 확정 x\(gd)"))
        }
        if let bp = d.bossDmgPct, bp != 0 {
            parts.append(chip("uphero.choice.effectSummary.bossReveal",
                              ["pct": .number(Double(bp))], fallback: "보스 피해 +\(bp)%"))
        }
        return parts
    }

    /// 세션의 런 한정 상태 4종을 `EffectSummaryData` 로 합성 (런 보정 스트립용).
    /// 웹 DungeonView.RunModsStrip 의 합성과 같은 순서 — runMods 가 먼저 나오므로
    /// 앞 `runStatMods.count` 개 칩이 보정 건에 1:1 대응한다.
    static func runStateSummary(_ s: CombatSession) -> EffectSummaryData? {
        var d = EffectSummaryData()
        if let mods = s.runStatMods, !mods.isEmpty { d.runMods = mods }
        if let bp = s.runBossDmgPct, bp > 0 { d.bossDmgPct = bp }
        if let st = s.runStealthLeft, st > 0 { d.stealth = st }
        if let gd = s.runGuaranteedDrops, gd > 0 { d.guaranteedDrop = gd }
        return d.isEmpty ? nil : d
    }
}

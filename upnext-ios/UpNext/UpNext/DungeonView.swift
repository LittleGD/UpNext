//
//  DungeonView.swift
//  UpNext — Up Hero 던전 전투 화면 (Phase 4 슬라이스 22).
//
//  웹 components/uphero/DungeonView.tsx 포팅. currentSession 이 있으면 UpHeroGameView
//  가 아지트 대신 이 화면을 보여준다. 타이머가 advanceCombat 을 반복 호출해 전투가
//  자동 진행되고, 전투 로그가 실시간으로 쌓인다.
//
//  슬라이스 22 — 자동 진행 전투 + 로그 + 종료 화면. condensed:
//   - 이벤트 선택지는 자동 결정 (인터랙티브 선택은 다음 슬라이스)
//   - 미니게임은 자동 처리 (플레이는 Phase 4.6)
//   - 보스 등장 연출·속도 조절은 이후, 보상 지급은 세션 결과 슬라이스
//

import SwiftUI
import Combine  // Timer.publish().autoconnect()

struct DungeonView: View {
    @EnvironmentObject private var upHero: UpHeroStore

    /// 전투 tick 타이머 — 0.7초마다 한 스텝. 화면이 살아있는 동안만 발화.
    private let tick = Timer.publish(every: 0.7, on: .main, in: .common).autoconnect()

    var body: some View {
        ZStack {
            Color.bgPrimary.ignoresSafeArea()
            if let session = upHero.state.currentSession {
                content(session)
            }
        }
        .onReceive(tick) { _ in upHero.advanceCombat() }
    }

    private func content(_ session: CombatSession) -> some View {
        VStack(spacing: 0) {
            statusHeader(session)
            logScroll(session)
            footer(session)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }

    // MARK: - 상태 헤더 (던전·층·HP·시간)

    private func statusHeader(_ session: CombatSession) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(alignment: .firstTextBaseline) {
                Text(Dungeons.all[session.dungeonId]?.name ?? "던전")
                    .typography(.heading)
                    .foregroundStyle(Color.textPrimary)
                Spacer()
                Text("\(session.currentFloor)층")
                    .typography(.caption)
                    .foregroundStyle(Color.accentPrimary)
            }
            statBar("HP", session.hero.hp, session.hero.maxHp, Color.accentPrimary)
            statBar("탐험 시간", session.time, session.maxTime, Color.accentCyan)
        }
        .padding(.horizontal, 16)
        .padding(.top, 8)
        .padding(.bottom, 12)
    }

    private func statBar(_ label: String, _ value: Int, _ max: Int, _ color: Color) -> some View {
        VStack(alignment: .leading, spacing: 3) {
            HStack {
                Text(label)
                    .typography(.micro)
                    .foregroundStyle(Color.textTertiary)
                Spacer()
                Text("\(Swift.max(0, value)) / \(max)")
                    .typography(.micro)
                    .foregroundStyle(Color.textSecondary)
            }
            GeometryReader { geo in
                ZStack(alignment: .leading) {
                    Capsule().fill(Color.bgElevated)
                    Capsule().fill(color)
                        .frame(width: geo.size.width * barFraction(value, max))
                }
            }
            .frame(height: 6)
        }
    }

    private func barFraction(_ v: Int, _ m: Int) -> CGFloat {
        guard m > 0 else { return 0 }
        return min(Swift.max(CGFloat(v) / CGFloat(m), 0), 1)
    }

    // MARK: - 전투 로그 (자동 스크롤)

    private func logScroll(_ session: CombatSession) -> some View {
        ScrollViewReader { proxy in
            ScrollView {
                LazyVStack(alignment: .leading, spacing: 6) {
                    ForEach(Array(session.log.enumerated()), id: \.offset) { idx, entry in
                        Text(logText(entry))
                            .typography(.caption)
                            .foregroundStyle(logColor(entry))
                            .frame(maxWidth: .infinity, alignment: .leading)
                            .id(idx)
                    }
                }
                .padding(.horizontal, 16)
                .padding(.vertical, 8)
            }
            .onChange(of: session.log.count) { _ in
                // 새 로그가 쌓이면 맨 아래로 — 전투 진행을 따라간다.
                withAnimation(.easeOut(duration: 0.2)) {
                    proxy.scrollTo(session.log.count - 1, anchor: .bottom)
                }
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }

    // MARK: - 하단 (진행 중 = 포기 / 종료 = 결과)

    @ViewBuilder
    private func footer(_ session: CombatSession) -> some View {
        if session.status == .completed {
            endResult(session)
        } else {
            Button { upHero.abandonSession() } label: {
                Text("탐험 포기")
                    .typography(.body)
                    .frame(maxWidth: .infinity)
                    .frame(height: 52)
                    .foregroundStyle(Color.textSecondary)
                    .background(Color.bgSurface, in: RoundedRectangle(cornerRadius: 12))
            }
            .buttonStyle(.plain)
            .padding(16)
        }
    }

    private func endResult(_ session: CombatSession) -> some View {
        VStack(spacing: 8) {
            Text(endReasonText(session))
                .typography(.heading)
                .foregroundStyle(Color.textPrimary)
            Text(rewardSummary(session))
                .typography(.caption)
                .foregroundStyle(Color.textSecondary)
            Text("보상 지급·층 기록은 다음 슬라이스에서 반영됩니다")
                .typography(.micro)
                .foregroundStyle(Color.textTertiary)
                .padding(.bottom, 4)
            Button { upHero.abandonSession() } label: {
                Text("돌아가기")
                    .typography(.body)
                    .frame(maxWidth: .infinity)
                    .frame(height: 52)
                    .foregroundStyle(Color.bgPrimary)
                    .background(Color.accentPrimary, in: RoundedRectangle(cornerRadius: 12))
            }
            .buttonStyle(.plain)
        }
        .padding(16)
        .frame(maxWidth: .infinity)
        .background(Color.bgSurface, in: RoundedRectangle(cornerRadius: 16))
        .padding(16)
    }

    /// 종료 사유 — 마지막 sessionEnd 로그에서 추출.
    private func endReasonText(_ session: CombatSession) -> String {
        for entry in session.log.reversed() {
            if case let .sessionEnd(reason, detail, _, _, _, _, _) = entry {
                return detail ?? sessionEndText(reason)
            }
        }
        return "탐험 종료"
    }

    private func rewardSummary(_ session: CombatSession) -> String {
        let r = session.rewards
        var parts = ["XP +\(r.xp)", "코인 +\(r.coins)"]
        if !r.drops.isEmpty { parts.append("장비 \(r.drops.count)개") }
        return parts.joined(separator: " · ")
    }

    // MARK: - 로그 엔트리 렌더 (웹 LogEntry 13-case)

    private func logText(_ entry: LogEntry) -> String {
        switch entry {
        case let .narrative(text, _, _, _):
            return text
        case let .encounter(monster, _):
            return "\(monster.name) 출현!"
        case let .combat(attacker, damage, outcome, narrative, _, _, _):
            if let narrative, !narrative.isEmpty { return narrative }
            let who = attacker == .hero ? "영웅" : "적"
            switch outcome {
            case .hit:   return "\(who)의 공격 — \(damage) 피해"
            case .crit:  return "\(who)의 치명타! — \(damage) 피해"
            case .dodge: return "\(attacker == .hero ? "적" : "영웅")이 회피"
            case .miss:  return "\(who)의 공격이 빗나갔다"
            }
        case let .victory(monster, xp, coins, _, _, _):
            return "\(monster.name) 처치 — XP +\(xp), 코인 +\(coins)"
        case let .drop(equipment, _):
            return "\(equipment.name) 획득!"
        case let .treasure(coins, description, _, _, _):
            return description.isEmpty ? "보물 발견 — 코인 +\(coins)" : description
        case let .floor(_, to, _):
            return "\(to)층 진입"
        case let .boss(monster, floor, _):
            return "보스 \(monster.name) 등장! (\(floor)층)"
        case let .choice(prompt, _, _, _, _, _, _, _, _, _):
            return prompt
        case let .sessionEnd(reason, detail, _, _, _, _, _):
            return detail ?? sessionEndText(reason)
        case let .skill(_, _, skillName, narrative, _, _, _):
            return narrative.isEmpty ? skillName : narrative
        case let .monsterEffect(_, _, narrative, _, _, _):
            return narrative ?? "몬스터 효과 발동"
        case let .choiceResult(text, _, _, _, _, _, _, _):
            return text
        }
    }

    private func logColor(_ entry: LogEntry) -> Color {
        switch entry {
        case .victory, .drop, .treasure:
            return Color.accentPrimary       // 좋은 일
        case .encounter, .boss:
            return Color.accentSecondary     // 위협 등장
        case .sessionEnd:
            return Color.textPrimary
        default:
            return Color.textSecondary
        }
    }

    private func sessionEndText(_ reason: SessionEndReason) -> String {
        switch reason {
        case .bossDefeated:  return "보스 격파 — 탐험 성공"
        case .heroDied:      return "영웅이 쓰러졌다 — 탐험 실패"
        case .timeExpired:   return "탐험 시간 소진"
        case .heroAbandoned: return "캠프로 복귀"
        case .victory:       return "탐험 성공"
        case .defeat:        return "탐험 실패"
        case .abandoned:     return "캠프로 복귀"
        }
    }
}

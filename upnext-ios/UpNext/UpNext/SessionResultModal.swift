//
//  SessionResultModal.swift
//  UpNext — Up Hero 세션 종료 결산 모달.
//
//  웹 src/components/uphero/SessionResultModal.tsx 포팅.
//  - 종료 사유별 타이틀/아이콘/색 (bossDefeated/heroDied/timeExpired/abandoned)
//  - 220ms scale 0.96→1 + opacity enter
//  - title 등장 후 280ms 뒤 detail fade-in (2-박자 reveal)
//  - 700ms count-up: XP/coin 숫자가 0→target 으로 카운트
//  - 드롭 그리드: DropRevealCard 들 (탭하면 flip)
//  - 사망 시 drops 절반 회색 + 사선 hatch 로 "잃음" 표시
//

import SwiftUI

struct SessionResultModal: View {
    let session: CombatSession
    let onAcknowledge: () -> Void

    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    @State private var mounted: Bool = false
    @State private var detailMounted: Bool = false
    @State private var xpDisplay: Int = 0
    @State private var coinDisplay: Int = 0

    var body: some View {
        ZStack {
            // 백드롭
            Color.black.opacity(0.85 * (mounted ? 1 : 0))
                .ignoresSafeArea()
                .contentShape(Rectangle())

            // 모달 카드
            VStack(spacing: 0) {
                header
                Divider().background(GBPalette.dark)
                rewards
                Divider().background(GBPalette.dark)
                cta
            }
            .frame(maxWidth: 380)
            .background(GBPalette.dark.opacity(0.96), in: RoundedRectangle(cornerRadius: 14))
            .overlay(
                RoundedRectangle(cornerRadius: 14)
                    .stroke(GBPalette.light.opacity(0.6), lineWidth: 1)
            )
            .padding(.horizontal, 16)
            .scaleEffect(mounted ? 1 : 0.96)
            .opacity(mounted ? 1 : 0)
        }
        .onAppear { runEnter() }
    }

    // MARK: - Header

    private var header: some View {
        let reasonInfo = resolveReason(session)
        return VStack(spacing: 8) {
            // 던전 · 층
            Text("던전 — F\(session.currentFloor)")
                .typography(.caption)
                .foregroundStyle(GBPalette.light)
            // 아이콘
            PixelIcon(reasonInfo.icon, size: 22, color: reasonInfo.color)
            // 타이틀
            Text(reasonInfo.title)
                .typography(.heading)
                .foregroundStyle(reasonInfo.color)
            // 세부 (2-박자 reveal)
            Text(reasonInfo.detail)
                .typography(.caption)
                .foregroundStyle(GBPalette.light)
                .multilineTextAlignment(.center)
                .opacity(detailMounted ? 0.85 : 0)
                .offset(y: detailMounted ? 0 : -4)
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 18)
    }

    // MARK: - Rewards

    private var rewards: some View {
        VStack(spacing: 10) {
            HStack {
                Label {
                    Text("XP")
                        .typography(.caption)
                        .foregroundStyle(GBPalette.light)
                } icon: {
                    PixelIcon(.sparkle, size: 14, color: GBPalette.light)
                }
                Spacer()
                Text("+\(xpDisplay)")
                    .typography(.caption)
                    .monospacedDigit()
                    .foregroundStyle(xpDisplay > 0 ? GBPalette.lightest : GBPalette.light)
            }

            HStack {
                Label {
                    Text("코인")
                        .typography(.caption)
                        .foregroundStyle(GBPalette.light)
                } icon: {
                    PixelIcon(.coins, size: 14, color: GBPalette.light)
                }
                Spacer()
                Text("+\(coinDisplay)")
                    .typography(.caption)
                    .monospacedDigit()
                    .foregroundStyle(coinDisplay > 0 ? GBPalette.lightest : GBPalette.light)
            }

            // Drops
            let drops = session.rewards.drops
            let heroDied = isHeroDied(session)
            let keptCount = heroDied ? drops.count / 2 : drops.count
            let kept = Array(drops.prefix(keptCount))
            let lost = Array(drops.dropFirst(keptCount))

            VStack(alignment: .leading, spacing: 6) {
                HStack(spacing: 6) {
                    PixelIcon(.gift, size: 14, color: GBPalette.light)
                    Text(lost.isEmpty ? AppConfig.loc("획득 장비 \(kept.count)") : AppConfig.loc("획득 장비 \(kept.count) (잃음 \(lost.count))"))
                        .typography(.caption)
                        .foregroundStyle(GBPalette.light)
                }
                if drops.isEmpty {
                    Text("드롭 없음")
                        .typography(.caption)
                        .foregroundStyle(GBPalette.light.opacity(0.6))
                        .padding(.leading, 16)
                } else {
                    LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible()), GridItem(.flexible())], spacing: 8) {
                        ForEach(kept) { eq in
                            DropRevealCard(equipment: eq)
                        }
                        ForEach(lost) { eq in
                            DropRevealCard(equipment: eq)
                                .opacity(0.35)
                                .saturation(0.4)
                                .overlay(
                                    HatchOverlay()
                                        .allowsHitTesting(false)
                                )
                        }
                    }
                    if !kept.isEmpty {
                        Text("탭하여 공개")
                            .typography(.caption)
                            .foregroundStyle(GBPalette.light.opacity(0.6))
                            .frame(maxWidth: .infinity, alignment: .center)
                    }
                }
            }
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 14)
    }

    // MARK: - CTA

    private var cta: some View {
        // GB 팔레트 세계관 CTA(GBPalette.lightest/dark·radius 8·minHeight 44)는 GbConfirm 과
        // 같은 이유로 그 룩을 유지 — variant 로 흡수하지 않고 공통 press 어포던스만 얹는다.
        Button {
            Haptics.play(.selection)
            onAcknowledge()
        } label: {
            Text("캠프로 돌아가기")
                .typography(.caption)
                .foregroundStyle(GBPalette.dark)
                .frame(maxWidth: .infinity)
                .frame(minHeight: 44)
                .background(GBPalette.lightest, in: RoundedRectangle(cornerRadius: 8))
        }
        .buttonStyle(.unPress)
        .padding(.horizontal, 16)
        .padding(.vertical, 12)
    }

    // MARK: - Enter sequence

    private func runEnter() {
        if reduceMotion {
            mounted = true
            detailMounted = true
            xpDisplay = session.rewards.xp
            coinDisplay = session.rewards.coins
            return
        }
        withAnimation(Anim.cardOverlayEnter) { mounted = true }
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.28) {
            withAnimation(.easeOut(duration: 0.24)) { detailMounted = true }
            // count-up 700ms
            countUp()
        }
    }

    private func countUp() {
        let targetXp = session.rewards.xp
        let targetCoins = session.rewards.coins
        let frames = 42  // ~700ms @ 60fps
        let startTime = Date()
        let duration: TimeInterval = 0.7
        Timer.scheduledTimer(withTimeInterval: 1.0/60, repeats: true) { timer in
            let elapsed = Date().timeIntervalSince(startTime)
            let progress = min(elapsed / duration, 1)
            let eased = 1 - pow(1 - progress, 3)  // ease-out
            xpDisplay = Int(Double(targetXp) * eased)
            coinDisplay = Int(Double(targetCoins) * eased)
            if progress >= 1 {
                xpDisplay = targetXp
                coinDisplay = targetCoins
                timer.invalidate()
            }
            _ = frames
        }
    }

    // MARK: - 종료 사유 매핑

    private struct ReasonInfo {
        let title: String
        let detail: String
        let icon: PixelIconName
        let color: Color
    }

    private func resolveReason(_ s: CombatSession) -> ReasonInfo {
        // 마지막 sessionEnd 추출
        var reason: SessionEndReason = .heroAbandoned
        var detailText: String?
        for entry in s.log.reversed() {
            if case let .sessionEnd(r, d, dKey, _, dMonster, dFloor, _) = entry {
                reason = r
                // 세션 결과 detail 다국어 — 이전엔 한국어 detail(d)을 그대로 렌더해 전
                //   언어에서 "몬스터 에게 쓰러졌다" 등이 샜다. 웹 SessionResultModal 파리티로
                //   detailKey 를 인앱 언어로 해석하고 monster/floor 를 주입한다(monster 는
                //   resolveLog 내 locRuntime 재현지화). 키 없으면 한국어 fallback(legacy 세이브).
                if let dKey {
                    var p: NarrativeParams = [:]
                    if let dMonster { p["monster"] = .text(dMonster) }
                    if let dFloor { p["floor"] = .number(Double(dFloor)) }
                    detailText = UpHeroNarrative.resolveLog(dKey, p.isEmpty ? nil : p, fallback: d ?? "")
                } else {
                    detailText = d
                }
                break
            }
        }
        switch reason {
        case .bossDefeated, .victory:
            return ReasonInfo(title: AppConfig.loc("보스 격파"),
                              detail: detailText ?? AppConfig.loc("탐험 성공"),
                              icon: .trophy, color: GBPalette.lightest)
        case .heroDied, .defeat:
            return ReasonInfo(title: AppConfig.loc("영웅이 쓰러졌다"),
                              detail: detailText ?? AppConfig.loc("장비 절반을 잃었다"),
                              icon: .warningDiamond, color: Color.accentSecondary)
        case .timeExpired:
            return ReasonInfo(title: AppConfig.loc("탐험 시간 소진"),
                              detail: detailText ?? AppConfig.loc("다음에 더 깊이 들어가자"),
                              icon: .clock, color: GBPalette.light)
        case .heroAbandoned, .abandoned:
            return ReasonInfo(title: AppConfig.loc("캠프로 복귀"),
                              detail: detailText ?? AppConfig.loc("안전한 휴식"),
                              icon: .flag, color: GBPalette.light)
        }
    }

    private func isHeroDied(_ s: CombatSession) -> Bool {
        for entry in s.log.reversed() {
            if case let .sessionEnd(r, _, _, _, _, _, _) = entry {
                return r == .heroDied || r == .defeat
            }
        }
        return false
    }
}

/// 사선 해치 패턴 — 잃은 드롭 카드 위에 덮어 "놓쳤다" 표시.
private struct HatchOverlay: View {
    var body: some View {
        Canvas { ctx, size in
            let spacing: CGFloat = 6
            let lineWidth: CGFloat = 2
            for x in stride(from: -size.height, to: size.width + size.height, by: spacing) {
                var path = Path()
                path.move(to: CGPoint(x: x, y: 0))
                path.addLine(to: CGPoint(x: x + size.height, y: size.height))
                ctx.stroke(path, with: .color(Color.accentSecondary.opacity(0.3)),
                           lineWidth: lineWidth)
            }
        }
        .clipShape(RoundedRectangle(cornerRadius: 8))
    }
}

//
//  SlotMachineModal.swift
//  Up Hero — 굴림틀(rune drum) 연출 모달. 웹 `SlotMachineModal.tsx` 1:1 이식.
//
//  **표시 전용이다.** 결과는 이미 세션 배선(`UpHeroSession.applySpinSlot`)에서 확정되고
//  지급까지 끝난 상태로 로그 엔트리에 실려 온다. 이 뷰는 그 결과를 드럼 세 칸으로
//  옮겨 그릴 뿐이라, 연출을 건너뛰거나 앱이 죽어도 보상이 어긋나지 않는다.
//  여기서 난수를 굴리는 코드는 한 줄도 없어야 한다.
//
//  흐름: idle(레버) → spinning → landed → 3초 뒤 자동 닫힘.
//   - 레버를 당겨야 돈다 (탭·드래그 전부 "당김"). 당김에 rigid 햅틱 1회.
//     결과는 이미 정해져 있지만 "내가 당겼다" 는 감각이 도파민의 절반이다.
//   - 릴 정지 시각은 `UpHeroSlot.reelTimings(symbols)` 가 준다. 웹과 iOS 가 같은
//     숫자를 쓴다. 릴1·릴2 가 같은 룬이면 릴3 가 +700ms 늦게 서고 그동안 감속
//     틱(소리+햅틱)이 돈다. 당첨이든 near-miss 든 같은 서스펜스다.
//   - near-miss(꽝의 30%, `UpHeroSlot.render` 가 고른 표시)는 릴3 착지에 3pt 오버슈트와
//     "아깝다!" 한 줄. 결과가 꽝으로 확정된 뒤의 그림일 뿐 확률과 무관하다.
//   - 꽝: 둔탁음 + light 햅틱 + 프레임 15% 디밍 250ms. 에러색(accentSecondary) 은 쓰지 않는다.
//   - 축하 티어(`UpHeroSlot.tier`): small 플래시 / mid 링+더블 햅틱 / big 버스트+2pt 셰이크
//     +스파크 낙하+트리플 햅틱+"대박!".
//   - pity: 스트릭이 임계에 닿았으면 "다음은 반드시 나와요" 힌트. 스트릭 값은
//     스토어가 만든다 (`blankStreak`). 여기서는 표시만.
//   - "한 번 더": 남은 스핀·코인이 있을 때만 CTA 가 뜬다 (`spinAgain`).
//   - reduce-motion: 레버·스핀 생략, 200ms 크로스페이드로 결과부터. 셰이크·스파크·
//     플레어 제거, 햅틱은 유지, 자동 닫힘 유지.
//   - 착지 후 탭: 어디를 눌러도 닫힌다. 회전 중 탭은 "건너뛰기".
//   - 모션은 주변부(드럼·플레어·보상 칩)에만. 결과 **본문 텍스트는 움직이지 않는다** —
//     페이드만 한다. 읽는 중에 글자가 움직이면 안 된다.
//

import SwiftUI
import UIKit

// MARK: - 룬 도상

/// 룬 → 픽셀 아이콘. 픽셀아트 결의 던전 도상 (7·체리·BAR 없음).
/// 웹 `SYMBOL_ICON` 과 의미가 같은 iOS 아이콘 세트로 대응시켰다 — iOS 카탈로그에
/// Money/DiamondGem/Package 가 없어 뜻이 가장 가까운 것으로 갈랐고, **여덟 룬이
/// 서로 다른 아이콘** 이라는 계약(화면만 보고 무엇인지 구분 가능)은 지켰다.
private func slotSymbolIcon(_ s: SlotSymbol) -> PixelIconName {
    switch s {
    case .blank:  return .moon          // 웹 Moon
    case .coin:   return .coins         // 웹 Coins
    case .coins:  return .shoppingBag   // 웹 Money — 동전 무더기/주머니
    case .gem:    return .trophy        // 웹 DiamondGem — 최상급 신호
    case .shield: return .shield        // 하락방지권 — 막아선다
    case .cloth:  return .lock          // 소실방지권 — 잠가둔다 (방패와 뜻을 가름)
    case .chest:  return .gift          // 웹 Package — 상자
    case .star:   return .zap           // 웹 Zap — 룬빛 버프
    }
}

/// 회전 중 스쳐 지나갈 얼굴들. 확률과 무관한 순수 장식이다. 웹 `REEL_FACES`.
private let slotReelFaces: [SlotSymbol] = [
    .coin, .cloth, .chest, .coins, .star, .shield, .gem,
]

// MARK: - 색

/// 웹 upHeroPalette GB_LEGEND (#e8b887) — 붉은 금색, 레전드 드롭과 같은 "최상급" 신호.
private let slotLegend = Color(hexString: "#e8b887")
/// 웹 GB_HINT (#6a9a66) — 힌트/보조 텍스트.
private let slotHint = Color(hexString: "#6a9a66")

// MARK: - 햅틱 (웹 sounds.ts HAPTIC_INTENT 의 굴림틀 행)

/// 굴림틀 전용 햅틱 — 레버 rigid / 틱 selection / 착지 light / 꽝 light /
/// small medium / mid medium×2 / big heavy×2 → success. `Haptics.enabled` 를 존중한다.
@MainActor
private enum SlotHaptics {
    /// 공용 `Haptics` 엔 rigid 가 없다 (Capacitor 도 없어 웹은 Heavy 근사). 네이티브는
    /// 진짜 rigid 로 — 짧고 단단한 "철컥".
    private static let rigidGen = UIImpactFeedbackGenerator(style: .rigid)

    static func prepareLever() {
        guard Haptics.enabled else { return }
        rigidGen.prepare()
    }

    static func lever() {
        guard Haptics.enabled else { return }
        rigidGen.impactOccurred()
    }

    static func tick() { Haptics.play(.selection) }
    static func reelStop() { Haptics.play(.light) }

    static func land(_ tier: SlotTier) {
        switch tier {
        case .none:
            Haptics.play(.light)
        case .small:
            Haptics.play(.medium)
        case .mid:
            Haptics.play(.medium)
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.09) { Haptics.play(.medium) }
        case .big:
            Haptics.play(.heavy)
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.09) { Haptics.play(.heavy) }
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.18) { Haptics.play(.success) }
        }
    }
}

/// 티어 → 착지 사운드. 웹 `TIER_SOUND`.
private func slotTierSound(_ tier: SlotTier) -> SoundName {
    switch tier {
    case .none:  return .slotThud
    case .small: return .slotWinSmall
    case .mid:   return .slotWinMid
    case .big:   return .slotWinBig
    }
}

// MARK: - "한 번 더"

/// 결과 모달의 "한 번 더" CTA 배선. 호출자가 남은 스핀 수와 지갑을 넘기면 모달이
/// 게이트를 건다 (spinsLeft > 0 && wallet >= cost). 없으면 CTA 도 없다.
/// `onSpin` 은 호출자가 이 결과를 닫고 새 스핀을 트리거해야 한다. 웹 `spinAgain` prop.
struct SlotSpinAgain {
    var spinsLeft: Int
    var wallet: Int
    var onSpin: () -> Void
}

// MARK: - 모달

struct SlotMachineModal: View {

    let result: SlotResultPayload
    /// 이 굴림 **뒤**의 연속 꽝 스트릭. `UpHeroSlot.isPityArmed` 면 "다음은 반드시
    /// 나와요" 힌트를 띄운다. 값은 스토어(UpHeroState.slotBlankStreak)가 만든다. 표시만.
    var blankStreak: Int = 0
    var spinAgain: SlotSpinAgain? = nil
    let onDismiss: () -> Void

    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    /// 드럼 한 칸 높이(pt). strip offset 계산의 기준. 웹 CELL.
    fileprivate static let cell: CGFloat = 56
    /// 1.4s 기본 스핀에 스쳐 갈 칸 수. 더 긴 스핀은 비례해 늘려 속도감을 유지한다.
    private static let spinCellsPer1400ms = 14
    /// 애니메이션이 끝난 뒤 "섰다" 로 넘기기까지의 여유(ms). 한 프레임 일찍 끊기면 튄다.
    private static let stopSettleMs = 90
    /// 착지 후 자동으로 닫히기까지(초).
    private static let autoDismiss: TimeInterval = 3.0
    /// 레버를 이만큼 끌어내리면 당긴 것으로 본다. 그보다 짧은 탭도 당김이다.
    fileprivate static let leverPullPt: CGFloat = 24

    private enum Phase { case idle, spinning, landed }

    @State private var pulled = false
    @State private var stopped: [Bool] = [false, false, false]
    @State private var remaining: TimeInterval = SlotMachineModal.autoDismiss
    /// 착지 사운드/햅틱은 한 번만.
    @State private var landFired = false
    /// 착지 후 자동 닫힘 타이머. 건너뛰기/닫기에서 정리한다.
    @State private var countdown: Timer?
    /// 스핀 타이머(릴 정지·틱). 건너뛰기에서 전부 취소한다.
    @State private var spinTimers: [DispatchWorkItem] = []

    // 연출 상태
    @State private var dim = false
    @State private var flash = false
    @State private var breathe: CGFloat = 1
    @State private var flare1 = false
    @State private var flare2 = false
    @State private var shake: CGSize = .zero
    @State private var sparks = false

    private var landed: Bool { reduceMotion || stopped.allSatisfy { $0 } }
    private var phase: Phase { landed ? .landed : (pulled ? .spinning : .idle) }
    private var won: Bool { UpHeroSlot.isWin(result.outcome) }
    private var tier: SlotTier { UpHeroSlot.tier(result.outcome) }
    private var nearMiss: Bool { !won && UpHeroSlot.isNearMiss(result.symbols) }
    private var suspense: Bool { UpHeroSlot.hasReelSuspense(result.symbols) }
    private var timings: [Int] { UpHeroSlot.reelTimings(result.symbols) }
    private var pityArmed: Bool { UpHeroSlot.isPityArmed(blankStreak: blankStreak) }
    private var canSpinAgain: Bool {
        guard let spinAgain else { return false }
        return spinAgain.spinsLeft > 0 && spinAgain.wallet >= result.cost
    }
    private var showFx: Bool { landed && !reduceMotion }
    private var accent: Color {
        won ? (tier == .big ? slotLegend : GBPalette.lightest) : GBPalette.light
    }

    // MARK: 문구

    private var resultText: String {
        UpHeroNarrative.resolveLog(
            "uphero.slot.result.\(result.outcome.rawValue)", nil,
            fallback: "")
    }

    /// 수치로 안 잡히는 보상까지 한 줄로. 웹 rewardLabel 과 같은 우선순위.
    private var rewardLabel: String? {
        guard won else { return nil }
        if let c = result.coins, c > 0 {
            return UpHeroNarrative.resolveLog(
                "uphero.slot.reward.coins", ["n": .number(Double(c))], fallback: "+\(c)")
        }
        if let n = result.destroyGuards, n > 0 {
            return UpHeroNarrative.resolveLog(
                "uphero.slot.reward.destroyGuard", ["n": .number(Double(n))], fallback: "+\(n)")
        }
        if let n = result.downGuards, n > 0 {
            return UpHeroNarrative.resolveLog(
                "uphero.slot.reward.downGuard", ["n": .number(Double(n))], fallback: "+\(n)")
        }
        if let pct = result.buffPct, let battles = result.buffBattles {
            return UpHeroNarrative.resolveLog(
                "uphero.slot.reward.buff",
                ["pct": .number(Double(pct)), "battles": .number(Double(battles))],
                fallback: "+\(pct)%")
        }
        if result.outcome == .itemBox {
            return UpHeroNarrative.resolveLog("uphero.slot.reward.itemBox", nil, fallback: "+1")
        }
        return nil
    }

    private var backdropLabel: String {
        switch phase {
        case .idle:     return AppConfig.loc("uphero.slot.lever.aria")
        case .spinning: return AppConfig.loc("uphero.slot.aria.skip")
        case .landed:   return AppConfig.loc("uphero.slot.aria.dismiss")
        }
    }

    // MARK: 본문

    var body: some View {
        ZStack {
            // 백드롭 — idle 은 당김, 회전 중 탭은 건너뛰기, 착지 후 탭은 닫기.
            GBPalette.darkest.opacity(0.87)
                .ignoresSafeArea()
                .contentShape(Rectangle())
                .onTapGesture { primaryAction() }
                // Color 는 기본적으로 접근성 요소가 아니다 — 명시적으로 요소로 만들고
                // 동작까지 붙여야 VoiceOver 에서 백드롭 탭이 실제로 먹는다.
                .accessibilityElement()
                .accessibilityLabel(Text(backdropLabel))
                .accessibilityAddTraits(.isButton)
                .accessibilityAction { primaryAction() }

            // big 티어 — 픽셀 스파크 낙하. 카드 위를 지나 떨어진다.
            if sparks {
                SlotSparks(color: slotLegend)
                    .ignoresSafeArea()
                    .allowsHitTesting(false)
                    .accessibilityHidden(true)
            }

            card
                .frame(maxWidth: 320)
                .padding(.horizontal, 24)
        }
        // 루트 셰이크 — big 티어 300ms, ±2pt. 카드·배경·스파크가 함께 흔들린다.
        .offset(shake)
        .onAppear(perform: start)
        .onDisappear {
            countdown?.invalidate()
            spinTimers.forEach { $0.cancel() }
        }
    }

    private var card: some View {
        VStack(spacing: 0) {
            header
            drums
            resultBlock
            footer
        }
        .background(GBPalette.darkest, in: RoundedRectangle(cornerRadius: 10))
        // 보더 대신 톤 글로우. 착지하면 결과 색으로 번진다.
        .shadow(color: accent.opacity(landed ? 0.28 : 0), radius: 11)
        .shadow(color: GBPalette.darkest.opacity(0.8), radius: 16, y: 12)
        .animation(.easeOut(duration: 0.24), value: landed)
        // 모달로 선언해 VoiceOver 가 뒤쪽 탐험 화면을 읽지 않게 한다. 자식은 묶지
        // 않는다 — 묶으면 버튼이 개별 요소로 잡히지 않아 조작이 막힌다.
        // 드럼은 장식이라 그쪽에서 accessibilityHidden 으로 뺀다.
        .accessibilityAddTraits(.isModal)
    }

    private var header: some View {
        HStack {
            Text(AppConfig.loc("uphero.slot.title"))
                .typography(.micro)
                .tracking(1.2)
                .foregroundStyle(GBPalette.light)
            Spacer()
            // 들어간 코인. 순손익을 숨기지 않는다.
            Text(UpHeroNarrative.resolveLog(
                "uphero.slot.stake", ["cost": .number(Double(result.cost))],
                fallback: "−\(result.cost)"))
                .typography(.micro)
                .monospacedDigit()
                .foregroundStyle(slotHint)
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 8)
    }

    private var drums: some View {
        ZStack {
            HStack(spacing: 8) {
                ForEach(0..<3, id: \.self) { i in
                    SlotDrum(
                        faces: strip(for: i),
                        phase: (stopped[i] || landed) ? .stopped : (phase == .spinning ? .spinning : .idle),
                        durationMs: timings[i],
                        suspense: i == 2 && suspense,
                        highlight: landed && won,
                        highlightColor: accent,
                        overshoot: i == 2 && nearMiss && !reduceMotion,
                        crossfade: reduceMotion,
                        cell: Self.cell)
                }
                SlotLever(phase: leverPhase, onPull: pull)
            }
            // 보상 착지 플레어 — mid 이상. 사각 아웃라인이 한 번 퍼졌다 사라진다.
            // 픽셀 결을 지키려고 원이 아니라 정사각이다.
            if showFx && (tier == .mid || tier == .big) {
                Rectangle()
                    .strokeBorder(accent, lineWidth: 2)
                    .frame(width: 96, height: 60)
                    .scaleEffect(flare1 ? 1.8 : 0.6)
                    .opacity(flare1 ? 0 : 0.9)
                    .allowsHitTesting(false)
            }
            if showFx && tier == .big {
                Rectangle()
                    .strokeBorder(accent, lineWidth: 2)
                    .frame(width: 96, height: 60)
                    .scaleEffect(flare2 ? 1.8 : 0.6)
                    .opacity(flare2 ? 0 : 0.9)
                    .allowsHitTesting(false)
            }
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 20)
        // 꽝 디밍(−15%) / small 플래시 / mid·big 숨쉬기 — 프레임 단위 연출.
        .brightness(dim ? -0.15 : (flash ? 0.35 : 0))
        .scaleEffect(breathe)
        .accessibilityHidden(true)
    }

    private var leverPhase: SlotLever.Phase {
        switch phase {
        case .idle:     return .armed
        case .spinning: return .pulled
        case .landed:   return .released
        }
    }

    private var resultBlock: some View {
        VStack(spacing: 8) {
            if landed && tier == .big {
                SlotBigCopy(text: AppConfig.loc("uphero.slot.big"), color: slotLegend,
                            animate: !reduceMotion)
            }
            if landed && nearMiss {
                Text(AppConfig.loc("uphero.slot.nearMiss"))
                    .typography(.caption)
                    .fontWeight(.semibold)
                    .tracking(0.8)
                    .foregroundStyle(GBPalette.light)
                    .transition(popTransition)
            }
            // 본문은 페이드만 — 읽는 중에 글자가 움직이지 않는다.
            Text(resultText)
                .typography(.body)
                .foregroundStyle(won ? GBPalette.lightest : GBPalette.light)
                .multilineTextAlignment(.center)
                .fixedSize(horizontal: false, vertical: true)
                .opacity(landed ? 1 : 0)
                .animation(.easeOut(duration: 0.22), value: landed)
                // 착지 전에는 결과가 없으므로 읽히지 않아야 한다 (웹 aria-live 대응).
                .accessibilityHidden(!landed)

            if landed, let rewardLabel {
                Text(rewardLabel)
                    .typography(.caption)
                    .monospacedDigit()
                    .fontWeight(.bold)
                    .foregroundStyle(GBPalette.darkest)
                    .padding(.horizontal, 10)
                    .padding(.vertical, 3)
                    .background(tier == .big ? slotLegend : GBPalette.lightest,
                                in: RoundedRectangle(cornerRadius: 4))
                    .transition(popTransition)
            }

            // 투명 pity — 다음 굴림이 보장되면 숨기지 않고 말한다.
            if landed && pityArmed {
                HStack(spacing: 6) {
                    PixelIcon(.sparkle, size: 12, color: GBPalette.lightest)
                    Text(AppConfig.loc("uphero.slot.pityHint"))
                        .typography(.caption)
                        .foregroundStyle(GBPalette.lightest)
                }
                .transition(popTransition)
            }
        }
        .frame(minHeight: 44)
        .padding(.horizontal, 16)
        .padding(.top, 4)
        .padding(.bottom, 12)
        .animation(reduceMotion ? .easeOut(duration: 0.2)
                                : .spring(response: 0.3, dampingFraction: 0.6),
                   value: landed)
    }

    private var popTransition: AnyTransition {
        reduceMotion ? .opacity : .scale(scale: 0.8).combined(with: .opacity)
    }

    private var footer: some View {
        HStack(spacing: 10) {
            // 자동 닫힘 카운트다운. 남은 시간을 숨기지 않는다.
            GeometryReader { geo in
                ZStack(alignment: .leading) {
                    Capsule().fill(GBPalette.dark)
                    Capsule().fill(accent)
                        .frame(width: landed
                               ? geo.size.width * CGFloat(remaining / Self.autoDismiss)
                               : 0)
                }
            }
            .frame(height: 2)
            .accessibilityHidden(true)

            // "한 번 더" — 남은 스핀·코인이 있을 때만.
            if landed && canSpinAgain, let spinAgain {
                Button {
                    countdown?.invalidate()
                    spinAgain.onSpin()
                } label: {
                    VStack(spacing: 1) {
                        Text(AppConfig.loc("uphero.slot.again"))
                            .typography(.caption)
                            .fontWeight(.semibold)
                            .foregroundStyle(GBPalette.lightest)
                        Text(UpHeroNarrative.resolveLog(
                            "uphero.slot.spinsLeft",
                            ["n": .number(Double(spinAgain.spinsLeft))],
                            fallback: "\(spinAgain.spinsLeft)"))
                            .typography(.micro)
                            .monospacedDigit()
                            .foregroundStyle(GBPalette.light)
                    }
                    .padding(.horizontal, 12)
                    .frame(minHeight: 44)
                    .background(GBPalette.dark, in: RoundedRectangle(cornerRadius: 6))
                }
                .buttonStyle(.plain)
                .transition(.opacity)
            }

            Button(action: primaryAction) {
                Text(primaryLabel)
                    .typography(.caption)
                    .fontWeight(.semibold)
                    .foregroundStyle(landed ? GBPalette.darkest : GBPalette.light)
                    .padding(.horizontal, 14)
                    .frame(minHeight: 44)
                    .background(landed ? accent : GBPalette.dark,
                                in: RoundedRectangle(cornerRadius: 6))
            }
            .buttonStyle(.plain)
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 10)
    }

    private var primaryLabel: String {
        switch phase {
        case .idle:     return AppConfig.loc("uphero.slot.lever.aria")
        case .spinning: return AppConfig.loc("uphero.slot.skip")
        // 계속 라벨은 전투 쪽 기존 키를 재사용한다 — 같은 뜻의 키를 새로 만들면
        // 번역이 두 곳으로 갈린다.
        case .landed:   return AppConfig.loc("uphero.combat.continue")
        }
    }

    // MARK: 드럼 strip

    /// 각 드럼의 strip — 장식 얼굴 n 개 + 마지막 칸이 실제 결과.
    /// 결정론적으로 만든다 (난수 없음) — 리렌더마다 얼굴이 바뀌면 깜빡인다.
    /// 긴 스핀(서스펜스)은 칸을 비례해 늘려 "느려지는데 계속 도는" 느낌을 낸다.
    private func strip(for drum: Int) -> [SlotSymbol] {
        let cells = Int((Double(Self.spinCellsPer1400ms) * Double(timings[drum]) / 1400).rounded())
        var faces: [SlotSymbol] = []
        for i in 0..<cells {
            faces.append(slotReelFaces[(i * 3 + drum * 2) % slotReelFaces.count])
        }
        faces.append(result.symbols[drum])
        return faces
    }

    // MARK: 타이밍

    private func start() {
        SlotHaptics.prepareLever()
        if reduceMotion {
            // 회전 자체를 건너뛴다. 세 칸이 처음부터 결과 상태 (200ms 크로스페이드는 드럼이).
            stopped = [true, true, true]
            land()
        }
    }

    /// 레버 당김 — 스핀 시작. 결과는 이미 정해져 있다. 두 번 당겨도 한 번만.
    private func pull() {
        guard phase == .idle else { return }
        SoundPlayer.shared.play(.slotLever)
        SlotHaptics.lever()
        pulled = true
        scheduleSpin()
    }

    /// 드럼 착지 타이머 + 서스펜스 틱. 전부 스핀 시작(당김) 기준.
    /// 애니메이션은 당김 다음 커밋에 시작하므로 duration 과 정확히 같게 잡으면
    /// 한 프레임 일찍 끊겨 미세하게 튄다. 여유(stopSettleMs)를 준다.
    private func scheduleSpin() {
        var items: [DispatchWorkItem] = []
        for (i, ms) in timings.enumerated() {
            let item = DispatchWorkItem {
                guard !stopped[i] else { return }
                // 릴1·릴2 착지음. 릴3 는 티어 사운드가 대신한다 (land).
                if i < 2 {
                    SoundPlayer.shared.play(.slotStop)
                    SlotHaptics.reelStop()
                }
                stopped[i] = true
                if landed { land() }
            }
            items.append(item)
            DispatchQueue.main.asyncAfter(
                deadline: .now() + Double(ms + Self.stopSettleMs) / 1000, execute: item)
        }
        // 감속 틱 — 릴2 정지 뒤부터 릴3 착지까지, 간격이 벌어진다.
        // 마지막 틱은 착지음과 겹치므로 생략.
        let t3 = timings[2]
        for at in UpHeroSlot.suspenseTickTimes(result.symbols) where at < t3 {
            let item = DispatchWorkItem {
                guard !landed else { return }
                SoundPlayer.shared.play(.slotTick)
                SlotHaptics.tick()
            }
            items.append(item)
            DispatchQueue.main.asyncAfter(deadline: .now() + Double(at) / 1000, execute: item)
        }
        spinTimers = items
    }

    /// 세 칸이 다 선 순간 — 소리·햅틱·티어 연출·자동 닫힘 카운트다운을 한 번만 건다.
    private func land() {
        guard !landFired else { return }
        landFired = true
        spinTimers.forEach { $0.cancel() }
        spinTimers = []

        SoundPlayer.shared.play(slotTierSound(tier))
        SlotHaptics.land(tier)
        if !reduceMotion { runTierFx() }

        let startedAt = Date()
        countdown?.invalidate()
        countdown = Timer.scheduledTimer(withTimeInterval: 1.0 / 30, repeats: true) { t in
            let left = Self.autoDismiss - Date().timeIntervalSince(startedAt)
            Task { @MainActor in
                remaining = max(0, left)
                if left <= 0 {
                    t.invalidate()
                    onDismiss()
                }
            }
        }
    }

    /// 티어별 착지 연출 (웹 keyframes 의 타이밍을 그대로 옮겼다).
    private func runTierFx() {
        switch tier {
        case .none:
            // 꽝 — 프레임이 15% 어두워졌다 돌아온다 (250ms: 20% 지점까지 내려가 70% 까지 유지).
            withAnimation(.easeOut(duration: 0.05)) { dim = true }
            after(0.175) { withAnimation(.easeOut(duration: 0.075)) { dim = false } }
        case .small:
            // 명도 플래시 2프레임 (120ms: 15%~30% 구간 밝게).
            after(0.018) { flash = true }
            after(0.036) { withAnimation(.linear(duration: 0.084)) { flash = false } }
        case .mid:
            // 한 번 숨을 쉰다 (420ms, 40% 지점에서 1.04) + 사각 링 1회.
            withAnimation(.easeOut(duration: 0.17)) { breathe = 1.04 }
            after(0.17) { withAnimation(.easeOut(duration: 0.25)) { breathe = 1.0 } }
            withAnimation(.easeOut(duration: 0.52)) { flare1 = true }
        case .big:
            // 더 크게 숨 쉬고(520ms, 1.07) 링이 두 번 퍼진다. 셰이크는 루트에, 스파크는 화면 전체에.
            withAnimation(.easeOut(duration: 0.18)) { breathe = 1.07 }
            after(0.18) { withAnimation(.easeOut(duration: 0.34)) { breathe = 1.0 } }
            withAnimation(.easeOut(duration: 0.52)) { flare1 = true }
            after(0.14) { withAnimation(.easeOut(duration: 0.76)) { flare2 = true } }
            sparks = true
            runShake()
        }
    }

    /// 루트 셰이크 — 300ms 동안 ±2pt (웹 slot-shake 키프레임: 15/30/45/60/75/90%).
    private func runShake() {
        let frames: [(Double, CGSize)] = [
            (0.045, CGSize(width: 2, height: -1)),
            (0.090, CGSize(width: -2, height: 1)),
            (0.135, CGSize(width: 2, height: 1)),
            (0.180, CGSize(width: -2, height: -1)),
            (0.225, CGSize(width: 1, height: 0)),
            (0.270, CGSize(width: -1, height: 0)),
            (0.300, .zero),
        ]
        for (t, off) in frames {
            after(t) { withAnimation(.linear(duration: 0.045)) { shake = off } }
        }
    }

    private func after(_ seconds: Double, _ body: @escaping () -> Void) {
        DispatchQueue.main.asyncAfter(deadline: .now() + seconds, execute: body)
    }

    /// idle 이면 당김, 회전 중이면 건너뛰기(남은 드럼 즉시 정지), 착지 후면 닫기.
    private func primaryAction() {
        switch phase {
        case .idle:
            pull()
        case .spinning:
            Haptics.play(.selection)
            spinTimers.forEach { $0.cancel() }
            spinTimers = []
            stopped = [true, true, true]
            land()
        case .landed:
            countdown?.invalidate()
            onDismiss()
        }
    }
}

// MARK: - 드럼 한 칸

/// strip 을 통째로 위로 밀어 올려 마지막 칸(결과)에 세우는 방식.
/// 마지막 얼굴이 결과라서, 애니메이션이 끝나면 창에 남는 건 언제나 실제 결과다.
/// 중간에 멈춰도(건너뛰기) 애니메이션 없이 결과 칸으로 스냅되므로 어긋날 수 없다.
///
///  - idle     : 첫 장식 얼굴이 보인다. 애니메이션 없음.
///  - spinning : 결과 칸으로 이징 (`durationMs`, 기본 (0.16,0.84,0.24,1) / 서스펜스 (0.1,0.9,0.2,1)).
///  - stopped  : 결과 칸에 고정. `overshoot` 면 3pt 아래서 튕겨 올라온다 (near-miss).
///  - crossfade: reduce-motion — 결과 칸에 고정된 채 200ms 페이드인.
private struct SlotDrum: View {
    enum Phase { case idle, spinning, stopped }

    let faces: [SlotSymbol]
    let phase: Phase
    let durationMs: Int
    let suspense: Bool
    let highlight: Bool
    let highlightColor: Color
    let overshoot: Bool
    let crossfade: Bool
    let cell: CGFloat

    /// near-miss 착지 — 3pt 아래로 넘쳤다가 제자리. "덜컹" 한 번.
    @State private var bounce: CGFloat = 0
    @State private var faded = false

    private var finalOffset: CGFloat { -CGFloat(faces.count - 1) * cell }

    private var spinAnimation: Animation {
        let d = Double(durationMs) / 1000
        return suspense
            ? .timingCurve(0.1, 0.9, 0.2, 1, duration: d)
            : .timingCurve(0.16, 0.84, 0.24, 1, duration: d)
    }

    var body: some View {
        ZStack {
            VStack(spacing: 0) {
                ForEach(Array(faces.enumerated()), id: \.offset) { _, face in
                    PixelIcon(slotSymbolIcon(face), size: 26,
                              color: highlight ? highlightColor : GBPalette.light)
                        .frame(width: cell, height: cell)
                }
            }
            .offset(y: (phase == .idle ? 0 : finalOffset) + bounce)
            .animation(phase == .spinning ? spinAnimation : nil, value: phase)
            // 건너뛰기: 진행 중인 이징을 끊고 결과 칸에 즉시 스냅 — 뷰 identity 를 바꿔 끊는다.
            .id(phase == .stopped)
            .opacity(crossfade && !faded ? 0 : 1)

            // 위아래 가림막 — 드럼이 통 안에서 도는 느낌.
            VStack {
                LinearGradient(colors: [GBPalette.darkest, .clear],
                               startPoint: .top, endPoint: .bottom)
                    .frame(height: 8)
                Spacer()
                LinearGradient(colors: [GBPalette.darkest, .clear],
                               startPoint: .bottom, endPoint: .top)
                    .frame(height: 8)
            }
            .allowsHitTesting(false)
        }
        .frame(width: cell, height: cell)
        .background(GBPalette.dark.opacity(0.35), in: RoundedRectangle(cornerRadius: 3))
        .clipShape(RoundedRectangle(cornerRadius: 3))
        // 보더 대신 글로우 — 세 칸이 맞으면 결과 색으로 살짝 번진다.
        .shadow(color: highlight ? highlightColor.opacity(0.45) : .clear, radius: 4)
        .animation(.easeOut(duration: 0.2), value: highlight)
        .onAppear {
            if crossfade {
                withAnimation(.linear(duration: 0.2)) { faded = true }
            }
        }
        .onChange(of: phase) { p in
            guard p == .stopped, overshoot else { return }
            bounce = 3
            withAnimation(.timingCurve(0.16, 0.84, 0.24, 1, duration: 0.18)) { bounce = 0 }
        }
    }
}

// MARK: - 레버

/// 픽셀 레버. 세로 트랙 위의 손잡이를 끌어내리거나 탭하면 `onPull`.
/// 당긴 뒤에는 손잡이가 내려간 채 머물다(spinning) 착지하면 스프링으로 돌아온다.
/// 제스처: `leverPullPt` 이상 아래로 끌면 당김. 그 전에 손을 떼도 탭으로 간주해
/// 당김 — 아무도 여기서 막히지 않는다.
private struct SlotLever: View {
    enum Phase { case armed, pulled, released }

    let phase: Phase
    let onPull: () -> Void

    @State private var drag: CGFloat = 0
    @State private var firedThisGesture = false

    private var armed: Bool { phase == .armed }
    private var travel: CGFloat { SlotMachineModal.leverPullPt + 6 }

    private var knobY: CGFloat {
        switch phase {
        case .pulled:   return travel
        case .released: return 0
        case .armed:    return drag
        }
    }

    var body: some View {
        ZStack(alignment: .top) {
            // 트랙
            RoundedRectangle(cornerRadius: 1)
                .fill(GBPalette.dark)
                .frame(width: 4)
                .padding(.vertical, 4)
            // 손잡이 — 픽셀 정사각
            Rectangle()
                .fill(armed ? GBPalette.lightest : GBPalette.light)
                .frame(width: 14, height: 14)
                .offset(y: 4 + knobY)
                .animation(phase == .released
                           ? .spring(response: 0.42, dampingFraction: 0.6)
                           : .easeOut(duration: 0.12), value: phase)
        }
        .frame(width: 22, height: SlotMachineModal.cell)
        .contentShape(Rectangle())
        .opacity(armed ? 1 : 0.55)
        .animation(.easeOut(duration: 0.24), value: armed)
        .gesture(
            DragGesture(minimumDistance: 0)
                .onChanged { v in
                    guard armed, !firedThisGesture else { return }
                    let dy = max(0, min(travel, v.translation.height))
                    drag = dy
                    if dy >= SlotMachineModal.leverPullPt {
                        firedThisGesture = true
                        onPull()
                    }
                }
                .onEnded { _ in
                    guard armed else { return }
                    if !firedThisGesture { onPull() }   // 짧은 탭도 당김
                    firedThisGesture = false
                    drag = 0
                }
        )
        .accessibilityElement()
        .accessibilityLabel(Text(AppConfig.loc("uphero.slot.lever.aria")))
        .accessibilityAddTraits(.isButton)
        .accessibilityHidden(!armed)
        .accessibilityAction { if armed { onPull() } }
    }
}

// MARK: - big 카피

/// "대박!" — 팝 진입 뒤 글로우가 두 번 맥동한다 (웹 slot-big-glow 900ms ×2).
private struct SlotBigCopy: View {
    let text: String
    let color: Color
    let animate: Bool

    @State private var glow = false

    var body: some View {
        Text(text)
            .typography(.caption)
            .fontWeight(.bold)
            .tracking(1.6)
            .foregroundStyle(color)
            .shadow(color: color.opacity(glow ? 0.65 : 0), radius: glow ? 6 : 0)
            .transition(animate ? .scale(scale: 0.8).combined(with: .opacity) : .opacity)
            .onAppear {
                guard animate else { return }
                withAnimation(.easeInOut(duration: 0.9).repeatCount(4, autoreverses: true)
                    .delay(0.34)) {
                    glow = true
                }
            }
    }
}

// MARK: - big 스파크

/// big 티어 픽셀 스파크 12개 — 화면 위에서 300pt 낙하하며 좌우로 살짝 흐른다 (900ms).
/// 좌표를 고정해 리렌더 튐을 막는다. 웹 `SPARKS`.
private struct SlotSparks: View {
    let color: Color

    private static let sparks: [(x: CGFloat, delay: Double, s: CGFloat, drift: CGFloat)] = [
        (0.08, 0.00, 3, 6), (0.17, 0.09, 2, -5), (0.26, 0.04, 4, 8), (0.35, 0.16, 2, -7),
        (0.44, 0.02, 3, 4), (0.52, 0.12, 2, -4), (0.60, 0.07, 4, 7), (0.68, 0.20, 3, -6),
        (0.76, 0.03, 2, 5), (0.84, 0.14, 3, -8), (0.91, 0.06, 2, 6), (0.97, 0.18, 3, -5),
    ]

    var body: some View {
        GeometryReader { geo in
            ForEach(Array(Self.sparks.enumerated()), id: \.offset) { _, p in
                SlotSpark(color: color, size: p.s, drift: p.drift, delay: p.delay)
                    .position(x: geo.size.width * p.x, y: -6)
            }
        }
    }
}

private struct SlotSpark: View {
    let color: Color
    let size: CGFloat
    let drift: CGFloat
    let delay: Double

    @State private var fall = false
    @State private var visible = false

    var body: some View {
        Rectangle()
            .fill(color)
            .frame(width: size, height: size)
            .offset(x: fall ? drift : 0, y: fall ? 300 : 0)
            .opacity(visible ? 1 : 0)
            .onAppear {
                withAnimation(.timingCurve(0.3, 0, 0.7, 1, duration: 0.9).delay(delay)) {
                    fall = true
                }
                withAnimation(.linear(duration: 0.11).delay(delay)) { visible = true }
                withAnimation(.linear(duration: 0.18).delay(delay + 0.72)) { visible = false }
            }
    }
}

#Preview("대박") {
    ZStack {
        Color.bgPrimary.ignoresSafeArea()
        SlotMachineModal(
            result: SlotResultPayload(
                outcome: .coinJackpot,
                symbols: [.gem, .gem, .gem],
                coins: 700),
            spinAgain: SlotSpinAgain(spinsLeft: 2, wallet: 900, onSpin: {}),
            onDismiss: {})
    }
}

#Preview("near-miss") {
    ZStack {
        Color.bgPrimary.ignoresSafeArea()
        SlotMachineModal(
            result: SlotResultPayload(
                outcome: .blank,
                symbols: [.gem, .gem, .coin]),
            blankStreak: 4,
            onDismiss: {})
    }
}

#Preview("꽝") {
    ZStack {
        Color.bgPrimary.ignoresSafeArea()
        SlotMachineModal(
            result: SlotResultPayload(
                outcome: .blank,
                symbols: [.cloth, .coins, .coin]),
            onDismiss: {})
    }
}

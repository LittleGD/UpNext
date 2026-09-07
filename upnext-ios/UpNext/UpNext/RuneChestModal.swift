//
//  RuneChestModal.swift
//  Up Hero — 룬 상자(rune chest) 연출 모달. 웹 `RuneChestModal.tsx` 1:1 이식.
//
//  **기본 보상은 이미 확정돼 있다.** 세션 배선(`UpHeroSession.applySpinSlot`)이 롤·지급까지
//  끝낸 상태로 로그 엔트리에 실어 보낸다. 이 뷰가 하는 일은 두 가지다:
//    1. 상자를 여는 짧은 조작(룬 자물쇠 걸쇠 맞추기)을 받는다.
//    2. 그 등급을 `onResolveLock` 으로 돌려준다 — 스토어가 `resolveRuneLock` 으로
//       코인 보너스 차액만 얹는다.
//  여기서 세션 RNG 를 굴리는 코드는 한 줄도 없다. 목표 위치와 표식 속도는 표시 전용
//  난수(`Double.random`)이고 저장되지 않는다.
//
//  ── 왜 조작이 있는가 (2026-09, 애플 2.3.6) ─────────────────────────────
//
//  이전 판은 룬 드럼 세 개가 돌아가는 장치였고, 개인 개발자 계정의 simulated gambling
//  금지(가이드라인 2.3.6)에 걸려 1.3.0 이 거절됐다. 돌아가는 드럼을 그냥 지우면
//  "코인 넣으면 결과가 뜬다" 는 밋밋한 상자만 남는다. 그래서 도파민을 확률이 아니라
//  **내 손끝**에 옮겼다: 표식을 노려 멈추면 보상이 최대 +30% 늘어난다. 확률표는
//  바뀌지 않고, 빗나가도 상자는 열린다 (실패 상태 없음).
//
//  흐름: lock(걸쇠 맞추기) → opening(뚜껑 420ms) → revealed(보상 + 3초 자동 닫힘).
//   - 트랙 자체가 버튼이다. 탭이 곧 "멈춤" 이고, 배경 탭도 같은 동작이다.
//   - reduce-motion: 왕복 주기를 2배로 늘리고(= 절반 속도) 셰이크·플래시를 뺀다.
//     **자동 해소하지 않는다** — 조작은 그대로 살아 있어야 공정하다.
//   - 앱이 백그라운드로 가면 여기서 `.plain`(보너스 0)으로 마감한다. 조작 없이 닫히는
//     경로는 **호출자**(DungeonView)가 닫기 액션에서 `.plain` 을 부른다 — `onDisappear`
//     에 두면 화면 전환에서 오발된다. 두 경로 모두 스토어 쪽이 멱등해 중복되지 않는다.
//   - pity: 스트릭이 임계에 닿았으면 "다음은 반드시 나와요". 값은 스토어가 만든다.
//   - "한 번 더": 남은 횟수·코인이 있을 때만 CTA 가 뜬다.
//

import SwiftUI
import UIKit

// MARK: - 색

/// 웹 upHeroPalette GB_LEGEND (#e8b887) — 붉은 금색, 레전드 드롭과 같은 "최상급" 신호.
private let chestLegend = Color(hexString: "#e8b887")
/// 웹 GB_HINT (#6a9a66) — 힌트/보조 텍스트.
private let chestHint = Color(hexString: "#6a9a66")

// MARK: - 소리 / 햅틱

/// 티어 → 보상 등장 사운드. 카지노 큐(릴·잭팟)는 전부 걷어내고 기존 상자/수집/확인
/// 계열만 재사용한다. 웹 `TIER_SOUND`.
private func chestTierSound(_ tier: SlotTier) -> SoundName {
    switch tier {
    case .none:  return .collect
    case .small: return .rewardChoose
    case .mid:   return .packOpen
    case .big:   return .levelUp
    }
}

/// 상자 연출 햅틱. 걸쇠 멈춤은 짧고 단단한 rigid 한 번, 보상은 티어별로 갈린다.
@MainActor
private enum ChestHaptics {
    /// 공용 `Haptics` 엔 rigid 가 없다 (웹은 Heavy 근사). 네이티브는 진짜 rigid 로.
    private static let rigidGen = UIImpactFeedbackGenerator(style: .rigid)

    static func prepare() {
        guard Haptics.enabled else { return }
        rigidGen.prepare()
    }

    /// 걸쇠가 멈추는 순간 — "철컥".
    static func stop() {
        guard Haptics.enabled else { return }
        rigidGen.impactOccurred()
    }

    static func reveal(_ tier: SlotTier) {
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

// MARK: - "한 번 더"

/// 결과 모달의 "한 번 더" CTA 배선. 호출자가 남은 횟수와 지갑을 넘기면 모달이 게이트를
/// 건다 (chestsLeft > 0 && wallet >= cost). 없으면 CTA 도 없다. 웹 `openAgain` prop.
struct RuneChestOpenAgain {
    var chestsLeft: Int
    var wallet: Int
    var onOpen: () -> Void
}

// MARK: - 모달

struct RuneChestModal: View {

    let result: SlotResultPayload
    /// 이 상자 **뒤**의 연속 꽝 스트릭. `UpHeroSlot.isPityArmed` 면 "다음은 반드시
    /// 나와요" 힌트를 띄운다. 값은 스토어(UpHeroState.slotBlankStreak)가 만든다. 표시만.
    var blankStreak: Int = 0
    var openAgain: RuneChestOpenAgain? = nil
    /// 걸쇠 등급 확정. 조작을 끝냈을 때, 또는 앱이 백그라운드로 갔을 때 호출된다.
    /// 스토어가 보너스 차액을 얹는다 (같은 상자를 두 번 해소하지 않는 멱등 계약).
    let onResolveLock: (RuneLockTier) -> Void
    /// 닫기. 조작 없이 닫히는 경우를 대비해 **호출자가 여기서 `onResolveLock(.plain)`
    /// 도 함께 불러야 한다** — 세션에 미해소 상자를 남기지 않기 위해서다.
    let onDismiss: () -> Void

    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    /// 뚜껑이 열리는 데 걸리는 시간(초). 결과가 붙기 전의 짧은 숨.
    private static let openSeconds: TimeInterval = 0.42
    private static let openSecondsReduced: TimeInterval = 0.16
    /// 보상이 뜬 뒤 자동으로 닫히기까지(초).
    private static let autoDismiss: TimeInterval = 3.0
    /// 표식 왕복 주기(초) 범위. 매번 조금씩 달라 외워서 누를 수 없다.
    private static let sweepMin: Double = 1.0
    private static let sweepMax: Double = 1.4
    /// reduce-motion 배수 — 주기를 2배로 늘리면 속도가 절반이 된다.
    private static let sweepReducedMult: Double = 2

    private enum Phase { case lock, opening, revealed }

    /// 목표 중심(0~1)과 왕복 주기(초). **표시 전용 난수** — 세션 RNG 를 쓰지 않고
    /// 저장하지도 않는다. 뷰 생성 시 한 번 뽑고 리렌더로 흔들리지 않는다.
    @State private var track: (center: Double, period: Double) = RuneChestModal.rollTrack()
    /// 표식 왕복의 기준 시각. 탭한 순간의 위치를 여기서 역산한다 (프레임마다 상태를
    /// 쓰지 않는다 — 그 비용이 곧 조준 지연이 된다).
    @State private var sweepStart = Date()
    @State private var phase: Phase = .lock
    @State private var lockTier: RuneLockTier?
    /// 등급 확정은 정확히 한 번. 조작으로도, 백그라운드로도 여기로 모인다.
    @State private var resolved = false
    @State private var remaining: TimeInterval = RuneChestModal.autoDismiss
    @State private var countdown: Timer?
    @State private var revealFired = false

    // 연출 상태
    @State private var flash = false
    @State private var breathe: CGFloat = 1
    @State private var flare1 = false
    @State private var flare2 = false
    @State private var shake: CGSize = .zero
    @State private var sparks = false

    /// 목표대가 트랙 밖으로 삐져나오지 않도록 중심을 접는 여유. 웹 `CENTER_MARGIN`.
    private static let centerMargin = UpHeroSlot.runeLockOuterHalf + 0.06

    private static func rollTrack() -> (center: Double, period: Double) {
        (center: centerMargin + Double.random(in: 0...1) * (1 - centerMargin * 2),
         period: sweepMin + Double.random(in: 0...1) * (sweepMax - sweepMin))
    }

    private var period: Double {
        reduceMotion ? track.period * Self.sweepReducedMult : track.period
    }

    /// 삼각파 — 0 → 1 → 0 왕복. 웹 `sweepPosition`.
    private func markerPosition(at date: Date) -> Double {
        let t = date.timeIntervalSince(sweepStart).truncatingRemainder(dividingBy: period) / period
        return t < 0.5 ? t * 2 : 2 - t * 2
    }

    private var won: Bool { UpHeroSlot.isWin(result.outcome) }
    private var tier: SlotTier { UpHeroSlot.tier(result.outcome) }
    private var pityArmed: Bool { UpHeroSlot.isPityArmed(blankStreak: blankStreak) }
    private var revealed: Bool { phase == .revealed }
    private var opened: Bool { phase != .lock }
    private var showFx: Bool { revealed && !reduceMotion }
    private var canOpenAgain: Bool {
        guard let openAgain else { return false }
        return openAgain.chestsLeft > 0 && openAgain.wallet >= result.cost
    }
    private var accent: Color {
        revealed && won ? (tier == .big ? chestLegend : GBPalette.lightest) : GBPalette.light
    }

    // MARK: 문구

    private var resultText: String {
        UpHeroNarrative.resolveLog(
            "uphero.slot.result.\(result.outcome.rawValue)", nil, fallback: "")
    }

    /// 걸쇠 등급 한 줄. **키를 문자열 보간으로 만들 때 `AppConfig.loc` 를 쓰면 안 된다** —
    /// `String.LocalizationValue` 가 보간 자리를 %@ 로 바꿔 "uphero.slot.lock.%@" 를 찾다가
    /// 못 찾고 조립된 키를 그대로 화면에 뱉는다 (시뮬레이터에서 실제로 그렇게 샜다).
    /// 결과 문구와 같은 `resolveLog(_: String, ...)` 경로로 통일한다.
    private var lockLine: String? {
        guard let lockTier else { return nil }
        let line = UpHeroNarrative.resolveLog(
            "uphero.slot.lock.\(lockTier.rawValue)", nil, fallback: "")
        return line.isEmpty ? nil : line
    }

    private var bonusPercent: Int {
        guard let lockTier else { return 0 }
        return UpHeroSlot.runeLockBonusPercent(lockTier)
    }

    /// 등급 보너스가 반영된 코인 액수. 페이로드에 실린 `coins` 는 기본 보상이고,
    /// 세션 갱신은 스토어가 하지만 이 뷰는 **호출 시점의 스냅샷**을 들고 있어 다시
    /// 흘러들어오지 않는다. 배율은 순수 함수라 여기서 같은 값을 계산한다.
    private var bonusedCoins: Int? {
        guard let coins = result.coins else { return nil }
        guard let lockTier else { return coins }
        if case let .coins(amount) = UpHeroSlot.applyRuneLockBonus(
            .coins(amount: coins), tier: lockTier) {
            return amount
        }
        return coins
    }

    /// 수치로 안 잡히는 보상까지 한 줄로. 웹 `rewardLabel` 과 같은 우선순위.
    private var rewardLabel: String? {
        guard won else { return nil }
        if let c = bonusedCoins, c > 0 {
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
        phase == .lock
            ? AppConfig.loc("uphero.slot.lock.aria")
            : AppConfig.loc("uphero.slot.aria.dismiss")
    }

    // MARK: 본문

    var body: some View {
        ZStack {
            // 백드롭 — 조작 중엔 멈춤, 보상 뒤엔 닫기. 뚜껑이 열리는 동안은 죽어 있다.
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
                ChestSparks(color: chestLegend)
                    .ignoresSafeArea()
                    .allowsHitTesting(false)
                    .accessibilityHidden(true)
            }

            card
                .frame(maxWidth: 320)
                .padding(.horizontal, 24)
        }
        // 루트 셰이크 — big 티어 300ms, ±2pt.
        .offset(shake)
        .onAppear(perform: start)
        .onDisappear { countdown?.invalidate() }
        // 백그라운드 진입 — 조작이 끝나지 않았으면 plain 으로 마감한다. (돌아왔을 때
        //   표식만 계속 돌고 보상은 안 나오는 상태를 만들지 않는다.)
        .onReceive(NotificationCenter.default.publisher(
            for: UIApplication.willResignActiveNotification)) { _ in
            if !resolved { finish(.plain) }
        }
    }

    private var card: some View {
        VStack(spacing: 0) {
            header
            chestStage
            if phase == .lock { lockTrack }
            resultBlock
            footer
        }
        .background(GBPalette.darkest, in: RoundedRectangle(cornerRadius: 10))
        // 보더 대신 톤 글로우. 열리면 결과 색으로 번진다.
        .shadow(color: accent.opacity(revealed ? 0.28 : 0), radius: 11)
        .shadow(color: GBPalette.darkest.opacity(0.8), radius: 16, y: 12)
        .animation(.easeOut(duration: 0.24), value: revealed)
        // 모달로 선언해 VoiceOver 가 뒤쪽 탐험 화면을 읽지 않게 한다. 자식은 묶지
        // 않는다 — 묶으면 버튼이 개별 요소로 잡히지 않아 조작이 막힌다.
        .accessibilityAddTraits(.isModal)
    }

    private var header: some View {
        HStack {
            Text(AppConfig.loc("uphero.slot.title"))
                .typography(.micro)
                .tracking(1.2)
                .foregroundStyle(GBPalette.light)
            Spacer()
            // 넣은 코인. 순손익을 숨기지 않는다.
            Text(UpHeroNarrative.resolveLog(
                "uphero.slot.stake", ["cost": .number(Double(result.cost))],
                fallback: "−\(result.cost)"))
                .typography(.micro)
                .monospacedDigit()
                .foregroundStyle(chestHint)
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 8)
    }

    /// 상자 — 픽셀 결의 단순 도형. 아이콘을 박스 안에 넣지 않는다.
    private var chestStage: some View {
        ZStack {
            ChestFigure(opened: opened, accent: accent,
                        openSeconds: reduceMotion ? Self.openSecondsReduced : Self.openSeconds)
            // 보상 착지 플레어 — mid 이상. 픽셀 결을 지키려고 원이 아니라 정사각이다.
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
        .padding(.top, 12)
        .padding(.bottom, 16)
        .brightness(flash ? 0.35 : 0)
        .scaleEffect(breathe)
        .accessibilityHidden(true)
    }

    /// 룬 자물쇠 — 트랙 자체가 버튼이다.
    private var lockTrack: some View {
        VStack(spacing: 6) {
            Text(AppConfig.loc("uphero.slot.lock.instruction"))
                .typography(.micro)
                .foregroundStyle(chestHint)
                .multilineTextAlignment(.center)
                .fixedSize(horizontal: false, vertical: true)

            Button(action: stop) {
                GeometryReader { geo in
                    ZStack(alignment: .topLeading) {
                        // 레일
                        RoundedRectangle(cornerRadius: 2)
                            .fill(GBPalette.dark)
                            .frame(height: 12)
                            .offset(y: 16)
                        // 바깥 목표대 (good)
                        RoundedRectangle(cornerRadius: 2)
                            .fill(GBPalette.light.opacity(0.35))
                            .frame(width: geo.size.width * UpHeroSlot.runeLockOuterHalf * 2,
                                   height: 12)
                            .offset(
                                x: geo.size.width
                                    * (track.center - UpHeroSlot.runeLockOuterHalf),
                                y: 16)
                        // 안쪽 목표대 (perfect)
                        RoundedRectangle(cornerRadius: 2)
                            .fill(GBPalette.lightest)
                            .frame(width: geo.size.width * UpHeroSlot.runeLockInnerHalf * 2,
                                   height: 12)
                            .offset(
                                x: geo.size.width
                                    * (track.center - UpHeroSlot.runeLockInnerHalf),
                                y: 16)
                        // 표식 — 매 프레임 위치만 다시 그린다 (상태를 쓰지 않는다).
                        TimelineView(.animation) { ctx in
                            Rectangle()
                                .fill(chestLegend)
                                .frame(width: 4, height: 24)
                                .offset(
                                    x: geo.size.width * markerPosition(at: ctx.date) - 2,
                                    y: 10)
                        }
                    }
                }
                .frame(height: 44)
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .accessibilityLabel(Text(AppConfig.loc("uphero.slot.lock.aria")))
            .accessibilityAddTraits(.isButton)
        }
        .padding(.horizontal, 16)
        .padding(.bottom, 4)
    }

    private var resultBlock: some View {
        VStack(spacing: 8) {
            if revealed, let lockLine {
                Text(lockLine)
                    .typography(.caption)
                    .foregroundStyle(GBPalette.light)
                    .multilineTextAlignment(.center)
                    .fixedSize(horizontal: false, vertical: true)
                    .transition(popTransition)
            }
            // 본문은 페이드만 — 읽는 중에 글자가 움직이지 않는다.
            Text(revealed ? resultText : "")
                .typography(.body)
                .foregroundStyle(won ? GBPalette.lightest : GBPalette.light)
                .multilineTextAlignment(.center)
                .fixedSize(horizontal: false, vertical: true)
                .opacity(revealed ? 1 : 0)
                .animation(.easeOut(duration: 0.22), value: revealed)
                // 열리기 전에는 결과가 없으므로 읽히지 않아야 한다 (웹 aria-live 대응).
                .accessibilityHidden(!revealed)

            if revealed && (rewardLabel != nil || bonusPercent > 0) {
                HStack(spacing: 6) {
                    if let rewardLabel {
                        Text(rewardLabel)
                            .typography(.caption)
                            .monospacedDigit()
                            .fontWeight(.bold)
                            .foregroundStyle(GBPalette.darkest)
                            .padding(.horizontal, 10)
                            .padding(.vertical, 3)
                            .background(tier == .big ? chestLegend : GBPalette.lightest,
                                        in: RoundedRectangle(cornerRadius: 4))
                    }
                    if bonusPercent > 0 {
                        Text(UpHeroNarrative.resolveLog(
                            "uphero.slot.lock.bonus",
                            ["pct": .number(Double(bonusPercent))],
                            fallback: "+\(bonusPercent)%"))
                            .typography(.micro)
                            .monospacedDigit()
                            .fontWeight(.bold)
                            .foregroundStyle(chestLegend)
                            .padding(.horizontal, 8)
                            .padding(.vertical, 3)
                            .background(GBPalette.dark, in: RoundedRectangle(cornerRadius: 4))
                    }
                }
                .transition(popTransition)
            }

            // 투명 pity — 다음 상자가 보장되면 숨기지 않고 말한다.
            if revealed && pityArmed {
                HStack(spacing: 6) {
                    PixelIcon(.sparkle, size: 12, color: GBPalette.lightest)
                    Text(AppConfig.loc("uphero.slot.pityHint"))
                        .typography(.caption)
                        .foregroundStyle(GBPalette.lightest)
                }
                .transition(popTransition)
            }
        }
        .frame(minHeight: phase == .lock ? 0 : 44)
        .padding(.horizontal, 16)
        .padding(.top, 4)
        .padding(.bottom, 12)
        .animation(reduceMotion ? .easeOut(duration: 0.2)
                                : .spring(response: 0.3, dampingFraction: 0.6),
                   value: revealed)
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
                        .frame(width: revealed
                               ? geo.size.width * CGFloat(remaining / Self.autoDismiss)
                               : 0)
                }
            }
            .frame(height: 2)
            .accessibilityHidden(true)

            // "한 번 더" — 남은 횟수·코인이 있을 때만.
            if revealed && canOpenAgain, let openAgain {
                Button {
                    countdown?.invalidate()
                    openAgain.onOpen()
                } label: {
                    VStack(spacing: 1) {
                        Text(AppConfig.loc("uphero.slot.again"))
                            .typography(.caption)
                            .fontWeight(.semibold)
                            .foregroundStyle(GBPalette.lightest)
                        Text(UpHeroNarrative.resolveLog(
                            "uphero.slot.spinsLeft",
                            ["n": .number(Double(openAgain.chestsLeft))],
                            fallback: "\(openAgain.chestsLeft)"))
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
                Text(phase == .lock
                     ? AppConfig.loc("uphero.slot.lock.stop")
                     : AppConfig.loc("uphero.combat.continue"))
                    .typography(.caption)
                    .fontWeight(.semibold)
                    .foregroundStyle(revealed ? GBPalette.darkest : GBPalette.light)
                    .padding(.horizontal, 14)
                    .frame(minHeight: 44)
                    .background(revealed ? accent : GBPalette.dark,
                                in: RoundedRectangle(cornerRadius: 6))
            }
            .buttonStyle(.plain)
            .disabled(phase == .opening)
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 10)
    }

    // MARK: 흐름

    private func start() {
        ChestHaptics.prepare()
        sweepStart = Date()
        // 이미 해소된 상자(리마운트·동기화)는 조작을 건너뛰고 보상부터 보여준다.
        if let already = result.lockTier {
            resolved = true
            lockTier = already
            phase = .revealed
            reveal()
        }
    }

    /// 걸쇠 멈춤 — 표식의 현재 위치로 등급을 가른다.
    private func stop() {
        guard phase == .lock, !resolved else { return }
        SoundPlayer.shared.play(.confirm)
        ChestHaptics.stop()
        finish(UpHeroSlot.runeLockTier(
            marker: markerPosition(at: Date()), center: track.center))
    }

    /// 등급 확정 — 정확히 한 번. 조작으로도, 백그라운드로도 여기로 모인다.
    private func finish(_ next: RuneLockTier) {
        guard !resolved else { return }
        resolved = true
        lockTier = next
        onResolveLock(next)
        withAnimation(.easeOut(duration: 0.2)) { phase = .opening }
        SoundPlayer.shared.play(.packOpen)
        let delay = reduceMotion ? Self.openSecondsReduced : Self.openSeconds
        DispatchQueue.main.asyncAfter(deadline: .now() + delay) {
            guard phase == .opening else { return }
            phase = .revealed
            reveal()
        }
    }

    /// 보상 등장 — 소리·햅틱·티어 연출·자동 닫힘 카운트다운을 한 번만 건다.
    private func reveal() {
        guard !revealFired else { return }
        revealFired = true

        SoundPlayer.shared.play(chestTierSound(tier))
        ChestHaptics.reveal(tier)
        if !reduceMotion { runTierFx() }
        // 웹 aria-live 대응 — 결과를 스크린리더에 한 번 알린다.
        let spoken = [lockLine, resultText, rewardLabel]
            .compactMap { $0 }
            .joined(separator: " ")
        if !spoken.isEmpty {
            UIAccessibility.post(notification: .announcement, argument: spoken)
        }

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

    /// 티어별 보상 연출 (웹 keyframes 의 타이밍을 그대로 옮겼다).
    private func runTierFx() {
        switch tier {
        case .none:
            break
        case .small:
            // 명도 플래시 2프레임 (120ms).
            after(0.018) { flash = true }
            after(0.036) { withAnimation(.linear(duration: 0.084)) { flash = false } }
        case .mid:
            // 한 번 숨을 쉰다 (420ms, 40% 지점에서 1.04) + 사각 링 1회.
            withAnimation(.easeOut(duration: 0.17)) { breathe = 1.04 }
            after(0.17) { withAnimation(.easeOut(duration: 0.25)) { breathe = 1.0 } }
            withAnimation(.easeOut(duration: 0.52)) { flare1 = true }
        case .big:
            // 더 크게 숨 쉬고(520ms, 1.08) 링이 두 번 퍼진다. 셰이크는 루트에.
            withAnimation(.easeOut(duration: 0.18)) { breathe = 1.08 }
            after(0.18) { withAnimation(.easeOut(duration: 0.34)) { breathe = 1.0 } }
            withAnimation(.easeOut(duration: 0.52)) { flare1 = true }
            after(0.14) { withAnimation(.easeOut(duration: 0.76)) { flare2 = true } }
            sparks = true
            runShake()
        }
    }

    /// 루트 셰이크 — 300ms 동안 ±2pt.
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

    /// 조작 중이면 멈춤, 뚜껑이 열리는 동안은 무시, 보상 뒤엔 닫기.
    private func primaryAction() {
        switch phase {
        case .lock:
            stop()
        case .opening:
            break
        case .revealed:
            countdown?.invalidate()
            onDismiss()
        }
    }
}

// MARK: - 상자 도형

/// 룬 상자 — 몸통·뚜껑·세로 띠 두 줄·자물쇠 판. 아이콘을 쓰지 않고 픽셀 결의 단순
/// 도형으로만 만든다. 뚜껑은 열릴 때 뒤로 젖혀지고 자물쇠 판이 accent 로 물든다.
private struct ChestFigure: View {
    let opened: Bool
    let accent: Color
    let openSeconds: TimeInterval

    var body: some View {
        ZStack(alignment: .bottomLeading) {
            // 뚜껑 안쪽 — 열릴 때만 보이는 어둠. 뚜껑 뒤에 깔린다.
            RoundedRectangle(cornerRadius: 2)
                .fill(GBPalette.darkest)
                .frame(width: 76, height: 12)
                .offset(x: 6, y: -40)
            // 뚜껑 — 위 22pt. 몸통과 2pt 틈을 두어 이음매가 생긴다.
            ZStack(alignment: .topLeading) {
                UnevenRoundedRectangle(
                    topLeadingRadius: 3, bottomLeadingRadius: 0,
                    bottomTrailingRadius: 0, topTrailingRadius: 3)
                    .fill(GBPalette.dark)
                    .frame(width: 88, height: 22)
                // 뚜껑 결 — 보더 대신 톤으로 면을 가른다.
                Rectangle()
                    .fill(GBPalette.light.opacity(0.15))
                    .frame(width: 88, height: 5)
                    .offset(y: 4)
            }
            .frame(width: 88, height: 22)
            .rotationEffect(.degrees(opened ? -9 : 0), anchor: .bottom)
            .offset(y: opened ? -51 : -44)
            .animation(.timingCurve(0.2, 0.9, 0.2, 1, duration: openSeconds), value: opened)
            // 몸통 — 아래 42pt.
            RoundedRectangle(cornerRadius: 2)
                .fill(GBPalette.dark)
                .frame(width: 88, height: 42)
            // 세로 띠 — 바닥부터 뚜껑 높이까지 관통해 상자처럼 보이게 한다.
            Rectangle()
                .fill(GBPalette.darkest.opacity(0.7))
                .frame(width: 7, height: 42)
                .offset(x: 14)
            Rectangle()
                .fill(GBPalette.darkest.opacity(0.7))
                .frame(width: 7, height: 42)
                .offset(x: 67)
            // 자물쇠 판 — 뚜껑과 몸통의 이음매에 걸린다. 열리면 accent 로 물든다.
            RoundedRectangle(cornerRadius: 2)
                .fill(opened ? accent : GBPalette.light)
                .frame(width: 16, height: 16)
                .offset(x: 36, y: opened ? -31 : -34)
                .rotationEffect(.degrees(opened ? 12 : 0))
                .animation(.timingCurve(0.2, 0.9, 0.2, 1, duration: openSeconds), value: opened)
        }
        .frame(width: 88, height: 70, alignment: .bottomLeading)
    }
}

// MARK: - 스파크 (big 티어)

private struct ChestSparks: View {
    let color: Color

    private static let sparks: [(x: CGFloat, delay: Double, s: CGFloat, drift: CGFloat)] = [
        (0.08, 0.00, 3, 6), (0.17, 0.09, 2, -5), (0.26, 0.04, 4, 8), (0.35, 0.16, 2, -7),
        (0.44, 0.02, 3, 4), (0.52, 0.12, 2, -4), (0.60, 0.07, 4, 7), (0.68, 0.20, 3, -6),
        (0.76, 0.03, 2, 5), (0.84, 0.14, 3, -8), (0.91, 0.06, 2, 6), (0.97, 0.18, 3, -5),
    ]

    var body: some View {
        GeometryReader { geo in
            ForEach(Array(Self.sparks.enumerated()), id: \.offset) { _, p in
                ChestSpark(color: color, size: p.s, drift: p.drift, delay: p.delay)
                    .position(x: geo.size.width * p.x, y: -6)
            }
        }
    }
}

private struct ChestSpark: View {
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

#Preview("자물쇠") {
    ZStack {
        Color.bgPrimary.ignoresSafeArea()
        RuneChestModal(
            result: SlotResultPayload(
                outcome: .coinJackpot, symbols: [.gem, .gem, .gem], coins: 700),
            openAgain: RuneChestOpenAgain(chestsLeft: 2, wallet: 900, onOpen: {}),
            onResolveLock: { _ in },
            onDismiss: {})
    }
}

#Preview("빈 상자") {
    ZStack {
        Color.bgPrimary.ignoresSafeArea()
        RuneChestModal(
            result: SlotResultPayload(
                outcome: .blank, symbols: [.cloth, .coins, .coin], lockTier: .good),
            blankStreak: 4,
            onResolveLock: { _ in },
            onDismiss: {})
    }
}

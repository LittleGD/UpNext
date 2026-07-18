//
//  Haptics.swift
//  UpNext — 햅틱 피드백 (Phase 5 슬라이스 1 · Phase 5.2 · Phase 사운드-햅틱 정밀화).
//
//  웹 src/lib/sounds.ts 의 HAPTIC_INTENT 7단계 매핑을 네이티브로 포팅. 웹은 Capacitor
//  Haptics 플러그인(JS bridge)을 거쳤지만, 네이티브는 UIFeedbackGenerator 직통.
//
//  Apple HIG 매핑:
//   - selection   : UISelectionFeedbackGenerator — 가벼운 선택/탐색
//   - light/medium/heavy : UIImpactFeedbackGenerator — 물리 이벤트 (강도 3단, intensity 미세조절)
//   - success/warning    : UINotificationFeedbackGenerator — 완료 / 부정 이벤트
//   - celebration : medium→heavy→success 상승 3박 컴파운드 — 레벨업 등 "큰 보상"
//
//  설계 참고 — Duolingo: 햅틱을 거의 모든 의미있는 인터랙션에 촘촘히 깔고(선택·
//  확정·완료), 큰 보상은 단발이 아닌 상승형 시퀀스로 준다. 그 결을 따라 카드 선택·
//  취소·리롤·전직·구매·미니게임 매치·탭 전환까지 폭넓게 배선한다.
//
//  ■ 네이티브 우위 (웹엔 없던 개념 — Capacitor Haptics JS API 엔 intensity/CoreHaptics 부재):
//   1) 제너레이터 캐싱 + prepare() : 매 호출마다 새로 만들어 버리던 것을 재사용하고,
//      "터치 다운"과 "재생" 사이 갭이 있는 인터랙션(홀드 드로우·팩 개봉)엔 미리 prepare 해
//      체감 지연 제거.
//   2) impactOccurred(intensity:) : 3단 고정 강도 → 0~1 연속 강도(크리티컬 데미지 비례 등).
//   3) CoreHaptics(CHHapticEngine) 커스텀 패턴 : 팩 개봉 레어도 스케일 · 레벨업 버스트 ·
//      홀드-드로우 연속 램프 · 전투 크리티컬 2단 타격 — UIFeedbackGenerator 로는 표현
//      불가능한 연속/합성 질감. 미지원 기기(시뮬레이터 포함)는 UIKit 제너레이터로 폴백.
//

import UIKit
import CoreHaptics

enum Haptics {

    /// 햅틱 의도 — 웹 HapticIntent 7종.
    enum Intent {
        case selection, light, medium, heavy, success, warning, celebration
    }

    /// 설정의 hapticEnabled 와 동기 — GameStore.progress 의 didSet 이 갱신한다.
    /// 기본 true (설정 로드 전에도 무음으로 죽지 않게).
    /// @MainActor — UIFeedbackGenerator 가 메인 스레드 전용이라 토글도 메인에서만.
    @MainActor static var enabled = true

    // MARK: - 재사용 제너레이터 (매번 새로 만들지 않고 캐시 — Apple 권장 패턴)

    @MainActor private static let selectionGen = UISelectionFeedbackGenerator()
    @MainActor private static let lightGen  = UIImpactFeedbackGenerator(style: .light)
    @MainActor private static let mediumGen = UIImpactFeedbackGenerator(style: .medium)
    @MainActor private static let heavyGen  = UIImpactFeedbackGenerator(style: .heavy)
    @MainActor private static let notifGen  = UINotificationFeedbackGenerator()

    /// 제스처 시작 시점(터치 다운, 홀드 시작 등)에 미리 호출 — 실제 재생 지연 제거.
    /// prepare 한 제너레이터는 잠깐 워밍 상태를 유지하다 자동 해제된다.
    @MainActor
    static func prepare(_ intent: Intent) {
        guard enabled else { return }
        switch intent {
        case .selection: selectionGen.prepare()
        case .light:  lightGen.prepare()
        case .medium: mediumGen.prepare()
        case .heavy:  heavyGen.prepare()
        case .success, .warning, .celebration: notifGen.prepare()
        }
    }

    /// 햅틱 발생. enabled=false 면 무음. 메인 스레드 전용 (UIFeedbackGenerator 제약).
    /// intensity: 0.0~1.0 — impact 계열(light/medium/heavy)에서만 유효.
    /// selection/success/warning 은 시스템 고정 질감이라 intensity 무시.
    @MainActor
    static func play(_ intent: Intent, intensity: CGFloat = 1.0) {
        guard enabled else { return }
        let clamped = min(max(intensity, 0), 1)
        switch intent {
        case .selection:
            selectionGen.selectionChanged()
        case .light:
            lightGen.impactOccurred(intensity: clamped)
        case .medium:
            mediumGen.impactOccurred(intensity: clamped)
        case .heavy:
            heavyGen.impactOccurred(intensity: clamped)
        case .success:
            notifGen.notificationOccurred(.success)
        case .warning:
            notifGen.notificationOccurred(.warning)
        case .celebration:
            // 상승 3박 — medium → heavy → success. 단발 충격보다 "차오르는" 보상감
            // (Duolingo 식 큰-보상 시퀀스). 웹 celebration(heavy+success)을 강화.
            // 후속 박자는 enabled 재확인 — 220ms 사이 사용자가 햅틱을 꺼도 즉시 멎게.
            mediumGen.impactOccurred()
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.09) {
                guard Haptics.enabled else { return }
                heavyGen.impactOccurred()
            }
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.22) {
                guard Haptics.enabled else { return }
                notifGen.notificationOccurred(.success)
            }
        }
    }

    // MARK: - CoreHaptics 승격 지점 (커스텀 패턴, 미지원 시 UIKit 폴백)

    private static var supportsCoreHaptics: Bool { HapticEngine.shared.supportsHaptics }

    /// 팩 개봉 카드 등장 — 레어도로 intensity/sharpness 스케일. legend 는 잔향 1개 추가.
    /// 미지원 기기: 레어도가 높을수록 강한 impact 로 폴백.
    @MainActor
    static func packReveal(rarity: Rarity) {
        guard enabled else { return }
        let idx = Rarity.allCases.firstIndex(of: rarity) ?? 0
        if supportsCoreHaptics {
            HapticEngine.shared.packReveal(rarityIndex: idx)
        } else {
            // normal/rare → light, unique/legend → medium/heavy 로 근사.
            play(idx >= 3 ? .heavy : idx >= 2 ? .medium : .light,
                 intensity: min(1.0, 0.4 + CGFloat(idx) * 0.2))
        }
    }

    /// 팩 흔들림(shakeMs 동안) — magnitude(웹 3/5/8)를 0.3~1.0 로 정규화한 연속 진동.
    @MainActor
    static func packShake(magnitude: Double, duration: TimeInterval) {
        guard enabled else { return }
        let intensity = Float(min(1.0, 0.3 + (magnitude - 3) / 5 * 0.7))
        if supportsCoreHaptics {
            HapticEngine.shared.continuous(intensity: intensity, sharpness: 0.4, duration: duration)
        }
        // 폴백 없음 — UIKit 으로 "연속"은 불가. 진입 medium(호출부 유지)이 대체.
    }

    /// 팩 개봉 플래시 클라이맥스 — legend 전용 "쨍" 한 방(sharpness 1.0).
    @MainActor
    static func packFlashClimax(rarity: Rarity) {
        guard enabled else { return }
        let idx = Rarity.allCases.firstIndex(of: rarity) ?? 0
        if supportsCoreHaptics, idx >= 3 {
            HapticEngine.shared.transient(intensity: 1.0, sharpness: 1.0)
        }
    }

    /// 레벨업 버스트 — 6음 상승과 동기화된 연속 램프(0.3→1.0) + 최종 클라이맥스 타격.
    /// 미지원: celebration 컴파운드로 폴백.
    @MainActor
    static func levelUpBurst() {
        guard enabled else { return }
        if supportsCoreHaptics {
            HapticEngine.shared.levelUpBurst()
        } else {
            play(.celebration)
        }
    }

    /// 전투 크리티컬 — 임팩트+반동 2단 transient. intensity 로 데미지 비례.
    /// 미지원: heavy(intensity) 단발.
    @MainActor
    static func critHit(intensity: CGFloat = 1.0) {
        guard enabled else { return }
        if supportsCoreHaptics {
            HapticEngine.shared.critHit(intensity: Float(min(max(intensity, 0.3), 1.0)))
        } else {
            play(.heavy, intensity: intensity)
        }
    }

    /// 슈퍼 챌린지 홀드 점화 — 연속 exp 램프(0.5→0.9, 0.7s) + crackle transient ×8 +
    /// 종료 타격. ChallengePhaseBanner 홀드 100% 도달(super 전용) 대응. 미지원: heavy 단발.
    @MainActor
    static func superIgnite() {
        guard enabled else { return }
        if supportsCoreHaptics {
            HapticEngine.shared.superIgnite()
        } else {
            play(.heavy)
        }
    }

    // MARK: 홀드-드로우 연속 램프 (CoreHaptics 전용 — 연속 강도 표현)

    /// 홀드 충전 시작 — 연속 진동 시작(CoreHaptics) 또는 prepare(폴백).
    @MainActor
    static func beginHoldCharge() {
        guard enabled else { return }
        if supportsCoreHaptics {
            HapticEngine.shared.startHoldCharge()
        } else {
            prepare(.heavy)   // 릴리즈 순간 지연 없게 미리 워밍.
        }
    }

    /// 홀드 진행도 갱신 — 연속 진동 intensity/sharpness 를 progress(0~1)로 실시간 바인딩.
    @MainActor
    static func updateHoldCharge(_ progress: Double) {
        guard enabled, supportsCoreHaptics else { return }
        HapticEngine.shared.updateHoldCharge(progress: progress)
    }

    /// 홀드 종료 — 완료(release=true)면 릴리즈 타격, 취소면 조용히 정지.
    @MainActor
    static func endHoldCharge(release: Bool) {
        // enabled 여부와 무관하게 재생 중이던 연속 플레이어는 반드시 정지.
        if supportsCoreHaptics {
            HapticEngine.shared.stopHoldCharge(release: release && enabled)
        } else if release, enabled {
            play(.heavy)
        }
    }
}

// MARK: - CoreHaptics 엔진 (수명주기 안전 처리 + 커스텀 패턴)

/// CHHapticEngine 을 감싼 싱글턴. 백그라운드/오디오 인터럽트로 엔진이 정지하면
/// resetHandler/stoppedHandler 로 감지해 다음 재생 시 되살린다. 미지원 기기(시뮬레이터
/// 포함)에선 engine 을 만들지 않고 supportsHaptics=false 만 노출 → 호출부가 UIKit 폴백.
final class HapticEngine {
    static let shared = HapticEngine()

    let supportsHaptics: Bool
    private var engine: CHHapticEngine?
    private var holdPlayer: CHHapticAdvancedPatternPlayer?

    private init() {
        supportsHaptics = CHHapticEngine.capabilitiesForHardware().supportsHaptics
        guard supportsHaptics else { return }
        do {
            let e = try CHHapticEngine()
            e.isAutoShutdownEnabled = true   // 유휴 시 자동 종료 — startIfNeeded 가 되살림.
            // 인터럽트/미디어 서버 리셋 후 자동 복구.
            e.resetHandler = { [weak e] in try? e?.start() }
            // 백그라운드 진입 등으로 정지 — 다음 재생 때 startIfNeeded 가 다시 start.
            e.stoppedHandler = { _ in }
            engine = e
        } catch {
            engine = nil
        }
    }

    /// 재생 직전 엔진 기동 보장. autoShutdown 으로 잠들었거나 정지됐어도 되살린다.
    @discardableResult
    private func startIfNeeded() -> CHHapticEngine? {
        guard let e = engine else { return nil }
        do { try e.start(); return e } catch { return nil }
    }

    // MARK: 단발/합성 패턴

    /// transient 1발.
    func transient(intensity: Float, sharpness: Float, at t: TimeInterval = 0) {
        play([event(.hapticTransient, intensity: intensity, sharpness: sharpness, at: t)])
    }

    /// 연속 진동 1개(고정 강도).
    func continuous(intensity: Float, sharpness: Float, duration: TimeInterval) {
        play([event(.hapticContinuous, intensity: intensity, sharpness: sharpness,
                    at: 0, duration: duration)])
    }

    /// 팩 개봉 카드 등장 — 레어도 스케일 transient (+legend 잔향).
    func packReveal(rarityIndex idx: Int) {
        // normal .4/.3, rare .6/.5, unique .8/.7, legend 1.0/.9
        let scale: [(Float, Float)] = [(0.4, 0.3), (0.6, 0.5), (0.8, 0.7), (1.0, 0.9)]
        let (i, s) = scale[min(max(idx, 0), 3)]
        var events = [event(.hapticTransient, intensity: i, sharpness: s, at: 0)]
        if idx >= 3 {
            // legend 전용 — 90ms 뒤 짧은 continuous 잔향.
            events.append(event(.hapticContinuous, intensity: 0.3, sharpness: 0.2,
                                at: 0.09, duration: 0.15))
        }
        play(events)
    }

    /// 레벨업 버스트 — 연속 램프(0.3→1.0, 0.86s) + 6-note bump + 클라이맥스.
    func levelUpBurst() {
        let dur: TimeInterval = 0.86
        var events = [event(.hapticContinuous, intensity: 0.6, sharpness: 0.4,
                            at: 0, duration: dur)]
        for n in 0..<6 {
            let t = Double(n) * 0.11
            let bump = Float(0.3 + Double(n) / 6.0 * 0.6)
            events.append(event(.hapticTransient, intensity: bump, sharpness: 0.5, at: t))
        }
        events.append(event(.hapticTransient, intensity: 1.0, sharpness: 0.8, at: dur))
        // 연속 이벤트 intensity 를 0.3→1.0 선형 램프.
        let curve = CHHapticParameterCurve(
            parameterID: .hapticIntensityControl,
            controlPoints: [
                .init(relativeTime: 0, value: 0.3),
                .init(relativeTime: dur, value: 1.0),
            ],
            relativeTime: 0)
        play(events, curves: [curve])
    }

    /// 전투 크리티컬 — 임팩트(sharp) + 40ms 뒤 약한 반동 2차 transient.
    func critHit(intensity: Float) {
        play([
            event(.hapticTransient, intensity: intensity, sharpness: 1.0, at: 0),
            event(.hapticTransient, intensity: 0.4, sharpness: 0.3, at: 0.04),
        ])
    }

    /// 슈퍼 챌린지 점화 — 연속 exp 램프(0.5→0.9, 0.7s) 위에 crackle transient 8발을
    /// 흩뿌리고, 종료 시점에 강한 마무리 transient 1발. levelUpBurst 패턴 참고
    /// (연속 + 다발 transient + 파라미터 커브 조합), 다만 램프는 지수형으로 "타오르는"
    /// 가속감을 준다.
    func superIgnite() {
        let dur: TimeInterval = 0.7
        var events = [event(.hapticContinuous, intensity: 0.5, sharpness: 0.5, at: 0, duration: dur)]
        // crackle — 0~dur 구간에 8발, 뒤로 갈수록 촘촘하고 강하게(exp 가속과 동조).
        for n in 0..<8 {
            let frac = Double(n) / 7.0
            let t = dur * (frac * frac)  // 제곱 분포 — 뒤쪽으로 몰림
            let bump = Float(0.4 + frac * 0.5)
            events.append(event(.hapticTransient, intensity: bump, sharpness: 0.8, at: t))
        }
        // 종료 타격 — 점화 완료.
        events.append(event(.hapticTransient, intensity: 1.0, sharpness: 0.9, at: dur))
        // 연속 이벤트 intensity 를 0.5→0.9 지수 램프로 근사(중간 컨트롤 포인트를 앞쪽에
        // 눌러 초반은 완만, 후반은 급격하게 — exp 커브 체감).
        let curve = CHHapticParameterCurve(
            parameterID: .hapticIntensityControl,
            controlPoints: [
                .init(relativeTime: 0, value: 0.5),
                .init(relativeTime: dur * 0.6, value: 0.62),
                .init(relativeTime: dur, value: 0.9),
            ],
            relativeTime: 0)
        play(events, curves: [curve])
    }

    // MARK: 홀드-드로우 연속 램프 (advanced player 로 실시간 파라미터 갱신)

    func startHoldCharge() {
        guard let e = startIfNeeded() else { return }
        // duration 을 넉넉히 잡고 stop() 으로 수동 종료. 시작 강도 낮게 → update 로 상승.
        let ev = event(.hapticContinuous, intensity: 0.2, sharpness: 0.3, at: 0, duration: 3.0)
        do {
            let pattern = try CHHapticPattern(events: [ev], parameters: [])
            let player = try e.makeAdvancedPlayer(with: pattern)
            try player.start(atTime: 0)
            holdPlayer = player
        } catch {
            holdPlayer = nil
        }
    }

    func updateHoldCharge(progress: Double) {
        guard let p = holdPlayer else { return }
        let clamped = min(max(progress, 0), 1)
        let intensity = Float(0.2 + clamped * 0.8)
        let sharpness = Float(0.3 + clamped * 0.5)
        let params = [
            CHHapticDynamicParameter(parameterID: .hapticIntensityControl,
                                     value: intensity, relativeTime: 0),
            CHHapticDynamicParameter(parameterID: .hapticSharpnessControl,
                                     value: sharpness, relativeTime: 0),
        ]
        try? p.sendParameters(params, atTime: 0)
    }

    func stopHoldCharge(release: Bool) {
        if let p = holdPlayer { try? p.stop(atTime: 0) }
        holdPlayer = nil
        if release {
            // 충전 완료 릴리즈 타격.
            transient(intensity: 1.0, sharpness: 0.8)
        }
    }

    // MARK: 내부 헬퍼

    private func event(_ type: CHHapticEvent.EventType,
                       intensity: Float,
                       sharpness: Float,
                       at t: TimeInterval,
                       duration: TimeInterval? = nil) -> CHHapticEvent {
        let params = [
            CHHapticEventParameter(parameterID: .hapticIntensity, value: intensity),
            CHHapticEventParameter(parameterID: .hapticSharpness, value: sharpness),
        ]
        if let duration {
            return CHHapticEvent(eventType: type, parameters: params,
                                 relativeTime: t, duration: duration)
        }
        return CHHapticEvent(eventType: type, parameters: params, relativeTime: t)
    }

    private func play(_ events: [CHHapticEvent], curves: [CHHapticParameterCurve] = []) {
        guard let e = startIfNeeded() else { return }
        do {
            let pattern = try CHHapticPattern(events: events, parameterCurves: curves)
            let player = try e.makePlayer(with: pattern)
            try player.start(atTime: 0)
        } catch {
            // 패턴 생성/재생 실패 — 조용히 무시(햅틱은 보조 피드백).
        }
    }
}

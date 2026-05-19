//
//  Haptics.swift
//  UpNext — 햅틱 피드백 (Phase 5 슬라이스 1 · Phase 5.2).
//
//  웹 src/lib/sounds.ts 의 HAPTIC_INTENT 7단계 매핑을 네이티브로 포팅. 웹은 Capacitor
//  Haptics 플러그인(JS bridge)을 거쳤지만, 네이티브는 UIFeedbackGenerator 직통.
//
//  Apple HIG 매핑:
//   - selection   : UISelectionFeedbackGenerator — 가벼운 선택/탐색
//   - light/medium/heavy : UIImpactFeedbackGenerator — 물리 이벤트 (강도 3단)
//   - success/warning    : UINotificationFeedbackGenerator — 완료 / 부정 이벤트
//   - celebration : medium→heavy→success 상승 3박 컴파운드 — 레벨업 등 "큰 보상"
//
//  설계 참고 — Duolingo: 햅틱을 거의 모든 의미있는 인터랙션에 촘촘히 깔고(선택·
//  확정·완료), 큰 보상은 단발이 아닌 상승형 시퀀스로 준다. 그 결을 따라 카드 선택·
//  취소·리롤·전직·구매·미니게임 매치·탭 전환까지 폭넓게 배선한다.
//

import UIKit

enum Haptics {

    /// 햅틱 의도 — 웹 HapticIntent 7종.
    enum Intent {
        case selection, light, medium, heavy, success, warning, celebration
    }

    /// 설정의 hapticEnabled 와 동기 — GameStore.progress 의 didSet 이 갱신한다.
    /// 기본 true (설정 로드 전에도 무음으로 죽지 않게).
    /// @MainActor — UIFeedbackGenerator 가 메인 스레드 전용이라 토글도 메인에서만.
    @MainActor static var enabled = true

    /// 햅틱 발생. enabled=false 면 무음. 메인 스레드 전용 (UIFeedbackGenerator 제약).
    @MainActor
    static func play(_ intent: Intent) {
        guard enabled else { return }
        switch intent {
        case .selection:
            UISelectionFeedbackGenerator().selectionChanged()
        case .light:
            UIImpactFeedbackGenerator(style: .light).impactOccurred()
        case .medium:
            UIImpactFeedbackGenerator(style: .medium).impactOccurred()
        case .heavy:
            UIImpactFeedbackGenerator(style: .heavy).impactOccurred()
        case .success:
            UINotificationFeedbackGenerator().notificationOccurred(.success)
        case .warning:
            UINotificationFeedbackGenerator().notificationOccurred(.warning)
        case .celebration:
            // 상승 3박 — medium → heavy → success. 단발 충격보다 "차오르는" 보상감
            // (Duolingo 식 큰-보상 시퀀스). 웹 celebration(heavy+success)을 강화.
            // 후속 박자는 enabled 재확인 — 220ms 사이 사용자가 햅틱을 꺼도 즉시 멎게.
            UIImpactFeedbackGenerator(style: .medium).impactOccurred()
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.09) {
                guard Haptics.enabled else { return }
                UIImpactFeedbackGenerator(style: .heavy).impactOccurred()
            }
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.22) {
                guard Haptics.enabled else { return }
                UINotificationFeedbackGenerator().notificationOccurred(.success)
            }
        }
    }
}

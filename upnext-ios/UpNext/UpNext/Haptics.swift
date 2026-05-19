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
//   - celebration : Heavy 충격 + 110ms 후 Success — 레벨업 등 "큰 보상" 컴파운드
//

import UIKit

enum Haptics {

    /// 햅틱 의도 — 웹 HapticIntent 7종.
    enum Intent {
        case selection, light, medium, heavy, success, warning, celebration
    }

    /// 설정의 hapticEnabled 와 동기 — GameStore.progress 의 didSet 이 갱신한다.
    /// 기본 true (설정 로드 전에도 무음으로 죽지 않게).
    static var enabled = true

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
            // Heavy 충격 → 110ms 후 Success. "꽝!" 다음 "팡팡" 패턴. 웹 celebration.
            UIImpactFeedbackGenerator(style: .heavy).impactOccurred()
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.11) {
                UINotificationFeedbackGenerator().notificationOccurred(.success)
            }
        }
    }
}

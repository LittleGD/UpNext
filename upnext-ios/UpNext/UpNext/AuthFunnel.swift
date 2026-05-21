//
//  AuthFunnel.swift
//  UpNext — 인증 funnel 분석 이벤트 (R1 phase 3 — UI/인터랙션 회복).
//
//  익명 → 로그인 전환 funnel 측정용 이벤트 enum + 로깅 헬퍼.
//  현재는 OSLog 기반 (Console.app 에서 subsystem=com.littlegd.upnext, category=auth_funnel
//  필터로 확인). 추후 Firebase Analytics SDK 연결 시 동일 키 그대로 forward.
//
//  웹에는 별도 funnel 이벤트가 없음 — iOS 베타 N=20 폴 보조 측정용으로 신설.
//  플랜 R1 acceptance: "분석 이벤트 auth_funnel_step 신설".
//

import Foundation
import OSLog

/// 인증 funnel 의 모든 의미있는 단계.
/// rawValue 는 *분석 대시보드 키* — 변경 시 대시보드도 갱신.
enum AuthFunnelEvent: String {
    /// 익명 모드 신규 사용자 — 캐시 없음 분기에서 발화.
    case anonymousStart = "auth_anonymous_start"
    /// 익명 사용자 캐시 복원 — 재시작 후 anonymous 복귀.
    case anonymousResume = "auth_anonymous_resume"
    /// 온보딩 완료 (익명/로그인 공통).
    case onboardingComplete = "auth_onboarding_complete"
    /// LoginOverlay 표시 (trigger 컨텍스트: onboarding_complete / signedout_resume /
    /// backup_banner / settings_button 등).
    case loginPromptShown = "auth_login_prompt_shown"
    /// LoginOverlay 에서 "건너뛰기" — loginPromptSeen=true 로 영구 표시 차단.
    case loginSkipped = "auth_login_skipped"
    /// 로그인 시도 — provider="apple" / "google".
    case loginAttempt = "auth_login_attempt"
    /// 로그인 성공.
    case loginSuccess = "auth_login_success"
    /// 로그인 실패 — error 메시지/코드.
    case loginError = "auth_login_error"
    /// MergeConflictDialog 표시 — 익명 진척 + 클라우드 진척 둘 다 있을 때.
    case mergeShown = "auth_merge_shown"
    /// MergeConflictDialog 응답 — 로컬 채택.
    case mergeResolvedLocal = "auth_merge_resolved_local"
    /// MergeConflictDialog 응답 — 클라우드 채택.
    case mergeResolvedCloud = "auth_merge_resolved_cloud"
    /// BackupReminderBanner 표시 (3일+ 진행, 7일+ 미해제 사용자).
    case backupBannerShown = "auth_backup_banner_shown"
    /// BackupReminderBanner "나중에" — 7일 cooldown 시작.
    case backupBannerDismissed = "auth_backup_banner_dismissed"
    /// BackupReminderBanner "지금 백업" — LoginOverlay 로 이동.
    case backupBannerCtaTapped = "auth_backup_banner_cta_tapped"
    /// 로그아웃 — 메모리 진척이 LocalProgressCache 로 자동 이전.
    case signOutToAnonymous = "auth_signout_to_anonymous"
}

enum AuthFunnel {
    private static let logger = Logger(subsystem: "com.littlegd.upnext", category: "auth_funnel")

    /// 이벤트 1건 발화. context 는 분석 차원 (예: ["provider": "apple", "trigger": "..."]).
    /// 호출처는 *결정점* 위주로만 — 모든 함수에 다는 대신 의미있는 사용자 행동 단위.
    static func log(_ event: AuthFunnelEvent, _ context: [String: String] = [:]) {
        if context.isEmpty {
            logger.info("\(event.rawValue, privacy: .public)")
            return
        }
        let ctxStr = context.map { "\($0.key)=\($0.value)" }.sorted().joined(separator: " ")
        logger.info("\(event.rawValue, privacy: .public) \(ctxStr, privacy: .public)")
    }
}

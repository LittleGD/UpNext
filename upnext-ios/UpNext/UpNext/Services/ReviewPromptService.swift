//
//  ReviewPromptService.swift
//  UpNext — 앱 평가 요청 모달의 노출 판정 · 스토어 링크 · 피드백 전송.
//
//  웹 src/lib/reviewPrompt.ts + src/lib/feedback.ts 대응. 판정 규칙과 Firestore
//  스키마를 웹과 동일하게 유지해야 한 사용자에게 두 번 뜨지 않는다
//  (progress.reviewPromptShownAt 은 양쪽이 같은 키를 공유한다).
//

import Foundation
import FirebaseAuth
import FirebaseFirestore

enum ReviewPromptService {

    /// 노출 기준 — 챌린지를 완료한 서로 다른 날 수.
    static let minCompletedDays = 2

    /// App Store 리뷰 작성 시트가 바로 열리는 딥링크.
    /// StoreKit `requestReview` 대신 쓴다 — 애플이 표시 여부를 임의로 결정하고
    /// 연 3회 제한이 있어, 커스텀 사전 질문과 묶으면 눌러도 아무 일이 없을 수 있다.
    static let writeReviewURL = URL(
        string: "https://apps.apple.com/app/id6762550135?action=write-review")!

    /// 챌린지를 완료한 서로 다른 날의 수.
    ///
    /// completionHistory 는 날짜가 넘어갈 때(reconcileForToday) 비로소 기록되므로
    /// 오늘 몫은 daily 에서 직접 센다. 이걸 빼면 2일차 당일이 아니라 3일차에 뜬다.
    static func completedDayCount(progress: UserProgress, daily: DailyState) -> Int {
        let past = progress.completionHistory.filter { !$0.completedCardIds.isEmpty }.count
        let today = daily.completedIds.isEmpty ? 0 : 1
        return past + today
    }

    /// 지금 평가 모달을 띄워야 하는가. 이미 띄운 적이 있으면 영구히 false.
    static func shouldShow(progress: UserProgress, daily: DailyState) -> Bool {
        guard progress.reviewPromptShownAt == nil else { return false }
        return completedDayCount(progress: progress, daily: daily) >= minCompletedDays
    }

    // MARK: - 피드백

    /// 객관식 사유. rawValue 는 웹 FEEDBACK_REASONS 와 문자열까지 일치시킨다
    /// (한 컬렉션에 두 플랫폼이 쓰므로 집계가 갈리면 안 된다).
    enum Reason: String, CaseIterable, Identifiable {
        case boring, difficult, bug, performance, notifications, design
        var id: String { rawValue }

        /// 화면 문구 — 카탈로그 키를 런타임에 조회한다(static let 캐시 금지: 언어 고착).
        var label: String {
            switch self {
            case .boring:        return AppConfig.loc("챌린지가 재미없어요")
            case .difficult:     return AppConfig.loc("어렵고 복잡해요")
            case .bug:           return AppConfig.loc("오류가 있어요")
            case .performance:   return AppConfig.loc("느리거나 멈춰요")
            case .notifications: return AppConfig.loc("알림이 너무 많아요")
            case .design:        return AppConfig.loc("디자인이 아쉬워요")
            }
        }
    }

    enum SubmitResult {
        case success
        case signedOut
        case failed
    }

    /// `/feedback` 에 create. 규칙이 create 전용 + 필드 allowlist 라 키가 하나라도
    /// 어긋나면 전체가 거부되고, Firestore 거부는 조용해서 원인 추적이 어렵다.
    static func submitFeedback(
        reasons: [Reason],
        comment: String
    ) async -> SubmitResult {
        guard let uid = Auth.auth().currentUser?.uid else { return .signedOut }

        var payload: [String: Any] = [
            "uid": uid,
            "reasons": reasons.prefix(6).map(\.rawValue),
            "platform": "ios",
            "locale": String(AppConfig.currentLocale.identifier.prefix(10)),
            "createdAt": Int(Date().timeIntervalSince1970 * 1000),
        ]
        let trimmed = String(
            comment.trimmingCharacters(in: .whitespacesAndNewlines).prefix(500))
        if !trimmed.isEmpty { payload["comment"] = trimmed }
        if let version = Bundle.main.object(
            forInfoDictionaryKey: "CFBundleShortVersionString") as? String {
            payload["appVersion"] = String(version.prefix(20))
        }

        do {
            try await Firestore.firestore().collection("feedback").addDocument(data: payload)
            return .success
        } catch {
            return .failed
        }
    }
}

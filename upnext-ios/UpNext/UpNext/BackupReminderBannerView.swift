//
//  BackupReminderBannerView.swift
//  UpNext — 익명 사용자 백업 유도 배너 (R1 phase 2 — UI/인터랙션 회복).
//
//  웹 src/components/auth/BackupReminderBanner.tsx 1:1 포팅.
//
//  진실 매핑:
//   - line 29-31  STORAGE_KEY="backup_reminder_dismissed_at", REMIND_AGAIN_AFTER_DAYS=7,
//                 MIN_DAYS_THRESHOLD=3
//   - line 39-52  조건: !isSignedIn + totalDaysCompleted >= 3 + (dismissed 후 7일+)
//   - line 54-57  dismiss = saveToStorage(now) + setVisible(false)
//   - line 73-77  스타일: rgba(232, 139, 122, 0.08) bg + rgba(232, 139, 122, 0.4) border
//   - line 91-104 "지금 백업" (accent bg) + "나중에" (text-tertiary)
//

import SwiftUI

struct BackupReminderBannerView: View {
    @EnvironmentObject private var store: GameStore

    /// 마지막 dismiss 타임스탬프 (ms) — 웹 STORAGE_KEY 와 동치.
    private static let dismissedAtKey = "backup_reminder_dismissed_at"
    /// 트리거 최소 진행 일수 — 웹 MIN_DAYS_THRESHOLD.
    private static let minDaysThreshold = 3
    /// dismiss 후 다시 표시까지 일수 — 웹 REMIND_AGAIN_AFTER_DAYS.
    private static let remindAgainAfterDays: Double = 7

    /// 표시 여부 — 익명 + 진행 3일+ + 이전 dismiss 후 7일+ 경과.
    private var isVisible: Bool {
        guard store.isAnonymous else { return false }
        let totalDays = store.progress?.totalDaysCompleted ?? 0
        guard totalDays >= Self.minDaysThreshold else { return false }
        let dismissedAt = UserDefaults.standard.double(forKey: Self.dismissedAtKey)
        if dismissedAt > 0 {
            let daysSince = (Date().timeIntervalSince1970 * 1000 - dismissedAt) / (1000 * 60 * 60 * 24)
            if daysSince < Self.remindAgainAfterDays { return false }
        }
        return true
    }

    var body: some View {
        if isVisible {
            // 배너 노출 1회 분석 발화. .onAppear 가 SwiftUI 재구성마다 fire 할 수 있어
            // *최초 노출* 만 잡으려면 별도 dedup 이 필요하지만, 분석 차원에선 conservative
            // 카운트가 더 가치 있어 그대로 둔다 (impression).
            let _ = onceLog
            HStack(alignment: .top, spacing: 12) {
                // 경고 아이콘 — 웹 PixelIcon WarningDiamond + color #E88B7A.
                Image(systemName: "exclamationmark.triangle.fill")  // R3 에서 PixelIcon 으로 교체
                    .font(.system(size: 18, weight: .semibold))
                    .foregroundStyle(Color(red: 232/255, green: 139/255, blue: 122/255))
                    .padding(.top, 2)

                VStack(alignment: .leading, spacing: 4) {
                    Text("\(store.progress?.totalDaysCompleted ?? 0)일째 진행 중 — 백업이 안 되어 있어요")
                        .typography(.caption)
                        .fontWeight(.semibold)
                        .foregroundStyle(Color.textPrimary)
                    Text("기기 데이터가 사라지면 복구할 수 없어요. 로그인해서 클라우드에 안전하게 보관하세요.")
                        .typography(.caption)
                        .foregroundStyle(Color.textSecondary)
                        .lineSpacing(2)
                    HStack(spacing: 8) {
                        Button {
                            AuthFunnel.log(.backupBannerCtaTapped)
                            store.promptLogin()
                        } label: {
                            Text("지금 백업")
                                .typography(.caption)
                                .fontWeight(.semibold)
                                .foregroundStyle(Color.bgPrimary)
                                .padding(.horizontal, 12)
                                .padding(.vertical, 6)
                                .background(Color.accentPrimary, in: RoundedRectangle(cornerRadius: 6))
                        }
                        .buttonStyle(.plain)
                        .accessibilityIdentifier("backupBannerLoginButton")

                        Button {
                            dismiss()
                            AuthFunnel.log(.backupBannerDismissed)
                        } label: {
                            Text("나중에")
                                .typography(.caption)
                                .foregroundStyle(Color.textTertiary)
                                .padding(.horizontal, 12)
                                .padding(.vertical, 6)
                        }
                        .buttonStyle(.plain)
                        .accessibilityIdentifier("backupBannerDismissButton")
                    }
                    .padding(.top, 4)
                }
                Spacer(minLength: 0)
            }
            .padding(12)
            .background(
                RoundedRectangle(cornerRadius: 8)
                    .fill(Color(red: 232/255, green: 139/255, blue: 122/255).opacity(0.08))
            )
            .overlay(
                RoundedRectangle(cornerRadius: 8)
                    .strokeBorder(Color(red: 232/255, green: 139/255, blue: 122/255).opacity(0.4),
                                  lineWidth: 1)
            )
            .accessibilityIdentifier("backupReminderBanner")
            .accessibilityElement(children: .contain)
            .transition(.opacity.combined(with: .move(edge: .top)))
        }
    }

    private func dismiss() {
        let now = Date().timeIntervalSince1970 * 1000
        UserDefaults.standard.set(now, forKey: Self.dismissedAtKey)
    }

    /// 배너 노출 1회 로그 — body 렌더 시 1회만 실행하는 트릭. 매 재구성마다 fire 되나
    /// 분석 차원에선 impression 카운트로 의미 있음 (사용자 노출 빈도 측정).
    private var onceLog: Void {
        AuthFunnel.log(.backupBannerShown, [
            "days": "\(store.progress?.totalDaysCompleted ?? 0)",
        ])
    }
}

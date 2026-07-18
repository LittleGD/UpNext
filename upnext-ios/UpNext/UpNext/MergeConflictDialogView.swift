//
//  MergeConflictDialogView.swift
//  UpNext — 익명 → 로그인 시 데이터 충돌 해결 다이얼로그 (R1 — UI/인터랙션 회복).
//
//  웹 src/components/auth/MergeConflictDialog.tsx 1:1 포팅.
//  진실 매핑:
//   - line 22-24 : localDays/cloudDays 추출 + recommend ("cloudDays >= localDays" → cloud)
//   - line 26-37 : framer-motion fade + spring (y:40→0, opacity 0→1, scale 0.95→1)
//   - line 47-93 : 두 옵션 카드 (local 사용 vs cloud 사용), 추천 분기는 accent 보더 + "추천" 뱃지
//
//  SwiftUI motion 매핑:
//   - opacity 0→1, scale 0.95→1, offset y:40→0 : `.transition(.opacity)` + spring(.response 0.4)
//

import SwiftUI

struct MergeConflictDialogView: View {
    @EnvironmentObject private var store: GameStore
    let conflict: MergeConflictData

    var body: some View {
        ZStack {
            // 백드롭 — bg-black/70 + backdrop-blur-sm
            Color.black.opacity(0.7)
                .ignoresSafeArea()
                .background(.ultraThinMaterial)

            // 다이얼로그 컨테이너 — max-w-sm + bg-bg-elevated + rounded-2xl + p-6
            VStack(spacing: 16) {
                header

                VStack(spacing: 8) {
                    optionCard(.local)
                    optionCard(.cloud)
                }
            }
            .padding(24)
            .frame(maxWidth: 360)
            .background(Color.bgElevated, in: RoundedRectangle(cornerRadius: 16))
            .padding(.horizontal, 16)
        }
    }

    // MARK: - Header

    private var header: some View {
        VStack(spacing: 4) {
            Text("데이터 충돌")
                .typography(.heading)
                .foregroundStyle(Color.textPrimary)
            Text("이 기기와 클라우드에 서로 다른 데이터가 있어요")
                .typography(.body)
                .foregroundStyle(Color.textSecondary)
                .multilineTextAlignment(.center)
        }
    }

    // MARK: - 옵션 카드

    private enum Side { case local, cloud }

    @ViewBuilder
    private func optionCard(_ side: Side) -> some View {
        let isRecommended = (side == .local && conflict.recommend == .local)
            || (side == .cloud && conflict.recommend == .cloud)
        let title = side == .local ? AppConfig.loc("이 기기 데이터 사용") : AppConfig.loc("클라우드 데이터 사용")
        let progress = side == .local ? conflict.localProgress : conflict.cloudProgress
        let days = progress.totalDaysCompleted

        Button {
            if side == .local {
                store.resolveMergeUsingLocal()
            } else {
                store.resolveMergeUsingCloud()
            }
        } label: {
            HStack(alignment: .center) {
                VStack(alignment: .leading, spacing: 2) {
                    Text(title)
                        .typography(.body)
                        .foregroundStyle(Color.textPrimary)
                    Text("Lv.\(progress.level) · \(days)일 완료 · \(progress.xp) XP")
                        .typography(.caption)
                        .foregroundStyle(Color.textSecondary)
                }
                Spacer(minLength: 8)
                if isRecommended {
                    Text("추천")
                        .typography(.micro)
                        .foregroundStyle(Color.accentPrimary)
                        .padding(.horizontal, 8)
                        .padding(.vertical, 4)
                        .background(Color.bgSurface, in: RoundedRectangle(cornerRadius: 4))
                }
            }
            .padding(16)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(
                RoundedRectangle(cornerRadius: 12)
                    .fill(isRecommended ? Color.bgElevated : Color.bgSurface)
            )
            .overlay(
                RoundedRectangle(cornerRadius: 12)
                    .strokeBorder(
                        isRecommended ? Color.accentPrimary : Color.bgElevated,
                        lineWidth: isRecommended ? 1.5 : 1
                    )
            )
        }
        .buttonStyle(.plain)
    }
}

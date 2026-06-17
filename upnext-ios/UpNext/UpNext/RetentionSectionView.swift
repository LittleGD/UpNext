//
//  RetentionSectionView.swift
//  UpNext — iOS 전용 리텐션 섹션 (불꽃 체크인 / 지난주 리포트 / 2인 불꽃).
//
//  웹에는 없는 iOS 전용 추가 기능. 기존엔 DailyHomeView 의 카드뽑기/보드 위에 끼워
//  넣어 카드 흐름의 hierarchy 를 침범했다(사용자 제보). 웹 데일리는 카드 드로우→보드만
//  풀스크린으로 띄우므로(page.tsx), 리텐션을 데일리에서 떼어내 *아지트 상단 섹션*으로
//  이전한다. 이 뷰가 그 이전 대상 — DailyHomeView 에서 그대로 추출.
//
//  의존: GameStore(체크인·주간리포트), DuoStore(2인 불꽃). 둘 다 루트에서 주입됨.
//

import SwiftUI

struct RetentionSectionView: View {
    @EnvironmentObject private var store: GameStore
    @EnvironmentObject private var duo: DuoStore
    @State private var shownReport: WeeklyReportSummary?
    @State private var duoJoinCode = ""

    var body: some View {
        VStack(spacing: 10) {
            retentionCard
            if let report = store.retention?.weeklyReports.first {
                weeklyReportCard(report)
            }
            duoCard
        }
        .sheet(item: $shownReport) { report in
            reportSheet(report)
                .presentationDetents([.medium, .large])
        }
    }

    // MARK: 오늘 불꽃 체크인

    private var retentionCard: some View {
        let state = store.retention ?? RetentionState.fresh(today: GameStore.todayString())
        let checked = state.lastCheckInDate == GameStore.todayString()
        return HStack(spacing: 12) {
            ZStack {
                Circle()
                    .fill(checked ? Color.accentPrimary : Color.bgElevated)
                    .frame(width: 44, height: 44)
                PixelIcon(.flame, size: 22,
                          color: checked ? Color.bgPrimary : Color.accentPrimary)
            }
            VStack(alignment: .leading, spacing: 3) {
                Text(checked ? "오늘 불꽃이 켜졌어요" : "오늘 불꽃 켜기")
                    .typography(.body)
                    .foregroundStyle(Color.textPrimary)
                Text("\(state.currentLightStreak)일째 · 세이버 \(state.streakSavers)개")
                    .typography(.caption)
                    .foregroundStyle(Color.textTertiary)
                    .accessibilityIdentifier("lightStreakLabel")
            }
            Spacer(minLength: 0)
            Button {
                store.checkInToday()
            } label: {
                Text(checked ? "완료" : "체크인")
                    .typography(.caption)
                    .foregroundStyle(checked ? Color.textTertiary : Color.bgPrimary)
                    .padding(.horizontal, 12)
                    .frame(height: 34)
                    .background(checked ? Color.bgElevated : Color.accentPrimary, in: Capsule())
            }
            .buttonStyle(.plain)
            .disabled(checked)
            .accessibilityIdentifier("todayFlameButton")
        }
        .padding(14)
        .background(Color.bgSurface, in: RoundedRectangle(cornerRadius: 14))
    }

    // MARK: 지난주 리포트

    private func weeklyReportCard(_ report: WeeklyReportSummary) -> some View {
        Button { shownReport = report } label: {
            HStack(spacing: 12) {
                PixelIcon(.chart, size: 18, color: Color.accentPrimary)
                    .frame(width: 28)
                VStack(alignment: .leading, spacing: 3) {
                    Text("지난주 리포트")
                        .typography(.body)
                        .foregroundStyle(Color.textPrimary)
                    Text("\(report.checkInCount)일 체크인 · 카드 \(report.completedCardCount)장 · 로그 \(report.photoLogCount)개")
                        .typography(.caption)
                        .foregroundStyle(Color.textTertiary)
                        .lineLimit(1)
                }
                Spacer(minLength: 0)
                PixelIcon(.chevronRight, size: 12, color: Color.textTertiary)
            }
            .padding(14)
            .background(Color.bgSurface, in: RoundedRectangle(cornerRadius: 14))
        }
        .buttonStyle(.plain)
        .accessibilityIdentifier("weeklyReportCard")
    }

    // MARK: 2인 불꽃 (듀오)

    private var duoCard: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack {
                HStack(spacing: 6) {
                    PixelIcon(.users, size: 16, color: Color.textPrimary)
                    Text("2인 불꽃").typography(.body).foregroundStyle(Color.textPrimary)
                }
                Spacer()
                if duo.isWorking {
                    ProgressView()
                        .scaleEffect(0.7)
                        .tint(Color.accentPrimary)
                }
            }
            if let active = duo.activeDuo, let uid = store.auth.uid {
                activeDuoContent(active, uid: uid)
            } else {
                inviteDuoContent
            }
            if let message = duo.message {
                Text(message)
                    .typography(.caption)
                    .foregroundStyle(Color.textTertiary)
                    .lineLimit(2)
            }
        }
        .padding(14)
        .background(Color.bgSurface, in: RoundedRectangle(cornerRadius: 14))
    }

    private func activeDuoContent(_ active: DuoSnapshot, uid: String) -> some View {
        let today = GameStore.todayString()
        let otherId = active.memberIds.first { $0 != uid }
        let friendName = otherId.flatMap { active.memberNames[$0] } ?? "친구"
        let friendChecked = otherId.map { active.checkedIn(uid: $0, on: today) } ?? false
        let mineChecked = active.checkedIn(uid: uid, on: today)
        let sharedGoal = min(active.sharedDays(currentUid: uid).count, 7)
        return VStack(alignment: .leading, spacing: 10) {
            HStack(spacing: 8) {
                duoPill(title: "나", on: mineChecked)
                duoPill(title: friendName, on: friendChecked)
                Spacer(minLength: 0)
                Text("\(sharedGoal) / 7")
                    .typography(.caption)
                    .foregroundStyle(Color.accentPrimary)
            }
            HStack(spacing: 8) {
                ForEach(recentSevenDays(), id: \.self) { day in
                    Circle()
                        .fill(duoColor(active, uid: uid, day: day))
                        .frame(width: 12, height: 12)
                        .accessibilityLabel(day)
                }
                Spacer(minLength: 0)
                Button("나가기") { duo.leaveDuo() }
                    .typography(.micro)
                    .foregroundStyle(Color.textTertiary)
                    .buttonStyle(.plain)
            }
            if let code = duo.inviteCode, active.memberIds.count == 1 {
                Text("초대코드 \(code)")
                    .typography(.caption)
                    .foregroundStyle(Color.accentPrimary)
                    .accessibilityIdentifier("duoInviteCodeLabel")
            }
        }
    }

    private var inviteDuoContent: some View {
        VStack(spacing: 10) {
            HStack(spacing: 8) {
                TextField("초대코드", text: $duoJoinCode)
                    .typography(.caption)
                    .textInputAutocapitalization(.characters)
                    .disableAutocorrection(true)
                    .padding(.horizontal, 10)
                    .frame(height: 38)
                    .background(Color.bgElevated, in: RoundedRectangle(cornerRadius: 10))
                    .accessibilityIdentifier("duoJoinCodeField")
                Button("참여") {
                    duo.joinInvite(code: duoJoinCode)
                }
                .typography(.caption)
                .foregroundStyle(Color.bgPrimary)
                .frame(width: 56, height: 38)
                .background(Color.accentPrimary, in: RoundedRectangle(cornerRadius: 10))
                .buttonStyle(.plain)
                .accessibilityIdentifier("duoJoinButton")
            }
            Button {
                duo.createInvite()
            } label: {
                HStack(spacing: 6) {
                    PixelIcon(.link, size: 14, color: Color.accentPrimary)
                    Text("초대코드 만들기").typography(.caption).foregroundStyle(Color.accentPrimary)
                }
                    .frame(maxWidth: .infinity)
                    .frame(height: 38)
                    .background(Color.bgElevated, in: RoundedRectangle(cornerRadius: 10))
            }
            .buttonStyle(.plain)
            .accessibilityIdentifier("duoCreateInviteButton")
        }
    }

    private func duoPill(title: String, on: Bool) -> some View {
        HStack(spacing: 4) {
            Circle()
                .fill(on ? Color.accentPrimary : Color.textTertiary.opacity(0.35))
                .frame(width: 7, height: 7)
            Text(title)
                .typography(.micro)
        }
        .foregroundStyle(on ? Color.textPrimary : Color.textTertiary)
        .padding(.horizontal, 8)
        .frame(height: 24)
        .background(Color.bgElevated, in: Capsule())
    }

    private func duoColor(_ duo: DuoSnapshot, uid: String, day: String) -> Color {
        let other = duo.memberIds.first { $0 != uid }
        let mine = duo.checkedIn(uid: uid, on: day)
        let theirs = other.map { duo.checkedIn(uid: $0, on: day) } ?? false
        if mine && theirs { return Color.accentPrimary }
        if mine || theirs { return Color.accentPrimary.opacity(0.38) }
        return Color.bgElevated
    }

    private func recentSevenDays() -> [String] {
        (-6...0).compactMap { RetentionEngine.addDays(GameStore.todayString(), $0) }
    }

    // MARK: 주간 리포트 시트

    private func reportSheet(_ report: WeeklyReportSummary) -> some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                Text("지난주 리포트")
                    .typography(.title)
                    .foregroundStyle(Color.textPrimary)
                Text("\(report.weekStart) - \(report.weekEnd)")
                    .typography(.caption)
                    .foregroundStyle(Color.textTertiary)
                LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible())], spacing: 10) {
                    reportMetric("체크인", "\(report.checkInCount)일", .flame)
                    reportMetric("완료 카드", "\(report.completedCardCount)장", .check)
                    reportMetric("사진 로그", "\(report.photoLogCount)개", .image)
                    reportMetric("세이버", report.usedSaver ? "사용" : "미사용", .shield)
                }
                if let category = report.topCategory {
                    reportRow(icon: category.pixelIcon, title: "가장 많이 한 카테고리", value: category.label)
                }
                if let title = report.highlightCardTitle {
                    reportRow(icon: .sparkle, title: "인상적인 카드", value: title)
                }
            }
            .padding(20)
        }
        .background(Color.bgPrimary)
    }

    private func reportMetric(_ title: String, _ value: String, _ icon: PixelIconName) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            PixelIcon(icon, size: 16, color: Color.accentPrimary)
            Text(value)
                .typography(.heading)
                .foregroundStyle(Color.textPrimary)
            Text(title)
                .typography(.micro)
                .foregroundStyle(Color.textTertiary)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(14)
        .background(Color.bgSurface, in: RoundedRectangle(cornerRadius: 12))
    }

    private func reportRow(icon: PixelIconName, title: String, value: String) -> some View {
        HStack(spacing: 12) {
            PixelIcon(icon, size: 18, color: Color.accentPrimary)
                .frame(width: 24)
            VStack(alignment: .leading, spacing: 2) {
                Text(title)
                    .typography(.micro)
                    .foregroundStyle(Color.textTertiary)
                Text(value)
                    .typography(.body)
                    .foregroundStyle(Color.textPrimary)
            }
            Spacer(minLength: 0)
        }
        .padding(14)
        .background(Color.bgSurface, in: RoundedRectangle(cornerRadius: 12))
    }
}

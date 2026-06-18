//
//  RetentionSectionView.swift
//  UpNext — 불꽃 탭 본문 (스트릭 히어로 · 마일스톤 · 방패/최고기록 · 28일 히트맵 ·
//  2인 불꽃 · 지난주 리포트).
//
//  다관점 디자인 패널(게이미피케이션/소셜/데이터비주얼/감성) 합성 결과로 재설계.
//  이전엔 작은 카드 3개 평면 나열 → 위계·동기·소셜·미사용데이터(bestLightStreak·
//  checkInDates) 활용을 강화. 신규 스토어 0건(기존 RetentionState/DuoStore 로 구현).
//
//  색 규칙: 솔로=accentPrimary(라임), 듀오/함께=accentCyan(아쿠아마린).
//  accentSecondary(에러 RED)는 사용 금지. 보더·아이콘 박스 금지.
//

import SwiftUI

struct RetentionSectionView: View {
    @EnvironmentObject private var store: GameStore
    @State private var shownReport: WeeklyReportSummary?

    private var state: RetentionState {
        store.retention ?? RetentionState.fresh(today: GameStore.todayString())
    }
    private var checkedToday: Bool {
        state.lastCheckInDate == GameStore.todayString()
    }

    var body: some View {
        VStack(spacing: 14) {
            FlameHeroCore(streak: state.currentLightStreak, best: state.bestLightStreak,
                          checkedToday: checkedToday, onCheckIn: { store.checkInToday() })
            MilestoneTrack(streak: state.currentLightStreak)
            GuardStatsRow(savers: state.streakSavers, best: state.bestLightStreak,
                          current: state.currentLightStreak)
            CheckInHeatmap(checkInDates: Set(state.checkInDates),
                           saverDates: Set(state.usedSaverDates))
            DuoFlameCard()
            if let report = store.retention?.weeklyReports.first {
                weeklyReportRow(report)
            }
        }
        .sheet(item: $shownReport) { report in
            reportSheet(report).presentationDetents([.medium, .large])
        }
    }

    // MARK: - 지난주 리포트 행 (미니 7칸 잔디 + 진입)

    private func weeklyReportRow(_ report: WeeklyReportSummary) -> some View {
        let checkIns = Set(state.checkInDates)
        return Button { shownReport = report } label: {
            HStack(spacing: 12) {
                // 해당 주 7칸 미니 잔디 프리뷰
                HStack(spacing: 3) {
                    ForEach((0..<7).compactMap { RetentionEngine.addDays(report.weekStart, $0) }, id: \.self) { d in
                        RoundedRectangle(cornerRadius: 2)
                            .fill(checkIns.contains(d) ? Color.accentPrimary.opacity(0.85) : Color.bgElevated)
                            .frame(width: 8, height: 8)
                    }
                }
                VStack(alignment: .leading, spacing: 3) {
                    Text("지난주의 나")
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

    // MARK: - 주간 리포트 시트

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

    private func reportMetric(_ title: LocalizedStringKey, _ value: LocalizedStringKey, _ icon: PixelIconName) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            PixelIcon(icon, size: 16, color: Color.accentPrimary)
            Text(value).typography(.heading).foregroundStyle(Color.textPrimary)
            Text(title).typography(.micro).foregroundStyle(Color.textTertiary)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(14)
        .background(Color.bgSurface, in: RoundedRectangle(cornerRadius: 12))
    }

    private func reportRow(icon: PixelIconName, title: LocalizedStringKey, value: String) -> some View {
        HStack(spacing: 12) {
            PixelIcon(icon, size: 18, color: Color.accentPrimary).frame(width: 24)
            VStack(alignment: .leading, spacing: 2) {
                Text(title).typography(.micro).foregroundStyle(Color.textTertiary)
                Text(value).typography(.body).foregroundStyle(Color.textPrimary)
            }
            Spacer(minLength: 0)
        }
        .padding(14)
        .background(Color.bgSurface, in: RoundedRectangle(cornerRadius: 12))
    }
}

// MARK: - 불꽃 히어로 코어 (스트릭 = 키우는 불꽃, 페이지 위계 정점)

private struct FlameHeroCore: View {
    let streak: Int
    let best: Int
    let checkedToday: Bool
    let onCheckIn: () -> Void
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    private var tier: Int {
        switch streak { case 0: return 0; case 1...6: return 1; case 7...29: return 2
        case 30...99: return 3; default: return 4 }
    }
    private var flameSize: CGFloat { [40, 52, 64, 76, 88][tier] }
    private var glow: Double { checkedToday ? [0, 0.25, 0.4, 0.55, 0.7][tier] : 0.12 }
    private var renewing: Bool { streak >= best && best > 0 }

    var body: some View {
        VStack(spacing: 14) {
            ZStack {
                Circle().fill(Color.accentPrimary.opacity(glow))
                    .frame(width: flameSize * 1.9, height: flameSize * 1.9)
                    .blur(radius: 24)
                PixelIcon(.flame, size: flameSize,
                          color: checkedToday ? .accentPrimary : .textTertiary)
                    .scaleEffect(checkedToday && !reduceMotion ? 1.0 : 0.96)
                    .animation(.spring(response: 0.5, dampingFraction: 0.6), value: checkedToday)
            }
            .frame(height: flameSize * 2)

            VStack(spacing: 2) {
                Text("\(streak)").typography(.display).foregroundStyle(Color.textPrimary).monospacedDigit()
                Text("일 연속").typography(.caption).foregroundStyle(Color.textTertiary)
                    .accessibilityIdentifier("lightStreakLabel")
            }

            if renewing {
                Text("최고 기록 경신 중").typography(.caption).foregroundStyle(Color.accentPrimary)
            }

            if checkedToday {
                Text("오늘 불꽃을 이어갔어요").typography(.body).foregroundStyle(Color.accentPrimary)
            } else {
                VStack(spacing: 8) {
                    Text(streak > 0 ? "오늘도 한 번, \(streak)일 불꽃을 이어가요" : "첫 불꽃을 켜보세요")
                        .typography(.body).foregroundStyle(Color.textPrimary)
                        .multilineTextAlignment(.center)
                    Button(action: onCheckIn) {
                        Text("불꽃 켜기").typography(.body).foregroundStyle(Color.bgPrimary)
                            .frame(maxWidth: .infinity).frame(height: 48)
                            .background(Color.accentPrimary, in: Capsule())
                    }
                    .buttonStyle(.plain)
                    .accessibilityIdentifier("todayFlameButton")
                }
            }
        }
        .frame(maxWidth: .infinity)
        .padding(20)
        .background(Color.bgSurface, in: RoundedRectangle(cornerRadius: 14))
    }
}

// MARK: - 마일스톤 트랙 (7·30·100일)

private struct MilestoneTrack: View {
    let streak: Int
    private let stops = [7, 30, 100]
    private var next: Int? { stops.first { $0 > streak } }
    private var prev: Int { stops.last { $0 <= streak } ?? 0 }
    private var progress: Double {
        guard let n = next else { return 1 }
        return Double(streak - prev) / Double(n - prev)
    }
    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(spacing: 6) {
                ForEach(stops, id: \.self) { s in
                    HStack(spacing: 4) {
                        PixelIcon(streak >= s ? .trophy : .flag, size: 12,
                                  color: streak >= s ? .accentPrimary : .textTertiary)
                        Text("\(s)").typography(.micro)
                            .foregroundStyle(streak >= s ? Color.textPrimary : Color.textTertiary)
                    }
                    .padding(.horizontal, 8).frame(height: 24)
                    .background(streak >= s ? Color.accentPrimary.opacity(0.16) : Color.bgElevated, in: Capsule())
                }
                Spacer(minLength: 0)
            }
            if let n = next {
                GeometryReader { g in
                    ZStack(alignment: .leading) {
                        Capsule().fill(Color.bgElevated).frame(height: 6)
                        Capsule().fill(Color.accentPrimary).frame(width: g.size.width * progress, height: 6)
                    }
                }.frame(height: 6)
                Text("다음 마일스톤까지 \(n - streak)일").typography(.caption).foregroundStyle(Color.textTertiary)
            } else {
                Text("100일 달성 — 전설의 불꽃").typography(.caption).foregroundStyle(Color.accentPrimary)
            }
        }
        .padding(14)
        .background(Color.bgSurface, in: RoundedRectangle(cornerRadius: 14))
    }
}

// MARK: - 방패(세이버) + 최고기록 스탯 행

private struct GuardStatsRow: View {
    let savers: Int
    let best: Int
    let current: Int
    private let maxSavers = RetentionEngine.maxMonthlySavers

    var body: some View {
        HStack(spacing: 10) {
            VStack(alignment: .leading, spacing: 8) {
                HStack(spacing: 6) {
                    ForEach(0..<maxSavers, id: \.self) { i in
                        PixelIcon(.shield, size: 18,
                                  color: i < savers ? .accentPrimary : Color.textTertiary.opacity(0.3))
                    }
                }
                Text(savers > 0 ? "방패 \(savers)개 — 하루 빠져도 이어져요" : "방패가 없어요, 오늘은 꼭 켜요")
                    .typography(.micro).foregroundStyle(Color.textTertiary).lineLimit(2)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(14)
            .background(Color.bgSurface, in: RoundedRectangle(cornerRadius: 12))

            VStack(alignment: .leading, spacing: 8) {
                PixelIcon(.trophy, size: 18, color: .accentPrimary)
                Text("\(best)일").typography(.heading).foregroundStyle(Color.textPrimary).monospacedDigit()
                Text(current >= best && best > 0 ? "최고 기록 경신 중" : "최고 기록")
                    .typography(.micro)
                    .foregroundStyle(current >= best && best > 0 ? Color.accentPrimary : Color.textTertiary)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(14)
            .background(Color.bgSurface, in: RoundedRectangle(cornerRadius: 12))
        }
    }
}

// MARK: - 28일 체크인 히트맵 (checkInDates 시각화)

private struct CheckInHeatmap: View {
    let checkInDates: Set<String>
    let saverDates: Set<String>
    private let today = GameStore.todayString()
    private let days: [String]
    private let cols = Array(repeating: GridItem(.flexible(), spacing: 6), count: 7)

    init(checkInDates: Set<String>, saverDates: Set<String>) {
        self.checkInDates = checkInDates
        self.saverDates = saverDates
        // addDays 28회를 init 1회로 캐시 (성능).
        self.days = (-27...0).compactMap { RetentionEngine.addDays(GameStore.todayString(), $0) }
    }

    private func color(_ d: String) -> Color {
        if checkInDates.contains(d) { return .accentPrimary }
        if saverDates.contains(d) { return Color.accentPrimary.opacity(0.55) }
        if d == today { return Color.accentPrimary.opacity(0.4) }
        return .bgElevated
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("내가 지나온 28일").typography(.body).foregroundStyle(Color.textPrimary)
            LazyVGrid(columns: cols, spacing: 6) {
                ForEach(days, id: \.self) { d in
                    RoundedRectangle(cornerRadius: 4)
                        .fill(color(d))
                        .aspectRatio(1, contentMode: .fit)
                        .accessibilityLabel(
                            checkInDates.contains(d) ? "\(d) 불꽃 켜짐"
                            : (saverDates.contains(d) ? "\(d) 방패로 메움" : "\(d) 빈 날"))
                }
            }
        }
        .padding(14)
        .background(Color.bgSurface, in: RoundedRectangle(cornerRadius: 14))
    }
}

// MARK: - 2인 불꽃 카드 (활성/대기/비활성 3상태 — 함께=시안)

private struct DuoFlameCard: View {
    @EnvironmentObject private var duo: DuoStore
    @EnvironmentObject private var store: GameStore
    @State private var joinCode = ""
    @State private var celebrate = false
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(spacing: 6) {
                PixelIcon(.users, size: 16, color: Color.textPrimary)
                Text("2인 불꽃").typography(.body).foregroundStyle(Color.textPrimary)
                Spacer()
                if duo.isWorking {
                    ProgressView().scaleEffect(0.7).tint(Color.accentPrimary)
                }
            }
            if duo.friendNudgedMe { nudgeBanner }
            if let a = duo.activeDuo, let uid = store.auth.uid {
                if a.memberIds.count == 2 { activeBody(a, uid: uid) }
                else { waitingBody(a) }
            } else {
                inactiveBody
            }
            if let message = duo.message {
                Text(message).typography(.caption).foregroundStyle(Color.textTertiary).lineLimit(2)
            }
        }
        .padding(14)
        .background(Color.bgSurface, in: RoundedRectangle(cornerRadius: 14))
        .overlay { PixelConfetti(trigger: $celebrate).allowsHitTesting(false) }
    }

    // 활성 — 두 명. 둘 다 켜지면 융합 불꽃 + 함께 N일째.
    private func activeBody(_ a: DuoSnapshot, uid: String) -> some View {
        let today = GameStore.todayString()
        let otherId = a.memberIds.first { $0 != uid }
        let friendName = otherId.flatMap { a.memberNames[$0] } ?? "친구"
        let mine = a.checkedIn(uid: uid, on: today)
        let theirs = otherId.map { a.checkedIn(uid: $0, on: today) } ?? false
        let fused = mine && theirs
        let joint = jointStreak(a, uid: uid)
        return VStack(alignment: .leading, spacing: 12) {
            if fused {
                ZStack {
                    Circle().fill(Color.accentCyan.opacity(0.22)).frame(width: 100, height: 100).blur(radius: 22)
                    PixelIcon(.flame, size: 56, color: .accentCyan)
                }
                .frame(maxWidth: .infinity)
                .frame(height: 96)
                Text("함께 \(joint)일째").typography(.heading).foregroundStyle(Color.accentCyan)
                    .frame(maxWidth: .infinity)
                Text("오늘 둘 다 불꽃을 켰어요").typography(.caption).foregroundStyle(Color.accentCyan)
                    .frame(maxWidth: .infinity)
            } else {
                HStack(spacing: 24) {
                    Spacer(minLength: 0)
                    flameSpark(AppConfig.loc("나"), on: mine)
                    flameSpark(friendName, on: theirs)
                    Spacer(minLength: 0)
                }
                .padding(.vertical, 4)
                if joint > 0 {
                    Text("함께 \(joint)일째").typography(.caption).foregroundStyle(Color.accentCyan)
                        .frame(maxWidth: .infinity)
                }
                if mine && !theirs {
                    // 내가 켰고 친구는 아직 — 기다림 카피 대신 친구를 깨우는 CTA.
                    nudgeButton(uid: uid, friendName: friendName)
                } else {
                    Text(statusCopy(mine: mine, theirs: theirs))
                        .typography(.caption)
                        .foregroundStyle(theirs && !mine ? Color.textSecondary : Color.textTertiary)
                        .frame(maxWidth: .infinity)
                        .multilineTextAlignment(.center)
                }
            }
            // 최근 7일 듀오 dot (보조)
            HStack(spacing: 8) {
                ForEach(recentSevenDays(), id: \.self) { day in
                    Circle().fill(duoDot(a, uid: uid, day: day)).frame(width: 12, height: 12)
                }
                Spacer(minLength: 0)
                Button("나가기") { duo.leaveDuo() }
                    .typography(.micro).foregroundStyle(Color.textTertiary).buttonStyle(.plain)
            }
        }
        .onChange(of: fused) { now in
            if now && !reduceMotion {
                celebrate = true
                Haptics.play(.celebration)
            }
        }
    }

    // 대기 — 초대했지만 친구 미참여(memberIds.count == 1).
    private func waitingBody(_ a: DuoSnapshot) -> some View {
        VStack(spacing: 12) {
            HStack(spacing: 24) {
                Spacer(minLength: 0)
                flameSpark(AppConfig.loc("나"), on: store.auth.uid.map { a.checkedIn(uid: $0, on: GameStore.todayString()) } ?? false)
                emptyFriendSlot
                Spacer(minLength: 0)
            }
            .padding(.vertical, 4)
            Text("동료를 기다리는 중").typography(.caption).foregroundStyle(Color.textTertiary)
            if let code = duo.inviteCode {
                Text("초대코드 \(code)")
                    .typography(.heading).foregroundStyle(Color.accentPrimary)
                    .accessibilityIdentifier("duoInviteCodeLabel")
            }
            Button("나가기") { duo.leaveDuo() }
                .typography(.micro).foregroundStyle(Color.textTertiary).buttonStyle(.plain)
        }
    }

    // 비활성 — 듀오 없음. 빈 파티 자리 + 초대/참여.
    private var inactiveBody: some View {
        VStack(spacing: 12) {
            HStack(spacing: 18) {
                Spacer(minLength: 0)
                flameSpark(AppConfig.loc("나"), on: false)
                PixelIcon(.plus, size: 14, color: Color.textTertiary)
                emptyFriendSlot
                Spacer(minLength: 0)
            }
            .padding(.vertical, 4)
            VStack(spacing: 2) {
                Text("함께 켜면 더 오래 타요").typography(.heading).foregroundStyle(Color.textPrimary)
                Text("친구를 불러 공동 불꽃을 시작하세요").typography(.caption).foregroundStyle(Color.textTertiary)
            }
            inviteControls
        }
    }

    private var inviteControls: some View {
        VStack(spacing: 10) {
            HStack(spacing: 8) {
                TextField("초대코드", text: $joinCode)
                    .typography(.caption)
                    .textInputAutocapitalization(.characters)
                    .disableAutocorrection(true)
                    .padding(.horizontal, 10).frame(height: 38)
                    .background(Color.bgElevated, in: RoundedRectangle(cornerRadius: 10))
                    .accessibilityIdentifier("duoJoinCodeField")
                Button("참여") { duo.joinInvite(code: joinCode) }
                    .typography(.caption).foregroundStyle(Color.bgPrimary)
                    .frame(width: 56, height: 38)
                    .background(Color.accentPrimary, in: RoundedRectangle(cornerRadius: 10))
                    .buttonStyle(.plain)
                    .accessibilityIdentifier("duoJoinButton")
            }
            Button { duo.createInvite() } label: {
                HStack(spacing: 6) {
                    PixelIcon(.link, size: 14, color: Color.accentPrimary)
                    Text("초대코드 만들기").typography(.caption).foregroundStyle(Color.accentPrimary)
                }
                .frame(maxWidth: .infinity).frame(height: 38)
                .background(Color.bgElevated, in: RoundedRectangle(cornerRadius: 10))
            }
            .buttonStyle(.plain)
            .accessibilityIdentifier("duoCreateInviteButton")
        }
    }

    // MARK: 헬퍼

    private func flameSpark(_ name: String, on: Bool) -> some View {
        VStack(spacing: 5) {
            PixelIcon(.flame, size: 30, color: on ? .accentCyan : Color.textTertiary.opacity(0.4))
            Text(name).typography(.micro)
                .foregroundStyle(on ? Color.textPrimary : Color.textTertiary).lineLimit(1)
        }
    }

    // 콕 찌르기 CTA — 내가 켰고 친구는 아직일 때. 이미 오늘 찔렀으면 비활성.
    // 색은 듀오 카드 톤(accentCyan)으로 통일 — 솔로=라임/듀오=시안 분리 유지.
    private func nudgeButton(uid: String, friendName: String) -> some View {
        let pokedToday = duo.activeDuo?.poked(uid: uid, on: GameStore.todayString()) ?? false
        return VStack(spacing: 8) {
            Text("\(friendName)님은 아직이에요")
                .typography(.caption).foregroundStyle(Color.textTertiary)
                .frame(maxWidth: .infinity)
            Button {
                duo.nudge()
                Haptics.play(.medium)
            } label: {
                HStack(spacing: 6) {
                    PixelIcon(.zap, size: 14, color: pokedToday ? Color.textTertiary : Color.bgPrimary)
                    Text(pokedToday ? "콕 찔렀어요" : "콕 찌르기")
                        .typography(.body)
                        .foregroundStyle(pokedToday ? Color.textTertiary : Color.bgPrimary)
                }
                .frame(maxWidth: .infinity).frame(height: 44)
                .background(pokedToday ? Color.bgElevated : Color.accentCyan, in: Capsule())
            }
            .buttonStyle(.plain)
            .disabled(pokedToday)
            .accessibilityIdentifier("duoNudgeButton")
        }
    }

    // 받는 쪽 배너 — 친구가 나를 찌르면 카드 상단에 1회. 탭하면 닫힘.
    private var nudgeBanner: some View {
        Button { duo.acknowledgeNudge() } label: {
            HStack(spacing: 8) {
                PixelIcon(.zap, size: 14, color: Color.accentCyan)
                Text("친구가 콕 찔렀어요 — 오늘 불꽃을 켜볼까요?")
                    .typography(.caption).foregroundStyle(Color.accentCyan)
                    .frame(maxWidth: .infinity, alignment: .leading)
            }
            .padding(.horizontal, 12).frame(minHeight: 38)
            .frame(maxWidth: .infinity)
            .background(Color.accentCyan.opacity(0.16), in: RoundedRectangle(cornerRadius: 10))
        }
        .buttonStyle(.plain)
        .accessibilityIdentifier("duoNudgeBanner")
    }

    private var emptyFriendSlot: some View {
        VStack(spacing: 5) {
            ZStack {
                Circle().fill(Color.bgElevated.opacity(0.6)).frame(width: 38, height: 38)
                PixelIcon(.users, size: 16, color: Color.textTertiary.opacity(0.5))
            }
            Text("빈 자리").typography(.micro).foregroundStyle(Color.textTertiary.opacity(0.6))
        }
    }

    private func statusCopy(mine: Bool, theirs: Bool) -> LocalizedStringKey {
        if theirs && !mine { return "친구가 먼저 켰어요 — 같이 이어가요" }
        if mine && !theirs { return "친구의 불꽃을 기다리는 중" }
        return "오늘은 둘 다 아직이에요 — 천천히 켜요"
    }

    private func jointStreak(_ a: DuoSnapshot, uid: String) -> Int {
        let shared = Set(a.sharedDays(currentUid: uid))
        var n = 0
        var d: String? = GameStore.todayString()
        while let c = d, shared.contains(c) { n += 1; d = RetentionEngine.addDays(c, -1) }
        return n
    }

    private func recentSevenDays() -> [String] {
        (-6...0).compactMap { RetentionEngine.addDays(GameStore.todayString(), $0) }
    }

    private func duoDot(_ a: DuoSnapshot, uid: String, day: String) -> Color {
        let other = a.memberIds.first { $0 != uid }
        let mine = a.checkedIn(uid: uid, on: day)
        let theirs = other.map { a.checkedIn(uid: $0, on: day) } ?? false
        if mine && theirs { return Color.accentCyan }
        if mine || theirs { return Color.accentCyan.opacity(0.38) }
        return Color.bgElevated
    }
}

//
//  WeeklyLeaderboardView.swift
//  UpNext — 주간 리더보드 (Up Hero 주간 변종 / 클리어 순위).
//
//  웹 components/uphero/WeeklyLeaderboard.tsx 이식. 17-leaderboard-dummy 이전에는
//  하드코딩 mock(민지/Jay/수아…)을 가드 없이 프로덕션에 노출했다(블로커). 이제
//  WeeklyLeaderboardService(Firestore) 로 실데이터를 fetch 하고 4가지 상태를 렌더한다:
//   (1) 로딩 → skeleton 8줄
//   (2) 비로그인 + 데이터 없음 → "로그인 후 볼 수 있어요" (읽기는 공개지만 참여 유도)
//   (3) entries 비어있음 → "첫 주자가 되어보세요" 빈 상태
//   (4) 실데이터 → 순위 rows + 본인이 top100 밖이면 하단 "내 순위" 섹션
//

import SwiftUI

struct WeeklyLeaderboardView: View {
    let onBack: () -> Void
    /// 주간 변종 weekId(예: "2026-W16") — Firestore 컬렉션 키이자 fetch 인자.
    let weekId: String
    let affixName: String

    /// nil = 로딩 중, [] = 데이터 없음, non-empty = 실데이터. 웹 entries===null 로딩 관례.
    @State private var entries: [WeeklyLeaderboardEntry]? = nil
    /// 본인 순위 — top100 밖일 때 하단 표기. nil = 없음/미로그인.
    @State private var myData: (rank: Int, entry: WeeklyLeaderboardEntry)? = nil
    @State private var didLoad = false

    private var isSignedIn: Bool { WeeklyLeaderboardService.isSignedIn }

    var body: some View {
        VStack(spacing: 0) {
            header
            ScrollView {
                VStack(alignment: .leading, spacing: 12) {
                    affixCard
                    content
                }
                .padding(16)
                .padding(.bottom, 100)
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(Color.bgPrimary)
        // 웹 useEffect([weekId]) — 진입 시 top100 + 내 순위 병렬 fetch. 재진입 중복 방지 가드.
        .task {
            guard !didLoad else { return }
            didLoad = true
            async let top = WeeklyLeaderboardService.fetchWeeklyTop(weekId: weekId, limit: 100)
            async let mine = WeeklyLeaderboardService.fetchMyRank(weekId: weekId)
            let (topResult, mineResult) = await (top, mine)
            entries = topResult
            myData = mineResult
        }
    }

    // MARK: - 상태별 본문

    @ViewBuilder
    private var content: some View {
        if let entries {
            if entries.isEmpty {
                emptyState
            } else {
                Text("Top \(entries.count)")
                    .typography(.heading)
                    .foregroundStyle(Color.textPrimary)
                VStack(spacing: 6) {
                    ForEach(Array(entries.enumerated()), id: \.element.id) { idx, entry in
                        row(rank: idx + 1, entry: entry, isMe: myData?.entry.uid == entry.uid)
                    }
                }
                // 본인이 top100 밖이면 하단 "내 순위" 섹션 (웹 L171-192).
                if let myData, !entries.contains(where: { $0.uid == myData.entry.uid }) {
                    VStack(alignment: .leading, spacing: 6) {
                        Text("내 순위")
                            .typography(.micro)
                            .foregroundStyle(Color.textTertiary)
                        row(rank: myData.rank, entry: myData.entry, isMe: true)
                    }
                    .padding(.top, 6)
                }
            }
        } else {
            skeleton
        }
    }

    /// 로딩 skeleton — 웹 L135-148(32pt bar 8줄).
    private var skeleton: some View {
        VStack(spacing: 6) {
            ForEach(0..<8, id: \.self) { _ in
                RoundedRectangle(cornerRadius: 8)
                    .fill(Color.bgSurface.opacity(0.6))
                    .frame(height: 40)
            }
        }
    }

    /// 빈 상태 — 로그인 여부에 따라 문구 분기. 비로그인 + 무데이터면 참여 유도(로그인 안내).
    private var emptyState: some View {
        Text(isSignedIn
             ? AppConfig.loc("아직 아무도 도전 기록이 없어요. 첫 주자가 되어보세요!")
             : AppConfig.loc("리더보드는 로그인 후에 볼 수 있어요"))
            .typography(.caption)
            .foregroundStyle(Color.textTertiary)
            .multilineTextAlignment(.center)
            .frame(maxWidth: .infinity)
            .padding(.vertical, 40)
    }

    // MARK: - 구성 요소

    private var header: some View {
        HStack(spacing: 8) {
            Button(action: onBack) {
                PixelIcon(.chevronLeft, size: 16, color: Color.textSecondary)
                    .frame(width: 40, height: 40)
            }
            .buttonStyle(.plain)
            Text("주간 리더보드")
                .typography(.title)
                .foregroundStyle(Color.textPrimary)
            Spacer()
        }
        .padding(.horizontal, 8).padding(.vertical, 6)
    }

    private var affixCard: some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack(spacing: 6) {
                PixelIcon(.sparkle, size: 14, color: Color.rarityLegend)
                Text("이번 주 변종")
                    .typography(.micro).foregroundStyle(Color.textTertiary)
            }
            Text(LocalizedStringKey(affixName))
                .typography(.heading).foregroundStyle(Color.rarityLegend)
        }
        .padding(14)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Color.bgSurface, in: RoundedRectangle(cornerRadius: 12))
        .overlay(
            RoundedRectangle(cornerRadius: 12)
                .stroke(Color.rarityLegend.opacity(0.3), lineWidth: 1)
        )
    }

    private func row(rank: Int, entry: WeeklyLeaderboardEntry, isMe: Bool) -> some View {
        HStack(spacing: 12) {
            Text("\(rank)")
                .typography(.body)
                .frame(width: 30)
                .foregroundStyle(rankColor(rank))
            Circle()
                .fill(Color(hex: avatarHex(for: entry.uid)))
                .frame(width: 32, height: 32)
            VStack(alignment: .leading, spacing: 2) {
                Text(entry.displayName + (isMe ? AppConfig.loc(" (나)") : ""))
                    .typography(.caption)
                    .foregroundStyle(isMe ? Color.bgPrimary : Color.textPrimary)
                    .lineLimit(1)
                Text("F\(entry.floorsCleared) · Lv.\(entry.heroLevel)")
                    .typography(.micro)
                    .foregroundStyle(isMe ? Color.bgPrimary.opacity(0.7) : Color.textTertiary)
                    .monospacedDigit()
            }
            Spacer(minLength: 0)
            Text("\(entry.score)")
                .typography(.caption)
                .foregroundStyle(isMe ? Color.bgPrimary : Color.accentPrimary)
                .monospacedDigit()
        }
        .padding(.horizontal, 14).padding(.vertical, 10)
        .background(isMe ? Color.accentPrimary : Color.bgSurface,
                    in: RoundedRectangle(cornerRadius: 10))
    }

    private func rankColor(_ rank: Int) -> Color {
        switch rank {
        case 1:  return Color.rarityLegend
        case 2:  return Color.rarityUnique
        case 3:  return Color.rarityRare
        default: return Color.textTertiary
        }
    }

    /// uid 해시로 결정론적 아바타 색 — 유저별로 안정적이면서 mock 색 팔레트의 시각 유지.
    private func avatarHex(for uid: String) -> UInt32 {
        let palette: [UInt32] = [0xCDF564, 0xF037A5, 0x9BF0E1, 0xFF4632, 0x4100F5,
                                 0xE8C76B, 0x87C87A, 0xC88BE8]
        var hash: UInt32 = 5381
        for byte in uid.utf8 { hash = (hash &* 33) &+ UInt32(byte) }
        return palette[Int(hash % UInt32(palette.count))]
    }
}

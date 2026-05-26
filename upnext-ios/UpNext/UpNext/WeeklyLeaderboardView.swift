//
//  WeeklyLeaderboardView.swift
//  UpNext — 주간 리더보드 (Up Hero 주간 변종 / 클리어 순위).
//
//  웹 components/uphero/WeeklyLeaderboard.tsx (300 LOC) 핵심 회복.
//   - 상위 N명 (이름 / 아바타 색 / floor / time)
//   - 본인 순위 강조 (accentPrimary 배경)
//   - 현재 주간 변종(weekly affix) 이름 표시
//   - 데이터는 Firestore (현재 stub — 로컬 mock 데이터로 시각 회복)
//

import SwiftUI

struct LeaderboardEntry: Identifiable {
    let id: String
    let rank: Int
    let name: String
    let floor: Int
    let timeSeconds: Int
    let avatarHex: UInt32
    let isMe: Bool
}

struct WeeklyLeaderboardView: View {
    let onBack: () -> Void
    let entries: [LeaderboardEntry]
    let affixName: String

    var body: some View {
        VStack(spacing: 0) {
            header
            ScrollView {
                VStack(alignment: .leading, spacing: 12) {
                    affixCard
                    Text("Top \(entries.count)")
                        .typography(.heading)
                        .foregroundStyle(Color.textPrimary)
                    VStack(spacing: 6) {
                        ForEach(entries) { entry in
                            row(entry)
                        }
                    }
                }
                .padding(16)
                .padding(.bottom, 100)
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(Color.bgPrimary)
    }

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
            Text(affixName)
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

    private func row(_ e: LeaderboardEntry) -> some View {
        HStack(spacing: 12) {
            Text("\(e.rank)")
                .typography(.body)
                .frame(width: 30)
                .foregroundStyle(rankColor(e.rank))
            Circle()
                .fill(Color(hex: e.avatarHex))
                .frame(width: 32, height: 32)
            VStack(alignment: .leading, spacing: 2) {
                Text(e.name + (e.isMe ? " (나)" : ""))
                    .typography(.caption)
                    .foregroundStyle(e.isMe ? Color.bgPrimary : Color.textPrimary)
                Text("F\(e.floor) · \(formatTime(e.timeSeconds))")
                    .typography(.micro)
                    .foregroundStyle(e.isMe ? Color.bgPrimary.opacity(0.7) : Color.textTertiary)
                    .monospacedDigit()
            }
            Spacer(minLength: 0)
        }
        .padding(.horizontal, 14).padding(.vertical, 10)
        .background(e.isMe ? Color.accentPrimary : Color.bgSurface,
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

    private func formatTime(_ sec: Int) -> String {
        let m = sec / 60, s = sec % 60
        return String(format: "%d:%02d", m, s)
    }

    /// 현재는 mock — 실제 Firestore 연결은 후속 슬라이스에서.
    static let mockEntries: [LeaderboardEntry] = [
        LeaderboardEntry(id: "1", rank: 1, name: "민지", floor: 30, timeSeconds: 320, avatarHex: 0xCDF564, isMe: false),
        LeaderboardEntry(id: "2", rank: 2, name: "Jay", floor: 28, timeSeconds: 412, avatarHex: 0xF037A5, isMe: false),
        LeaderboardEntry(id: "3", rank: 3, name: "수아", floor: 27, timeSeconds: 388, avatarHex: 0x9BF0E1, isMe: false),
        LeaderboardEntry(id: "4", rank: 4, name: "나", floor: 22, timeSeconds: 520, avatarHex: 0xFF4632, isMe: true),
        LeaderboardEntry(id: "5", rank: 5, name: "Kai", floor: 21, timeSeconds: 590, avatarHex: 0x4100F5, isMe: false),
    ]
}

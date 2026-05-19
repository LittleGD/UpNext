//
//  DungeonView.swift
//  UpNext — Up Hero 던전 전투 화면 (Phase 4 슬라이스 21).
//
//  웹 components/uphero/DungeonView.tsx 의 자리. currentSession 이 있으면
//  UpHeroGameView 가 아지트 대신 이 화면을 보여준다 (웹 UpHeroGame 의 분기와 동일).
//
//  슬라이스 21 은 세션 생성 확인용 placeholder — 던전·층 정보 + 탐험 포기.
//  전투 진행(tickSession·전투 로그·이벤트 선택지·세션 결산)은 다음 슬라이스.
//

import SwiftUI

struct DungeonView: View {
    @EnvironmentObject private var upHero: UpHeroStore

    var body: some View {
        ZStack {
            Color.bgPrimary.ignoresSafeArea()
            if let session = upHero.state.currentSession {
                content(session)
            }
        }
    }

    private func content(_ session: CombatSession) -> some View {
        VStack(spacing: 14) {
            Spacer()
            Image(systemName: "figure.walk")
                .font(.system(size: 44))
                .foregroundStyle(Color.accentPrimary)
            Text(Dungeons.all[session.dungeonId]?.name ?? "던전")
                .typography(.title)
                .foregroundStyle(Color.textPrimary)
            Text("\(session.currentFloor)층 · 탐험 진행 중")
                .typography(.body)
                .foregroundStyle(Color.accentPrimary)
            Text("전투 진행은 다음 슬라이스에서 구현됩니다")
                .typography(.caption)
                .foregroundStyle(Color.textTertiary)
            Spacer()
            Button { upHero.abandonSession() } label: {
                Text("탐험 포기")
                    .typography(.body)
                    .frame(maxWidth: .infinity)
                    .frame(height: 52)
                    .foregroundStyle(Color.bgPrimary)
                    .background(Color.accentPrimary, in: RoundedRectangle(cornerRadius: 12))
            }
            .buttonStyle(.plain)
        }
        .padding(24)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }
}

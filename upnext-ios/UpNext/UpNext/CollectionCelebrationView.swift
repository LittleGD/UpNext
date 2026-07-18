//
//  CollectionCelebrationView.swift
//  UpNext — 컬렉션 완성 축하 모달 (Phase 4 슬라이스 13 · Phase 4.3 마무리).
//
//  웹 components/cards/CollectionCelebration.tsx 포팅. 164장 카드를 처음으로
//  모두 모은 순간 1회성으로 뜨는 축하 모달 — 트로피 + 칭호 획득 + 보너스 안내.
//
//  트리거: GameStore.collectionCelebration == true (openCardPack 의 첫 완료 감지).
//  닫힘:   확인 버튼 또는 배경 탭 → dismissCollectionCelebration().
//
//  웹의 xpGain 사운드는 Phase 5.1 — 생략. 영웅 코인 실지급은 Phase 4.4 (안내만).
//

import SwiftUI

struct CollectionCelebrationView: View {
    @EnvironmentObject private var store: GameStore

    /// 트로피 펄스 / 방사 광선 등장 — onAppear 에서 켠다.
    @State private var trophyPulse = false
    @State private var raysShown = false

    private let rayCount = 12

    var body: some View {
        ZStack {
            // 어두운 배경 — 바깥을 탭하면 닫힌다.
            Color.black.opacity(0.85)
                .ignoresSafeArea()
                .onTapGesture { store.dismissCollectionCelebration() }

            rays
            card
        }
        .onAppear {
            // 광선 등장은 각 Capsule 의 .animation(value: raysShown) 가 staggered 로 구동.
            //   withAnimation 으로 또 감싸면 두 애니메이션이 겹치므로 플래그만 토글한다.
            raysShown = true
            // 트로피만 무한 펄스 — 전용 애니메이션이 없으니 withAnimation 으로 구동.
            withAnimation(.easeInOut(duration: 1.4).repeatForever(autoreverses: true)) {
                trophyPulse = true
            }
        }
    }

    // MARK: - 방사형 광선

    /// 트로피 주변으로 뻗는 12갈래 광선. 등장 시 중심에서 바깥으로 터지듯 확장.
    private var rays: some View {
        ZStack {
            ForEach(0..<rayCount, id: \.self) { i in
                Capsule()
                    .fill(LinearGradient(
                        colors: [Color.accentPrimary.opacity(0), Color.accentPrimary],
                        startPoint: .top, endPoint: .bottom))
                    .frame(width: 3, height: 200)
                    .offset(y: -150)
                    .rotationEffect(.degrees(Double(i) / Double(rayCount) * 360))
                    .scaleEffect(raysShown ? 1 : 0.25)
                    .opacity(raysShown ? 0.45 : 0)
                    .animation(.easeOut(duration: 1.0).delay(Double(i) * 0.04),
                               value: raysShown)
            }
        }
        .allowsHitTesting(false)  // 광선은 배경 탭(닫기)을 막지 않는다.
    }

    // MARK: - 축하 카드

    private var card: some View {
        VStack(spacing: 16) {
            PixelIcon(.trophy, size: 64, color: Color.accentPrimary)
                .scaleEffect(trophyPulse ? 1.08 : 1)

            Text("도감 완성!")
                .typography(.title)
                .foregroundStyle(Color.accentPrimary)

            Text("\(CardCatalog.allCards.count)장의 카드를 모두 모았어요.\n진정한 갓생러의 길에 한 발 더 다가섰습니다.")
                .typography(.body)
                .foregroundStyle(Color.textPrimary)
                .multilineTextAlignment(.center)
                .fixedSize(horizontal: false, vertical: true)

            titleAward
            rewardGrid

            Button {
                store.dismissCollectionCelebration()
            } label: {
                Text("확인")
                    .typography(.body)
                    .frame(maxWidth: .infinity)
                    .frame(height: 50)
                    .foregroundStyle(Color.bgPrimary)
                    .background(Color.accentPrimary, in: RoundedRectangle(cornerRadius: 12))
            }
            .buttonStyle(.plain)
        }
        .padding(24)
        .frame(maxWidth: 360)
        .background(Color.bgElevated, in: RoundedRectangle(cornerRadius: 20))
        .shadow(color: Color.accentPrimary.opacity(0.35), radius: 28, y: 12)
        .padding(.horizontal, 24)
        .onTapGesture { }  // 카드 탭은 배경 닫기로 전파되지 않게 흡수.
    }

    /// 칭호 획득 안내 — "도감 완성자" 칭호.
    private var titleAward: some View {
        HStack(spacing: 10) {
            PixelIcon(.trophy, size: 16, color: Color.accentPrimary)
            VStack(alignment: .leading, spacing: 2) {
                Text("칭호 획득")
                    .typography(.caption)
                    .foregroundStyle(Color.accentPrimary)
                Text("도감 완성자")
                    .typography(.caption)
                    .foregroundStyle(Color.textSecondary)
            }
            Spacer(minLength: 0)
        }
        .padding(12)
        .frame(maxWidth: .infinity)
        .background(Color.accentPrimary.opacity(0.12), in: RoundedRectangle(cornerRadius: 10))
    }

    /// 보너스 보상 — XP / 영웅 코인 2칸 그리드.
    private var rewardGrid: some View {
        HStack(spacing: 10) {
            rewardCell(label: "XP", amount: PackTier.firstClearBonus.xp)
            rewardCell(label: AppConfig.loc("영웅 코인"), amount: PackTier.firstClearBonus.coins)
        }
    }

    private func rewardCell(label: String, amount: Int) -> some View {
        VStack(spacing: 4) {
            Text(label)
                .typography(.caption)
                .foregroundStyle(Color.textTertiary)
            Text("+\(amount)")
                .typography(.body)
                .foregroundStyle(Color.accentPrimary)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 12)
        .background(Color.bgSurface, in: RoundedRectangle(cornerRadius: 10))
    }
}

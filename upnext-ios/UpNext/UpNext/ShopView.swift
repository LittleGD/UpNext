//
//  ShopView.swift
//  UpNext — Up Hero 갓생 상점 (Phase 4 슬라이스 25).
//
//  웹 components/uphero/CampPlaceholder.tsx 의 ShopView 포팅. 던전 탐험으로 번
//  코인을 카드팩으로 바꾼다 — 코인 루프(탐험에서 벌고 → 상점에서 쓴다)를 닫는다.
//
//  슬라이스 25 는 카드팩만 — 미니게임 티켓은 미니게임(Phase 4.6), 탐험권은 패스
//  경제 슬라이스에서 이 상점에 추가된다 (지금 사도 쓸 데가 없는 품목은 제외).
//

import SwiftUI

struct ShopView: View {
    @EnvironmentObject private var upHero: UpHeroStore
    @EnvironmentObject private var store: GameStore
    /// 아지트 홈으로 복귀.
    let onBack: () -> Void

    var body: some View {
        VStack(spacing: 0) {
            header
            ScrollView {
                VStack(spacing: 10) {
                    shopItem(name: "작은 카드팩", desc: "새 카드 1장",
                             price: ShopPrices.cardPackSmall) {
                        store.buyCardPack(full: false)
                    }
                    shopItem(name: "카드팩", desc: "새 카드 5장",
                             price: ShopPrices.cardPackFull) {
                        store.buyCardPack(full: true)
                    }
                }
                .padding(16)
                .padding(.bottom, 88)  // 하단 플로팅 네비 여유
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(Color.bgPrimary)
    }

    // MARK: - 헤더 (뒤로 + 코인 잔액)

    private var header: some View {
        HStack(spacing: 8) {
            Button(action: onBack) {
                Image(systemName: "chevron.left")
                    .font(.system(size: 16, weight: .semibold))
                    .foregroundStyle(Color.textSecondary)
                    .frame(width: 40, height: 40)
            }
            .buttonStyle(.plain)
            Text("상점")
                .typography(.title)
                .foregroundStyle(Color.textPrimary)
            Spacer()
            Text("코인 \(upHero.state.coins)")
                .typography(.body)
                .foregroundStyle(Color.accentPrimary)
        }
        .padding(.horizontal, 8)
        .padding(.vertical, 6)
    }

    // MARK: - 상점 항목

    private func shopItem(name: String, desc: String, price: Int,
                          buy: @escaping () -> Void) -> some View {
        let affordable = upHero.state.coins >= price
        return HStack(spacing: 12) {
            VStack(alignment: .leading, spacing: 2) {
                Text(name)
                    .typography(.body)
                    .foregroundStyle(Color.textPrimary)
                Text(desc)
                    .typography(.micro)
                    .foregroundStyle(Color.textTertiary)
            }
            Spacer(minLength: 0)
            Button(action: buy) {
                Text("\(price)")
                    .typography(.caption)
                    .foregroundStyle(affordable ? Color.bgPrimary : Color.textTertiary)
                    .padding(.horizontal, 16)
                    .padding(.vertical, 8)
                    .background(affordable ? Color.accentPrimary : Color.bgElevated,
                                in: Capsule())
            }
            .buttonStyle(.plain)
            .disabled(!affordable)
        }
        .padding(14)
        .frame(maxWidth: .infinity)
        .background(Color.bgSurface, in: RoundedRectangle(cornerRadius: 12))
    }
}

//
//  BagOverflowSheet.swift
//  UpNext — 가방 초과 전리품 처리 시트 (Phase 6-E, Track E, 피드백 22).
//
//  웹 components/uphero/BagOverflowModal.tsx 1:1. 정산 때 `UpHeroRules.inventoryCap` 을 넘긴
//  드롭은 `state.overflowDrops` 에 남는다. 이 시트는 캠프에서 목록이 빌 때까지 닫히지 않는다
//  (백드롭 탭 무시). 한 개씩 판매/버리기, 또는 모두 판매. 마운트 게이트(세션 없음 · 레벨업
//  오버레이 없음 · 전직 제안 없음)는 `isVisible` — UpHeroGameView 가 읽는다.
//
//  보더 없음. 배경 단계와 라임 글로우로 위계를 만든다.
//

import SwiftUI

struct BagOverflowSheet: View {
    @EnvironmentObject private var upHero: UpHeroStore
    @State private var toast: String?

    /// 마운트 게이트 — 웹 `isBagOverflowVisible` 과 같은 네 조건.
    static func isVisible(_ s: UpHeroState) -> Bool {
        !s.overflowDrops.isEmpty
            && s.currentSession == nil
            && s.pendingHeroLevelUp == nil
            && s.pendingClassChoice == nil
    }

    private var total: Int {
        upHero.state.overflowDrops.reduce(0) { $0 + UpHeroStore.sellPrice($1) }
    }

    var body: some View {
        ZStack {
            GBPalette.darkest.opacity(0.9).ignoresSafeArea()
            VStack(spacing: 0) {
                VStack(alignment: .leading, spacing: 4) {
                    Text(AppConfig.loc("가방이 가득 찼어요"))
                        .typography(.heading).foregroundStyle(GBPalette.lightest)
                    Text(AppConfig.loc(
                        "가방 \(UpHeroRules.inventoryCap)칸을 넘긴 전리품 \(upHero.state.overflowDrops.count)개. 팔거나 버려야 해요"))
                        .typography(.caption).foregroundStyle(GBPalette.light)
                        .fixedSize(horizontal: false, vertical: true)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(16)

                ScrollView {
                    VStack(spacing: 8) {
                        ForEach(upHero.state.overflowDrops) { item in
                            row(item)
                        }
                    }
                    .padding(.horizontal, 16)
                }
                .frame(maxHeight: 360)

                Button {
                    let coins = upHero.sellAllOverflow()
                    showToast(AppConfig.loc("판매 +\(coins) C"))
                } label: {
                    Text(AppConfig.loc("모두 판매 (+\(total))"))
                        .typography(.body).monospacedDigit()
                        .foregroundStyle(GBPalette.darkest)
                        .frame(maxWidth: .infinity, minHeight: 52)
                        .background(GBPalette.lightest, in: RoundedRectangle(cornerRadius: 12))
                }
                .buttonStyle(.plain)
                .padding(16)
            }
            .frame(maxWidth: 360)
            .background(GBPalette.dark.opacity(0.95), in: RoundedRectangle(cornerRadius: 12))
            .shadow(color: GBPalette.lightest.opacity(0.25), radius: 16)
            .padding(16)

            if let toast {
                VStack {
                    Spacer()
                    Text(toast)
                        .typography(.caption)
                        .foregroundStyle(Color.textPrimary)
                        .padding(.horizontal, 16).padding(.vertical, 10)
                        .background(Color.bgElevated, in: Capsule())
                        .padding(.bottom, 40)
                }
                .allowsHitTesting(false)
            }
        }
        .accessibilityAddTraits(.isModal)
    }

    /// 한 줄 — 아이콘 + 이름/등급/주스탯 + [판매 +N] [버리기]. 웹 row.
    private func row(_ item: Equipment) -> some View {
        let price = UpHeroStore.sellPrice(item)
        return HStack(spacing: 10) {
            PixelIcon(PixelIconName.resolve(item.iconName), size: 20, color: item.rarity.color)
                .frame(width: 24)
            VStack(alignment: .leading, spacing: 2) {
                Text(item.localizedDisplayName)
                    .typography(.caption).foregroundStyle(GBPalette.lightest).lineLimit(1)
                HStack(spacing: 6) {
                    Text(item.rarity.displayName)
                        .typography(.micro).foregroundStyle(item.rarity.color)
                    if let first = EquipmentStats.orderedEntries(item).first {
                        Text("\(first.key.label) \(EquipmentStats.format(first.key, first.value))")
                            .typography(.micro).monospacedDigit().foregroundStyle(GBPalette.light)
                    }
                }
            }
            Spacer(minLength: 0)
            Button {
                let refund = upHero.resolveOverflowItem(item.id, sell: true)
                showToast(AppConfig.loc("판매 +\(refund) C"))
            } label: {
                Text(AppConfig.loc("판매 +\(price)"))
                    .typography(.micro).monospacedDigit()
                    .foregroundStyle(GBPalette.darkest)
                    .padding(.horizontal, 8)
                    .frame(minHeight: 44)
                    .background(GBPalette.lightest, in: RoundedRectangle(cornerRadius: 8))
            }
            .buttonStyle(.plain)
            Button {
                upHero.resolveOverflowItem(item.id, sell: false)
            } label: {
                Text(AppConfig.loc("버리기"))
                    .typography(.micro)
                    .foregroundStyle(GBPalette.light)
                    .padding(.horizontal, 8)
                    .frame(minHeight: 44)
                    .background(GBPalette.darkest.opacity(0.6), in: RoundedRectangle(cornerRadius: 8))
            }
            .buttonStyle(.plain)
        }
        .padding(8)
        .background(GBPalette.darkest.opacity(0.35), in: RoundedRectangle(cornerRadius: 10))
    }

    private func showToast(_ msg: String) {
        toast = msg
        DispatchQueue.main.asyncAfter(deadline: .now() + 2) { if toast == msg { toast = nil } }
    }
}

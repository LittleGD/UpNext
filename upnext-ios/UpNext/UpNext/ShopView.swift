//
//  ShopView.swift
//  UpNext — Up Hero 갓생 상점 (Phase 4 슬라이스 25 + 패스 경제 22-shop-tickets).
//
//  웹 components/uphero/CampPlaceholder.tsx 의 ShopView 포팅. 던전 탐험으로 번
//  코인을 탐험권·코인 주머니·카드팩으로 바꾼다 — 코인 루프(탐험에서 벌고 → 상점에서
//  쓴다)를 닫는다.
//
//  섹션 순서 — 웹과 동일: 데일리 코인 주머니 → 탐험권 구매 그리드 → 카드팩.
//  (카드매치 티켓 구매는 미니게임 슬라이스 스코프 — 이 파일 미포함. 22-shop-tickets
//   fixSpec 3) 참조 — 별도 후속 이슈.)
//

import SwiftUI

struct ShopView: View {
    @EnvironmentObject private var upHero: UpHeroStore
    @EnvironmentObject private var store: GameStore
    /// 아지트 홈으로 복귀.
    let onBack: () -> Void

    @State private var toast: String?

    // 오늘 날짜가 아니면 shopDaily 는 이미 지난 값 — 리셋된 것으로 취급(구매 함수와 동일 규칙).
    private var shopDailyToday: ShopDaily? {
        upHero.state.shopDaily?.date == AppClock.todayString() ? upHero.state.shopDaily : nil
    }
    private var passesBoughtToday: Int { shopDailyToday?.passesBought ?? 0 }
    private var pouchClaimedToday: Bool { shopDailyToday?.coinPouchClaimed == true }

    var body: some View {
        ZStack {
            VStack(spacing: 0) {
                header
                ScrollView {
                    VStack(spacing: 10) {
                        coinPouchSection
                        expeditionPassSection
                        shopItem(name: AppConfig.loc("작은 카드팩"), desc: AppConfig.loc("새 카드 1장"),
                                 price: ShopPrices.cardPackSmall) {
                            store.buyCardPack(full: false)
                        }
                        shopItem(name: AppConfig.loc("카드팩"), desc: AppConfig.loc("새 카드 5장"),
                                 price: ShopPrices.cardPackFull) {
                            store.buyCardPack(full: true)
                        }
                    }
                    .padding(16)
                    .padding(.bottom, 88)  // 하단 플로팅 네비 여유
                }
            }
            if let toast { toastView(toast) }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(Color.bgPrimary)
    }

    // MARK: - 헤더 (뒤로 + 코인 잔액)

    private var header: some View {
        HStack(spacing: 8) {
            Button(action: onBack) {
                // 뒤로 아이콘 색 GBPalette.light — DungeonSelectView 헤더와 톤 통일.
                PixelIcon(.chevronLeft, size: 16, color: GBPalette.light)
                    .frame(width: 40, height: 40)
            }
            .buttonStyle(.plain)
            Text("상점")
                .typography(.title)
                .foregroundStyle(Color.textPrimary)
            Spacer()
            HStack(spacing: 4) {
                PixelIcon(.coins, size: 14, color: Color.accentPrimary)
                NumberRollView(value: upHero.state.coins, baseColor: Color.accentPrimary)
                    .typography(.body)
            }
        }
        .padding(.horizontal, 8)
        .padding(.vertical, 6)
    }

    // MARK: - 데일리 코인 주머니 (웹 ShopView 코인 주머니 섹션 — 하루 1회 무료 랜덤 코인)

    private var coinPouchSection: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(spacing: 6) {
                PixelIcon(.gift, size: 14, color: GBPalette.lightest)
                Text("데일리 코인 주머니")
                    .typography(.caption)
                    .foregroundStyle(GBPalette.lightest)
            }
            UNButton(
                pouchClaimedToday ? AppConfig.loc("내일 다시 받기") : AppConfig.loc("받기"),
                variant: pouchClaimedToday ? .secondary : .primary,
                enabled: !pouchClaimedToday
            ) {
                claimPouch()
            }
            Text("하루 1회 · 무작위 코인 보상")
                .typography(.micro)
                .foregroundStyle(GBPalette.light)
                .frame(maxWidth: .infinity, alignment: .center)
        }
        .padding(12)
        .frame(maxWidth: .infinity)
        .background(GBPalette.dark.opacity(0.25), in: RoundedRectangle(cornerRadius: 12))
    }

    private func claimPouch() {
        let result = upHero.claimCoinPouch()
        // 버튼이 이미 disabled(claimed) 라 result.ok==false 분기는 정상 흐름에서 도달하지
        // 않음 — 방어적 no-op(웹 onClaimPouch 와 동일하게 실패 토스트 없음).
        guard result.ok else { return }
        Haptics.play(.success)
        SoundPlayer.shared.play(.collect)
        showToast(AppConfig.loc("코인 주머니 +\(result.coins)"))
    }

    // MARK: - 탐험권 구매 그리드 (웹 ShopView 탐험권 섹션 — 8던전 4열, 웹 grid-cols-4)

    private var expeditionPassSection: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                HStack(spacing: 6) {
                    PixelIcon(.target, size: 14, color: GBPalette.lightest)
                    Text("탐험권 구매")
                        .typography(.caption)
                        .foregroundStyle(GBPalette.lightest)
                }
                Spacer()
                Text(AppConfig.loc("오늘 \(passesBoughtToday)/\(UpHeroRules.dailyPassPurchaseCap)"))
                    .typography(.micro)
                    .monospacedDigit()
                    .foregroundStyle(passesBoughtToday >= UpHeroRules.dailyPassPurchaseCap
                                      ? GBPalette.light : GBPalette.lightest)
            }
            LazyVGrid(
                columns: Array(repeating: GridItem(.flexible(), spacing: 6), count: 4),
                spacing: 6
            ) {
                ForEach(Dungeons.list) { dungeon in
                    passButton(dungeon)
                }
            }
            Text(AppConfig.loc("\(ShopPrices.expeditionPass) 코인 / 장 · 하루 \(UpHeroRules.dailyPassPurchaseCap)장 한정"))
                .typography(.micro)
                .foregroundStyle(GBPalette.light)
                .frame(maxWidth: .infinity, alignment: .center)
        }
        .padding(12)
        .frame(maxWidth: .infinity)
        .background(GBPalette.dark.opacity(0.25), in: RoundedRectangle(cornerRadius: 12))
    }

    /// 던전 1칸 — 아이콘(테마색) + 보유/cap. 웹 shop-pass-btn 1:1(보더 대신 틴트 — 디자인 규칙).
    private func passButton(_ dungeon: Dungeon) -> some View {
        let owned = upHero.state.passes[dungeon.id] ?? 0
        let isFull = owned >= UpHeroRules.passCapPerCategory
        let dailyCapReached = passesBoughtToday >= UpHeroRules.dailyPassPurchaseCap
        let canBuy = !dailyCapReached && !isFull && upHero.state.coins >= ShopPrices.expeditionPass
        let dColor = Color(hexString: dungeon.themeColor)
        return Button {
            buyPass(dungeon)
        } label: {
            VStack(spacing: 3) {
                PixelIcon(DungeonSelectView.dungeonIcon(dungeon.id), size: 16,
                          color: canBuy ? dColor : GBPalette.light)
                Text(AppConfig.loc("\(owned)/\(UpHeroRules.passCapPerCategory)"))
                    .typography(.micro)
                    .monospacedDigit()
                    .foregroundStyle(canBuy ? GBPalette.lightest : GBPalette.light)
            }
            .frame(maxWidth: .infinity, minHeight: 56)
            .background(GBPalette.dark.opacity(canBuy ? 0.55 : 0.25), in: RoundedRectangle(cornerRadius: 8))
            .opacity(canBuy ? 1 : 0.55)
        }
        .buttonStyle(.unPress)
        .disabled(!canBuy)
        .accessibilityLabel(AppConfig.loc(
            "\(AppConfig.locRuntime(dungeon.name)) 탐험권 구매 (\(ShopPrices.expeditionPass) 코인)"))
    }

    private func buyPass(_ dungeon: Dungeon) {
        switch upHero.purchasePass(dungeon.id) {
        case .ok:
            Haptics.play(.success)
            SoundPlayer.shared.play(.collect)
            showToast(AppConfig.loc("\(AppConfig.locRuntime(dungeon.name)) 탐험권 +1"))
        case .noCoin:
            Haptics.play(.warning)
            SoundPlayer.shared.play(.cancel)
            showToast(AppConfig.loc("코인이 부족해요"))
        case .dailyCap:
            Haptics.play(.warning)
            SoundPlayer.shared.play(.cancel)
            showToast(AppConfig.loc("오늘은 \(UpHeroRules.dailyPassPurchaseCap)장까지만 구매 가능"))
        case .passCap:
            Haptics.play(.warning)
            SoundPlayer.shared.play(.cancel)
            showToast(AppConfig.loc("이 던전 탐험권이 가득 찼어요"))
        }
    }

    // MARK: - 토스트 (PhotoTalismanPicker.swift 패턴 재사용)

    private func toastView(_ msg: String) -> some View {
        VStack {
            Spacer()
            Text(msg).typography(.caption).foregroundStyle(Color.textPrimary)
                .padding(.horizontal, 16).padding(.vertical, 10)
                .background(Color.bgElevated, in: Capsule())
                .padding(.bottom, 40)
        }
    }

    private func showToast(_ msg: String) {
        toast = msg
        DispatchQueue.main.asyncAfter(deadline: .now() + 2) { if toast == msg { toast = nil } }
    }

    // MARK: - 상점 항목 (기존 카드팩 — 슬라이스 25)

    private func shopItem(name: String, desc: String, price: Int,
                          buy: @escaping () -> Void) -> some View {
        let affordable = upHero.state.coins >= price
        return HStack(spacing: 12) {
            PixelIcon(.gift, size: 20, color: Color.accentPrimary)
                .frame(width: 28)
            VStack(alignment: .leading, spacing: 2) {
                Text(name)
                    .typography(.body)
                    .foregroundStyle(Color.textPrimary)
                Text(desc)
                    .typography(.caption)   // 상품 설명 본문 — micro(12)→caption(15)
                    .foregroundStyle(Color.textTertiary)
            }
            Spacer(minLength: 0)
            Button(action: buy) {
                HStack(spacing: 4) {
                    PixelIcon(.coins, size: 12,
                              color: affordable ? Color.bgPrimary : Color.textTertiary)
                    Text("\(price)")
                        .typography(.caption)
                        .monospacedDigit()
                        .foregroundStyle(affordable ? Color.bgPrimary : Color.textTertiary)
                }
                .padding(.horizontal, 14)
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

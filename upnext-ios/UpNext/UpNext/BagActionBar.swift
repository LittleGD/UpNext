//
//  BagActionBar.swift
//  UpNext — Up Hero 가방 액션바 (웹 components/uphero/BagActionBar.tsx 1:1 미러).
//
//  **항상** 마운트된다(56pt). 선택 여부에 따라 나타났다 사라지면 그 위의 보드가 매번
//  리사이즈되어 셀 크기가 출렁이는데, 격자에서 그건 "아이템이 움직였다" 로 읽힌다.
//  그래서 비어 있을 땐 힌트 한 줄이 그 자리를 지킨다.
//
//  계층: 라임(GBPalette.lightest)은 화면에서 **하나**뿐인 활성 요소다. 여기서는 지금
//  해야 할 행동(배치 또는 해제) 하나만 라임이고 나머지는 배경 단계로만 구분한다.
//

import SwiftUI

struct BagActionBar: View {
    /// 선택된 가방 아이템 (없으면 nil).
    let item: Equipment?
    /// 앵커를 눌러 고른 착용 슬롯.
    let wornSlot: EquipSlot?
    /// 빈 칸 탭을 기다리는 중인가.
    let placing: Bool
    /// 정리 대기 개수 — 0 보다 크면 유휴 힌트가 "가방이 꽉 찼어요" 로 바뀐다.
    let trayCount: Int
    /// 회전이 의미 있는 타입인가 (v1: 무기만).
    let rotatable: Bool
    /// Track E 합성 모드 — 같은 등급 3개를 보드·트레이에서 고르는 중. 이때 바는
    /// "합성 n/3" 확인과 취소만 보인다 (배치·장착은 모드 밖에서). 웹 BagActionBar 동일.
    var synthMode: Bool = false
    var synthCount: Int = 0
    /// 유휴 상태에서 합성 진입 버튼을 보일지 (재료 후보가 3개 이상일 때).
    var canStartSynth: Bool = false
    let onAction: (BagItemAction) -> Void
    let onCancel: () -> Void
    var onSynthConfirm: () -> Void = {}
    var onSynthCancel: () -> Void = {}

    var body: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 8) {
                if synthMode {
                    // 합성 모드: 재료 수가 주인공. 3개가 모이면 확인이 라임으로 켜진다.
                    Text(AppConfig.loc("같은 등급 장비 3개를 고르세요"))
                        .typography(.caption)
                        .foregroundStyle(GBPalette.lightest)
                        .lineLimit(1)
                    action(AppConfig.loc("합성 \(synthCount)/3"), primary: true,
                           disabled: synthCount != UpHeroRules.synthesisInputCount,
                           onTap: onSynthConfirm)
                    action(AppConfig.loc("취소"), onTap: onSynthCancel)
                } else if let wornSlot {
                    Text(slotName(wornSlot))
                        .typography(.micro)
                        .foregroundStyle(GBPalette.light)
                        .lineLimit(1)
                        .frame(maxWidth: 84)
                    action(AppConfig.loc("해제"), primary: true) { onAction(.unequip) }
                    action(AppConfig.loc("강화")) { onAction(.enhance) }
                    action(AppConfig.loc("취소"), onTap: onCancel)
                } else if item != nil, placing {
                    // 배치 모드: 힌트가 주인공. 회전·취소만 남겨 빈 칸 탭에 집중시킨다 (웹 동일).
                    Text(hint)
                        .typography(.caption)
                        .foregroundStyle(GBPalette.lightest)
                        .lineLimit(1)
                    action(AppConfig.loc("회전"), disabled: !rotatable) { onAction(.rotate) }
                    action(AppConfig.loc("취소"), onTap: onCancel)
                } else if let item {
                    action(AppConfig.loc("배치"), primary: true) { onAction(.place) }
                    action(AppConfig.loc("회전"), disabled: !rotatable) { onAction(.rotate) }
                    action(AppConfig.loc("장착")) { onAction(.equip) }
                    action(AppConfig.loc("강화")) { onAction(.enhance) }
                    // 판매가 = 등급 + 드롭 층 + 강화 단계 (Track E, UpHeroStore.sellPrice 단일 출처).
                    // 웹 "판매 +N" 과 같은 짧은 라벨 (액션바 일곱 버튼이 393pt 에 들어가야 한다).
                    action(AppConfig.loc("판매 +\(UpHeroStore.sellPrice(item))")) {
                        onAction(.sell)
                    }
                    // Track E 합성 — 선택한 아이템이 첫 재료. legend·사진 부적은 버튼을 숨긴다.
                    if item.photoId == nil, UpHeroRules.nextRarity[item.rarity] != nil {
                        action(AppConfig.loc("합성")) { onAction(.synth) }
                    }
                    // 버리기는 액션바에서 뺀다 (Track E: 판매·합성으로 정리). 웹 동일.
                    action(AppConfig.loc("취소"), onTap: onCancel)
                } else {
                    Text(hint)
                        .typography(.caption)
                        .foregroundStyle(GBPalette.light)
                        .lineLimit(1)
                    if canStartSynth {
                        Spacer(minLength: 8)
                        action(AppConfig.loc("합성")) { onAction(.synth) }
                    }
                }
                Spacer(minLength: 0)
            }
            .padding(.horizontal, 12)
            .frame(maxHeight: .infinity)
        }
        .frame(height: CGFloat(UpHeroBag.actionH))
        .frame(maxWidth: .infinity)
        .background(GBPalette.dark.opacity(0.2))
        .overlay(alignment: .top) { Rectangle().fill(GBPalette.dark).frame(height: 1) }
        // children: .contain — 버튼들이 각자의 요소로 남아야 액션바 안에서 찾을 수 있다.
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("bagActionBar")
        .accessibilityLabel(AppConfig.loc("가방 액션"))
    }

    private var hint: String {
        if placing { return AppConfig.loc("빈 칸을 탭해서 놓으세요") }
        if trayCount > 0 { return AppConfig.loc("가방이 꽉 찼어요. 판매하거나 상점에서 가방을 늘리세요") }
        return AppConfig.loc("아이템을 탭해서 선택하세요")
    }

    /// 액션 버튼 — 보더 없이 배경 단계와 색으로만 위계를 만든다. 44pt 터치 타깃, press 0.97.
    private func action(
        _ label: String, primary: Bool = false, danger: Bool = false, disabled: Bool = false,
        onTap: @escaping () -> Void
    ) -> some View {
        Button(action: onTap) {
            Text(label)
                .typography(.caption)
                .foregroundStyle(primary ? GBPalette.darkest
                                 : (danger ? GBPalette.enemy : GBPalette.light))
                .lineLimit(1)
                .padding(.horizontal, 12)
                .frame(minHeight: 44)
                .background(primary ? GBPalette.lightest : GBPalette.dark.opacity(0.53),
                            in: RoundedRectangle(cornerRadius: 4))
                .opacity(disabled ? 0.45 : 1)
        }
        .buttonStyle(.unPress)
        .disabled(disabled)
    }

    private func slotName(_ slot: EquipSlot) -> String {
        switch slot {
        case .weapon:    return AppConfig.loc("무기")
        case .armor:     return AppConfig.loc("방어구")
        case .accessory: return AppConfig.loc("장신구")
        case .talisman:  return AppConfig.loc("부적")
        }
    }
}

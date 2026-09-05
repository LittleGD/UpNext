//
//  BagTrayView.swift
//  UpNext — Up Hero 정리 대기 트레이 (웹 components/uphero/BagTray.tsx 1:1 미러).
//
//  넘침 전용 공간이다. 유저가 아이템을 여기로 **옮기는** 동작은 없고, 보드에 자리가
//  없어 못 들어간 것과 레벨이 내려가 보드 밖으로 밀린 것(보류)만 온다.
//
//  기본 경로는 **탭 선택 → 보드 빈 칸 탭**이다. 드래그 아웃은 250ms 롱프레스로만
//  시작한다 — 가로 스크롤과 같은 제스처를 두고 다투면 스크롤이 먼저 먹혀 드래그가
//  안 잡히기 때문에, StickerLayer 와 같은 "롱프레스 + 4pt 취소 한계" 규칙을 쓴다.
//

import SwiftUI

struct BagTrayView: View {
    /// 롱프레스로 드래그를 여는 시간(s). StickerLayer 선례보다 짧게 — 여긴 삭제가 아니라 이동.
    private static let longPress: Double = 0.25
    /// 롱프레스 도중 이만큼 움직이면 취소하고 스크롤에 넘긴다.
    private static let cancelSlop: CGFloat = 4
    private static let tile: CGFloat = 44

    let items: [Equipment]
    let suspendedIds: Set<String>
    let selectedId: String?
    let synergy: BagSynergy
    let growth: GrowthStore
    let onSelect: (String) -> Void
    /// 롱프레스 드래그가 보드 위에서 손을 뗐다. 좌표 해석은 부모가 보드 기하로 한다.
    let onDragToBoard: (String, CGPoint, Int) -> Void

    /// 들린 복제본 — 트레이 밖(가방 화면 루트 좌표계)에 그린다.
    @State private var lift: (item: Equipment, point: CGPoint)?

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            Text(items.isEmpty
                 ? AppConfig.loc("정리 대기 없음")
                 : AppConfig.loc("정리 대기 \(items.count)"))
                .typography(.micro)
                .monospacedDigit()
                .foregroundStyle(GBPalette.light)
                .frame(height: 16)
                .padding(.horizontal, 12)
                .padding(.top, 2)
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 8) {
                    ForEach(items) { item in
                        tile(item)
                    }
                }
                .padding(.horizontal, 12)
                .frame(maxHeight: .infinity)
            }
            .frame(maxHeight: .infinity)
        }
        .frame(height: CGFloat(UpHeroBag.trayH))
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(GBPalette.dark.opacity(0.13))
        .overlay(alignment: .top) { Rectangle().fill(GBPalette.dark).frame(height: 1) }
        // children: .contain — 없으면 이 식별자가 트레이 타일 식별자를 덮는다 (보드와 같은 이유).
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("bagTray")
        // 들린 복제본은 트레이 위로 떠야 하므로 오버레이로 그리되, 좌표는 화면 루트 기준이다.
        .overlay(alignment: .topLeading) { liftedClone }
    }

    @ViewBuilder
    private var liftedClone: some View {
        if let lift {
            GeometryReader { g in
                let local = g.frame(in: .named(EquipmentInventoryView.rootSpace)).origin
                tileFace(lift.item, selected: false, dimmed: false)
                    .frame(width: Self.tile, height: Self.tile)
                    .offset(x: lift.point.x - local.x - Self.tile / 2,
                            y: lift.point.y - local.y - Self.tile * 1.5)
                    .allowsHitTesting(false)
            }
        }
    }

    private func tile(_ item: Equipment) -> some View {
        let selected = item.id == selectedId
        return tileFace(item, selected: selected, dimmed: lift?.item.id == item.id)
            .frame(width: Self.tile, height: Self.tile)
            .contentShape(Rectangle())
            .gesture(dragOutGesture(item))
            .onTapGesture {
                SoundPlayer.shared.play(.select)
                onSelect(item.id)
            }
            .accessibilityElement(children: .ignore)
            .accessibilityAddTraits(selected ? [.isButton, .isSelected] : .isButton)
            .accessibilityLabel(
                [item.rarity.displayName, item.localizedDisplayName,
                 suspendedIds.contains(item.id) ? AppConfig.loc("보류") : nil]
                    .compactMap { $0 }.joined(separator: ", "))
            .accessibilityIdentifier("bagTrayTile_\(item.id)")
    }

    private func tileFace(_ item: Equipment, selected: Bool, dimmed: Bool) -> some View {
        let enhance = item.enhanceLevel ?? 0
        // 시너지 짝(S6 등)에 걸린 아이템은 글로우로만 구분 — 보더는 등급·선택 전용이다.
        let pairing = synergy.links.contains {
            $0.sourceId == item.id || $0.partnerId == item.id
        }
        return ZStack {
            RoundedRectangle(cornerRadius: 3).fill(GBPalette.dark.opacity(0.87))
            if let photoId = item.photoId, !photoId.isEmpty {
                GrowthThumbImage(id: photoId, growth: growth) {
                    RoundedRectangle(cornerRadius: 2).fill(GBPalette.dark)
                }
                .frame(width: 26, height: 26)
                .clipShape(RoundedRectangle(cornerRadius: 2))
            } else {
                PixelIcon(PixelIconName.resolve(item.iconName), size: 22, color: item.rarity.color)
            }
            if enhance > 0 {
                Text("+\(enhance)")
                    .typography(.micro)
                    .monospacedDigit()
                    .foregroundStyle(enhance >= UpHeroRules.maxEnhanceLevel
                                     ? GBPalette.darkest : GBPalette.lightest)
                    .padding(.horizontal, 3)
                    .background(
                        enhance >= UpHeroRules.maxEnhanceLevel
                            ? Rarity.legend.color : GBPalette.darkest.opacity(0.87),
                        in: RoundedRectangle(cornerRadius: 2))
                    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
                    .padding(2)
            }
            if suspendedIds.contains(item.id) {
                Text(AppConfig.loc("보류"))
                    .typography(.micro)
                    .foregroundStyle(GBPalette.light)
                    .padding(.horizontal, 3)
                    .background(GBPalette.darkest.opacity(0.87),
                                in: RoundedRectangle(cornerRadius: 2))
                    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .bottomLeading)
            }
        }
        .overlay(
            RoundedRectangle(cornerRadius: 3)
                .strokeBorder(selected ? GBPalette.lightest : item.rarity.color, lineWidth: 1))
        .shadow(color: item.rarity.color.opacity(pairing ? 0.33 : 0), radius: pairing ? 6 : 0)
        .opacity(dimmed ? 0.35 : 1)
    }

    /// 롱프레스(0.25s) → 드래그. 4pt 안에서만 롱프레스가 살아 있어 가로 스크롤과 다투지 않는다.
    private func dragOutGesture(_ item: Equipment) -> some Gesture {
        LongPressGesture(minimumDuration: Self.longPress, maximumDistance: Self.cancelSlop)
            .sequenced(before: DragGesture(
                minimumDistance: 0,
                coordinateSpace: .named(EquipmentInventoryView.rootSpace)))
            .onChanged { value in
                switch value {
                case .first:
                    break
                case .second(_, let drag):
                    if lift == nil {
                        Haptics.play(.light)
                    }
                    lift = (item, drag?.location ?? .zero)
                }
            }
            .onEnded { value in
                defer { lift = nil }
                guard case .second(_, let drag?) = value else { return }
                onDragToBoard(item.id, drag.location, UpHeroBag.normalizeRot(item.bagRot))
            }
    }
}

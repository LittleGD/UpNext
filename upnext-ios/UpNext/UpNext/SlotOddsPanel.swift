//
//  SlotOddsPanel.swift
//  Up Hero — 굴림틀 확률 공개 패널. 웹 `SlotOddsPanel.tsx` 1:1 이식.
//
//  굴림틀 이벤트에서 **스핀 전에** 볼 수 있는 작은 정보 표면이다. `DungeonView.choiceOptions`
//  가 굴림틀 선택지 위에 "확률 보기" 토글을 두고, 누르면 이 패널이 인라인으로 펼쳐진다.
//  결과 모달·릴 연출과는 분리돼 있어 도파민 경로를 건드리지 않는다.
//
//  왜 있는가: 13+ (Simulated Gambling: Infrequent) 서사와 앱의 정직성 원칙
//  ("공개된 확률이 거짓이 되지 않는다") 은 이 UI 를 전제한다. 그래서 여기 적히는
//  숫자는 전부 **런타임 계산값** 이다 — `UpHeroSlot.oddsRows()` / `rtp()` /
//  `pityThreshold` / `dailySpinCap` 을 포맷해 넣고, 문구에 확률을 하드코딩하지 않는다.
//  표를 고치면 화면이 따라온다.
//
//  내용 순서: 결과별 확률 표(꽝이 맨 위) → 환수율 → pity 는 표와 별개 규칙이라는
//  한 줄 → 하루 상한과 오늘 남은 횟수.
//
//  디자인: 아지트 GB 팔레트, 보더·아이콘 박스 없음, 에러색 없음. 정보 위계는 작게
//  (micro / caption), 배경은 `GBPalette.dark` 40% 로 선택지 버튼보다 뒤에 앉는다.
//

import SwiftUI

/// 표 한 줄의 라벨 — 지급 내용(`SlotGrant`)에서 유도한다. 결과 모달의 보상 문구
/// (`uphero.slot.reward.*`)와 같은 키를 쓰므로 표와 결과 화면의 이름이 어긋날 수 없다.
/// 꽝만 전용 키(`uphero.slot.odds.blank`). 웹 `slotOddsLabel`.
func slotOddsLabel(_ row: UpHeroSlot.OddsRow) -> String {
    switch row.grant {
    case .none:
        return AppConfig.loc("uphero.slot.odds.blank")
    case let .coins(amount):
        return UpHeroNarrative.resolveLog(
            "uphero.slot.reward.coins", ["n": .number(Double(amount))],
            fallback: "코인 +\(amount)")
    case let .destroyGuards(count):
        return UpHeroNarrative.resolveLog(
            "uphero.slot.reward.destroyGuard", ["n": .number(Double(count))],
            fallback: "\(AppConfig.loc("소실방지권")) +\(count)")
    case let .downGuards(count):
        return UpHeroNarrative.resolveLog(
            "uphero.slot.reward.downGuard", ["n": .number(Double(count))],
            fallback: "\(AppConfig.loc("하락방지권")) +\(count)")
    case .itemBox:
        return UpHeroNarrative.resolveLog("uphero.slot.reward.itemBox", nil, fallback: "장비 +1")
    case let .combatBuff(pct, battles):
        return UpHeroNarrative.resolveLog(
            "uphero.slot.reward.buff",
            ["pct": .number(Double(pct)), "battles": .number(Double(battles))],
            fallback: "\(battles)전투 능력치 +\(pct)%")
    }
}

struct SlotOddsPanel: View {

    /// 오늘 남은 굴림 횟수 (`UpHeroStore.slotSpinsLeft`). 상한과 나란히 보여준다.
    let spinsLeft: Int

    @State private var open = false

    private let rows = UpHeroSlot.oddsRows()
    /// 보조 문구 색 — 웹 upHeroPalette GB_HINT (#6a9a66) 그대로.
    private let hint = Color(hexString: "#6a9a66")

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            Button {
                withAnimation(.easeOut(duration: 0.16)) { open.toggle() }
            } label: {
                // 텍스트 버튼 — 선택지 버튼과 위계가 겹치지 않게 배경·보더 없이 글자만.
                HStack(spacing: 4) {
                    PixelIcon(.infoBox, size: 12, color: open ? GBPalette.lightest : GBPalette.light)
                    Text(AppConfig.loc(open ? "uphero.slot.odds.close" : "uphero.slot.odds.open"))
                        .typography(.micro)
                        .foregroundStyle(open ? GBPalette.lightest : GBPalette.light)
                }
                .padding(.trailing, 6)
                .frame(minHeight: 28)
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .accessibilityValue(Text(AppConfig.loc(open ? "uphero.slot.odds.close" : "uphero.slot.odds.open")))

            if open {
                section
                    .transition(.opacity)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.leading, 8)
    }

    private var section: some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(AppConfig.loc("uphero.slot.odds.title"))
                .typography(.micro)
                .foregroundStyle(GBPalette.lightest)
                .padding(.bottom, 4)
            ForEach(rows, id: \.id) { row in
                HStack(alignment: .firstTextBaseline, spacing: 12) {
                    Text(slotOddsLabel(row))
                        .typography(.micro)
                        .foregroundStyle(GBPalette.light)
                    Spacer(minLength: 0)
                    Text(UpHeroSlot.formatPercent(row.probability))
                        .typography(.micro)
                        .monospacedDigit()
                        .foregroundStyle(GBPalette.lightest)
                }
                .accessibilityElement(children: .combine)
            }
            Text(UpHeroNarrative.resolveLog(
                "uphero.slot.odds.rtp",
                ["pct": .text(UpHeroSlot.formatPercent(UpHeroSlot.rtp()))],
                fallback: "환수율 \(UpHeroSlot.formatPercent(UpHeroSlot.rtp()))"))
                .typography(.micro)
                .monospacedDigit()
                .foregroundStyle(GBPalette.lightest)
                .padding(.top, 6)
            Text(UpHeroNarrative.resolveLog(
                "uphero.slot.odds.pityNote",
                ["n": .number(Double(UpHeroSlot.pityThreshold - 1))],
                fallback: "꽝이 \(UpHeroSlot.pityThreshold - 1)번 이어지면 다음 굴림은 반드시 나와요."))
                .typography(.micro)
                .foregroundStyle(hint)
                .fixedSize(horizontal: false, vertical: true)
                .padding(.top, 2)
            Text(UpHeroNarrative.resolveLog(
                    "uphero.slot.odds.dailyCap",
                    ["n": .number(Double(UpHeroSlot.dailySpinCap))],
                    fallback: "하루 \(UpHeroSlot.dailySpinCap)회까지")
                 + " · "
                 + UpHeroNarrative.resolveLog(
                    "uphero.slot.spinsLeft",
                    ["n": .number(Double(spinsLeft))],
                    fallback: "남은 \(spinsLeft)회"))
                .typography(.micro)
                .monospacedDigit()
                .foregroundStyle(hint)
                .padding(.top, 2)
        }
        .padding(.top, 8)
        .padding(.horizontal, 10)
        .padding(.bottom, 9)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(GBPalette.dark.opacity(0.4), in: RoundedRectangle(cornerRadius: 4))
        .accessibilityElement(children: .contain)
        .accessibilityLabel(Text(AppConfig.loc("uphero.slot.odds.title")))
    }
}

#if DEBUG
#Preview {
    ZStack {
        Color.black.ignoresSafeArea()
        SlotOddsPanel(spinsLeft: 2).padding()
    }
}
#endif

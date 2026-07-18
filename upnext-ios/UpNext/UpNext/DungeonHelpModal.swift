//
//  DungeonHelpModal.swift
//  UpNext — 탐험(던전 전투) 인터랙션 도움말 오버레이.
//
//  웹 components/uphero/DungeonHelpModal.tsx 포팅. 전투 화면 헤더의 ? 버튼으로 열며,
//  HP·시간 / 자원 / 스킬 / 속도 / 포기 5가지 메커닉을 간단히 안내한다.
//

import SwiftUI

struct DungeonHelpModal: View {
    let onClose: () -> Void

    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var entered = false

    private struct HelpItem { let icon: PixelIconName; let title: LocalizedStringKey; let desc: LocalizedStringKey }

    private let items: [HelpItem] = [
        .init(icon: .heart, title: "HP · 시간",
              desc: "HP 0 또는 시간 0 이면 탐험 종료. 시간은 층 이동·전투·이벤트로 소모돼요."),
        .init(icon: .zap, title: "자원 게이지",
              desc: "클래스마다 다른 자원(분노/마나/기 등). 전투 중 모아 스킬 발동에 써요."),
        .init(icon: .star, title: "스킬 버튼",
              desc: "자원이 차고 쿨다운이 0이면 탭으로 즉시 발동. 스탯창의 스킬트리에서 해금해요."),
        .init(icon: .play, title: "속도 · 일시정지",
              desc: "1× / 2× / 4× 로 진행 속도를 조정. 가운데 버튼으로 잠시 멈출 수 있어요."),
        .init(icon: .flag, title: "포기",
              desc: "스스로 캠프로 돌아가요. 지금까지 얻은 전리품은 모두 유지됩니다."),
    ]

    var body: some View {
        ZStack {
            Color.black.opacity(0.8 * (entered ? 1 : 0))
                .ignoresSafeArea()
                .contentShape(Rectangle())
                .onTapGesture { close() }

            VStack(alignment: .leading, spacing: 0) {
                HStack {
                    Text("탐험 도움말")
                        .typography(.heading)
                        .foregroundStyle(Color.textPrimary)
                    Spacer()
                    Button { close() } label: {
                        PixelIcon(.cancel, size: 16, color: Color.textTertiary)
                            .frame(width: 32, height: 32)
                    }
                    .buttonStyle(.plain)
                }
                .padding(.bottom, 16)

                VStack(alignment: .leading, spacing: 16) {
                    ForEach(items.indices, id: \.self) { i in
                        let item = items[i]
                        HStack(alignment: .top, spacing: 12) {
                            PixelIcon(item.icon, size: 16, color: Color.accentPrimary)
                                .frame(width: 22)
                            VStack(alignment: .leading, spacing: 3) {
                                Text(item.title)
                                    .typography(.body)
                                    .foregroundStyle(Color.textPrimary)
                                Text(item.desc)
                                    .typography(.caption)
                                    .foregroundStyle(Color.textTertiary)
                                    .fixedSize(horizontal: false, vertical: true)
                            }
                        }
                    }
                }
            }
            .padding(22)
            .frame(maxWidth: 360)
            .background(Color.bgSurface, in: RoundedRectangle(cornerRadius: 18))
            .padding(.horizontal, 24)
            .scaleEffect(entered ? 1 : 0.96)
            .opacity(entered ? 1 : 0)
        }
        .onAppear {
            withAnimation(reduceMotion ? nil : .spring(response: 0.45, dampingFraction: 0.85)) {
                entered = true
            }
        }
    }

    private func close() {
        SoundPlayer.shared.play(.select)
        Haptics.play(.selection)
        withAnimation(reduceMotion ? nil : .easeIn(duration: 0.18)) { entered = false }
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.18) { onClose() }
    }
}

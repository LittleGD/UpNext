//
//  MonsterCodexDetailModal.swift
//  UpNext — 도감 몬스터 상세 모달.
//
//  웹 components/uphero/MonsterCodexDetailModal.tsx 포팅. 도감에서 발견한 몬스터를
//  탭하면 뜨며, 스프라이트·이름·출현 던전·등급(파워)·lore 를 보여준다.
//  lore 는 MonsterLore(웹 i18n 한국어) 에서 조회.
//

import SwiftUI

struct MonsterCodexDetailModal: View {
    let template: MonsterTemplate
    let onClose: () -> Void

    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var entered = false

    private var spriteColor: Color {
        template.isBoss ? Color.accentSecondary : Color.textPrimary
    }

    var body: some View {
        ZStack {
            Color.black.opacity(0.8 * (entered ? 1 : 0))
                .ignoresSafeArea()
                .contentShape(Rectangle())
                .onTapGesture { close() }

            VStack(alignment: .leading, spacing: 0) {
                HStack {
                    if template.isBoss {
                        Text("보스")
                            .typography(.micro)
                            .foregroundStyle(Color.bgPrimary)
                            .padding(.horizontal, 8).padding(.vertical, 3)
                            .background(Color.accentSecondary, in: Capsule())
                    }
                    Spacer()
                    Button { close() } label: {
                        PixelIcon(.cancel, size: 16, color: Color.textTertiary)
                            .frame(width: 32, height: 32)
                    }
                    .buttonStyle(.plain)
                }

                // 스프라이트 — 던전 테마색으로 은은히 물든 배경 위.
                MonsterSprite(kind: template.kind,
                              size: template.isBoss ? 80 : 72,
                              color: spriteColor, glow: template.isBoss)
                    .frame(maxWidth: .infinity)
                    .frame(height: 132)
                    .background(spriteBackdrop, in: RoundedRectangle(cornerRadius: 14))

                Text(template.name)
                    .typography(.heading)
                    .foregroundStyle(Color.textPrimary)
                    .padding(.top, 14)

                // 출현 던전 + 등급(파워)
                HStack(spacing: 14) {
                    if let did = template.dungeonId, let d = Dungeons.all[did] {
                        HStack(spacing: 6) {
                            Circle().fill(Color(hexString: d.themeColor))
                                .frame(width: 10, height: 10)
                            Text(d.name)
                                .typography(.caption)
                                .foregroundStyle(Color.textSecondary)
                        }
                    }
                    HStack(spacing: 4) {
                        PixelIcon(.flame, size: 12, color: Color.textTertiary)
                        HStack(spacing: 3) {
                            ForEach(0..<3, id: \.self) { i in
                                Circle()
                                    .fill(i < template.power ? Color.accentPrimary
                                          : Color.textTertiary.opacity(0.3))
                                    .frame(width: 6, height: 6)
                            }
                        }
                    }
                }
                .padding(.top, 8)

                if let lore = MonsterLore.lore(for: template.id) {
                    Text(lore)
                        .typography(.caption)
                        .foregroundStyle(Color.textTertiary)
                        .fixedSize(horizontal: false, vertical: true)
                        .padding(.top, 14)
                }
            }
            .padding(20)
            .frame(maxWidth: 340)
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

    /// 던전 테마색 은은한 backdrop (없으면 elevated).
    private var spriteBackdrop: Color {
        if let did = template.dungeonId, let d = Dungeons.all[did] {
            return Color(hexString: d.themeColor).opacity(0.12)
        }
        return Color.bgElevated.opacity(0.5)
    }

    private func close() {
        SoundPlayer.shared.play(.select)
        withAnimation(reduceMotion ? nil : .easeIn(duration: 0.18)) { entered = false }
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.18) { onClose() }
    }
}

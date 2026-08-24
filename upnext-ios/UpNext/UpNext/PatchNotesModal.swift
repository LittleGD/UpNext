//
//  PatchNotesModal.swift
//  UpNext — 패치 노트 모달.
//
//  웹 src/components/PatchNotesModal.tsx + src/data/patchNotes.ts 포팅.
//  최신 버전부터 누적된 패치 노트 표시. lastSeenPatchVersion 비교로 신규 노트 강조.
//

import SwiftUI

struct PatchNoteEntry {
    let icon: PixelIconName?
    let title: String
    let description: String
}

struct PatchNoteVersion: Identifiable {
    var id: String { version }
    let version: String
    let date: String
    let headline: String
    let entries: [PatchNoteEntry]
    let isNew: Bool
}

struct PatchNotesModal: View {
    let lastSeenVersion: String?
    let onDismiss: () -> Void

    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var entered: Bool = false

    var body: some View {
        ZStack {
            Color.black.opacity(0.75 * (entered ? 1 : 0))
                .ignoresSafeArea()
                .contentShape(Rectangle())
                .onTapGesture { dismiss() }

            VStack(spacing: 0) {
                header
                Divider().background(Color.bgElevated)
                content
                Divider().background(Color.bgElevated)
                cta
            }
            .background(Color.bgSurface, in: RoundedRectangle(cornerRadius: 18))
            .padding(.horizontal, 16)
            .frame(maxHeight: 600)
            .scaleEffect(entered ? 1 : 0.96)
            .opacity(entered ? 1 : 0)
        }
        .onAppear { runEnter() }
    }

    private var header: some View {
        HStack(spacing: 10) {
            PixelIcon(.sparkle, size: 18, color: Color.accentPrimary)
            Text("새로운 변경사항")
                .typography(.heading)
                .foregroundStyle(Color.textPrimary)
            Spacer()
            Button { dismiss() } label: {
                PixelIcon(.cancel, size: 16, color: Color.textTertiary)
                    .frame(width: 32, height: 32)
            }
            .buttonStyle(.plain)
        }
        .padding(16)
    }

    private var content: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 24) {
                ForEach(Self.notes) { note in
                    versionSection(note)
                }
            }
            .padding(16)
        }
    }

    private func versionSection(_ note: PatchNoteVersion) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack {
                VStack(alignment: .leading, spacing: 2) {
                    HStack(spacing: 6) {
                        Text("v\(note.version)")
                            .typography(.caption)
                            .foregroundStyle(Color.textPrimary)
                            .monospacedDigit()
                        if note.isNew {
                            Text("NEW")
                                .typography(.micro)
                                .tracking(1)
                                .foregroundStyle(Color.bgPrimary)
                                .padding(.horizontal, 6).padding(.vertical, 1)
                                .background(Color.accentPrimary, in: Capsule())
                        }
                    }
                    Text(note.date)
                        .typography(.micro)
                        .foregroundStyle(Color.textTertiary)
                }
                Spacer()
            }
            Text(note.headline)
                .typography(.body)
                .foregroundStyle(Color.accentPrimary)
            VStack(alignment: .leading, spacing: 10) {
                ForEach(0..<note.entries.count, id: \.self) { i in
                    entryRow(note.entries[i])
                }
            }
        }
        .padding(16)
        .background(Color.bgElevated.opacity(0.5), in: RoundedRectangle(cornerRadius: 14))
    }

    private func entryRow(_ entry: PatchNoteEntry) -> some View {
        HStack(alignment: .top, spacing: 10) {
            // 디자인 규칙 — 아이콘 박스 금지. 픽셀 아이콘만 인라인으로 정렬(배경/보더 없음).
            if let icon = entry.icon {
                PixelIcon(icon, size: 16, color: Color.accentPrimary)
                    .frame(width: 22, height: 22, alignment: .center)
            } else {
                Color.clear.frame(width: 22, height: 22)
            }
            VStack(alignment: .leading, spacing: 4) {
                Text(entry.title)
                    .typography(.caption)
                    .foregroundStyle(Color.textPrimary)
                Text(entry.description)
                    .typography(.micro)
                    .foregroundStyle(Color.textTertiary)
                    .lineLimit(nil)
            }
        }
    }

    private var cta: some View {
        Button { dismiss() } label: {
            Text("확인")
                .typography(.body)
                .foregroundStyle(Color.bgPrimary)
                .frame(maxWidth: .infinity)
                .frame(height: 48)
                .background(Color.accentPrimary, in: RoundedRectangle(cornerRadius: 12))
        }
        .buttonStyle(.plain)
        .padding(16)
    }

    private func runEnter() {
        if reduceMotion { entered = true; return }
        withAnimation(Anim.cardOverlayEnter) { entered = true }
    }

    private func dismiss() {
        withAnimation(Anim.cardOverlayExit) {
            entered = false
        }
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.25) { onDismiss() }
    }

    // MARK: - Mock notes (실제로는 patchNotes.json bundle 로드)

    // computed — static let 은 첫 접근 시점 언어로 AppConfig.loc 결과가 동결된다(금지 패턴).
    static var notes: [PatchNoteVersion] { [
        PatchNoteVersion(
            version: "2026.05.22",
            date: "2026-05-22",
            headline: AppConfig.loc("네이티브 iOS 회복 — 폴라로이드·미니게임·전투 비주얼 전면 부활"),
            entries: [
                PatchNoteEntry(icon: .image, title: AppConfig.loc("폴라로이드 기둥 회복"),
                               description: AppConfig.loc("라이브 카메라 + 5종 프레임 + Kodak Gold 필터 + 스티커/서명/메모 + PNG 합성 공유까지 — 사진 인증 흐름이 네이티브로 돌아왔습니다.")),
                PatchNoteEntry(icon: .gamepad, title: AppConfig.loc("미니게임 11종 작동"),
                               description: AppConfig.loc("이전엔 자동 승리 처리되던 모든 반사 미니게임이 실제 입력으로 동작합니다. PairMatch·ReactionTap·TapBurst·PipeConnect 외 7종.")),
                PatchNoteEntry(icon: .sword, title: AppConfig.loc("던전 전투 시각화"),
                               description: AppConfig.loc("텍스트 로그에서 HeroSprite vs MonsterSprite 대치 + BossBanner + 14 부유 전투 숫자 + crit-shake + attack-flash + DungeonAtmosphere 까지.")),
                PatchNoteEntry(icon: .sparkle, title: AppConfig.loc("전 화면 오로라 + 별"),
                               description: AppConfig.loc("웹과 동일한 3-layer 오로라 앰비언트 + 1px 트윙클 별을 전 화면에 마운트.")),
                PatchNoteEntry(icon: .gift, title: AppConfig.loc("카드팩 시네마틱"),
                               description: AppConfig.loc("shake → flash → 3-halo expand → reveal 스태거 — 등급별 강도 차등.")),
            ],
            isNew: true
        ),
        PatchNoteVersion(
            version: "2026.05.21",
            date: "2026-05-21",
            headline: AppConfig.loc("충실도 그리드 R0-R7 — 디자인 토큰·타이포·스프링 수학·SplashView 1:1 포팅"),
            entries: [
                PatchNoteEntry(icon: .check, title: AppConfig.loc("디자인 토큰 1:1"),
                               description: AppConfig.loc("웹 globals.css 의 모든 hex 값을 Color+Tokens.swift 에 정확히 옮김.")),
                PatchNoteEntry(icon: .play, title: AppConfig.loc("Splash 모션"),
                               description: AppConfig.loc("U↗Next 2.8s 시퀀스 — spring duration 0.7 bounce 0.3 을 SwiftUI response/dampingFraction 수학 변환.")),
            ],
            isNew: false
        ),
    ] }
}

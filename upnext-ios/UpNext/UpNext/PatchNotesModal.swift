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
    // 웹 src/data/patchNotes.ts PATCH_NOTES[0] 과 같은 내용 (아이콘은 iOS PixelIconName
    //   중 가장 가까운 것 — Backpack→shoppingBag, Skull→warningDiamond, Repeat→reload).
    static var notes: [PatchNoteVersion] { [
        PatchNoteVersion(
            version: "2026.09.05",
            date: "2026-09-05",
            headline: AppConfig.loc("업 히어로 대개편: 격자 가방, 영웅 레벨 분리, 강화 +20"),
            entries: [
                PatchNoteEntry(icon: .shoppingBag, title: AppConfig.loc("격자 가방: 어디에 두느냐가 힘이 됩니다"),
                               description: AppConfig.loc("목록이던 가방이 격자판이 됐어요. 아이템을 칸에 직접 놓고, 무기는 회전해 자리를 맞춥니다. 십자 가운데의 착용 칸 옆에 같은 계열을 붙이면 인접 시너지가 붙어 스탯이 올라가요.")),
                PatchNoteEntry(icon: .archive, title: AppConfig.loc("상점에서 가방을 넓히세요"),
                               description: AppConfig.loc("가방은 4행으로 시작해 상점에서 한 행씩 8행까지 늘릴 수 있어요. 늘린 행은 계정에 영구히 남습니다.")),
                PatchNoteEntry(icon: .chart, title: AppConfig.loc("영웅 레벨과 계정 레벨이 분리됐어요"),
                               description: AppConfig.loc("영웅은 이제 자기 경험치로 자랍니다. 챌린지로 쌓는 계정 레벨과 따로 움직여서, 탐험을 많이 할수록 영웅이 강해져요.")),
                PatchNoteEntry(icon: .warningDiamond, title: AppConfig.loc("보스는 10층마다, 30층 이후에도 계속"),
                               description: AppConfig.loc("던전 보스가 10층마다 기다립니다. 30층에서 끝나지 않고 그 위로도 계속 이어져요.")),
                PatchNoteEntry(icon: .reload, title: AppConfig.loc("직업 스킬 두 갈래 분기와 리스펙"),
                               description: AppConfig.loc("직업마다 스킬이 두 갈래로 갈라져 취향대로 키울 수 있어요. 마음이 바뀌면 리스펙으로 포인트를 되돌립니다.")),
                PatchNoteEntry(icon: .zap, title: AppConfig.loc("강화 +20, 시도마다 쓰는 방지권"),
                               description: AppConfig.loc("강화 상한이 +20 으로 올랐어요. 소실방지권과 하락방지권은 걸어 둔 시도에서 한 장씩 나가고, 그 시도의 나쁜 결과만 막아줍니다.")),
                PatchNoteEntry(icon: .sword, title: AppConfig.loc("장비 아이콘, 합성, 도감 복구"),
                               description: AppConfig.loc("비어 보이던 장비 아이콘이 제자리를 찾았어요. 같은 등급 셋을 모아 윗 등급으로 합성할 수 있고, 도감도 다시 채워집니다.")),
            ],
            isNew: true
        ),
        PatchNoteVersion(
            version: "2026.05.22",
            date: "2026-05-22",
            headline: AppConfig.loc("네이티브 iOS 회복: 폴라로이드·미니게임·전투 비주얼 전면 부활"),
            entries: [
                PatchNoteEntry(icon: .image, title: AppConfig.loc("폴라로이드 기둥 회복"),
                               description: AppConfig.loc("라이브 카메라 + 5종 프레임 + Kodak Gold 필터 + 스티커/서명/메모 + PNG 합성 공유까지, 사진 인증 흐름이 네이티브로 돌아왔습니다.")),
                PatchNoteEntry(icon: .gamepad, title: AppConfig.loc("미니게임 11종 작동"),
                               description: AppConfig.loc("이전엔 자동 승리 처리되던 모든 반사 미니게임이 실제 입력으로 동작합니다. PairMatch·ReactionTap·TapBurst·PipeConnect 외 7종.")),
                PatchNoteEntry(icon: .sword, title: AppConfig.loc("던전 전투 시각화"),
                               description: AppConfig.loc("텍스트 로그에서 HeroSprite vs MonsterSprite 대치 + BossBanner + 14 부유 전투 숫자 + crit-shake + attack-flash + DungeonAtmosphere 까지.")),
                PatchNoteEntry(icon: .sparkle, title: AppConfig.loc("전 화면 오로라 + 별"),
                               description: AppConfig.loc("웹과 동일한 3-layer 오로라 앰비언트 + 1px 트윙클 별을 전 화면에 마운트.")),
                PatchNoteEntry(icon: .gift, title: AppConfig.loc("카드팩 시네마틱"),
                               description: AppConfig.loc("shake → flash → 3-halo expand → reveal 스태거, 등급별 강도 차등.")),
            ],
            isNew: false
        ),
        PatchNoteVersion(
            version: "2026.05.21",
            date: "2026-05-21",
            headline: AppConfig.loc("충실도 그리드 R0-R7: 디자인 토큰·타이포·스프링 수학·SplashView 1:1 포팅"),
            entries: [
                PatchNoteEntry(icon: .check, title: AppConfig.loc("디자인 토큰 1:1"),
                               description: AppConfig.loc("웹 globals.css 의 모든 hex 값을 Color+Tokens.swift 에 정확히 옮김.")),
                PatchNoteEntry(icon: .play, title: AppConfig.loc("Splash 모션"),
                               description: AppConfig.loc("U↗Next 2.8s 시퀀스: spring duration 0.7 bounce 0.3 을 SwiftUI response/dampingFraction 수학 변환.")),
            ],
            isNew: false
        ),
    ] }
}

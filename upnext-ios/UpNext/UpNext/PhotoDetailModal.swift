//
//  PhotoDetailModal.swift
//  UpNext — 앨범 사진 상세 뷰.
//
//  웹 src/components/growth/PhotoDetailModal.tsx 포팅. 앨범에서 사진을 탭하면
//  뜨며, 폴라로이드를 크게 보고(틸트+플립) 뒷면 메모를 편집(자동 저장)하거나
//  공유·부적 제작·삭제할 수 있다.
//
//  iOS 저장 구조 메모: GrowthStore 는 "합성 완료된" 폴라로이드(프레임+서명+스티커가
//  이미 구워진 이미지)를 보관한다(savePhoto 주석). 따라서 앞면은 합성본을 그대로
//  표시하고, 공유도 그 합성본을 그대로 내보낸다(재합성 불필요). 서명/스티커 raw 는
//  PhotoMeta 에 남아 있어 추후 원본 사진 보존이 추가되면 재편집까지 확장 가능.
//

import SwiftUI

struct PhotoDetailModal: View {
    let meta: PhotoMeta
    let onClose: () -> Void

    @EnvironmentObject private var growth: GrowthStore
    @EnvironmentObject private var upHero: UpHeroStore
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    @State private var flipped = false
    @State private var memoDraft: String = ""
    @State private var memoEditing = false
    @State private var showDeleteConfirm = false
    @State private var showShareSheet = false
    @State private var shareImage: UIImage?
    @State private var entered = false
    @State private var memoSaveTask: Task<Void, Never>?
    @FocusState private var memoFocused: Bool

    private let polaroidAspect: CGFloat = 184.0 / 223.0
    private let deleteTint = Color(hexString: "#e88b7a")

    var body: some View {
        ZStack {
            // 백드롭 — 탭하면 닫기.
            Color.black.opacity(0.85 * (entered ? 1 : 0))
                .ignoresSafeArea()
                .background(.ultraThinMaterial.opacity(entered ? 1 : 0))
                .contentShape(Rectangle())
                .onTapGesture { close() }

            VStack(spacing: 14) {
                header
                polaroid
                flipButton
                actionRow
            }
            .padding(.horizontal, 24)
            .frame(maxWidth: 360)
            .scaleEffect(entered ? 1 : 0.95)
            .opacity(entered ? 1 : 0)

            if showDeleteConfirm { deleteConfirm }
        }
        .sheet(isPresented: $showShareSheet) {
            if let img = shareImage { PolaroidShareSheet(image: img) }
        }
        .onAppear {
            memoDraft = meta.memo
            withAnimation(reduceMotion ? nil : .spring(response: 0.5, dampingFraction: 0.82)) {
                entered = true
            }
        }
        .onChange(of: memoFocused) { focused in
            memoEditing = focused
            if !focused { flushMemo() }
        }
        .onChange(of: memoDraft) { newValue in
            memoSaveTask?.cancel()
            memoSaveTask = Task {
                try? await Task.sleep(nanoseconds: 500_000_000)  // debounce 0.5s
                if Task.isCancelled { return }
                await MainActor.run { growth.updatePhotoMemo(meta.id, newValue) }
            }
        }
        .onDisappear { flushMemo() }
    }

    // MARK: - 헤더 (제목 + 날짜)

    private var header: some View {
        VStack(spacing: 3) {
            if let title = displayTitle {
                Text(title)
                    .typography(.body)
                    .foregroundStyle(Color.textPrimary)
                    .multilineTextAlignment(.center)
                    .lineLimit(2)
            }
            Text(meta.date)
                .typography(.micro)
                .monospacedDigit()
                .foregroundStyle(Color.textTertiary)
        }
    }

    private var displayTitle: String? {
        if let id = meta.challengeCardId,
           let card = CardCatalog.allCards.first(where: { $0.id == id }) {
            // 10-i18n-leaks(a): 카드명은 원문(한국어) title 대신 인앱 언어로 현지화해 표시.
            return card.localizedTitle(.current)
        }
        return meta.challengeTitle
    }

    // MARK: - 폴라로이드 (틸트 + 플립)

    private var polaroid: some View {
        PolaroidTilt(content: {
            PolaroidFlip(flipped: $flipped, front: { frontFace }, back: { backFace })
        }, enabled: !memoEditing)
        .frame(maxWidth: 300)
        .padding(.vertical, 4)
    }

    private var frontFace: some View {
        Group {
            if let img = growth.image(for: meta.id) {
                Image(uiImage: img)
                    .resizable()
                    .scaledToFit()
                    .clipShape(RoundedRectangle(cornerRadius: 4))
            } else {
                RoundedRectangle(cornerRadius: 4)
                    .fill(Color.bgElevated)
                    .aspectRatio(polaroidAspect, contentMode: .fit)
                    .overlay(PixelIcon(.image, size: 28, color: Color.textTertiary))
            }
        }
        .shadow(color: .black.opacity(0.35), radius: 14, y: 8)
    }

    private var backFace: some View {
        ZStack {
            Color.paperCream.clipShape(RoundedRectangle(cornerRadius: 4))
            VStack(spacing: 0) {
                MemoEditor(text: $memoDraft)
                    .focused($memoFocused)
                    .padding(14)
                if memoDraft.trimmingCharacters(in: .whitespaces).isEmpty && !memoEditing {
                    Text("탭하여 메모를 남겨요")
                        .typography(.micro)
                        .foregroundStyle(Color.inkWarmText.opacity(0.5))
                        .padding(.bottom, 14)
                }
            }
        }
        .aspectRatio(polaroidAspect, contentMode: .fit)
        .shadow(color: .black.opacity(0.25), radius: 10, y: 5)
    }

    // MARK: - 플립 버튼

    private var flipButton: some View {
        Button {
            SoundPlayer.shared.play(.select)
            if memoFocused { memoFocused = false }
            withAnimation(reduceMotion ? nil : .spring(response: 0.5, dampingFraction: 0.7)) {
                flipped.toggle()
            }
        } label: {
            HStack(spacing: 6) {
                PixelIcon(.reload, size: 12, color: Color.textSecondary)
                Text(flipped ? AppConfig.loc("사진 보기") : AppConfig.loc("메모 보기"))
                    .typography(.caption)
                    .foregroundStyle(Color.textSecondary)
            }
            .padding(.horizontal, 14)
            .padding(.vertical, 8)
            .background(Color.bgElevated, in: Capsule())
        }
        .buttonStyle(.plain)
    }

    // MARK: - 액션 (공유 / 부적 / 삭제 / 닫기)

    private var actionRow: some View {
        HStack(spacing: 8) {
            actionButton(.send, AppConfig.loc("공유"), tint: Color.textSecondary) { share() }
            actionButton(.sparkle, AppConfig.loc("부적"), tint: Color.textSecondary) { makeTalisman() }
            actionButton(.trash, AppConfig.loc("삭제"), tint: deleteTint) {
                SoundPlayer.shared.play(.select)
                showDeleteConfirm = true
            }
            actionButton(.cancel, AppConfig.loc("닫기"), tint: Color.textSecondary) { close() }
        }
    }

    private func actionButton(_ icon: PixelIconName, _ label: String,
                              tint: Color, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            VStack(spacing: 5) {
                PixelIcon(icon, size: 16, color: tint)
                Text(label)
                    .typography(.micro)
                    .foregroundStyle(tint)
            }
            .frame(maxWidth: .infinity)
            .padding(.vertical, 11)
            .background(Color.bgElevated, in: RoundedRectangle(cornerRadius: 12))
        }
        .buttonStyle(.plain)
    }

    // MARK: - 삭제 확인 (GB 스타일 인라인 컨펌)

    private var deleteConfirm: some View {
        ZStack {
            Color.black.opacity(0.6).ignoresSafeArea()
                .onTapGesture { showDeleteConfirm = false }
            VStack(spacing: 16) {
                Text("이 사진을 삭제할까요?")
                    .typography(.body)
                    .foregroundStyle(Color.textPrimary)
                Text("삭제하면 되돌릴 수 없어요.")
                    .typography(.caption)
                    .foregroundStyle(Color.textTertiary)
                HStack(spacing: 10) {
                    Button {
                        showDeleteConfirm = false
                    } label: {
                        Text("취소")
                            .typography(.body)
                            .foregroundStyle(Color.textSecondary)
                            .frame(maxWidth: .infinity)
                            .frame(height: 46)
                            .background(Color.bgElevated, in: RoundedRectangle(cornerRadius: 12))
                    }
                    .buttonStyle(.plain)
                    Button {
                        SoundPlayer.shared.play(.cancel)
                        Haptics.play(.medium)
                        growth.deletePhoto(meta.id)
                        showDeleteConfirm = false
                        close()
                    } label: {
                        Text("삭제")
                            .typography(.body)
                            .foregroundStyle(Color.bgPrimary)
                            .frame(maxWidth: .infinity)
                            .frame(height: 46)
                            .background(deleteTint, in: RoundedRectangle(cornerRadius: 12))
                    }
                    .buttonStyle(.plain)
                }
            }
            .padding(22)
            .frame(maxWidth: 300)
            .background(Color.bgSurface, in: RoundedRectangle(cornerRadius: 18))
            .padding(.horizontal, 32)
        }
    }

    // MARK: - 액션 구현

    private func share() {
        guard let img = growth.image(for: meta.id) else { return }
        SoundPlayer.shared.play(.select)
        shareImage = img
        showShareSheet = true
    }

    private func makeTalisman() {
        SoundPlayer.shared.play(.select)
        flushMemo()
        // 코인 부족·이미 바인딩이면 의식이 시작되지 않음(실패 결과). 성공 시 닫고
        // 앨범의 의식 오버레이가 이어받는다.
        let result = upHero.beginPhotoTalismanRitual(photo: meta)
        if result.ok { onClose() }
    }

    private func flushMemo() {
        memoSaveTask?.cancel()
        growth.updatePhotoMemo(meta.id, memoDraft)
    }

    private func close() {
        flushMemo()
        if memoFocused { memoFocused = false }
        withAnimation(reduceMotion ? nil : .easeIn(duration: 0.18)) { entered = false }
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.18) { onClose() }
    }
}

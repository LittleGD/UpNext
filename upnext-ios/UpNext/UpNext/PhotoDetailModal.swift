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
    // 부적 의식 실패 피드백(코인 부족·이미 바인딩) — 웹 PhotoTalismanPicker onNotify 토스트
    // 패턴 이식. 이 값이 있으면 하단 토스트를 띄운다. 실패를 침묵으로 버리던 결함 수정.
    @State private var talismanToast: String?
    @FocusState private var memoFocused: Bool

    private let polaroidAspect: CGFloat = 184.0 / 223.0
    // 05-modal-design — 로컬 #e88b7a 하드코딩을 GB 팔레트 단일 출처로 교체(GB_ENEMY).
    private let deleteTint = GBPalette.enemy

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
            if let toast = talismanToast { talismanToastView(toast) }
        }
        .sheet(isPresented: $showShareSheet) {
            if let img = shareImage { PolaroidShareSheet(image: img) }
        }
        .onAppear {
            memoDraft = meta.memo
            withAnimation(reduceMotion ? nil : .spring(response: 0.5, dampingFraction: 0.82)) {
                entered = true
            }
            #if DEBUG
            applyUITestHooks()
            #endif
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
        // 웹 PolaroidTilt/PolaroidFlip 의 textarea passthrough 근사 이식.
        //   틸트(enabled: !flipped): 메모(뒷면)가 보일 때는 틸트를 하위뷰로 양보해야 메모 영역
        //     탭이 TextEditor 로 전달돼 편집에 진입할 수 있다. 앞면(사진)에서만 틸트 활성.
        //     (틸트 제스처는 minimumDistance 0 이라 켜져 있으면 메모 탭을 가로채 포커스가 실패한다.)
        //   플립(enabled: !memoEditing): 편집 중엔 드래그 플립 비활성(내부에서 flipped 도 함께 검사).
        // 두 컴포넌트 모두 제스처를 GestureMask 로만 게이트해 뷰 정체성을 유지 → 편집 진입 시
        // memoFocused 가 살아있어 memoEditing 이 정상 구동된다.
        PolaroidTilt(content: {
            PolaroidFlip(flipped: $flipped, enabled: !memoEditing,
                         front: { frontFace }, back: { backFace })
        }, enabled: !flipped)
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
                // 포커스를 합성 View(MemoEditor) 바깥에 `.focused()` 로 붙이면 SwiftUI 에서
                // no-op → memoFocused 가 영원히 false 로 죽던 함정 제거. 이제 focus 를
                // 파라미터로 넘겨 실제 내부 TextEditor 의 `.focused()` 에 직접 연결한다.
                MemoEditor(text: $memoDraft, focus: $memoFocused)
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
            Haptics.play(.selection)
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
                Haptics.play(.selection)
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

    // MARK: - 삭제 확인 (05-modal-design — GbConfirm 실제 이식)
    //
    // 기존 "GB 스타일" 주석과 달리 실제로는 시스템 토큰(bgSurface/bgElevated/textPrimary)을
    // 쓴 4번째 독자 스타일이었다. 웹 growth/PhotoDetailModal.tsx:507 GbConfirm(danger)과
    // 색·형태를 실제로 일치시킴.

    private var deleteConfirm: some View {
        GbConfirm(
            title: "이 사진을 삭제할까요?",
            message: "삭제하면 되돌릴 수 없어요.",
            confirmLabel: "삭제",
            danger: true,
            onConfirm: {
                SoundPlayer.shared.play(.cancel)
                Haptics.play(.medium)
                growth.deletePhoto(meta.id)
                showDeleteConfirm = false
                close()
            },
            onCancel: { showDeleteConfirm = false })
    }

    // MARK: - 액션 구현

    private func share() {
        guard let img = growth.image(for: meta.id) else { return }
        SoundPlayer.shared.play(.select)
        Haptics.play(.selection)
        shareImage = img
        showShareSheet = true
    }

    private func makeTalisman() {
        SoundPlayer.shared.play(.select)
        Haptics.play(.selection)
        flushMemo()
        // 코인 부족·이미 바인딩이면 의식이 시작되지 않음(실패 결과). 성공 시 닫고
        // 앨범(AlbumView)의 의식 오버레이가 pendingTalismanPhoto 를 구독해 이어받는다.
        let result = upHero.beginPhotoTalismanRitual(photo: meta)
        if result.ok {
            onClose()
        } else if let err = result.error {
            // 실패를 침묵으로 버리던 결함 수정 — 웹 onNotify 처럼 사운드·햅틱·토스트로
            // 사유(코인 부족/이미 부적)를 반드시 노출한다(기본 0코인 유저의 무반응 해소).
            SoundPlayer.shared.play(.cancel)
            Haptics.play(.warning)
            showTalismanToast(err)
        }
    }

    /// 부적 실패 토스트 — 2초 후 자동 소멸(웹 PhotoTalismanPicker.showToast 패턴).
    private func showTalismanToast(_ msg: String) {
        withAnimation(reduceMotion ? nil : .easeOut(duration: 0.2)) { talismanToast = msg }
        DispatchQueue.main.asyncAfter(deadline: .now() + 2) {
            if talismanToast == msg {
                withAnimation(reduceMotion ? nil : .easeOut(duration: 0.2)) { talismanToast = nil }
            }
        }
    }

    private func talismanToastView(_ msg: String) -> some View {
        VStack {
            Spacer()
            Text(msg)
                .typography(.caption)
                .foregroundStyle(Color.textPrimary)
                .multilineTextAlignment(.center)
                .padding(.horizontal, 16)
                .padding(.vertical, 10)
                .background(Color.bgElevated, in: Capsule())
                .padding(.bottom, 60)
                .padding(.horizontal, 32)
        }
        .transition(.opacity)
        .allowsHitTesting(false)   // 백드롭 탭(닫기) 관통 허용
        .accessibilityIdentifier("talismanToast")
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

    #if DEBUG
    // MARK: - UITest 검증 훅 (출시 바이너리엔 비포함)
    //
    // simctl 은 좌표 탭이 불가하므로, 상세 진입 후 각 결함 수정을 결정론적으로 재현하기
    // 위한 런치 인자 훅. 기존 MainShell/GameStore 의 UITest 훅 패턴을 따른다.
    //   UITestFlipMemo    : 뒷면(메모)으로 즉시 플립 — 플립 렌더 확인.
    //   UITestOpenMemo    : 뒷면 플립 + 메모 포커스 → memoEditing 활성(포커스 바인딩 확인).
    //   UITestGrantCoins  : 부적 성공 경로 검증용 코인 지급(200).
    //   UITestTalismanTap : 부적 버튼 자동 탭 — 실패 토스트(0코인) 또는 성공(코인 지급 시).
    private func applyUITestHooks() {
        let args = ProcessInfo.processInfo.arguments
        if args.contains("UITestFlipMemo") || args.contains("UITestOpenMemo")
            || args.contains("UITestTypeMemo") {
            flipped = true
        }
        if args.contains("UITestGrantCoins") {
            upHero.addCoins(200)
        }
        if args.contains("UITestOpenMemo") || args.contains("UITestTypeMemo") {
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.5) { memoFocused = true }
        }
        // 편집→저장 파이프라인(.onChange(of: memoDraft) → growth.updatePhotoMemo) 실측용:
        // 메모 본문을 변경해 카운터/본문 갱신 + 디바운스 저장을 트리거.
        if args.contains("UITestTypeMemo") {
            DispatchQueue.main.asyncAfter(deadline: .now() + 1.0) {
                memoDraft += " ✎편집저장"
            }
        }
        if args.contains("UITestTalismanTap") {
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.6) { makeTalisman() }
        }
    }
    #endif
}

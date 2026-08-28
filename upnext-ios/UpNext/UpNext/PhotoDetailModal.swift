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
    @State private var showDeleteConfirm = false
    /// 공유 대상 — `.sheet(item:)` 로 띄운다. `.sheet(isPresented:)` 는 content 클로저가
    ///   직전 body 평가본을 캡처해, 이미지가 아직 nil 인 **빈 시트**가 먼저 떴다
    ///   ("공유를 누르면 처음에 아무 화면도 안 뜬다"의 원인). item: 은 값이 확정된
    ///   뒤에만 시트를 만들어 이 레이스가 구조적으로 불가능하다.
    @State private var shareItem: SharePayload?
    @State private var entered = false
    /// 표시용 풀사이즈 합성본 — onAppear 에서 1회만 로드해 들고 있는다.
    ///   구 구현은 `frontFace` 가 body 안에서 `growth.image(for:)` 를 직접 불렀다. 앞면에선
    ///   틸트 자이로가 60Hz 로 @State 를 갱신하므로 body 도 초당 60회 재평가되고, NSCache 가
    ///   축출된 순간부터는 매 프레임 1200×1454 JPEG 를 디스크에서 다시 디코드하게 된다.
    @State private var photo: UIImage?
    @State private var memoSaveTask: Task<Void, Never>?
    // 부적 의식 실패 피드백(코인 부족·이미 바인딩) — 웹 PhotoTalismanPicker onNotify 토스트
    // 패턴 이식. 이 값이 있으면 하단 토스트를 띄운다. 실패를 침묵으로 버리던 결함 수정.
    @State private var talismanToast: String?
    // MemoEditor 는 UITextView 래퍼라 `.focused()` 로는 first responder 가 안 잡힌다.
    //   Bool 바인딩으로 직접 구동한다(PhotoCaptureModal 과 동일 규약).
    @State private var memoFocused: Bool = false

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
        .sheet(item: $shareItem) { payload in
            PolaroidShareSheet(image: payload.image, filename: payload.filename)
        }
        .onAppear {
            memoDraft = meta.memo
            if photo == nil { photo = growth.image(for: meta.id) }
            withAnimation(reduceMotion ? nil : .spring(response: 0.5, dampingFraction: 0.82)) {
                entered = true
            }
            #if DEBUG
            applyUITestHooks()
            #endif
        }
        .onChange(of: memoFocused) { focused in
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
        // 앨범 상세는 '감상' 화면이라 앞면에서만 틸트(자이로+드래그)를 켠다.
        //   뒷면(메모)에선 틸트를 하위뷰로 양보해야 메모 탭이 편집으로 들어간다
        //   (틸트 제스처는 minimumDistance 0 이라 켜져 있으면 탭을 가로챈다).
        //   꾸미기 화면(PhotoCaptureModal)은 틸트를 아예 끈다 — 그쪽은 '편집' 화면.
        // 플립은 앞·뒤 양쪽에서 살아있다. PolaroidFlip 이 수평 우세 드래그만 잡아
        //   메모 탭·캐럿 이동과 공존하므로, 뒷면에서 스와이프로 앞면에 돌아올 수 있다.
        PolaroidTilt(content: {
            PolaroidFlip(flipped: $flipped,
                         onInteractionBegan: { if memoFocused { memoFocused = false } },
                         front: { frontFace }, back: { backFace })
        }, enabled: !flipped)
        .frame(maxWidth: 300)
        .padding(.vertical, 4)
    }

    private var frontFace: some View {
        Group {
            if let img = photo {
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
            // 포커스는 Bool 바인딩으로 MemoEditor 내부 UITextView 의 first responder 를 직접
            //   구동한다. 안내 문구도 MemoEditor 가 첫 괘선 위에 그린다(구 구현은 카드 맨
            //   아래에 떠 있어 "어디에 쓰라는 건지" 읽히지 않았다).
            MemoEditor(text: $memoDraft,
                       placeholder: AppConfig.loc("탭하여 메모를 남겨요"),
                       focus: $memoFocused)
                .padding(14)
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
                // ae-nav(A) — 캡처 꾸미기 flip pill 과 같은 한 벌로 통일(학습 비용 감소).
                Text(flipped ? AppConfig.loc("앞면 사진 보기") : AppConfig.loc("뒷면에 메모해요"))
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
        guard let img = photo ?? growth.image(for: meta.id) else {
            // 파일이 아직 안 써졌거나 유실 — 침묵 대신 사유를 알린다.
            Haptics.play(.warning)
            showTalismanToast(AppConfig.loc("사진을 불러오지 못했어요"))
            return
        }
        SoundPlayer.shared.play(.select)
        Haptics.play(.selection)
        flushMemo()
        shareItem = SharePayload(image: img, filename: "upnext-\(meta.date).jpg")
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
            // 실패를 침묵으로 버리던 결함 수정 — 웹 onNotify 처럼 햅틱·토스트로 사유
            // (코인 부족/이미 부적/진행 중)를 반드시 노출한다. cancel 사운드는
            // talismanFail(스토어)이 전 호출처 공통으로 재생하므로 여기선 중복 재생 안 함.
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

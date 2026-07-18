//
//  PhotoCaptureModal.swift
//  UpNext — 폴라로이드 챌린지 인증 전체 흐름.
//
//  웹 src/components/growth/PhotoCaptureModal.tsx (1496 LOC) 핵심 격상.
//   3 phase (웹 capturePhase: camera→ejecting→polaroid 대응):
//    1. capture   — 라이브 카메라 + 셔터 + 갤러리 진입
//    2. ejecting  — 폴라로이드 배출(인화) 연출 2.5s (웹 tsx:1251-1356)
//    3. decorate  — 폴라로이드 + 스티커/서명/메모 + 저장/공유
//
//  프레임은 웹과 동일하게 촬영 시점 timestamp 로 랜덤 결정(선택 UI 없음).
//  06-photo-flow 수정:
//    (a/perf) Kodak CIFilter 를 캡처 직후 백그라운드 1회만 실행해 캐시 — body 안
//             동기 렌더 제거. 프레임 선택 그리드(전체 이미지 ×5 재인코딩) 삭제.
//    (b) 배출 시퀀스 이식. (d) 프레임 랜덤화. (a 연장) 저장 합성/인코딩 오프메인.
//
//  사용: parent 가 `fullScreenCover(item: $growth.pendingCapture)` 로 띄움.
//        completion 콜백으로 저장 결과(합성 UIImage)와 메타데이터 반환.
//

import SwiftUI
import PhotosUI

struct PhotoCaptureModal: View {
    /// 헤더에 표시할 챌린지 제목 — nil 이면 자유 캡처 (제목 캡슐 생략).
    /// 두 init 변형 모두 내부적으로 이 필드만 본다.
    private let displayTitle: String?
    /// 모달 닫기 (사용자가 X 또는 시스템 swipe-down). MainShell 이 cancelCapture() 호출.
    private let onCloseImpl: () -> Void
    /// 저장 콜백 — image, signature, memo, stickers. MainShell 이 GrowthStore.savePhoto 에
    /// 그대로 forward. 두 init 변형 모두 이 인자 순서로 normalize 해서 보관.
    private let onSaveImpl: (_ image: UIImage, _ signature: Data?, _ memo: String, _ stickers: [Sticker]) -> Void

    // MARK: init — A 형 (cardId/title/category + onSave(image,signature,memo,stickers) + onCancel)

    /// MainShell 의 `fullScreenCover(item: $growth.pendingCapture)` wire 가 쓰는 init.
    /// onSave 인자 순서: `image, signature, memo, stickers`. cardId 자체는 캡처 모달
    /// 내부에선 사용하지 않지만 (저장 시 MainShell 이 다시 forward), 시그니처 호환을
    /// 위해 받아두기만 한다.
    init(
        cardId: String?,
        title: String?,
        category: Category?,
        onSave: @escaping (_ image: UIImage, _ signature: Data?, _ memo: String, _ stickers: [Sticker]) -> Void,
        onCancel: @escaping () -> Void
    ) {
        _ = cardId      // 현 단계에선 카드 메타는 title 만 표시. category 도 보존 안 함.
        _ = category
        self.displayTitle = title
        self.onCloseImpl = onCancel
        self.onSaveImpl = onSave
    }

    // MARK: init — B 형 (card + onClose + onSave(image,memo,signature,stickers))

    /// 대체 wire — `fullScreenCover(isPresented:)` 패턴에서 쓰던 init.
    /// onSave 인자 순서: `image, memo, signature, stickers` — A 형과 다르니 주의.
    /// 내부에서 A 형 onSave 순서로 normalize 해서 onSaveImpl 에 저장한다.
    init(
        card: ChallengeCard?,
        onClose: @escaping () -> Void,
        onSave: @escaping (_ image: UIImage, _ memo: String, _ signature: Data?, _ stickers: [Sticker]) -> Void
    ) {
        // 10-i18n-leaks(a): 헤더 표시용 제목은 인앱 언어로 현지화(원문 title 직결 누수 차단).
        self.displayTitle = card?.localizedTitle(.current)
        self.onCloseImpl = onClose
        // A 형 (image, signature, memo, stickers) → B 형 (image, memo, signature, stickers) 매핑.
        self.onSaveImpl = { image, signature, memo, stickers in
            onSave(image, memo, signature, stickers)
        }
    }

    @State private var phase: Phase = .capture
    @State private var capturedImage: UIImage?          // 원본 (카메라/갤러리)
    @State private var filteredImage: UIImage?          // Kodak 필터 적용본 (캐시 — 표시/합성 공용)
    @State private var captureTimestamp: Date = Date()  // 프레임 랜덤·날짜스탬프·빈티지 기준
    @State private var photosPickerItem: PhotosPickerItem?
    @State private var facingFront: Bool = false
    @State private var flashOn: Bool = false
    @State private var flashOpacity: Double = 0         // 셔터 플래시 잔상 (웹 showFlash)
    @StateObject private var captureCoord = PhotoCaptureCoordinator()

    // Decorate phase
    @State private var frameVariant: PolaroidFrameVariant = .five  // 촬영 시 random 으로 덮어씀
    @State private var stickers: [Sticker] = []
    @State private var selectedSticker: UUID? = nil
    @State private var signatureData: Data? = nil
    @State private var memoText: String = ""
    @State private var flipped: Bool = false
    @State private var currentTool: DecorationTool = .pen
    @State private var penColor: PenColor = .black
    @State private var penWidth: PenWidth = .medium
    @State private var showShareSheet: Bool = false
    @State private var compositedImage: UIImage?
    @State private var isSaving: Bool = false           // 저장 중 가드 + 인디케이터

    // Ejecting 애니메이션 상태 (웹 PhotoCaptureModal.tsx:1251-1356 수치 그대로)
    @State private var ejectY: CGFloat = -1.0       // 폴라로이드 y = 자기 높이의 배수(-100% 시작)
    @State private var ejectScale: CGFloat = 1.0
    @State private var ejectCameraY: CGFloat = 0    // 카메라 top/bottom 레이어 퇴장 offset
    @State private var developProgress: Double = 0  // 0 sepia/어둠 → 1 풀컬러 현상
    @State private var ejectStarted: Bool = false   // onAppear 중복 방지

    private enum Phase { case capture, ejecting, decorate }

    var body: some View {
        ZStack {
            Color.bgPrimary.ignoresSafeArea()
            switch phase {
            case .capture:  captureView
            case .ejecting: ejectingView
            case .decorate: decorateView
            }
            // 셔터 플래시 잔상 — 웹 captureFromVideo 의 showFlash (opacity 1→0).
            if flashOpacity > 0 {
                Color.white
                    .opacity(flashOpacity)
                    .ignoresSafeArea()
                    .allowsHitTesting(false)
            }
        }
        .sheet(isPresented: $showShareSheet) {
            if let img = compositedImage {
                PolaroidShareSheet(image: img)
            }
        }
        .onChange(of: photosPickerItem) { item in
            guard let item else { return }
            Task {
                guard let data = try? await item.loadTransferable(type: Data.self),
                      let img = UIImage(data: data) else { return }
                await MainActor.run { beginEject(img) }
            }
        }
    }

    // MARK: - Phase 1 — Capture

    private var captureView: some View {
        ZStack {
            PhotoCaptureView(onCapture: { img in
                beginEject(img)
            }, facingFront: $facingFront, flashOn: $flashOn,
               coordinator: captureCoord)
            .ignoresSafeArea()

            // 상단 — 닫기 / 카드 제목
            VStack {
                HStack {
                    Button { onCloseImpl() } label: {
                        PixelIcon(.cancel, size: 22, color: Color.white)
                            .padding(12)
                            .background(Color.black.opacity(0.4), in: Circle())
                    }
                    Spacer()
                    if let displayTitle {
                        Text(displayTitle)
                            .typography(.body)
                            .foregroundStyle(Color.white)
                            .padding(.horizontal, 12)
                            .padding(.vertical, 6)
                            .background(Color.black.opacity(0.4), in: Capsule())
                    }
                    Spacer()
                    Button { flashOn.toggle() } label: {
                        PixelIcon(flashOn ? .zap : .moon, size: 22, color: Color.white)
                            .padding(12)
                            .background(Color.black.opacity(0.4), in: Circle())
                    }
                }
                .padding(.horizontal, 16)
                .padding(.top, 8)
                Spacer()
                // 하단 — 갤러리 / 셔터 / 전후면 토글
                HStack(spacing: 28) {
                    PhotosPicker(selection: $photosPickerItem, matching: .images) {
                        PixelIcon(.image, size: 26, color: Color.white)
                            .frame(width: 56, height: 56)
                            .background(Color.black.opacity(0.4), in: Circle())
                    }
                    Button { shutterTap() } label: {
                        ZStack {
                            Circle().fill(Color.white).frame(width: 76, height: 76)
                            Circle()
                                .stroke(Color.white, lineWidth: 4)
                                .frame(width: 86, height: 86)
                        }
                    }
                    Button { facingFront.toggle() } label: {
                        PixelIcon(.reload, size: 26, color: Color.white)
                            .frame(width: 56, height: 56)
                            .background(Color.black.opacity(0.4), in: Circle())
                    }
                }
                .padding(.bottom, 40)
            }
        }
    }

    private func shutterTap() {
        Haptics.play(.medium)
        SoundPlayer.shared.play(.cameraShutter)
        // PhotoCaptureCoordinator 가 들고 있는 CameraVC.capture() 직호출.
        // (이전엔 NotificationCenter 옵저버가 없는 채로 post 만 해서 dead button 이었다.)
        captureCoord.trigger()
    }

    /// 캡처(카메라·갤러리) 직후 진입점 — 웹 captureFromVideo(tsx:282-337) 대응.
    /// 프레임을 timestamp 로 랜덤 결정하고, Kodak 필터를 백그라운드 1회만 돌려 캐시한 뒤
    /// 배출 애니메이션을 시작한다. body 안에서는 필터를 절대 돌리지 않는다.
    private func beginEject(_ img: UIImage) {
        capturedImage = img
        let ts = Date()
        captureTimestamp = ts
        frameVariant = PolaroidFrameVariant.random(timestamp: ts)   // 웹 pickVariant (선택 UI 없음)
        filteredImage = nil

        // Kodak 필름룩 — 06-photo-flow(a): 캡처 직후 백그라운드 1회. body 재평가와 무관.
        // maxDimension 1200 다운샘플로 CIFilter/디코드 비용 절감 (표시·합성엔 충분).
        DispatchQueue.global(qos: .userInitiated).async {
            let filtered = PolaroidFilters.applyKodak(img, maxDimension: 1200)
            DispatchQueue.main.async { self.filteredImage = filtered }
        }

        // 셔터 플래시 잔상 (opacity 1→0, 0.3s).
        flashOpacity = 1
        withAnimation(.easeOut(duration: 0.3)) { flashOpacity = 0 }

        // 배출 초기 상태 세팅 후 ejecting 진입 — 실제 애니메이션 kick 은 ejectingView.onAppear
        // (뷰 마운트 후에 시작해야 -100% → 15% 가 애니메이트됨).
        ejectY = -1.0; ejectScale = 1.0; ejectCameraY = 0; developProgress = 0
        ejectStarted = false
        phase = .ejecting
    }

    // MARK: - Phase 2 — Ejecting (폴라로이드 배출 연출)

    /// 웹 tsx:1246-1356 3레이어 샌드위치 — bottom(z1)·폴라로이드(z2)·top(z3).
    /// 슬롯 라인 = 조립체 높이의 1238/1426 ≈ 86.8%. 폴라로이드는 슬롯에서 위로 숨은 채
    /// 시작(-100%) → y 증가로 슬롯 밖으로 밀려나옴. 위쪽은 top 레이어가 가려준다.
    private var ejectingView: some View {
        GeometryReader { geo in
            // 조립체 aspect 1525/1426 (웹 style aspectRatio). 최대 340pt.
            let cw = min(geo.size.width - 32, 340)
            let ch = cw * 1426.0 / 1525.0
            let topH = ch * 1238.0 / 1426.0       // top 레이어 높이 (86.8%)
            let bottomH = ch * 188.0 / 1426.0     // bottom 레이어 높이 (13.2%)
            let polW = cw * 0.62                   // 폴라로이드 width 62%
            let polH = polW * (223.0 / 184.0)      // 프레임 aspect (184×223)
            let polX = (cw - polW) / 2
            let polBaseY = ch * 1238.0 / 1426.0    // 슬롯 라인 top

            ZStack(alignment: .topLeading) {
                // Bottom layer (z1) — 카메라 하단 립. 아래 정렬, 위로 퇴장.
                Image("PolaroidBottom")
                    .resizable()
                    .frame(width: cw, height: bottomH)
                    .offset(x: 0, y: (ch - bottomH) + ejectCameraY)
                    .zIndex(1)

                // Polaroid (z2) — 슬롯에서 출력. transformOrigin center-top (anchor .top).
                developedPolaroid
                    .frame(width: polW, height: polH)
                    .scaleEffect(ejectScale, anchor: .top)
                    .offset(x: polX, y: polBaseY + ejectY * polH)
                    .zIndex(2)

                // Top layer (z3) — 카메라 본체. 위 정렬, 위로 퇴장. 폴라로이드 상단을 가림.
                Image("PolaroidTop")
                    .resizable()
                    .frame(width: cw, height: topH)
                    .offset(x: 0, y: ejectCameraY)
                    .zIndex(3)
            }
            .frame(width: cw, height: ch)
            .position(x: geo.size.width / 2, y: geo.size.height / 2)
            .onAppear { runEjectSequence() }
        }
    }

    /// 배출 중 폴라로이드 — 현상 연출(웹 filter sepia 0.8→0·brightness 0.85→1·contrast 0.9→1).
    /// SwiftUI 근사: 채도/명도/대비 애니 + 세피아 웜톤 오버레이 페이드.
    private var developedPolaroid: some View {
        PolaroidFrame(image: filteredImage ?? capturedImage,
                      timestamp: captureTimestamp,
                      variant: frameVariant) { EmptyView() }
            .saturation(0.35 + 0.65 * developProgress)
            .brightness(-0.15 * (1 - developProgress))
            .contrast(0.9 + 0.1 * developProgress)
            .overlay(
                Color(red: 0.44, green: 0.30, blue: 0.11)
                    .opacity(0.42 * (1 - developProgress))
                    .blendMode(.multiply)
                    .allowsHitTesting(false)
            )
            .compositingGroup()
    }

    /// 배출 타임라인 (웹 총 2.5s, keyTimes [0,0.5,1]) — 뷰 마운트 후 1회.
    private func runEjectSequence() {
        guard !ejectStarted else { return }
        ejectStarted = true

        // 400ms: 슬라이드 사운드 + 라이트 햅틱 (웹 setTimeout(polaroidSlide,400) / HAPTIC light).
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.4) {
            SoundPlayer.shared.play(.polaroidSlide)
            Haptics.play(.light)
        }

        // Stage A (0→1.25s) — 직선 출력 -100%→15%, ease (0.23,1,0.32,1).
        withAnimation(.timingCurve(0.23, 1, 0.32, 1, duration: 1.25)) {
            ejectY = 0.15
        }
        // 현상 — sepia/어둠 → 풀컬러 (웹 duration 1.8, delay 0.6, ease (0.23,1,0.32,1)).
        withAnimation(.timingCurve(0.23, 1, 0.32, 1, duration: 1.8).delay(0.6)) {
            developProgress = 1
        }

        // Stage B (1.25→2.5s) — 폴라로이드 15%→-45% scale 1→1.3 (ease 0.77,0,0.175,1),
        // 카메라 레이어 퇴장 (ease 0.33,1,0.68,1).
        DispatchQueue.main.asyncAfter(deadline: .now() + 1.25) {
            withAnimation(.timingCurve(0.77, 0, 0.175, 1, duration: 1.25)) {
                ejectY = -0.45
                ejectScale = 1.3
            }
            withAnimation(.timingCurve(0.33, 1, 0.68, 1, duration: 1.25)) {
                // 웹 -700px(≈2.2×조립체높이) — 화면 밖으로 완전 퇴장.
                ejectCameraY = -UIScreen.main.bounds.height
            }
        }

        // 2.5s 후 데코 단계 진입 (웹 setTimeout(→polaroid,2500)).
        DispatchQueue.main.asyncAfter(deadline: .now() + 2.5) {
            phase = .decorate
        }
    }

    // MARK: - Phase 3 — Decorate

    private var decorateView: some View {
        VStack(spacing: 12) {
            HStack {
                Button { retake() } label: {
                    PixelIcon(.chevronLeft, size: 18, color: Color.textSecondary)
                        .padding(8)
                }
                Spacer()
                Button { flipped.toggle() } label: {
                    Text(flipped ? AppConfig.loc("앞면") : AppConfig.loc("뒷면 메모"))
                        .typography(.caption)
                        .foregroundStyle(Color.textSecondary)
                        .padding(.horizontal, 14).padding(.vertical, 6)
                        .background(Color.bgSurface, in: Capsule())
                }
                Spacer()
                Button { share() } label: {
                    PixelIcon(.send, size: 18, color: Color.accentPrimary)
                        .padding(8)
                }
            }
            .padding(.horizontal, 16)

            // 폴라로이드 (PolaroidTilt + PolaroidFlip 합성)
            PolaroidTilt(content: {
                PolaroidFlip(flipped: $flipped, front: { frontFace }, back: { backFace })
            })
            .frame(maxWidth: 320)
            .padding(.vertical, 8)

            DecorationToolbar(
                currentTool: $currentTool,
                penColor: $penColor,
                penWidth: $penWidth,
                onPickSticker: { stickers.append($0) }
            )
            .padding(.horizontal, 16)

            Button { save() } label: {
                Group {
                    if isSaving {
                        HStack(spacing: 8) {
                            ProgressView().tint(Color.bgPrimary)
                            Text(AppConfig.loc("저장 중…"))
                        }
                    } else {
                        Text("저장")
                    }
                }
                .typography(.body)
                .foregroundStyle(Color.bgPrimary)
                .frame(maxWidth: .infinity)
                .frame(height: 52)
                .background(Color.accentPrimary, in: RoundedRectangle(cornerRadius: 12))
                .opacity(isSaving ? 0.7 : 1)
            }
            .buttonStyle(.plain)
            .disabled(isSaving)
            .padding(.horizontal, 16)
            .padding(.bottom, 12)
        }
    }

    private var frontFace: some View {
        ZStack {
            // 이미 필터된 이미지를 넘긴다 — PolaroidFrame body 안 CIFilter 없음(06-photo-flow a).
            PolaroidFrame(image: filteredImage ?? capturedImage,
                          timestamp: captureTimestamp, variant: frameVariant) { EmptyView() }
            // 스티커 레이어
            StickerLayer(stickers: $stickers, selectedId: $selectedSticker)
                .allowsHitTesting(currentTool == .sticker || selectedSticker != nil)
            // 서명 캔버스 (top layer)
            if currentTool == .pen || currentTool == .eraser {
                SignatureCanvas(
                    signatureData: $signatureData,
                    penColor: penColor.uiColor,
                    penWidth: penWidth.stroke,
                    eraserMode: currentTool == .eraser
                )
                .allowsHitTesting(true)
            }
        }
    }

    private var backFace: some View {
        ZStack {
            Color.paperCream.clipShape(RoundedRectangle(cornerRadius: 2))
            VStack {
                MemoEditor(text: $memoText)
                    .padding(8)
            }
        }
        .aspectRatio(184.0/223.0, contentMode: .fit)
        .shadow(color: .black.opacity(0.1), radius: 4)
    }

    /// 다시 촬영 — 사진·필터·데코 상태를 초기화하고 카메라로 복귀.
    private func retake() {
        capturedImage = nil
        filteredImage = nil
        stickers = []
        selectedSticker = nil
        signatureData = nil
        memoText = ""
        flipped = false
        phase = .capture
    }

    // MARK: - 합성 / 저장 / 공유

    /// 폴라로이드 합성 → UIImage. 06-photo-flow(a 연장): 서명 렌더·합성·인코딩을
    /// 백그라운드 큐로 옮겨 메인 블로킹 제거. UIScreen.main.scale 은 메인에서 캡처해 넘긴다.
    /// filteredImage 가 있으면 이미 Kodak 이 적용된 것이므로 재필터 생략(이중 CIFilter 방지).
    private func composite(_ completion: @escaping (UIImage) -> Void) {
        guard let base = filteredImage ?? capturedImage else { return }
        let alreadyFiltered = (filteredImage != nil)
        let ts = captureTimestamp
        let variantBg = UIColor(Color(hex: frameVariant.backgroundHex))
        let scale = UIScreen.main.scale
        let sigData = signatureData
        let compositeStickers = stickers.map {
            CompositeSticker(
                id: $0.id.uuidString,
                type: $0.type == .emoji ? .emoji : .image,
                content: $0.content, x: $0.x, y: $0.y,
                rotation: $0.rotation, scale: $0.scale, zIndex: $0.zIndex
            )
        }
        DispatchQueue.global(qos: .userInitiated).async {
            let sigImage = SignatureCanvas.renderImage(
                from: sigData,
                size: CGSize(width: 600, height: 727),
                scale: scale
            )
            let composited = PolaroidComposite.render(
                photo: base,
                timestamp: ts,
                signatureImage: sigImage,
                stickers: compositeStickers,
                frameBg: variantBg,
                applyFilter: !alreadyFiltered
            )
            DispatchQueue.main.async { completion(composited) }
        }
    }

    private func save() {
        guard !isSaving else { return }   // 더블탭 가드 (웹 isSavingRef)
        isSaving = true
        Haptics.play(.success)
        composite { img in
            self.compositedImage = img
            self.isSaving = false
            // 내부 표준 순서 — (image, signature, memo, stickers).
            // B 형 init 의 onSave 는 init 에서 normalize 어댑터로 변환된다.
            self.onSaveImpl(img, self.signatureData, self.memoText, self.stickers)
        }
    }

    private func share() {
        guard !isSaving else { return }
        isSaving = true
        composite { img in
            self.compositedImage = img
            self.isSaving = false
            self.showShareSheet = true
        }
    }
}

// (이전의 `.upnextCameraShutter` Notification.Name 은 셔터 트리거가 코디네이터
//  직호출로 바뀌면서 폐기 — 옵저버가 없던 dead code 였다.)

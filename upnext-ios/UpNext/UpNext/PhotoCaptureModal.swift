//
//  PhotoCaptureModal.swift
//  UpNext — 폴라로이드 챌린지 인증 전체 흐름.
//
//  웹 src/components/growth/PhotoCaptureModal.tsx (1496 LOC) 핵심 격상.
//   3 phase:
//    1. capture — 라이브 카메라 + 셔터 + 갤러리 진입
//    2. preview — 사진 미리보기 + 프레임 선택 (1-5) + 재촬영
//    3. decorate — 폴라로이드 + 스티커/서명/메모 + 저장/공유
//
//  사용: parent 가 `showCapture: Bool` 로 fullScreenCover 띄움. completion 콜백으로
//        저장 결과(`composited UIImage`)와 메타데이터 반환.
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
    @State private var capturedImage: UIImage?
    @State private var photosPickerItem: PhotosPickerItem?
    @State private var facingFront: Bool = false
    @State private var flashOn: Bool = false
    @StateObject private var captureCoord = PhotoCaptureCoordinator()

    // Decorate phase
    @State private var frameVariant: PolaroidFrameVariant = .one
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

    private enum Phase { case capture, preview, decorate }

    var body: some View {
        ZStack {
            Color.bgPrimary.ignoresSafeArea()
            switch phase {
            case .capture:  captureView
            case .preview:  previewView
            case .decorate: decorateView
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
                await MainActor.run {
                    capturedImage = img
                    phase = .preview
                }
            }
        }
    }

    // MARK: - Phase 1 — Capture

    private var captureView: some View {
        ZStack {
            PhotoCaptureView(onCapture: { img in
                capturedImage = img
                phase = .preview
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

    // MARK: - Phase 2 — Preview

    private var previewView: some View {
        VStack(spacing: 16) {
            HStack {
                Button { retake() } label: {
                    HStack(spacing: 6) {
                        PixelIcon(.chevronLeft, size: 14, color: Color.textSecondary)
                        Text("다시 촬영").typography(.caption).foregroundStyle(Color.textSecondary)
                    }
                }
                Spacer()
                Button { phase = .decorate } label: {
                    Text("꾸미기 →")
                        .typography(.caption)
                        .foregroundStyle(Color.bgPrimary)
                        .padding(.horizontal, 14)
                        .padding(.vertical, 8)
                        .background(Color.accentPrimary, in: Capsule())
                }
            }
            .padding(.horizontal, 20)
            .padding(.top, 12)

            Text("프레임 선택")
                .typography(.heading)
                .foregroundStyle(Color.textPrimary)

            ScrollView {
                LazyVGrid(columns: [GridItem(.flexible(), spacing: 12), GridItem(.flexible(), spacing: 12)], spacing: 12) {
                    ForEach(PolaroidFrameVariant.allCases, id: \.self) { v in
                        Button {
                            frameVariant = v
                            Haptics.play(.selection)
                        } label: {
                            PolaroidFrame(imageData: capturedImage?.jpegData(compressionQuality: 0.9),
                                          timestamp: Date(), variant: v) {
                                EmptyView()
                            }
                            .overlay(
                                RoundedRectangle(cornerRadius: 4)
                                    .stroke(frameVariant == v ? Color.accentPrimary : Color.clear,
                                            lineWidth: 3)
                                    .padding(-4)
                            )
                        }
                        .buttonStyle(.plain)
                    }
                }
                .padding(20)
            }
        }
    }

    private func retake() {
        capturedImage = nil
        phase = .capture
    }

    // MARK: - Phase 3 — Decorate

    private var decorateView: some View {
        VStack(spacing: 12) {
            HStack {
                Button { phase = .preview } label: {
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
                Text("저장")
                    .typography(.body)
                    .foregroundStyle(Color.bgPrimary)
                    .frame(maxWidth: .infinity)
                    .frame(height: 52)
                    .background(Color.accentPrimary, in: RoundedRectangle(cornerRadius: 12))
            }
            .buttonStyle(.plain)
            .padding(.horizontal, 16)
            .padding(.bottom, 12)
        }
    }

    private var frontFace: some View {
        ZStack {
            PolaroidFrame(imageData: capturedImage?.jpegData(compressionQuality: 0.9),
                          timestamp: Date(), variant: frameVariant) { EmptyView() }
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

    private func save() {
        guard let captured = capturedImage else { return }
        let sigImage = SignatureCanvas.renderImage(
            from: signatureData,
            size: CGSize(width: 600, height: 727)
        )
        let composited = PolaroidComposite.render(
            photo: captured,
            timestamp: Date(),
            signatureImage: sigImage,
            stickers: stickers.map {
                CompositeSticker(
                    id: $0.id.uuidString,
                    type: $0.type == .emoji ? .emoji : .image,
                    content: $0.content, x: $0.x, y: $0.y,
                    rotation: $0.rotation, scale: $0.scale, zIndex: $0.zIndex
                )
            },
            frameBg: UIColor(Color(hex: frameVariant.backgroundHex))
        )
        compositedImage = composited
        Haptics.play(.success)
        // 내부 표준 순서 — (image, signature, memo, stickers).
        // B 형 init 의 onSave 는 init 에서 normalize 어댑터로 변환된다.
        onSaveImpl(composited, signatureData, memoText, stickers)
    }

    private func share() {
        save()
        showShareSheet = true
    }
}

// (이전의 `.upnextCameraShutter` Notification.Name 은 셔터 트리거가 코디네이터
//  직호출로 바뀌면서 폐기 — 옵저버가 없던 dead code 였다.)

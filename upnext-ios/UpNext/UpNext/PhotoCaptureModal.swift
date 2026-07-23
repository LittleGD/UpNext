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
#if DEBUG
import PencilKit
#endif

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
    // 노출 보정 EV(-2..+2) — 웹 PhotoCaptureModal exposureEV. 리브드 슬라이더 드래그로 조정.
    //   파인더 노출계 바늘 각도 + 리브 translate + 캡처 시 CIExposureAdjust 로 반영.
    //   (웹은 라이브 휘도 자동 측광이지만 iOS 미리보기 레이어엔 프레임 접근이 없어
    //    바늘을 수동 EV 매치-니들 방식으로 구동 — 실사 필름 카메라 매치니들과 동일 감각.)
    @State private var exposureEV: Double = 0
    @State private var isExposureDragging: Bool = false
    @State private var exposureDragStartEV: Double = 0
    @State private var cameraError: Bool = false       // 카메라 불가 → 갤러리 폴백(웹 cameraError)
    @State private var showGalleryPicker: Bool = false  // 프로그램적 PhotosPicker 트리거
    @StateObject private var captureCoord = PhotoCaptureCoordinator()

    // Decorate phase
    @State private var frameVariant: PolaroidFrameVariant = .five  // 촬영 시 random 으로 덮어씀
    @State private var stickers: [Sticker] = []
    @State private var selectedSticker: UUID? = nil
    @State private var signatureData: Data? = nil
    @State private var memoText: String = ""
    @State private var flipped: Bool = false
    // P3(d) 사용자 지시 — 뒷면 메모 진입 시 키보드 즉시 표시. MemoEditor 의 focus: 파라미터에
    //   직접 배선한다(합성 View 바깥 .focused() 는 no-op 이 되는 SwiftUI 함정 회피).
    @FocusState private var memoFocused: Bool
    // 뒷면 진입 키보드 지연 표시 예약 — 재플립 시 취소용(a-flip-focus-stale-timer).
    @State private var memoFocusWork: DispatchWorkItem?
    // P4 — 편집 오버레이(폴라로이드 프레임=서명/스티커 컨테이너)의 실제 point 크기.
    //   서명 합성 시 이 크기로 렌더한 뒤 600×727 로 균일 스케일해 웹과 좌표 정합.
    @State private var polaroidEditorSize: CGSize = .zero
    @State private var currentTool: DecorationTool = .pen
    @State private var penColor: PenColor = .black
    @State private var penWidth: PenWidth = .medium
    @State private var showShareSheet: Bool = false
    @State private var compositedImage: UIImage?
    @State private var isSaving: Bool = false           // 저장 중 가드 + 인디케이터
    // ae-nav(A) — 꾸미기 파괴 액션 확인 다이얼로그. dirty(서명/스티커/메모 존재) 시에만 노출.
    @State private var showQuitConfirm: Bool = false     // 그만두기(캡처 취소) 확인
    @State private var showRetakeConfirm: Bool = false   // 다시 찍기(카메라 복귀) 확인

    // Ejecting 애니메이션 상태 (웹 PhotoCaptureModal.tsx:1251-1356 수치 그대로)
    @State private var ejectY: CGFloat = -1.0       // 폴라로이드 y = 자기 높이의 배수(-100% 시작)
    @State private var ejectScale: CGFloat = 1.0
    @State private var ejectCameraY: CGFloat = 0    // 카메라 top/bottom 레이어 퇴장 offset
    @State private var developProgress: Double = 0  // 0 sepia/어둠 → 1 풀컬러 현상
    @State private var ejectStarted: Bool = false   // onAppear 중복 방지
    // B-2 — 배출용 폴라로이드 프리래스터 결과(flat UIImage). 배출 시작 전 1회 래스터화해
    //   배출 내내 이 비트맵에 현상 컬러필터+슬라이드만 적용(.drawingGroup 최초/재래스터·
    //   filteredImage 스왑 재래스터 제거). nil 이면 라이브 렌더 폴백.
    @State private var ejectPolaroidFlat: UIImage?
    // B-2 — PolaroidTop/Bottom 대형 PNG 를 오프메인에서 미리 디코드해 배출 첫 렌더 틱의
    //   동기 디코드 비용을 없앤다. Image(uiImage:) 로 렌더해 재디코드를 피함.
    @State private var prewarmedTop: UIImage?
    @State private var prewarmedBottom: UIImage?

    #if DEBUG
    // #10 정량 왕복 검증 훅(출시 바이너리 비포함) — UITestDecorateProbe.
    @State private var probeDidSetup = false
    @State private var probeDidStroke = false
    #endif

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
        #if DEBUG
        .onAppear { decorateProbeSetup() }
        #endif
        // 갤러리 폴백 — 카메라 불가(시뮬/권한)거나 뷰파인더 탭 시 프로그램적으로 오픈.
        .photosPicker(isPresented: $showGalleryPicker, selection: $photosPickerItem, matching: .images)
        .onChange(of: photosPickerItem) { item in
            guard let item else { return }
            Task {
                guard let data = try? await item.loadTransferable(type: Data.self),
                      let img = UIImage(data: data) else { return }
                // 갤러리 폴백 — 기기 노출계가 없으므로 EXPOSURE 다이얼 값을 CIExposureAdjust 로
                //   소프트 베이크(P2-a: 갤러리 경로만 소프트 노출, 카메라는 하드웨어 bias).
                await MainActor.run { beginEject(img, exposureEV: exposureEV) }
            }
        }
    }

    // MARK: - Phase 1 — Capture

    //
    // 웹 PhotoCaptureModal.tsx camera phase(tsx:505-1244) 정밀 이식 — 레트로 폴라로이드
    // 카메라 바디 스킨. 크림 바디 + 그린 액센트 스트라이프 + 필름 그레인 → 헤더(로고+CLOSE)
    // → 이중 베젤 뷰파인더(라이브 카메라 + 광학 파인더 오버레이 + 노출계 바늘) → 움푹
    // 컨트롤 트레이(FLASH 슬라이드 토글·SHUTTER·전후면·EXPOSURE 리브드 바) → 필름 배출 슬롯.
    private var captureView: some View {
        GeometryReader { geo in
            let vfSide = min(geo.size.width - 16, 386)  // 뷰파인더 외곽 변(웹 maxWidth 386)
            ZStack {
                cameraBodyBackground.ignoresSafeArea()

                // 상단 중앙 그린 액센트 스트라이프 — 웹 top:-13, 108×216 #cdf564(바디 위·헤더 뒤).
                VStack(spacing: 0) {
                    Rectangle()
                        .fill(Color(hex: 0xCDF564))
                        .frame(width: 108, height: 216)
                        .offset(y: -13 - geo.safeAreaInsets.top)
                    Spacer()
                }
                .allowsHitTesting(false)

                // 전체 바디 아날로그 필름 그레인 — 캐시된 종이 텍스처 재사용(멀티플라이).
                Image(uiImage: PolaroidFilters.paperTexture())
                    .resizable()
                    .opacity(0.16)
                    .blendMode(.multiply)
                    .ignoresSafeArea()
                    .allowsHitTesting(false)

                VStack(spacing: 0) {
                    cameraHeaderRow
                    Spacer(minLength: 8)
                    viewfinder(side: vfSide)
                    Spacer(minLength: 10)
                    controlsTray(width: vfSide)
                    filmOutputSlot(width: vfSide)
                        .padding(.top, 6)
                }
                .frame(maxWidth: 430)
                .frame(maxWidth: .infinity)
                .padding(.horizontal, 8)
                .padding(.top, geo.safeAreaInsets.top + 4)
                .padding(.bottom, max(geo.safeAreaInsets.bottom, 8))
            }
        }
    }

    // MARK: 바디 배경 — 웹 두 겹 그라디언트

    private var cameraBodyBackground: some View {
        ZStack {
            // Layer2 270deg: #DCD5BC → #EDE7D2 → #EDE7D2 → #DCD5BC (가로 중앙 하이라이트)
            LinearGradient(
                colors: [Color(hex: 0xDCD5BC), Color(hex: 0xEDE7D2),
                         Color(hex: 0xEDE7D2), Color(hex: 0xDCD5BC)],
                startPoint: .trailing, endPoint: .leading
            )
            // Layer1 180deg 20%: #D7CFB1 → #C3BB9C (세로 어둠 오버레이)
            LinearGradient(
                colors: [Color(hex: 0xD7CFB1, alpha: 0.20), Color(hex: 0xC3BB9C, alpha: 0.20)],
                startPoint: .top, endPoint: .bottom
            )
        }
    }

    // MARK: 헤더 — UpNext 워드마크 + CLOSE

    private var cameraHeaderRow: some View {
        HStack {
            Image("Wordmark")
                .renderingMode(.template)
                .resizable()
                .scaledToFit()
                .frame(height: 24)
                .foregroundStyle(Color(hex: 0x212727))
            Spacer()
            Button { onCloseImpl() } label: {
                moldedDarkButton(width: 80, height: 40) {
                    Text("CLOSE")
                        .font(.system(size: 10, weight: .bold))
                        .tracking(0.4)
                        .foregroundStyle(.white)
                        .shadow(color: .black.opacity(0.55), radius: 0.5, y: 1)
                }
            }
            .buttonStyle(.plain)
            .accessibilityLabel(AppConfig.loc("카메라 닫기"))
        }
        .padding(8)
    }

    /// 몰드된 다크 플라스틱 버튼(4px 검정 프레임 + 내부 수직 그라디언트 + 양각) — CLOSE/전후면 공용.
    @ViewBuilder
    private func moldedDarkButton<Content: View>(
        width: CGFloat, height: CGFloat, @ViewBuilder content: () -> Content
    ) -> some View {
        ZStack {
            RoundedRectangle(cornerRadius: 8).fill(.black)                 // 4px 검정 프레임
            RoundedRectangle(cornerRadius: 4)
                .fill(LinearGradient(
                    colors: [Color(hex: 0x2A2F2F), Color(hex: 0x212727), Color(hex: 0x161B1B)],
                    startPoint: .top, endPoint: .bottom))
                .overlay(                                                   // 상단 양각 하이라이트
                    RoundedRectangle(cornerRadius: 4)
                        .fill(LinearGradient(colors: [.white.opacity(0.22), .clear],
                                             startPoint: .top, endPoint: .center))
                        .allowsHitTesting(false))
                .padding(4)
            content()
        }
        .frame(width: width, height: height)
        .shadow(color: .black.opacity(0.25), radius: 2, y: 2)
    }

    // MARK: 뷰파인더 — 이중 베젤 + 라이브 카메라 + 광학 오버레이

    private func viewfinder(side: CGFloat) -> some View {
        let videoSide = side - 8 * 2 - 11 * 2   // 외곽 pad 8 + mid pad 11
        return cameraInner(size: videoSide)
            .frame(width: videoSide, height: videoSide)
            .padding(11)
            .background(
                RoundedRectangle(cornerRadius: 24)
                    .fill(Color(hex: 0xACA798, alpha: 0.2))
                    .overlay(RoundedRectangle(cornerRadius: 24)
                        .stroke(Color(hex: 0xB7AE91), lineWidth: 1))
            )
            .padding(8)
            .background(
                RoundedRectangle(cornerRadius: 32)
                    .strokeBorder(LinearGradient(
                        colors: [Color(hex: 0xECE9DE, alpha: 0.5), Color(hex: 0x46443E, alpha: 0.5)],
                        startPoint: .top, endPoint: .bottom), lineWidth: 2)
            )
            .shadow(color: .black.opacity(0.15), radius: 2)
    }

    private func cameraInner(size: CGFloat) -> some View {
        ZStack {
            Color(hex: 0x1A1D1E)

            // 라이브 카메라 (시뮬엔 프레임 없음 → cameraError=true → 갤러리 폴백)
            //   exposureEV 바인딩 → 기기 setExposureTargetBias 로 라이브 프리뷰 밝기 실시간 반영(P2-a).
            //   하드웨어 캡처는 이미 노출이 반영되므로 beginEject 는 exposureEV:0 (이중적용 방지).
            PhotoCaptureView(onCapture: { img in beginEject(img, exposureEV: 0) },
                             facingFront: $facingFront, flashOn: $flashOn,
                             exposureEV: $exposureEV,
                             cameraError: $cameraError, coordinator: captureCoord)

            // FLASH 라이브 프리뷰 밝기 파리티 — 웹 video CSS `brightness(1.15)` 근사(P2-b).
            //   라이브 프리뷰 위 화이트 15% 컴포짓. 시뮬/갤러리(cameraError) 모드엔 미적용.
            if flashOn && !cameraError {
                Color.white
                    .opacity(0.15)
                    .allowsHitTesting(false)
            }

            // 매트 스크린 그레인
            Image(uiImage: PolaroidFilters.paperTexture())
                .resizable().opacity(0.10).blendMode(.overlay).allowsHitTesting(false)

            // 광학 원형 비네트 (엣지 어둠)
            RadialGradient(colors: [.clear, .black.opacity(0.18), .black.opacity(0.55)],
                           center: .center, startRadius: size * 0.20, endRadius: size * 0.56)
                .allowsHitTesting(false)

            // 광학 파인더 오버레이 (프레임라인·마이크로프리즘·스플릿원·노출계 바늘)
            viewfinderOptics(size: size).allowsHitTesting(false)

            // 우측 노출 스케일 라벨 +/○/−
            HStack {
                Spacer()
                VStack(spacing: 9) {
                    Text("+")
                    Text("○").font(.system(size: 8, weight: .bold))
                    Text("−")
                }
                .font(.custom("Times New Roman", size: 7))
                .foregroundStyle(.white.opacity(0.55))
                .shadow(color: .black.opacity(0.9), radius: 1, y: 1)
                .padding(.trailing, 6)
            }
            .allowsHitTesting(false)

            // 카메라 불가 시 — 뷰파인더 탭 = 갤러리(웹 cameraError 오버레이 대응, 아이콘 only)
            if cameraError {
                Button { showGalleryPicker = true } label: {
                    ZStack {
                        Color(hex: 0x1A1D1E, alpha: 0.85)
                        PixelIcon(.image, size: 28, color: Color(hex: 0xECE9DE))
                    }
                }
                .buttonStyle(.plain)
                .accessibilityLabel(AppConfig.loc("갤러리에서 선택"))
            }
        }
        .frame(width: size, height: size)
        .clipShape(RoundedRectangle(cornerRadius: 18))
    }

    /// 광학 파인더 오버레이 — 웹 SVG(viewBox 100×100) 를 Canvas 로 이식. 좌표 정규화.
    private func viewfinderOptics(size: CGFloat) -> some View {
        Canvas { ctx, cs in
            let s = cs.width / 100.0
            func P(_ x: Double, _ y: Double) -> CGPoint { CGPoint(x: x * s, y: y * s) }
            let w = Color.white

            // 35mm 프레임 라인 rect(6,16,88,68)
            ctx.stroke(Path(CGRect(x: 6 * s, y: 16 * s, width: 88 * s, height: 68 * s)),
                       with: .color(w.opacity(0.22)), lineWidth: 0.25 * s)

            // 마이크로프리즘 링 (48 dots r6.2 + 56 dots r7.6)
            for i in 0..<48 {
                let a = Double(i) / 48 * 2 * .pi
                let c = P(50 + cos(a) * 6.2, 50 + sin(a) * 6.2)
                ctx.fill(Path(ellipseIn: CGRect(x: c.x - 0.28 * s, y: c.y - 0.28 * s,
                                                width: 0.56 * s, height: 0.56 * s)),
                         with: .color(w.opacity(0.2)))
            }
            for i in 0..<56 {
                let a = (Double(i) + 0.5) / 56 * 2 * .pi
                let c = P(50 + cos(a) * 7.6, 50 + sin(a) * 7.6)
                ctx.fill(Path(ellipseIn: CGRect(x: c.x - 0.22 * s, y: c.y - 0.22 * s,
                                                width: 0.44 * s, height: 0.44 * s)),
                         with: .color(w.opacity(0.15)))
            }

            // 스플릿 이미지 원 r4.2 + 수평 스플릿 라인
            ctx.stroke(Path(ellipseIn: CGRect(x: (50 - 4.2) * s, y: (50 - 4.2) * s,
                                              width: 8.4 * s, height: 8.4 * s)),
                       with: .color(w.opacity(0.55)), lineWidth: 0.32 * s)
            var split = Path(); split.move(to: P(45.8, 50)); split.addLine(to: P(54.2, 50))
            ctx.stroke(split, with: .color(w.opacity(0.55)), lineWidth: 0.28 * s)

            // 우측 노출 미터 세로선 + 틱마크 (+2,+1,0,-1,-2)
            var meter = Path(); meter.move(to: P(90, 32)); meter.addLine(to: P(90, 68))
            ctx.stroke(meter, with: .color(w.opacity(0.45)), lineWidth: 0.2 * s)
            let ticks: [(Double, Double, Double)] = [
                (32, 88.5, 0.2), (41, 89, 0.2), (50, 87.5, 0.3), (59, 89, 0.2), (68, 88.5, 0.2)]
            for (y, x0, lw) in ticks {
                var t = Path(); t.move(to: P(x0, y)); t.addLine(to: P(90, y))
                ctx.stroke(t, with: .color(w.opacity(0.45)), lineWidth: lw * s)
            }

            // 바늘 — 웹: θ = -EV·(π/8), 길이 5.15, 피벗(85,50)
            let ang = -exposureEV * (.pi / 8)
            let tip = P(85 + 5.15 * cos(ang), 50 + 5.15 * sin(ang))
            var needle = Path(); needle.move(to: P(85, 50)); needle.addLine(to: tip)
            ctx.stroke(needle, with: .color(w.opacity(0.75)),
                       style: StrokeStyle(lineWidth: 0.42 * s, lineCap: .round))
            ctx.fill(Path(ellipseIn: CGRect(x: (85 - 0.55) * s, y: (50 - 0.55) * s,
                                            width: 1.1 * s, height: 1.1 * s)),
                     with: .color(w.opacity(0.75)))
        }
    }

    // MARK: 컨트롤 트레이 (움푹) — Row1 FLASH+SHUTTER, Row2 전후면+EXPOSURE

    private func controlsTray(width: CGFloat) -> some View {
        VStack(spacing: 8) {
            HStack(spacing: 16) {
                flashGroup
                shutterGroup
            }
            HStack(spacing: 8) {
                flipButton
                Text("EXPOSURE")
                    .font(.system(size: 10, weight: .bold))
                    .foregroundStyle(Color(hex: 0x212328))
                exposureBar
            }
        }
        .padding(EdgeInsets(top: 10, leading: 12, bottom: 12, trailing: 12))
        .frame(width: width)
        .background(
            RoundedRectangle(cornerRadius: 14)
                .fill(Color(hex: 0x46443E, alpha: 0.06))
                .overlay(RoundedRectangle(cornerRadius: 14)
                    .stroke(.white.opacity(0.28), lineWidth: 0.5))
        )
    }

    // FLASH 그룹 — 라벨 + 슬라이드 토글 + OFF/ON
    private var flashGroup: some View {
        VStack(spacing: 4) {
            Text("FLASH")
                .font(.system(size: 10, weight: .bold))
                .foregroundStyle(Color(hex: 0x212328))
            Button {
                flashOn.toggle(); Haptics.play(.light)
            } label: { flashToggle }
            .buttonStyle(.plain)
            .accessibilityLabel(flashOn ? AppConfig.loc("플래시 끄기") : AppConfig.loc("플래시 켜기"))
            HStack {
                Text("OFF"); Spacer(); Text("ON")
            }
            .font(.system(size: 10, weight: .bold))
            .foregroundStyle(Color(hex: 0x212328, alpha: 0.4))
            .frame(width: 80)
        }
    }

    private var flashToggle: some View {
        ZStack(alignment: flashOn ? .trailing : .leading) {
            RoundedRectangle(cornerRadius: 8).fill(.black)
            ribbedTrack.padding(4)
            flashKnob.padding(2)
        }
        .frame(width: 80, height: 40)
        .shadow(color: .black.opacity(0.2), radius: 2, y: 1)
        .animation(.spring(response: 0.28, dampingFraction: 0.72), value: flashOn)
    }

    /// 미끄럼방지 리브 그릴 트랙 — 수직 릿지(하이라이트+섀도우).
    private var ribbedTrack: some View {
        Canvas { ctx, sz in
            ctx.fill(Path(CGRect(origin: .zero, size: sz)), with: .color(Color(hex: 0x434039)))
            var x: CGFloat = 0
            while x < sz.width {
                ctx.fill(Path(CGRect(x: x, y: 0, width: 0.5, height: sz.height)),
                         with: .color(.white.opacity(0.06)))
                ctx.fill(Path(CGRect(x: x + 2, y: 0, width: 1, height: sz.height)),
                         with: .color(.black.opacity(0.45)))
                x += 3
            }
        }
        .clipShape(RoundedRectangle(cornerRadius: 4))
    }

    private var flashKnob: some View {
        RoundedRectangle(cornerRadius: 3)
            .fill(LinearGradient(colors: [Color(hex: 0xF6F1DC), Color(hex: 0xEDE7D2), Color(hex: 0xCFC6A6)],
                                 startPoint: .top, endPoint: .bottom))
            .overlay(RoundedRectangle(cornerRadius: 3).stroke(Color(hex: 0x7D7660), lineWidth: 1))
            .frame(width: 34, height: 34)
            .overlay(PixelIcon(.zap, size: 12, color: Color(hex: 0x212727)))
            .shadow(color: .black.opacity(0.5), radius: 2, y: 2)
    }

    // SHUTTER 그룹 (flex-1)
    private var shutterGroup: some View {
        VStack(spacing: 4) {
            Text("SHUTTER")
                .font(.system(size: 10, weight: .bold))
                .foregroundStyle(Color(hex: 0x212328))
            Button { shutterTap() } label: { shutterButton }
                .buttonStyle(.plain)
                .accessibilityLabel(AppConfig.loc("사진 촬영"))
            // FLASH 의 OFF/ON 행과 높이 매칭 (버튼 센터 정렬용 히든 스페이서)
            Text("OFF").font(.system(size: 10, weight: .bold)).opacity(0)
        }
        .frame(maxWidth: .infinity)
    }

    private var shutterButton: some View {
        ZStack {
            Capsule().fill(Color(hex: 0xCA3024))                          // red1
            Capsule()                                                     // red2 그라디언트 하이라인
                .strokeBorder(LinearGradient(
                    colors: [Color(hex: 0xE38F7C, alpha: 0.5), Color(hex: 0x871D14, alpha: 0.5)],
                    startPoint: .top, endPoint: .bottom), lineWidth: 2)
                .padding(6)
            Capsule().fill(LinearGradient(colors: [.white.opacity(0.22), .clear],
                                          startPoint: .top, endPoint: .center))  // top gloss
        }
        .frame(maxWidth: .infinity)
        .frame(height: 80)
        .clipShape(Capsule())
        .overlay(Capsule().strokeBorder(Color(hex: 0x232829), lineWidth: 1))
        .overlay(Capsule().strokeBorder(LinearGradient(
            colors: [Color(hex: 0xECE9DE, alpha: 0.25), Color(hex: 0x46443E, alpha: 0.25)],
            startPoint: .top, endPoint: .bottom), lineWidth: 2))
        .shadow(color: .black.opacity(0.2), radius: 3, y: 2)
    }

    private var flipButton: some View {
        Button {
            facingFront.toggle(); Haptics.play(.light)
        } label: {
            moldedDarkButton(width: 40, height: 40) {
                PixelIcon(.reload, size: 16, color: .white)
            }
        }
        .buttonStyle(.plain)
        .disabled(cameraError)
        .opacity(cameraError ? 0.4 : 1)
        .accessibilityLabel(facingFront ? AppConfig.loc("후면 카메라로 전환") : AppConfig.loc("전면 카메라로 전환"))
    }

    // EXPOSURE 리브드 바 — 드래그로 EV(-2..+2) 조정, 리브 translate + 바늘 반응
    private var exposureBar: some View {
        GeometryReader { g in
            ZStack {
                RoundedRectangle(cornerRadius: 8).fill(.black)
                RoundedRectangle(cornerRadius: 4)
                    .fill(LinearGradient(colors: [Color(hex: 0x212727), Color(hex: 0x939595), Color(hex: 0x212727)],
                                         startPoint: .leading, endPoint: .trailing))
                    .padding(4)
                HStack {
                    Text("−"); Spacer(); Text("+")
                }
                .font(.system(size: 10, weight: .bold))
                .foregroundStyle(Color(hex: 0x7C7C7C))
                .padding(.horizontal, 16)
                // 리브 그룹 — EV 에 따라 좌우로 활주 (웹 translateX(EV*24))
                HStack(spacing: 4) {
                    ForEach(0..<25, id: \.self) { _ in
                        RoundedRectangle(cornerRadius: 1)
                            .fill(Color(hex: 0x1D1E18))
                            .frame(width: 2, height: 12)
                    }
                }
                .offset(x: exposureEV * 24)
                .mask(RoundedRectangle(cornerRadius: 4).padding(4))
                .animation(isExposureDragging ? nil : .easeOut(duration: 0.16), value: exposureEV)
            }
            .contentShape(Rectangle())
            .gesture(exposureDrag(width: g.size.width))
        }
        .frame(height: 24)
    }

    private func exposureDrag(width: CGFloat) -> some Gesture {
        DragGesture(minimumDistance: 0)
            .onChanged { v in
                if !isExposureDragging { isExposureDragging = true; exposureDragStartEV = exposureEV }
                let dEV = Double(v.translation.width) / Double(max(1, width / 4))  // 바 폭 1/4 = 1 stop
                exposureEV = max(-2, min(2, exposureDragStartEV + dEV))
            }
            .onEnded { _ in isExposureDragging = false }
    }

    // MARK: 필름 배출 슬롯 — 라운드-탑

    private func filmOutputSlot(width: CGFloat) -> some View {
        UnevenRoundedRectangle(topLeadingRadius: 40, bottomLeadingRadius: 0,
                               bottomTrailingRadius: 0, topTrailingRadius: 40)
            .fill(Color(hex: 0x191A13))
            .frame(width: width, height: 42)
            .overlay(
                UnevenRoundedRectangle(topLeadingRadius: 40, bottomLeadingRadius: 0,
                                       bottomTrailingRadius: 0, topTrailingRadius: 40)
                    .fill(LinearGradient(colors: [.white.opacity(0.18), .clear],
                                         startPoint: .top, endPoint: .center))
                    .allowsHitTesting(false))
            .shadow(color: .black.opacity(0.15), radius: 2)
    }

    private func shutterTap() {
        // 카메라 불가(시뮬/권한) 시 셔터 = 갤러리 폴백(웹 cameraError → file input).
        if cameraError { showGalleryPicker = true; return }
        Haptics.play(.medium)
        SoundPlayer.shared.play(.cameraShutter)
        // PhotoCaptureCoordinator 가 들고 있는 CameraVC.capture() 직호출.
        // (이전엔 NotificationCenter 옵저버가 없는 채로 post 만 해서 dead button 이었다.)
        captureCoord.trigger()
    }

    /// 캡처(카메라·갤러리) 직후 진입점 — 웹 captureFromVideo(tsx:282-337) 대응.
    ///
    /// B-1/B-2/B-3(배출 프리즈 근본 수리) — 모든 무거운 이미지 작업을 배출 애니메이션 창
    /// 밖으로 직렬화한다. 실기기 12MP 에서 배출 시작 틱에 다운샘플·Kodak·프레임 최초 래스터·
    /// PNG 디코드가 한꺼번에 메인을 삼켜 애니메이션이 "정지"처럼 보이던 것(조사 실측 766ms)을
    /// 제거한다. 순서:
    ///   (bg) 다운샘플 → (bg) applyKodak → (bg) PolaroidTop/Bottom 디코드 프리웜
    ///   → (main) 소형 비트맵 세팅 + 배출 폴라로이드 flat 프리래스터(1회)
    ///   → **깨끗한 메인에서** phase=.ejecting (배출 애니는 ejectingView.onAppear 가 kick).
    /// 배출 중엔 flat 비트맵만 애니메이트하므로 메인 런루프가 비고, 슬라이드/현상이 매끈.
    private func beginEject(_ img: UIImage, exposureEV ev: Double = 0) {
        let ts = Date()
        let variant = PolaroidFrameVariant.random(timestamp: ts)  // 웹 pickVariant (선택 UI 없음)

        // 셔터 플래시 잔상 (opacity 1→0, 0.3s) — 프리래스터 준비 구간을 흰 플래시로 덮는다.
        flashOpacity = 1
        withAnimation(.easeOut(duration: 0.3)) { flashOpacity = 0 }

        // B-1/B-3 — 다운샘플·Kodak·PNG 디코드를 전부 오프메인 직렬화(카메라/갤러리 양경로 공통).
        //   원본 12MP 는 여기서 1회만 디코드(다운샘플)하고 버린다. exposureEV: 카메라는 0
        //   (하드웨어 bias 이미 반영), 갤러리 폴백만 CIExposureAdjust 소프트 베이크.
        DispatchQueue.global(qos: .userInitiated).async {
            // 1. 다운샘플 (12MP→960) — 이후 표시·합성 경로가 전부 ≤960px.
            let preview = PolaroidFilters.downsample(img, maxDimension: 960)
            // 2. Kodak 필름룩 — 축소된 preview 재사용(원본 재디코드 회피).
            let filtered = PolaroidFilters.applyKodak(preview, exposureEV: ev) ?? preview
            // 3. B-2 — 배출 레이어(PolaroidTop/Bottom) 대형 PNG 오프메인 디코드 프리웜.
            let top = UIImage(named: "PolaroidTop")?.preparingForDisplay()
            let bottom = UIImage(named: "PolaroidBottom")?.preparingForDisplay()

            DispatchQueue.main.async {
                // 4. (main) 소형·이미 필터된 비트맵 세팅 — 배출 중 스왑 없음(B-2).
                self.capturedImage = preview
                self.filteredImage = filtered
                self.captureTimestamp = ts
                self.frameVariant = variant
                self.prewarmedTop = top
                self.prewarmedBottom = bottom
                // 5. B-2 — 배출 폴라로이드 flat 프리래스터(ImageRenderer 는 @MainActor 라 main 1회).
                //   입력이 이미 ≤960 + 필터본이라 구(舊) 라이브 12MP + drawingGroup 이중 래스터보다
                //   훨씬 싸고(실측 ~10ms), 배출 애니 창 *밖*(phase 전환 전)에서 1회만 돈다.
                self.ejectPolaroidFlat = Self.renderEjectPolaroid(
                    image: filtered, timestamp: ts, variant: variant)
                // 6. 배출 초기 상태 세팅 후 깨끗한 메인에서 ejecting 진입.
                self.ejectY = -1.0; self.ejectScale = 1.0; self.ejectCameraY = 0
                self.developProgress = 0
                self.ejectStarted = false
                self.phase = .ejecting
            }
        }
    }

    /// B-2 — 배출용 폴라로이드를 단일 flat UIImage 로 1회 래스터화.
    /// ImageRenderer 는 @MainActor 제약이라 백그라운드 불가 → 메인에서 1회(배출 애니 시작 전).
    /// 입력 image 는 이미 다운샘플+Kodak 된 소형 비트맵이라 비용이 작다. 배출은 폭 340pt 상한
    /// (폴라로이드 62%≈210pt)이므로 넉넉히 240pt 로 렌더해 스케일 소프트닝을 피한다.
    @MainActor
    private static func renderEjectPolaroid(
        image: UIImage, timestamp: Date, variant: PolaroidFrameVariant
    ) -> UIImage? {
        let w: CGFloat = 240
        let h = w / variant.aspectRatio
        let content = PolaroidFrame(image: image, timestamp: timestamp, variant: variant) {
            EmptyView()
        }
        .frame(width: w, height: h)
        let renderer = ImageRenderer(content: content)
        renderer.scale = UIScreen.main.scale
        return renderer.uiImage
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
                //   B-2 — 오프메인 프리웜 디코드본을 렌더(배출 첫 틱 동기 디코드 제거).
                ejectLayerImage(prewarmedBottom, fallback: "PolaroidBottom")
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
                ejectLayerImage(prewarmedTop, fallback: "PolaroidTop")
                    .frame(width: cw, height: topH)
                    .offset(x: 0, y: ejectCameraY)
                    .zIndex(3)
            }
            .frame(width: cw, height: ch)
            .position(x: geo.size.width / 2, y: geo.size.height / 2)
            .onAppear { runEjectSequence() }
        }
    }

    /// 배출 레이어 이미지 — 오프메인 프리웜 디코드본(prewarmed)이 있으면 그걸 쓰고,
    /// 없으면(레이스/실패) 에셋명 폴백. 둘 다 resizable.
    @ViewBuilder
    private func ejectLayerImage(_ prewarmed: UIImage?, fallback: String) -> some View {
        if let prewarmed {
            Image(uiImage: prewarmed).resizable()
        } else {
            Image(fallback).resizable()
        }
    }

    /// 배출 중 폴라로이드 — 현상 연출(웹 filter sepia 0.8→0·brightness 0.85→1·contrast 0.9→1).
    /// SwiftUI 근사: 채도/명도/대비 애니 + 세피아 웜톤 오버레이 페이드.
    ///
    /// B-2 — 배출 시작 전 오프메인 직렬화에서 만든 flat 비트맵(ejectPolaroidFlat)만 애니메이트한다.
    ///   이전엔 무거운 PolaroidFrame 서브트리(Canvas 크로스해치 수백 path·blur·paperTexture)를
    ///   .drawingGroup() 으로 배출 첫 틱에 동기 래스터화 + filteredImage 스왑 시 재래스터화해
    ///   실기기 12MP 에서 766ms 메인 블록(=애니 정지)이 났다. 조사가 "애니 케이스 순손해"로
    ///   판정한 .drawingGroup() 을 제거하고, 정적 비트맵 위 GPU 컬러필터만 남긴다.
    ///   프리래스터 실패 시에만 라이브 렌더 폴백(그때도 drawingGroup 없음).
    private var developedPolaroid: some View {
        Group {
            if let flat = ejectPolaroidFlat {
                Image(uiImage: flat)
                    .resizable()
                    .aspectRatio(contentMode: .fit)
            } else {
                PolaroidFrame(image: filteredImage ?? capturedImage,
                              timestamp: captureTimestamp,
                              variant: frameVariant) { EmptyView() }
            }
        }
        .saturation(0.35 + 0.65 * developProgress)
        .brightness(-0.15 * (1 - developProgress))
        .contrast(0.9 + 0.1 * developProgress)
        // 세피아 웜톤 — 구 overlay(Color·blendMode.multiply)+compositingGroup 은 배출 첫 마운트에
        //   오프스크린 합성 패스를 강제해 히치를 키웠다. 수학적으로 동치인 .colorMultiply 로 대체:
        //   multiply(base, (1-a)*white + a*C), a=0.42*(1-p), C=(0.44,0.30,0.11)
        //   → 채널 배수 = 1 - 0.42*(1-p)*(1-C_ch). 오프스크린 그룹 없이 GPU 셰이더 1패스.
        .colorMultiply(Color(
            red:   1 - 0.2352 * (1 - developProgress),
            green: 1 - 0.2940 * (1 - developProgress),
            blue:  1 - 0.3738 * (1 - developProgress)))
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
            // ae-nav(A) 상단 바 — 좌: `그만두기`(캡처 취소), 우: `다시 찍기`(카메라 복귀).
            //   모호한 chevron/공유(send) 아이콘 제거(공유는 상세뷰 전용). 명시 텍스트 라벨 +
            //   dirty(서명/스티커/메모) 시 GbConfirm 가드. 완료는 버튼 ① 시점에 이미 커밋돼
            //   그만두기=사진만 생략(완료 유지). 보더·아이콘박스 없음(디자인 규칙).
            HStack {
                Button { quitTapped() } label: {
                    Text(AppConfig.loc("그만두기"))
                        .typography(.body)
                        .foregroundStyle(Color.textSecondary)
                        .padding(.vertical, 6).padding(.horizontal, 4)
                        .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .accessibilityLabel(AppConfig.loc("그만두기"))
                Spacer()
                // `다시 찍기` — 앞면에서만 노출. 뒷면(메모)에선 숨겨 "이전으로" 후보 경쟁 제거.
                if !flipped {
                    Button { retakeTapped() } label: {
                        Text(AppConfig.loc("다시 찍기"))
                            .typography(.body)
                            .foregroundStyle(Color.textSecondary)
                            .padding(.vertical, 6).padding(.horizontal, 4)
                            .contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel(AppConfig.loc("다시 찍기"))
                    .transition(.opacity)
                }
            }
            .padding(.horizontal, 16)

            // 폴라로이드 (PolaroidTilt + PolaroidFlip 합성)
            //   틸트 enabled: !flipped — 뒷면(메모)에선 틸트를 하위뷰로 양보(메모 탭이 편집 진입).
            //   플립 enabled: !memoFocused — 메모 편집 중엔 드래그 플립 비활성(포커스 탈취 방지).
            //   (PhotoDetailModal 과 동일한 GestureMask 게이트 규약. 뷰 정체성 유지.)
            PolaroidTilt(content: {
                PolaroidFlip(flipped: $flipped, enabled: !memoFocused,
                             front: { frontFace }, back: { backFace })
            }, enabled: !flipped)
            .frame(maxWidth: 320)
            .padding(.vertical, 8)

            // ae-nav(A) 플립 pill — 폴라로이드 하단 중앙. 라벨을 목적 중심으로 통일:
            //   `뒷면에 메모해요` ⇄ `앞면 사진 보기` (PhotoDetailModal flip 라벨과 같은 한 벌).
            flipPill

            // P3(d) 사용자 지시 — 뒷면 메모 화면에선 꾸미기 툴박스를 임시로 숨긴다(펜/지우개/
            //   스티커 스와치는 앞면 사진 전용). 앞면 복귀 시 자동 복원.
            if !flipped {
                DecorationToolbar(
                    currentTool: $currentTool,
                    penColor: $penColor,
                    penWidth: $penWidth,
                    onPickSticker: { stickers.append($0) }
                )
                .padding(.horizontal, 16)
                .transition(.opacity)
            }

            Button { save() } label: {
                Group {
                    if isSaving {
                        HStack(spacing: 8) {
                            ProgressView().tint(Color.bgPrimary)
                            Text(AppConfig.loc("저장 중…"))
                        }
                    } else {
                        // ae-nav(A) — 하단 primary 라벨을 `저장`으로 통일(구 "꾸미기 저장" 대체).
                        //   사진+데코+메모 전체를 한 번에 커밋하는 창작 저장.
                        Text(AppConfig.loc("저장"))
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
        .animation(.easeInOut(duration: 0.2), value: flipped)
        // P3(d) 사용자 지시 — 뒷면 진입 시 키보드 즉시 표시, 앞면 복귀 시 해제.
        //   플립 애니메이션이 시작된 뒤(≈0.35s) 포커스를 줘 3D 회전 중 포커스 점프를 피한다.
        .onChange(of: flipped) { isBack in
            // 빠른 재플립 시 이전 지연 클로저가 회전 중 키보드를 오띄우던 레이스 —
            // WorkItem 으로 이전 예약을 취소(코드리뷰 a-flip-focus-stale-timer).
            memoFocusWork?.cancel()
            if isBack {
                let work = DispatchWorkItem { if flipped { memoFocused = true } }
                memoFocusWork = work
                DispatchQueue.main.asyncAfter(deadline: .now() + 0.35, execute: work)
            } else {
                memoFocused = false
            }
        }
        // ae-nav(A) 파괴 액션 확인 — GbConfirm 재사용(05-modal-design). danger primary + secondary.
        .overlay {
            if showQuitConfirm {
                GbConfirm(
                    title: "꾸미기를 그만둘까요?",
                    message: "저장하지 않으면 지금까지 꾸민 건 사라져요.",
                    confirmLabel: "그만두기",
                    cancelLabel: "계속 꾸미기",
                    danger: true,
                    onConfirm: { showQuitConfirm = false; onCloseImpl() },
                    onCancel: { showQuitConfirm = false }
                )
                .transition(.opacity)
                .zIndex(90)
            }
        }
        .overlay {
            if showRetakeConfirm {
                GbConfirm(
                    title: "다시 찍을까요?",
                    message: "꾸민 내용은 사라지고 카메라로 돌아가요.",
                    confirmLabel: "다시 찍기",
                    cancelLabel: "취소",
                    danger: true,
                    onConfirm: { showRetakeConfirm = false; retake() },
                    onCancel: { showRetakeConfirm = false }
                )
                .transition(.opacity)
                .zIndex(90)
            }
        }
        .animation(.easeInOut(duration: 0.2), value: showQuitConfirm)
        .animation(.easeInOut(duration: 0.2), value: showRetakeConfirm)
    }

    /// ae-nav(A) 플립 pill — 폴라로이드 하단 중앙. PhotoDetailModal.flipButton 과 같은 한 벌.
    private var flipPill: some View {
        Button { toggleFlip() } label: {
            HStack(spacing: 6) {
                PixelIcon(.reload, size: 12, color: Color.textSecondary)
                Text(flipped ? AppConfig.loc("앞면 사진 보기") : AppConfig.loc("뒷면에 메모해요"))
                    .typography(.caption)
                    .foregroundStyle(Color.textSecondary)
            }
            .padding(.horizontal, 14).padding(.vertical, 6)
            .background(Color.bgSurface, in: Capsule())
        }
        .buttonStyle(.plain)
    }

    /// 앞면 ⇄ 뒷면 메모 전환 — 편집 포커스는 먼저 내리고 스프링 플립.
    private func toggleFlip() {
        if memoFocused { memoFocused = false }
        withAnimation(.spring(response: 0.5, dampingFraction: 0.7)) { flipped.toggle() }
    }

    /// 꾸미기 dirty 판정 — 서명·스티커·메모 중 하나라도 있으면 파괴 액션에 확인 가드.
    private var decorateDirty: Bool {
        signatureData != nil
            || !stickers.isEmpty
            || !memoText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    }

    /// `그만두기` — 캡처 취소(모달 닫기). 완료는 이미 커밋돼 사진만 생략된다.
    private func quitTapped() {
        if memoFocused { memoFocused = false }
        if decorateDirty {
            showQuitConfirm = true
        } else {
            onCloseImpl()
        }
    }

    /// `다시 찍기` — 카메라 복귀. dirty 면 확인 후 retake().
    private func retakeTapped() {
        if memoFocused { memoFocused = false }
        if decorateDirty {
            showRetakeConfirm = true
        } else {
            retake()
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
        // P4 좌표 정합 — 오버레이(스티커/서명) 컨테이너를 폴라로이드 프레임과 동일 bounds 로
        //   강제(웹 absolute inset-0). 그리디 자식(GeometryReader/PKCanvasView)이 ZStack 을
        //   세로로 늘려 컨테이너 aspect(≈0.55)가 합성 600:727(0.825)과 어긋나던 것을 제거 →
        //   컨테이너=프레임=600:727. 서명 CROP 오배치·스티커 세로 드리프트 모두 해소.
        .aspectRatio(frameVariant.aspectRatio, contentMode: .fit)
        .background(
            GeometryReader { geo in
                Color.clear.preference(key: EditorSizeKey.self, value: geo.size)
            }
        )
        .onPreferenceChange(EditorSizeKey.self) {
            polaroidEditorSize = $0
            #if DEBUG
            decorateProbeStrokeIfReady()
            #endif
        }
    }

    private var backFace: some View {
        ZStack {
            Color.paperCream.clipShape(RoundedRectangle(cornerRadius: 2))
            VStack(spacing: 0) {
                // 포커스를 파라미터로 넘겨 실제 내부 TextEditor 의 .focused() 에 직접 연결(합성 View
                //   바깥 .focused() 는 no-op 이 되는 함정 회피 — PhotoDetailModal 과 동일 규약).
                MemoEditor(text: $memoText, focus: $memoFocused)
                    .padding(8)
                // P3(a/d) 뒷면 힌트 — 캡처 backFace 엔 없던 placeholder. 비어있고 미편집일 때만.
                //   ae-nav(A) — 문구를 `여기에 오늘 메모를 남겨요`로 통일("~해요" 톤).
                if memoText.trimmingCharacters(in: .whitespaces).isEmpty && !memoFocused {
                    Text(AppConfig.loc("여기에 오늘 메모를 남겨요"))
                        .typography(.micro)
                        .foregroundStyle(Color.inkWarmText.opacity(0.5))
                        .padding(.bottom, 10)
                }
            }
        }
        .aspectRatio(184.0/223.0, contentMode: .fit)
        .shadow(color: .black.opacity(0.1), radius: 4)
    }

    /// 다시 촬영 — 사진·필터·데코 상태를 초기화하고 카메라로 복귀.
    private func retake() {
        capturedImage = nil
        filteredImage = nil
        ejectPolaroidFlat = nil          // B-2 배출 프리래스터 캐시 무효화
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
        // P4 — 서명을 편집 캔버스 실제 point 크기로 렌더한 뒤 PolaroidComposite 가 600×727 로
        //   균일 스케일(0,0,600,727)한다. 편집 컨테이너 aspect 가 600:727 로 잠겨 있어(frontFace
        //   aspect-lock) 왜곡 없이 정합. 폴백(레이아웃 전)은 600×727(구 동작).
        let editorSize: CGSize = (polaroidEditorSize.width > 1 && polaroidEditorSize.height > 1)
            ? polaroidEditorSize
            : CGSize(width: 600, height: 727)
        let compositeStickers = stickers.map {
            CompositeSticker(
                id: $0.id.uuidString,
                type: $0.type == .emoji ? .emoji : .image,
                content: $0.content, x: $0.x, y: $0.y,
                rotation: $0.rotation, scale: $0.scale, zIndex: $0.zIndex
            )
        }
        // 서명 렌더는 메인에서 — PKDrawing.image + UITraitCollection.performAsCurrent 는
        // UIKit 트레이트 API 라 백그라운드 호출이 미정의(코드리뷰 d-signature-trait-offmain).
        // 600×727 1회 렌더라 메인 비용은 수 ms. 무거운 합성만 백그라운드로.
        let sigImage = SignatureCanvas.renderImage(
            from: sigData,
            size: editorSize,
            scale: scale
        )
        DispatchQueue.global(qos: .userInitiated).async {
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

    #if DEBUG
    // MARK: - #10 정량 왕복 검증 프로브 (UITestDecorateProbe, 출시 비포함)
    //
    // 절차: 결정 위치에 스티커(⭐ 50/25%) + 낙서(캡션영역 가로선, editor 프랙션 기준) 를
    //   프로그램적으로 배치 → 저장 → 앨범 저장본에서 같은 위치에 렌더되는지 픽셀 검증.
    //   낙서를 top-left 가 아닌 하단(≈80%y)에 둬 P4 수정(SCALE) 과 구버그(CROP)를 확실히 구분.

    private func decorateProbeSetup() {
        guard ProcessInfo.processInfo.arguments.contains("UITestDecorateProbe"),
              !probeDidSetup else { return }
        probeDidSetup = true
        let img = Self.makeProbePhoto()
        captureTimestamp = Date()
        frameVariant = .five
        capturedImage = img
        filteredImage = img          // 필터 베이크 스킵 — 좌표 검증에 집중
        stickers = [Sticker(type: .emoji, content: "⭐️", x: 50, y: 25)]
        currentTool = .pen
        phase = .decorate
    }

    private func decorateProbeStrokeIfReady() {
        guard ProcessInfo.processInfo.arguments.contains("UITestDecorateProbe"),
              !probeDidStroke, polaroidEditorSize.width > 1 else { return }
        probeDidStroke = true
        let size = polaroidEditorSize
        signatureData = Self.makeProbeStroke(in: size)
        // 필터 자체검증 — 솔리드 블루(60,120,200)에 Kodak 적용 후 중앙 픽셀 로그(웹 타깃 (61,134,196)).
        Self.logKodakSample()
        // 저장(합성 → GrowthStore 커밋). 실제 save 경로(백그라운드 합성)로 왕복 검증.
        DispatchQueue.main.asyncAfter(deadline: .now() + 1.5) { save() }
    }

    /// 검증용 사진 — 파랑 바탕 + 4모서리 색블록(좌표 오리엔테이션 확인).
    private static func makeProbePhoto() -> UIImage {
        let s: CGFloat = 800
        return UIGraphicsImageRenderer(size: CGSize(width: s, height: s)).image { rc in
            let c = rc.cgContext
            c.setFillColor(UIColor(red: 60/255, green: 120/255, blue: 200/255, alpha: 1).cgColor)
            c.fill(CGRect(x: 0, y: 0, width: s, height: s))
            let corners: [(CGRect, UIColor)] = [
                (CGRect(x: 0, y: 0, width: 160, height: 160), .red),
                (CGRect(x: s-160, y: 0, width: 160, height: 160), .green),
                (CGRect(x: 0, y: s-160, width: 160, height: 160), .yellow),
                (CGRect(x: s-160, y: s-160, width: 160, height: 160), .magenta),
            ]
            for (r, col) in corners { col.setFill(); c.fill(r) }
        }
    }

    /// 검증용 낙서 — 편집 캔버스 하단(≈80%y)을 가로지르는 검은 획(x 15%→85%).
    private static func makeProbeStroke(in size: CGSize) -> Data {
        let ink = PKInk(.pen, color: .black)
        let y = size.height * 0.80
        var points: [PKStrokePoint] = []
        let n = 40
        for i in 0...n {
            let t = CGFloat(i) / CGFloat(n)
            let x = size.width * (0.15 + 0.70 * t)
            points.append(PKStrokePoint(
                location: CGPoint(x: x, y: y),
                timeOffset: TimeInterval(i) * 0.008,
                size: CGSize(width: 6, height: 6),
                opacity: 1, force: 1, azimuth: 0, altitude: .pi / 2))
        }
        let path = PKStrokePath(controlPoints: points, creationDate: Date())
        let stroke = PKStroke(ink: ink, path: path)
        return PKDrawing(strokes: [stroke]).dataRepresentation()
    }

    /// P4-b 필터 자체검증 — 솔리드 블루에 Kodak 적용 후 중앙 픽셀 로그.
    private static func logKodakSample() {
        let src = UIGraphicsImageRenderer(size: CGSize(width: 40, height: 40)).image { rc in
            UIColor(red: 60/255, green: 120/255, blue: 200/255, alpha: 1).setFill()
            rc.fill(CGRect(x: 0, y: 0, width: 40, height: 40))
        }
        guard let out = PolaroidFilters.applyKodak(src), let cg = out.cgImage else { return }
        var buf = [UInt8](repeating: 0, count: 4)
        if let c = CGContext(data: &buf, width: 1, height: 1, bitsPerComponent: 8, bytesPerRow: 4,
                             space: CGColorSpaceCreateDeviceRGB(),
                             bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue) {
            c.draw(cg, in: CGRect(x: -Int(out.size.width)/2, y: -Int(out.size.height)/2,
                                  width: Int(out.size.width), height: Int(out.size.height)))
            NSLog("PROBE kodak blue(60,120,200) -> (\(buf[0]),\(buf[1]),\(buf[2]))  web target (61,134,196)")
        }
    }
    #endif
}

// (이전의 `.upnextCameraShutter` Notification.Name 은 셔터 트리거가 코디네이터
//  직호출로 바뀌면서 폐기 — 옵저버가 없던 dead code 였다.)

/// P4 — 편집 오버레이(폴라로이드 프레임) 실제 렌더 크기를 위로 전달하는 PreferenceKey.
///   서명 합성 좌표 기준(편집 point 공간)을 잡는 데만 쓴다.
private struct EditorSizeKey: PreferenceKey {
    static var defaultValue: CGSize = .zero
    static func reduce(value: inout CGSize, nextValue: () -> CGSize) {
        let next = nextValue()
        if next != .zero { value = next }
    }
}

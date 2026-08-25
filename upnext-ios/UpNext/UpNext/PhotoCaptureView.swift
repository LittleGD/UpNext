//
//  PhotoCaptureView.swift
//  UpNext — 라이브 카메라 캡처 (AVCaptureSession 기반).
//
//  웹 PhotoCaptureModal 의 navigator.getUserMedia 부분 격상:
//   - AVCaptureSession + AVCaptureVideoPreviewLayer
//   - 전후면 토글 (facingMode)
//   - 풀스크린 미리보기 + 캡처 버튼
//   - 캡처 시 UIImage 로 onCapture 콜백
//   - 외부 셔터 트리거 — PhotoCaptureCoordinator 핸들에 VC 를 바인딩해서
//     SwiftUI 셔터 버튼이 NotificationCenter 없이 직호출.
//

import SwiftUI
import AVFoundation
import CoreMedia
import Combine

/// SwiftUI 부모가 카메라 VC 를 외부에서 트리거하기 위한 핸들. PhotoCaptureView 가
/// `makeUIViewController` 에서 자신을 vc 슬롯에 꽂는다. 부모는 `trigger()` 만 호출.
final class PhotoCaptureCoordinator: ObservableObject {
    weak var vc: CameraVC?

    /// 셔터 트리거 — VC 가 photoOutput.capturePhoto 호출. VC 없으면 무시.
    func trigger() { vc?.capture() }
}

struct PhotoCaptureView: UIViewControllerRepresentable {
    let onCapture: (UIImage) -> Void
    @Binding var facingFront: Bool
    @Binding var flashOn: Bool
    /// EXPOSURE 다이얼(EV, -2..+2) — 웹 PhotoCaptureModal exposureEV. 값 변경 시 기기
    /// `setExposureTargetBias` 로 라이브 AVCaptureVideoPreviewLayer 밝기를 실시간 반영(P2-a).
    /// 웹의 프리뷰 CSS `brightness(2^EV)` WYSIWYG 대응.
    @Binding var exposureEV: Double
    /// 카메라 사용 불가(시뮬레이터·권한 거부·하드웨어 없음)일 때 true 로 세팅.
    /// 웹 PhotoCaptureModal 의 `cameraError` 대응 — 부모가 갤러리 폴백을 노출한다.
    @Binding var cameraError: Bool
    /// 세션 인터럽션(전화 수신·잠금·다른 앱 카메라 점유) 동안 true — 부모가 안내 오버레이를
    /// 표시한다. `cameraError` 와 달리 일시 상태: interruptionEnded 로 세션이 재개되면 false.
    @Binding var cameraInterrupted: Bool
    /// 부모 모달이 보유하는 코디네이터 — 셔터 버튼이 `coord.trigger()` 호출.
    /// nil 이면 외부 트리거 없이 동작 (테스트/프리뷰).
    var coordinator: PhotoCaptureCoordinator? = nil

    func makeUIViewController(context: Context) -> CameraVC {
        let vc = CameraVC()
        vc.onCapture = onCapture
        vc.facingFront = facingFront
        vc.exposureEV = exposureEV
        vc.onCameraUnavailable = { DispatchQueue.main.async { cameraError = true } }
        vc.onInterruptionChanged = { interrupted in
            DispatchQueue.main.async { cameraInterrupted = interrupted }
        }
        coordinator?.vc = vc
        return vc
    }

    func updateUIViewController(_ vc: CameraVC, context: Context) {
        if vc.facingFront != facingFront {
            vc.facingFront = facingFront
            vc.reconfigure()
        }
        vc.flashOn = flashOn
        // EXPOSURE 다이얼 변화 시에만 기기 노출 bias 재적용(매 update 마다 스팸 방지).
        if vc.exposureEV != exposureEV {
            vc.exposureEV = exposureEV
            vc.applyExposureBias()
        }
        // SwiftUI 가 representable 을 재생성할 때마다 코디네이터에 현재 VC 보장.
        coordinator?.vc = vc
    }

    static func dismantleUIViewController(_ vc: CameraVC, coordinator: ()) {
        vc.teardown()
    }
}

final class CameraVC: UIViewController, AVCapturePhotoCaptureDelegate {
    /// 세션 구성/시작/정지 전용 직렬 큐 — global() concurrent 큐에 흩어 보내면
    /// configure 와 stopRunning 이 동시 실행되는 레이스가 가능(코드리뷰 avcapture-serial).
    private static let sessionQueue = DispatchQueue(label: "com.littlegd.upnext.camera-session",
                                                    qos: .userInitiated)
    var onCapture: ((UIImage) -> Void)?
    /// 카메라 장치를 열 수 없을 때(시뮬레이터/권한/하드웨어) 1회 통지 — 부모가 갤러리 폴백 노출.
    var onCameraUnavailable: (() -> Void)?
    /// 세션 인터럽션 상태 통지(true=중단/false=재개) — 항상 메인 스레드에서 호출된다.
    var onInterruptionChanged: ((Bool) -> Void)?
    var facingFront: Bool = false
    var flashOn: Bool = false
    /// EXPOSURE 다이얼 EV(-2..+2) — `applyExposureBias()` 로 기기 노출계에 반영.
    var exposureEV: Double = 0

    private let session = AVCaptureSession()
    private let photoOutput = AVCapturePhotoOutput()
    private var previewLayer: AVCaptureVideoPreviewLayer?
    /// 현재 활성 비디오 장치 — setExposureTargetBias 대상. configure/reconfigure 에서 갱신.
    private var videoDevice: AVCaptureDevice?
    /// 세션 노티 구독 토큰 — viewDidLoad 1회 설치(메인), deinit 해제. 블록 기반이라 명시 해제 필수.
    private var sessionObservers: [NSObjectProtocol] = []
    /// runtimeError 재시도 폭주 가드 — sessionQueue 에서만 접근. 실패한 startRunning 이
    /// 다시 runtimeError 를 통지하는 되먹임을 1회 재시도로 끊는다. 재시도 성공·세션 재구성·
    /// interruptionEnded(시스템 재개)에서 해제.
    private var runtimeRestartFailed = false

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = .black
        // 세션 노티 구독은 configure 이전·1회 지점인 여기서. configure() 는 플립마다 재호출되고
        // 메인/sessionQueue 어느 쪽에서도 진입할 수 있어(reconfigure 경유) 설치 가드가 레이스가 된다.
        installSessionObservers()
        // 권한 사전 확인(AVCam 패턴) — 거부 상태에서 세션을 시작하면 iOS 버전에 따라
        // 검은 프리뷰로 남을 수 있어, configure 진입 전에 갤러리 폴백으로 확정 분기한다.
        switch AVCaptureDevice.authorizationStatus(for: .video) {
        case .authorized:
            configure()
        case .notDetermined:
            AVCaptureDevice.requestAccess(for: .video) { [weak self] granted in
                DispatchQueue.main.async { [weak self] in
                    guard let self else { return }
                    if granted { configure() } else { onCameraUnavailable?() }
                }
            }
        default: // .denied, .restricted
            onCameraUnavailable?()
        }
    }

    override func viewDidLayoutSubviews() {
        super.viewDidLayoutSubviews()
        previewLayer?.frame = view.bounds
    }

    /// AVCam 패턴 세션 노티 3종 구독 — 미구독 시 전화 수신·잠금·mediaServicesWereReset 후
    /// 세션이 정지된 채 남아 뷰파인더가 마지막 프레임/검정으로 굳고, capture() 의 isRunning
    /// 가드로 셔터가 무음 no-op 이 됐다(모달 재진입 전까지 복구 불가 — 2026-08-24 S2-4).
    /// 세션 조작(startRunning)은 반드시 sessionQueue 안에서만 — 메인 stopRunning/startRunning 은
    /// 블랙스크린 수정에서 확립된 금지 규약.
    private func installSessionObservers() {
        let nc = NotificationCenter.default
        // runtimeError — 대표 케이스 .mediaServicesWereReset(미디어데몬 재시동): 세션이 스스로
        // 복구하지 않으므로 sessionQueue 에서 startRunning 1회 재시도. 실패한 startRunning 은
        // runtimeError 를 재통지하므로 runtimeRestartFailed 가 되먹임 폭주를 끊고, 그때는
        // 인터럽션 오버레이로 안내만 남긴다(성공 시 오버레이 해제).
        sessionObservers.append(nc.addObserver(forName: .AVCaptureSessionRuntimeError,
                                               object: session, queue: nil) { [weak self] note in
            let code = (note.userInfo?[AVCaptureSessionErrorKey] as? NSError)?.code
            NSLog("PhotoCapture session runtime error (code: \(code.map(String.init) ?? "?"))")
            Self.sessionQueue.async { [weak self] in
                guard let self, !session.isRunning else { return }
                if !runtimeRestartFailed {
                    runtimeRestartFailed = true
                    session.startRunning()
                    if session.isRunning { runtimeRestartFailed = false }
                }
                let recovered = session.isRunning
                DispatchQueue.main.async { [weak self] in
                    self?.onInterruptionChanged?(!recovered)
                }
            }
        })
        // wasInterrupted — 전화 수신·잠금·다른 앱의 카메라 점유. 세션은 시스템이 정지시킨
        // 상태라 여기서의 startRunning 은 무의미(인터럽션 중엔 실패) — 안내 오버레이만 요청.
        sessionObservers.append(nc.addObserver(forName: .AVCaptureSessionWasInterrupted,
                                               object: session, queue: .main) { [weak self] note in
            let reason = note.userInfo?[AVCaptureSessionInterruptionReasonKey] as? Int
            NSLog("PhotoCapture session interrupted (reason: \(reason.map(String.init) ?? "?"))")
            self?.onInterruptionChanged?(true)
        })
        // interruptionEnded — 시스템이 세션을 자동 재개. 오버레이 해제 + 재시도 가드 리셋.
        sessionObservers.append(nc.addObserver(forName: .AVCaptureSessionInterruptionEnded,
                                               object: session, queue: .main) { [weak self] _ in
            self?.onInterruptionChanged?(false)
            Self.sessionQueue.async { [weak self] in self?.runtimeRestartFailed = false }
        })
    }

    /// VC 해제 시 세션을 명시적으로 정지 — preview layer 가 백그라운드 큐에서
    /// 살아남는 일이 없도록. isRunning 판독까지 큐 안에서 수행한다(메인 판독은
    /// configure/stop 과의 TOCTOU 레이스).
    func teardown() {
        Self.sessionQueue.async { [session] in
            if session.isRunning { session.stopRunning() }
        }
    }

    deinit {
        // 블록 기반 노티 토큰은 자동 해제되지 않는다 — 명시 제거(잔류 시 무해하나 누수).
        for token in sessionObservers { NotificationCenter.default.removeObserver(token) }
        // 안전망도 반드시 세션 큐로. stopRunning 은 세션이 완전히 정지할 때까지
        // 블로킹하는 호출이라(AVCam 이 전용 큐에서만 부르는 이유) 이전처럼 여기서
        // 동기 호출하면 — deinit 은 phase=.decorate 커밋 직후 메인에서 실행되고,
        // teardown 의 비동기 정지가 아직 끝나기 전이라 isRunning 이 참 — 검은 첫
        // 프레임(꾸미기 opacity 0) 위에서 메인이 수백 ms~수 초 정지했다(실기기
        // 촬영 직후 블랙스크린+무반응의 주범). [session] 강캡처가 블록 실행까지
        // 세션 수명을 보장하므로 deinit 뒤에도 안전하다.
        Self.sessionQueue.async { [session] in
            if session.isRunning { session.stopRunning() }
        }
    }

    /// 세션 구성 전체를 sessionQueue 에서 수행 — videoDevice 는 이 큐에서만 읽고 쓴다
    /// (코드리뷰 b-videoDevice-datarace: 메인/큐 양쪽 비동기 접근이 미정의 동작).
    /// UIKit 작업(previewLayer 생성·폴백 통지)만 메인으로 홉.
    func configure() {
        let position: AVCaptureDevice.Position = facingFront ? .front : .back
        let ev = exposureEV
        Self.sessionQueue.async { [weak self] in
            guard let self else { return }
            // 새 구성 = 새 시작 기회 — runtimeError 재시도 폭주 가드 리셋.
            runtimeRestartFailed = false
            session.beginConfiguration()
            session.sessionPreset = .photo
            // 기존 입력 제거
            for input in session.inputs { session.removeInput(input) }
            guard let device = AVCaptureDevice.default(.builtInWideAngleCamera, for: .video, position: position),
                  let input = try? AVCaptureDeviceInput(device: device) else {
                session.commitConfiguration()
                videoDevice = nil
                // 시뮬레이터/권한 거부/하드웨어 없음 — 갤러리 폴백 노출을 위해 부모에 통지.
                DispatchQueue.main.async { [weak self] in self?.onCameraUnavailable?() }
                return
            }
            videoDevice = device
            if session.canAddInput(input) { session.addInput(input) }
            if !session.outputs.contains(photoOutput),
               session.canAddOutput(photoOutput) {
                session.addOutput(photoOutput)
            }
            // 캡처 해상도 축소 — 표시·합성·저장이 전부 ≤960px 프리뷰만 쓰므로 12MP 인코드/디코드는
            // 순수 비용 낭비다(실기기 셔터→꾸미기 1~2초 지연의 근원). 지원 dimension 중 최장변
            // ~2016급(1920~2048)을 골라 photoOutput 상한을 낮춘다. 지원 배열이 비면(구형/미지원)
            // 상한을 건드리지 않아 기존 12MP 동작으로 폴백한다. AVCam 의 configureSession 과 동일 패턴
            // (device.activeFormat.supportedMaxPhotoDimensions 에서 선택 후 output 에 반영).
            if let dims = Self.reducedPhotoDimensions(from: device.activeFormat) {
                photoOutput.maxPhotoDimensions = dims
            }
            session.commitConfiguration()

            DispatchQueue.main.async { [weak self] in
                guard let self, previewLayer == nil else { return }
                let layer = AVCaptureVideoPreviewLayer(session: session)
                layer.videoGravity = .resizeAspectFill
                layer.frame = view.bounds
                view.layer.addSublayer(layer)
                previewLayer = layer
            }
            session.startRunning()
            // 세션 구성 직후 현재 EXPOSURE 값 반영(플립 후 재구성 시 다이얼 값 유지).
            applyExposureBiasOnQueue(ev)
        }
    }

    /// EXPOSURE 다이얼(EV) → 기기 노출 보정. 라이브 프리뷰가 실시간으로 밝기 반영(웹 패리티).
    /// 기기 bias 범위(통상 ±8EV)로 클램프하므로 ±2 는 항상 유효. videoDevice 읽기까지
    /// 세션 큐 안에서 수행해 configure/start 와 완전 직렬화. 장치 없음(시뮬)이면 무시.
    func applyExposureBias() {
        let ev = exposureEV
        Self.sessionQueue.async { [weak self] in
            self?.applyExposureBiasOnQueue(ev)
        }
    }

    /// sessionQueue 위에서만 호출할 것.
    private func applyExposureBiasOnQueue(_ ev: Double) {
        guard let device = videoDevice else { return }
        guard (try? device.lockForConfiguration()) != nil else { return }
        let clamped = max(device.minExposureTargetBias,
                          min(device.maxExposureTargetBias, Float(ev)))
        device.setExposureTargetBias(clamped, completionHandler: nil)
        device.unlockForConfiguration()
    }

    func reconfigure() {
        Self.sessionQueue.async { [weak self] in
            guard let self else { return }
            session.stopRunning()
            // configure 는 내부에서 다시 sessionQueue 로 디스패치 — 직렬 큐라 순서 보장.
            configure()
        }
    }

    /// 촬영 인플라이트 가드 — 메인 스레드에서만 접근. 셔터 연타로 capturePhoto 가
    /// 중복 큐잉되면 didFinishProcessingPhoto 가 2회 도착하고, 두 번째 콜백의
    /// beginProcess 재진입이 decorate 를 영구 opacity 0(순검정 무반응)으로 고착시켰다.
    private var captureInFlight = false

    /// 외부 셔터 — PhotoCaptureCoordinator.trigger() 가 호출. 메인 스레드에서.
    /// 실제 capturePhoto 는 세션 큐에서 실행 — configure/reconfigure 와 직렬화해
    /// 미부착 출력·미가동 세션에서의 NSGenericException, 플립 직후 스테일
    /// maxPhotoDimensions 레이스를 제거한다(AVCam 과 동일 패턴).
    func capture() {
        guard !captureInFlight else { return }
        captureInFlight = true
        let flash = flashOn
        Self.sessionQueue.async { [weak self] in
            guard let self else { return }
            guard session.isRunning, photoOutput.connection(with: .video) != nil else {
                DispatchQueue.main.async { [weak self] in self?.captureInFlight = false }
                return
            }
            let settings = AVCapturePhotoSettings()
            settings.flashMode = flash ? .on : .off
            // 캡처 해상도 상한을 세션 구성에서 낮춘 값으로 명시(축소 미지원 기기면 기존 최대 그대로).
            //   12MP JPEG 인코드/디코드 비용 원천 제거 — 이후 경로는 전부 960px 프리뷰만 쓴다.
            settings.maxPhotoDimensions = photoOutput.maxPhotoDimensions
            // 속도 우선 — 멀티프레임 노이즈리덕션/후처리 지연 제거(체감 셔터 지연 감소).
            //   .speed ≤ 출력 기본 maxPhotoQualityPrioritization(.balanced) 라 항상 유효.
            settings.photoQualityPrioritization = .speed
            photoOutput.capturePhoto(with: settings, delegate: self)
        }
    }

    /// 지원 max photo dimension 중 최장변 ~2016급을 선택. 표시/합성/저장이 전부 ≤960px 라
    /// 12MP 는 불필요 — 인코드/디코드 비용만 낸다. 선택 규칙:
    ///   1) 최장변 1920~2048 대역 중 가장 작은 것(스펙 명시 대역, 프리뷰 960 대비 충분한 여유)
    ///   2) 대역이 없으면 최장변이 target(2016)에 가장 가까운 지원 dimension
    /// 지원 배열이 비면 nil → 호출측이 photoOutput 상한을 건드리지 않아 기존 최대 해상도 동작 유지(폴백).
    /// 반환값은 항상 supportedMaxPhotoDimensions 원소라 photoOutput.maxPhotoDimensions 설정 시 예외 없음.
    private static func reducedPhotoDimensions(from format: AVCaptureDevice.Format) -> CMVideoDimensions? {
        let supported = format.supportedMaxPhotoDimensions
        guard !supported.isEmpty else { return nil }
        func side(_ d: CMVideoDimensions) -> Int32 { max(d.width, d.height) }
        let target: Int32 = 2016
        if let inBand = supported.filter({ side($0) >= 1920 && side($0) <= 2048 })
            .min(by: { side($0) < side($1) }) {
            return inBand
        }
        return supported.min(by: { abs(side($0) - target) < abs(side($1) - target) })
    }

    // nonisolated — AVFoundation 이 자체 큐에서 부르는 콜백. 세션 큐에서 delegate 로
    // self 를 넘기려면 conformance 가 메인 액터 격리여선 안 된다(Swift 6 에러 예방).
    nonisolated func photoOutput(_ output: AVCapturePhotoOutput,
                                 didFinishProcessingPhoto photo: AVCapturePhoto,
                                 error: Error?) {
        if let error { NSLog("PhotoCapture failed: \(error.localizedDescription)") }
        let image: UIImage? = (error == nil)
            ? photo.fileDataRepresentation().flatMap { UIImage(data: $0) }
            : nil
        Task { @MainActor in
            // 실패(인터럽션·발열 제한 등)여도 인플라이트를 풀어 셔터가 죽지 않게 한다
            // (이전엔 silent return — 셔터음만 나고 무반응인 데드 셔터).
            self.captureInFlight = false
            if let image { self.onCapture?(image) }
        }
    }
}

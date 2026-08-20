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
    /// 부모 모달이 보유하는 코디네이터 — 셔터 버튼이 `coord.trigger()` 호출.
    /// nil 이면 외부 트리거 없이 동작 (테스트/프리뷰).
    var coordinator: PhotoCaptureCoordinator? = nil

    func makeUIViewController(context: Context) -> CameraVC {
        let vc = CameraVC()
        vc.onCapture = onCapture
        vc.facingFront = facingFront
        vc.exposureEV = exposureEV
        vc.onCameraUnavailable = { DispatchQueue.main.async { cameraError = true } }
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
    var facingFront: Bool = false
    var flashOn: Bool = false
    /// EXPOSURE 다이얼 EV(-2..+2) — `applyExposureBias()` 로 기기 노출계에 반영.
    var exposureEV: Double = 0

    private let session = AVCaptureSession()
    private let photoOutput = AVCapturePhotoOutput()
    private var previewLayer: AVCaptureVideoPreviewLayer?
    /// 현재 활성 비디오 장치 — setExposureTargetBias 대상. configure/reconfigure 에서 갱신.
    private var videoDevice: AVCaptureDevice?

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = .black
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

    /// VC 해제 시 세션을 명시적으로 정지 — preview layer 가 백그라운드 큐에서
    /// 살아남는 일이 없도록.
    func teardown() {
        if session.isRunning {
            Self.sessionQueue.async { [session] in
                session.stopRunning()
            }
        }
    }

    deinit {
        // SwiftUI 의 dismantleUIViewController 가 먼저 teardown 을 부르지만,
        // 안전망으로 한 번 더 — 이중 호출은 무해 (isRunning 가드).
        if session.isRunning { session.stopRunning() }
    }

    /// 세션 구성 전체를 sessionQueue 에서 수행 — videoDevice 는 이 큐에서만 읽고 쓴다
    /// (코드리뷰 b-videoDevice-datarace: 메인/큐 양쪽 비동기 접근이 미정의 동작).
    /// UIKit 작업(previewLayer 생성·폴백 통지)만 메인으로 홉.
    func configure() {
        let position: AVCaptureDevice.Position = facingFront ? .front : .back
        let ev = exposureEV
        Self.sessionQueue.async { [weak self] in
            guard let self else { return }
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

    /// 외부 셔터 — PhotoCaptureCoordinator.trigger() 가 호출. 메인 스레드에서.
    func capture() {
        let settings = AVCapturePhotoSettings()
        settings.flashMode = flashOn ? .on : .off
        // 캡처 해상도 상한을 세션 구성에서 낮춘 값으로 명시(축소 미지원 기기면 기존 최대 그대로).
        //   12MP JPEG 인코드/디코드 비용 원천 제거 — 이후 경로는 전부 960px 프리뷰만 쓴다.
        settings.maxPhotoDimensions = photoOutput.maxPhotoDimensions
        // 속도 우선 — 멀티프레임 노이즈리덕션/후처리 지연 제거(체감 셔터 지연 감소).
        //   .speed ≤ 출력 기본 maxPhotoQualityPrioritization(.balanced) 라 항상 유효.
        settings.photoQualityPrioritization = .speed
        photoOutput.capturePhoto(with: settings, delegate: self)
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

    func photoOutput(_ output: AVCapturePhotoOutput,
                     didFinishProcessingPhoto photo: AVCapturePhoto,
                     error: Error?) {
        guard let data = photo.fileDataRepresentation(),
              let image = UIImage(data: data) else { return }
        DispatchQueue.main.async { self.onCapture?(image) }
    }
}

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
    /// 부모 모달이 보유하는 코디네이터 — 셔터 버튼이 `coord.trigger()` 호출.
    /// nil 이면 외부 트리거 없이 동작 (테스트/프리뷰).
    var coordinator: PhotoCaptureCoordinator? = nil

    func makeUIViewController(context: Context) -> CameraVC {
        let vc = CameraVC()
        vc.onCapture = onCapture
        vc.facingFront = facingFront
        coordinator?.vc = vc
        return vc
    }

    func updateUIViewController(_ vc: CameraVC, context: Context) {
        if vc.facingFront != facingFront {
            vc.facingFront = facingFront
            vc.reconfigure()
        }
        vc.flashOn = flashOn
        // SwiftUI 가 representable 을 재생성할 때마다 코디네이터에 현재 VC 보장.
        coordinator?.vc = vc
    }

    static func dismantleUIViewController(_ vc: CameraVC, coordinator: ()) {
        vc.teardown()
    }
}

final class CameraVC: UIViewController, AVCapturePhotoCaptureDelegate {
    var onCapture: ((UIImage) -> Void)?
    var facingFront: Bool = false
    var flashOn: Bool = false

    private let session = AVCaptureSession()
    private let photoOutput = AVCapturePhotoOutput()
    private var previewLayer: AVCaptureVideoPreviewLayer?

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = .black
        configure()
    }

    override func viewDidLayoutSubviews() {
        super.viewDidLayoutSubviews()
        previewLayer?.frame = view.bounds
    }

    /// VC 해제 시 세션을 명시적으로 정지 — preview layer 가 백그라운드 큐에서
    /// 살아남는 일이 없도록.
    func teardown() {
        if session.isRunning {
            DispatchQueue.global(qos: .userInitiated).async { [session] in
                session.stopRunning()
            }
        }
    }

    deinit {
        // SwiftUI 의 dismantleUIViewController 가 먼저 teardown 을 부르지만,
        // 안전망으로 한 번 더 — 이중 호출은 무해 (isRunning 가드).
        if session.isRunning { session.stopRunning() }
    }

    func configure() {
        session.beginConfiguration()
        session.sessionPreset = .photo
        // 기존 입력 제거
        for input in session.inputs { session.removeInput(input) }
        let position: AVCaptureDevice.Position = facingFront ? .front : .back
        guard let device = AVCaptureDevice.default(.builtInWideAngleCamera, for: .video, position: position),
              let input = try? AVCaptureDeviceInput(device: device) else {
            session.commitConfiguration()
            return
        }
        if session.canAddInput(input) { session.addInput(input) }
        if !session.outputs.contains(photoOutput),
           session.canAddOutput(photoOutput) {
            session.addOutput(photoOutput)
        }
        session.commitConfiguration()

        if previewLayer == nil {
            let layer = AVCaptureVideoPreviewLayer(session: session)
            layer.videoGravity = .resizeAspectFill
            layer.frame = view.bounds
            view.layer.addSublayer(layer)
            previewLayer = layer
        }
        DispatchQueue.global(qos: .userInitiated).async { [weak self] in
            self?.session.startRunning()
        }
    }

    func reconfigure() {
        DispatchQueue.global(qos: .userInitiated).async { [weak self] in
            guard let self else { return }
            session.stopRunning()
            configure()
        }
    }

    /// 외부 셔터 — PhotoCaptureCoordinator.trigger() 가 호출. 메인 스레드에서.
    func capture() {
        let settings = AVCapturePhotoSettings()
        settings.flashMode = flashOn ? .on : .off
        photoOutput.capturePhoto(with: settings, delegate: self)
    }

    func photoOutput(_ output: AVCapturePhotoOutput,
                     didFinishProcessingPhoto photo: AVCapturePhoto,
                     error: Error?) {
        guard let data = photo.fileDataRepresentation(),
              let image = UIImage(data: data) else { return }
        DispatchQueue.main.async { self.onCapture?(image) }
    }
}

//
//  GrowthStore.swift
//  UpNext — Growth(인증 사진) 스토어 (Phase 4 슬라이스 28 · Phase 4.5 시작).
//
//  웹 src/store/useGrowthStore.ts 재설계. 웹은 메타를 localStorage, 이미지 blob 을
//  IndexedDB 에 분리 저장 — 네이티브는 메타를 JSON 파일, 이미지를 JPEG 파일로
//  (Application Support/growth/). 사진도 Up Hero 처럼 기기 로컬 전용.
//
//  슬라이스 28 — 저장 + 앨범. 캡처 플로우(폴라로이드 편집·메모)와 챌린지 완료
//  연동, 사진 부적은 이후 슬라이스. 지금은 PhotosPicker 로 자유 추가/삭제만.
//

import SwiftUI
import Combine  // ObservableObject / @Published
import ImageIO  // CGImageSourceCreateThumbnailAtIndex — 그리드 썸네일 다운샘플 디코드

@MainActor
final class GrowthStore: ObservableObject {

    /// 인증 사진 메타 — 최신이 앞. 화면은 이걸 구독.
    @Published private(set) var photoMetas: [PhotoMeta] = []

    /// 로드된 이미지 메모리 캐시 — 그리드가 매 렌더 디스크를 안 읽도록.
    /// NSCache: 비용 상한 + 시스템 메모리 압박 시 자동 축출. 이전의 [String: UIImage]
    /// 딕셔너리는 축출이 전무해 촬영/앨범 반복 시 합성본이 무한 누적 — 실기기에서
    /// jetsam 직전 전역 렉(촬영 직후 수 초 프리즈 가중)의 원인이었다.
    private let imageCache: NSCache<NSString, UIImage> = {
        let c = NSCache<NSString, UIImage>()
        c.totalCostLimit = 96 * 1024 * 1024   // 디코드 픽셀 바이트 기준 ≈96MB
        return c
    }()

    /// NSCache 비용 — 디코드된 픽셀 버퍼 크기(바이트).
    nonisolated private static func cacheCost(of image: UIImage) -> Int {
        guard let cg = image.cgImage else { return 4_000_000 }
        return cg.bytesPerRow * cg.height
    }

    /// 사진 보관 상한 — 초과 시 가장 오래된 것부터 정리. 웹 useGrowthStore 의 cap 대응
    /// (저장 공간·앨범 로딩 무한 증가 방지).
    private static let photoCap = 500

    // MARK: - P0-2: 폴라로이드 캡처 플로우 (transient — 영속화 대상 아님)

    /// 챌린지 완료 직후 인증 사진을 기다리는 카드 컨텍스트. `Identifiable` 이라
    /// `fullScreenCover(item: $growth.pendingCapture)` 패턴에 그대로 결합.
    /// transient — 디스크 저장하지 않는다 (앱 재기동 시 캡처 의도는 사라지는 게 맞음).
    @Published var pendingCapture: PendingCaptureContext?

    /// 챌린지 완료 후 인증 사진을 기다리는 카드 id. nil 이면 자유 캡처 또는 대기 없음.
    /// `pendingCapture` 의 cardId alias — 일부 호출부가 단일 필드 binding 을 쓸 수 있어
    /// 동일 의미를 두 형태로 노출.
    var pendingCaptureCardId: String? {
        get { pendingCapture?.cardId }
        set {
            if newValue == nil { pendingCapture = nil }
            // setter 로 값을 주입하는 경로는 사용하지 않음 — beginCapture 만 set 한다.
        }
    }

    /// `pendingCapture` 의 별칭 — MainShell 이 ctx 변수명을 쓸 때를 위한 호환 alias.
    var pendingCaptureContext: PendingCaptureContext? { pendingCapture }

    /// 현재 캡처 단계 — UI 가 진행도를 보여주거나 백버튼 동작을 분기.
    @Published var capturePhase: CapturePhase = .idle

    /// 캡처 플로우 외부 컨텍스트 — 챌린지 완료 직후 챌린지 메타 스냅샷을 묶어둔다.
    /// `Identifiable` 로 SwiftUI `fullScreenCover(item:)` 에 그대로 결합.
    struct PendingCaptureContext: Equatable, Identifiable {
        /// id = cardId — fullScreenCover 가 변화 감지에 쓰는 키.
        var id: String { cardId }
        let cardId: String
        let title: String
        let category: Category
    }

    /// 캡처 모달의 단계 — 시각적 진행도와 모달 디스미스 안전성에 쓰임.
    enum CapturePhase: Equatable {
        case idle           // 모달이 떠 있지 않음
        case camera         // 라이브 카메라 미리보기
        case preview        // 촬영 직후 프리뷰 + 프레임 선택
        case polaroid       // 폴라로이드 데코(스티커/서명/메모)
        case ejecting       // 저장 직후 출력 애니메이션
    }

    init() {
        photoMetas = Self.loadMetas()
    }

    // MARK: - 액션

    /// 사진 추가 — 이미지를 JPEG 로 재인코딩해 파일로 저장하고 메타를 등록. 웹 addPhoto.
    /// memo·challenge 메타는 슬라이스 28 에선 비움 (자유 추가 사진).
    func addPhoto(imageData: Data) {
        guard let image = UIImage(data: imageData),
              let jpeg = image.jpegData(compressionQuality: 0.85) else { return }
        let id = "vp_\(UpHeroStore.nowMillis())"
        guard Self.saveImage(jpeg, id: id) else { return }
        let meta = PhotoMeta(
            id: id,
            kind: .free,
            challengeCardId: nil,
            challengeTitle: nil,
            category: nil,
            date: GameStore.todayString(),
            timestamp: UpHeroStore.nowMillis(),
            memo: ""
        )
        insert(meta: meta, image: image)
    }

    /// 챌린지 완료 직후 남기는 "2초 로그" v1 — 실제 영상 대신 사진 1장 + 짧은 캡션.
    func addChallengeLog(imageData: Data, card: ChallengeCard, caption: String) {
        guard let image = UIImage(data: imageData),
              let jpeg = image.jpegData(compressionQuality: 0.85) else { return }
        let now = Date()
        let id = "cl_\(UpHeroStore.nowMillis())"
        guard Self.saveImage(jpeg, id: id) else { return }
        let day = GameStore.todayString()
        let cleanCaption = String(caption.trimmingCharacters(in: .whitespacesAndNewlines).prefix(80))
        let meta = PhotoMeta(
            id: id,
            kind: .challengeLog,
            challengeCardId: card.id,
            challengeTitle: card.title,
            category: card.category,
            date: day,
            timestamp: UpHeroStore.nowMillis(),
            memo: cleanCaption,
            timeSlot: Self.timeSlotFormatter.string(from: now),
            caption: cleanCaption,
            weekId: RetentionEngine.weekId(for: day)
        )
        insert(meta: meta, image: image)
    }

    private func insert(meta: PhotoMeta, image: UIImage) {
        imageCache.setObject(image, forKey: meta.id as NSString,
                             cost: Self.cacheCost(of: image))
        photoMetas.insert(meta, at: 0)   // 최신이 앞
        // cap 초과분 — 가장 오래된 것(메타 끝)부터 메타·캐시·파일 정리.
        while photoMetas.count > Self.photoCap {
            let old = photoMetas.removeLast()
            imageCache.removeObject(forKey: old.id as NSString)
            imageCache.removeObject(forKey: Self.thumbKey(old.id))
            Self.deleteImage(id: old.id)
        }
        Self.saveMetas(photoMetas)
    }

    /// 사진 삭제 — 메타·캐시·파일 모두 제거 + Up Hero 부적 캐스케이드. 웹 deletePhoto.
    ///
    /// 캐스케이드가 필요한 이유: 이 사진을 photoId 로 바인딩한 사진 부적은 삭제된
    /// 이미지를 참조해 썸네일이 뜨지 않는데 스킬은 계속 발동한다. 그래서 인벤토리에서
    /// 빼고 착용 슬롯도 해제한다 (웹은 useGrowthStore 안에서 dynamic import 로
    /// useUpHeroStore 를 잡아 같은 일을 한다 — 순환 참조 회피).
    ///
    /// iOS 에는 그 모듈 싱글턴이 없어 `UpHeroStore.current`(살아 있는 인스턴스의 weak
    /// 참조)를 대신 쓴다. GrowthStore 와 UpHeroStore 는 둘 다 GameStore 가 소유하지만
    /// 서로를 모르며, 여기서 GameStore 를 참조하면 뷰 계층까지 끌려온다.
    /// 저장은 UpHeroStore 의 평소 경로(mutate → persist → 클라우드 업로드)를 그대로 탄다 —
    /// 삭제 직후 앱을 닫아도 인벤토리 변경이 날아가지 않는다.
    func deletePhoto(_ id: String) {
        photoMetas.removeAll { $0.id == id }
        imageCache.removeObject(forKey: id as NSString)
        imageCache.removeObject(forKey: Self.thumbKey(id))
        Self.deleteImage(id: id)
        Self.saveMetas(photoMetas)
        UpHeroStore.current?.removePhotoBindings(photoId: id)
    }

    /// 메모만 갱신 — PhotoDetailModal 뒷면에서 자동 저장(debounce). 웹 updatePhotoMemo.
    /// 최대 200자, 앞뒤 공백 트림. 값이 같으면 no-op(불필요 persist 방지).
    func updatePhotoMemo(_ id: String, _ memo: String) {
        guard let idx = photoMetas.firstIndex(where: { $0.id == id }) else { return }
        let clean = String(memo.trimmingCharacters(in: .whitespacesAndNewlines).prefix(200))
        guard photoMetas[idx].memo != clean else { return }
        photoMetas[idx].memo = clean
        Self.saveMetas(photoMetas)
    }

    /// R8 — 전체 사진 데이터 리셋. GameStore.resetAllData 가 호출한다.
    /// 모든 메타·메모리 캐시·디스크 이미지 + 진행 중 캡처 상태까지 제거.
    /// (이전엔 resetAllData 가 growth 를 안 건드려 리셋 후 사진이 잔존했음.)
    func reset() {
        for meta in photoMetas { Self.deleteImage(id: meta.id) }
        photoMetas = []
        imageCache.removeAllObjects()
        Self.saveMetas([])
        pendingCapture = nil
        capturePhase = .idle
    }

    /// 사진 이미지 로드 (메모리 캐시). 파일이 없으면 nil.
    /// 풀사이즈 디코드 — PhotoDetailModal·부적 의식 등 크게 보는 화면 전용.
    /// 그리드/썸네일 셀은 loadThumbnail(for:) 을 쓸 것 (장당 7~15MB vs ~0.3MB).
    func image(for id: String) -> UIImage? {
        if let cached = imageCache.object(forKey: id as NSString) { return cached }
        guard let img = UIImage(contentsOfFile: Self.imageURL(id).path) else { return nil }
        imageCache.setObject(img, forKey: id as NSString, cost: Self.cacheCost(of: img))
        return img
    }

    // MARK: - 그리드 썸네일

    /// 그리드 썸네일 최대 픽셀(긴 변). 앨범 3열 셀 ≈ 110pt(@3x 330px) — 300px 이면
    /// 셀 표시에 충분하고, 저장 합성본(1200×1454, 구버전 1800×2181) 풀 디코드 대비
    /// 픽셀 메모리가 1/16~1/36 로 줄어 NSCache 상한 안에 수백 장이 들어간다.
    nonisolated private static let thumbMaxPixel = 300

    /// 썸네일 캐시 키 — 풀사이즈(id 키)와 같은 NSCache 를 쓰되 별도 키로 공존.
    nonisolated private static func thumbKey(_ id: String) -> NSString {
        "\(id)#thumb" as NSString
    }

    /// 캐시된 썸네일 즉시 조회 — 없으면 nil (디스크 접근 없음). 셀 init 에서 첫
    /// 프레임 placeholder 깜빡임을 피할 때 사용.
    func cachedThumbnail(for id: String) -> UIImage? {
        imageCache.object(forKey: Self.thumbKey(id))
    }

    /// 그리드용 썸네일 로드 — ImageIO 로 셀 크기(≤300px)만 디코드해 별도 키로 캐시.
    /// 디코드는 백그라운드에서 수행하고 캐시 반영은 메인. 파일이 아직 없으면(방금
    /// savePhoto 직후 백그라운드 쓰기 진행 중) 메모리의 풀사이즈에서 다운스케일 폴백.
    func loadThumbnail(for id: String) async -> UIImage? {
        if let cached = imageCache.object(forKey: Self.thumbKey(id)) { return cached }
        let url = Self.imageURL(id)
        var thumb = await Task.detached(priority: .userInitiated) {
            Self.decodeThumbnail(at: url)
        }.value
        if thumb == nil, let full = imageCache.object(forKey: id as NSString) {
            thumb = await full.byPreparingThumbnail(ofSize: Self.thumbSize(for: full.size))
        }
        guard let thumb else { return nil }
        imageCache.setObject(thumb, forKey: Self.thumbKey(id),
                             cost: Self.cacheCost(of: thumb))
        return thumb
    }

    /// 원본 크기를 긴 변 thumbMaxPixel 이하로 축소한 목표 크기 (비율 유지).
    nonisolated private static func thumbSize(for size: CGSize) -> CGSize {
        let maxDim = max(size.width, size.height)
        guard maxDim > 0 else { return CGSize(width: thumbMaxPixel, height: thumbMaxPixel) }
        let scale = min(1, CGFloat(thumbMaxPixel) / maxDim)
        return CGSize(width: size.width * scale, height: size.height * scale)
    }

    /// ImageIO 다운샘플 디코드 — 풀사이즈 픽셀 버퍼를 만들지 않고 썸네일만 생성.
    nonisolated private static func decodeThumbnail(at url: URL) -> UIImage? {
        let opts: [CFString: Any] = [
            kCGImageSourceCreateThumbnailFromImageAlways: true,
            kCGImageSourceCreateThumbnailWithTransform: true,
            kCGImageSourceShouldCacheImmediately: true,
            kCGImageSourceThumbnailMaxPixelSize: thumbMaxPixel,
        ]
        guard let src = CGImageSourceCreateWithURL(url as CFURL, nil),
              let cg = CGImageSourceCreateThumbnailAtIndex(src, 0, opts as CFDictionary)
        else { return nil }
        return UIImage(cgImage: cg)
    }

    /// id 로 PhotoMeta 조회 — 부적 의식 등 외부 화면이 미리보기 사진을 가져갈 때.
    /// 메타 목록은 작아서 (cap 500) 선형 탐색 안전.
    func photoMeta(for id: String) -> PhotoMeta? {
        photoMetas.first { $0.id == id }
    }

    // MARK: - P0-2: 캡처 플로우 액션

    /// 챌린지 완료 직후 호출 — pendingCaptureCardId+context 를 set 해서 MainShell 이
    /// 모달을 띄우게 한다. capturePhase 는 `.camera` 로 시작 (라이브 미리보기).
    ///
    /// MainShell wire 계약 (두 패턴 모두 호환):
    ///
    /// (A) `fullScreenCover(item:)` 형 — 권장:
    /// ```swift
    /// .fullScreenCover(item: $growth.pendingCapture) { item in
    ///     PhotoCaptureModal(
    ///         cardId: item.cardId, title: item.title, category: item.category,
    ///         onSave: { image, signature, memo, stickers in
    ///             growth.savePhoto(
    ///                 image: image, signature: signature, memo: memo,
    ///                 challengeCardId: item.cardId,
    ///                 challengeTitle: item.title, category: item.category,
    ///                 stickers: stickers)
    ///         },
    ///         onCancel: { growth.cancelCapture() })
    /// }
    /// ```
    ///
    /// (B) `fullScreenCover(isPresented:)` + ctx 조회 형:
    /// ```swift
    /// .fullScreenCover(isPresented: Binding(
    ///     get: { growth.pendingCaptureCardId != nil },
    ///     set: { if !$0 { growth.cancelCapture() } })) {
    ///     if let ctx = growth.pendingCaptureContext,
    ///        let card = CardCatalog.card(id: ctx.cardId) {
    ///         PhotoCaptureModal(
    ///             card: card,
    ///             onClose: { growth.cancelCapture() },
    ///             onSave: { image, memo, signature, stickers in
    ///                 growth.savePhoto(
    ///                     image: image, signature: signature, memo: memo,
    ///                     challengeCardId: ctx.cardId,
    ///                     challengeTitle: ctx.title, category: ctx.category,
    ///                     stickers: stickers)
    ///             })
    ///     }
    /// }
    /// ```
    ///
    /// 호출 예시 (GameStore — completeChallenge 직후):
    /// ```swift
    /// growth.beginCapture(cardId: card.id, title: card.title, category: card.category)
    /// ```
    func beginCapture(cardId: String, title: String, category: Category) {
        pendingCapture = PendingCaptureContext(
            cardId: cardId, title: title, category: category)
        capturePhase = .camera
    }

    /// 모달 dismiss 시 호출 — pendingCapture·context·phase 클리어. 사진 저장
    /// 안 하고 닫아도 챌린지 완료 자체는 유지 (인증 사진은 옵셔널).
    func cancelCapture() {
        pendingCapture = nil
        capturePhase = .idle
    }

    /// 폴라로이드 합성본 + 메타데이터 저장. PhotoCaptureModal.onSave 콜백이 호출.
    /// challengeCardId 가 nil 이면 자유 사진(.free), 있으면 챌린지 로그(.challengeLog).
    /// 저장 후 캡처 플로우를 초기화 (cancelCapture 와 동일하게 pending 클리어).
    /// 기존 addPhoto / addChallengeLog 와 다른 점:
    ///   - 합성 완료된 이미지(폴라로이드 프레임 + 서명 + 스티커) 그대로 저장.
    ///   - 서명·스티커 raw 데이터도 PhotoMeta 에 보존 — 추후 재편집/재합성 여지.
    func savePhoto(
        image: UIImage,
        signature: Data?,
        memo: String,
        challengeCardId: String?,
        challengeTitle: String?,
        category: Category?,
        stickers: [Sticker]
    ) {
        let kind: PhotoKind = challengeCardId == nil ? .free : .challengeLog
        let prefix = kind == .free ? "vp" : "cl"
        let id = "\(prefix)_\(UpHeroStore.nowMillis())"

        let now = Date()
        let day = GameStore.todayString()
        let cleanMemo = String(memo.trimmingCharacters(in: .whitespacesAndNewlines).prefix(200))
        let meta = PhotoMeta(
            id: id,
            kind: kind,
            challengeCardId: challengeCardId,
            challengeTitle: challengeTitle,
            category: category,
            date: day,
            timestamp: UpHeroStore.nowMillis(),
            memo: cleanMemo,
            timeSlot: Self.timeSlotFormatter.string(from: now),
            caption: kind == .challengeLog ? cleanMemo : nil,
            weekId: RetentionEngine.weekId(for: day),
            signatureData: signature,
            stickers: stickers
        )
        // 06-photo-flow(a 연장): JPEG 인코딩+디스크 쓰기를 메인에서 제거.
        // 메타·메모리 캐시는 즉시 반영(image(for:) 는 imageCache 로 파일 없이 서빙되므로
        // 앨범/디테일이 곧바로 뜬다). 인코딩·파일쓰기는 백그라운드 best-effort —
        // 합성(합성본 저장 아키텍처는 그대로) 이후 남은 유일한 메인 블로킹이었다.
        insert(meta: meta, image: image)
        DispatchQueue.global(qos: .utility).async { [weak self] in
            let ok = image.jpegData(compressionQuality: 0.9)
                .map { Self.saveImage($0, id: id) } ?? false
            // 인코딩/파일쓰기 실패 시 방금 넣은 메타 롤백 — 실패한 채 두면 imageCache
            // 축출/재시작 후 이미지 없는 고아 메타(깨진 사진)가 남는다(코드리뷰).
            if !ok {
                Task { @MainActor [weak self] in self?.deletePhoto(id) }
            }
        }
        // 캡처 플로우 종료 — pending 정리.
        cancelCapture()
    }

    #if DEBUG
    /// UI 테스트용 — 실제 이미지가 있는 사진 1장 시드. PhotoDetailModal 검증용
    /// (탭→상세→틸트/플립/메모/공유/삭제). 폴라로이드 합성 느낌의 그라데이션 생성.
    func seedPhotoWithImageForUITests(card: ChallengeCard) {
        let size = CGSize(width: 600, height: 727)
        let img = UIGraphicsImageRenderer(size: size).image { ctx in
            let c = ctx.cgContext
            UIColor(white: 0.96, alpha: 1).setFill()
            c.fill(CGRect(origin: .zero, size: size))
            let photo = CGRect(x: 40, y: 40, width: 520, height: 520)
            let colors = [UIColor(red: 0.55, green: 0.76, blue: 0.45, alpha: 1).cgColor,
                          UIColor(red: 0.16, green: 0.32, blue: 0.28, alpha: 1).cgColor]
            if let grad = CGGradient(colorsSpace: CGColorSpaceCreateDeviceRGB(),
                                     colors: colors as CFArray, locations: [0, 1]) {
                c.saveGState(); c.addRect(photo); c.clip()
                c.drawLinearGradient(grad, start: CGPoint(x: 40, y: 40),
                                     end: CGPoint(x: 560, y: 560), options: [])
                c.restoreGState()
            }
        }
        savePhoto(image: img, signature: nil, memo: "오늘도 한 걸음 — 시드 메모",
                  challengeCardId: card.id, challengeTitle: card.title,
                  category: card.category, stickers: [])
    }

    /// UI 테스트용 — 사진 라이브러리 권한 없이 챌린지 로그 badge 렌더링만 검증한다.
    func seedChallengeLogForUITests(card: ChallengeCard) {
        let day = GameStore.todayString()
        let meta = PhotoMeta(
            id: "cl_ui_seed",
            kind: .challengeLog,
            challengeCardId: card.id,
            challengeTitle: card.title,
            category: card.category,
            date: day,
            timestamp: UpHeroStore.nowMillis(),
            memo: "UI seed",
            timeSlot: "09:00",
            caption: "UI seed",
            weekId: RetentionEngine.weekId(for: day)
        )
        photoMetas = [meta]
        imageCache.removeObject(forKey: meta.id as NSString)
        imageCache.removeObject(forKey: Self.thumbKey(meta.id))
        Self.saveMetas(photoMetas)
    }
    #endif

    // MARK: - 파일 저장 (Application Support/growth/)

    /// 메타 영속화 전용 직렬 큐 — 인코드+쓰기를 메인에서 제거. 이전엔 매 저장·메모
    /// 편집마다 전체 메타(서명 PKDrawing Data 포함) JSON 을 메인에서 재인코드+원자적
    /// 쓰기해, 사진이 쌓일수록 저장 버튼 직후 메인이 그만큼 정지했다.
    nonisolated private static let persistQueue =
        DispatchQueue(label: "com.littlegd.upnext.growth-persist", qos: .utility)

    nonisolated private static var dir: URL {
        FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
            .appendingPathComponent("growth", isDirectory: true)
    }
    nonisolated private static func imageURL(_ id: String) -> URL {
        dir.appendingPathComponent("\(id).jpg")
    }
    nonisolated private static var metasURL: URL {
        dir.appendingPathComponent("metas.json")
    }

    private static let timeSlotFormatter: DateFormatter = {
        let f = DateFormatter()
        f.locale = Locale(identifier: "en_US_POSIX")
        f.timeZone = .current
        f.dateFormat = "HH:mm"
        return f
    }()

    nonisolated private static func ensureDir() {
        try? FileManager.default.createDirectory(
            at: dir, withIntermediateDirectories: true)
    }

    /// 이미지 JPEG 데이터를 파일로 기록. 성공 여부 반환.
    /// nonisolated — savePhoto 의 백그라운드 인코드 경로에서 호출된다.
    nonisolated private static func saveImage(_ jpeg: Data, id: String) -> Bool {
        ensureDir()
        do {
            try jpeg.write(to: imageURL(id), options: .atomic)
            return true
        } catch {
            return false
        }
    }

    nonisolated private static func deleteImage(id: String) {
        try? FileManager.default.removeItem(at: imageURL(id))
    }

    /// 메타 목록 복원. 파일이 없거나 손상되면 빈 배열.
    nonisolated private static func loadMetas() -> [PhotoMeta] {
        guard let data = try? Data(contentsOf: metasURL),
              let metas = try? JSONDecoder().decode([PhotoMeta].self, from: data)
        else { return [] }
        return metas
    }

    /// 메타 목록을 JSON 파일로 기록. 실패는 무시 (best-effort).
    /// 호출 시점의 스냅샷을 캡처해 persistQueue 에서 인코드+쓰기 — 직렬 큐라 순서가
    /// 보존되고 마지막 쓰기가 최종 상태와 일치한다. 메인은 즉시 반환.
    nonisolated private static func saveMetas(_ metas: [PhotoMeta]) {
        persistQueue.async {
            ensureDir()
            guard let data = try? JSONEncoder().encode(metas) else { return }
            try? data.write(to: metasURL, options: .atomic)
        }
    }
}

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

@MainActor
final class GrowthStore: ObservableObject {

    /// 인증 사진 메타 — 최신이 앞. 화면은 이걸 구독.
    @Published private(set) var photoMetas: [PhotoMeta] = []

    /// 로드된 이미지 메모리 캐시 — 그리드가 매 렌더 디스크를 안 읽도록.
    private var imageCache: [String: UIImage] = [:]

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
        imageCache[meta.id] = image
        photoMetas.insert(meta, at: 0)   // 최신이 앞
        // cap 초과분 — 가장 오래된 것(메타 끝)부터 메타·캐시·파일 정리.
        while photoMetas.count > Self.photoCap {
            let old = photoMetas.removeLast()
            imageCache[old.id] = nil
            Self.deleteImage(id: old.id)
        }
        Self.saveMetas(photoMetas)
    }

    /// 사진 삭제 — 메타·캐시·파일 모두 제거. 웹 deletePhoto.
    func deletePhoto(_ id: String) {
        photoMetas.removeAll { $0.id == id }
        imageCache[id] = nil
        Self.deleteImage(id: id)
        Self.saveMetas(photoMetas)
    }

    /// R8 — 전체 사진 데이터 리셋. GameStore.resetAllData 가 호출한다.
    /// 모든 메타·메모리 캐시·디스크 이미지 + 진행 중 캡처 상태까지 제거.
    /// (이전엔 resetAllData 가 growth 를 안 건드려 리셋 후 사진이 잔존했음.)
    func reset() {
        for meta in photoMetas { Self.deleteImage(id: meta.id) }
        photoMetas = []
        imageCache.removeAll()
        Self.saveMetas([])
        pendingCapture = nil
        capturePhase = .idle
    }

    /// 사진 이미지 로드 (메모리 캐시). 파일이 없으면 nil.
    func image(for id: String) -> UIImage? {
        if let cached = imageCache[id] { return cached }
        guard let img = UIImage(contentsOfFile: Self.imageURL(id).path) else { return nil }
        imageCache[id] = img
        return img
    }

    /// id 로 PhotoMeta 조회 — 부적 의식 등 외부 화면이 미리보기 사진을 가져갈 때.
    /// 메타 목록은 작아서 (cap 60) 선형 탐색 안전.
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
        guard let jpeg = image.jpegData(compressionQuality: 0.9) else { return }
        let kind: PhotoKind = challengeCardId == nil ? .free : .challengeLog
        let prefix = kind == .free ? "vp" : "cl"
        let id = "\(prefix)_\(UpHeroStore.nowMillis())"
        guard Self.saveImage(jpeg, id: id) else { return }

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
        insert(meta: meta, image: image)
        // 캡처 플로우 종료 — pending 정리.
        cancelCapture()
    }

    #if DEBUG
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
        imageCache[meta.id] = nil
        Self.saveMetas(photoMetas)
    }
    #endif

    // MARK: - 파일 저장 (Application Support/growth/)

    private static var dir: URL {
        FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
            .appendingPathComponent("growth", isDirectory: true)
    }
    private static func imageURL(_ id: String) -> URL {
        dir.appendingPathComponent("\(id).jpg")
    }
    private static var metasURL: URL {
        dir.appendingPathComponent("metas.json")
    }

    private static let timeSlotFormatter: DateFormatter = {
        let f = DateFormatter()
        f.locale = Locale(identifier: "en_US_POSIX")
        f.timeZone = .current
        f.dateFormat = "HH:mm"
        return f
    }()

    private static func ensureDir() {
        try? FileManager.default.createDirectory(
            at: dir, withIntermediateDirectories: true)
    }

    /// 이미지 JPEG 데이터를 파일로 기록. 성공 여부 반환.
    private static func saveImage(_ jpeg: Data, id: String) -> Bool {
        ensureDir()
        do {
            try jpeg.write(to: imageURL(id), options: .atomic)
            return true
        } catch {
            return false
        }
    }

    private static func deleteImage(id: String) {
        try? FileManager.default.removeItem(at: imageURL(id))
    }

    /// 메타 목록 복원. 파일이 없거나 손상되면 빈 배열.
    private static func loadMetas() -> [PhotoMeta] {
        guard let data = try? Data(contentsOf: metasURL),
              let metas = try? JSONDecoder().decode([PhotoMeta].self, from: data)
        else { return [] }
        return metas
    }

    /// 메타 목록을 JSON 파일로 기록. 실패는 무시 (best-effort).
    private static func saveMetas(_ metas: [PhotoMeta]) {
        ensureDir()
        guard let data = try? JSONEncoder().encode(metas) else { return }
        try? data.write(to: metasURL, options: .atomic)
    }
}

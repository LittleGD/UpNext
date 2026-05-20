//
//  SyncManager.swift
//  UpNext — Firestore 클라우드 동기화 (Phase 3.3).
//
//  웹 src/lib/sync.ts 의 SyncManager 를 1:1 포팅:
//   - startListener   : onSnapshot 실시간 리스너
//   - syncProgress/Daily/Onboarding : 로컬 변경 → 클라우드 (디바운스 300ms)
//   - flushSync       : setData(merge) + 지수 backoff 재시도
//   - getCloudData / uploadLocalData / deleteCloudData
//
//  race condition 방지 — 웹과 동일한 3중 가드:
//   (1) snapshot.metadata.hasPendingWrites — 자기 write 메아리 무시
//   (2) isUpdatingFromCloud  — 클라우드→로컬 적용 중 재진입 차단
//   (3) hasLocalPendingWrite — 디바운스 대기 중 도착한 stale snapshot 무시
//
//  @MainActor — 플래그·pending 상태가 리스너 콜백/디바운스/재시도 Task 등 여러
//  컨텍스트에서 접근되므로 메인 액터로 직렬화해 데이터 레이스를 원천 차단.
//

import Foundation
import Combine
import FirebaseFirestore

/// getCloudData 결과 — "문서 없음" 과 "조회 실패" 를 명확히 구분한다.
enum CloudLoad {
    case loaded(progress: UserProgress, daily: DailyState, retention: RetentionState?)
    case notFound   // 문서 자체가 없음 — 신규 계정
    case failed     // 네트워크/권한 오류 또는 손상 문서 — 기존 데이터 보호 위해 덮어쓰면 안 됨
}

@MainActor
final class SyncManager: ObservableObject {

    enum SyncStatus: Equatable {
        case idle
        case listening
        case syncing
        case synced
        case retrying(attempt: Int)
        case error(String)
    }

    @Published private(set) var status: SyncStatus = .idle

    /// 클라우드 변경을 로컬 상태로 반영하는 콜백 (Phase 4 에서 store 연결).
    private var onCloudUpdate: ((UserProgress, DailyState, RetentionState?) -> Void)?

    private var listener: ListenerRegistration?
    private var currentUid: String?

    // (2) 클라우드→로컬 적용 중 — 루프 방지.
    private var isUpdatingFromCloud = false
    // (3) 디바운스 대기 중인 로컬 write 존재 — Firestore hasPendingWrites 보다 먼저
    //     true 가 돼, 디바운스 대기 동안 도착한 stale snapshot 이 로컬을 덮어쓰는 race 차단.
    private var hasLocalPendingWrite = false
    // 앱 시작 시 Auth 확인 완료 전까지 클라우드 쓰기 차단.
    private var isSyncReady = false

    // 디바운스 중인 pending write — 키별 최신값만 보관 (웹 pendingSyncData).
    private var pendingProgress: UserProgress?
    private var pendingDaily: DailyDoc?
    private var pendingRetention: RetentionState?
    private var pendingOnboarding: Bool?

    private var debounceTask: Task<Void, Never>?
    private var retryTask: Task<Void, Never>?
    private var retryAttempt = 0
    private let maxRetryAttempts = 6

    private let usersCollection = AppConfig.firestoreUsersCollection

    /// 현재 클라우드→로컬 적용 중인지 — store 가 자기 write 를 동기화로 되돌리지 않게 가드.
    var isCloudUpdate: Bool { isUpdatingFromCloud }

    func setSyncReady(_ ready: Bool) { isSyncReady = ready }

    // MARK: - 실시간 리스너

    func startListener(
        uid: String,
        onCloudUpdate: @escaping (UserProgress, DailyState, RetentionState?) -> Void
    ) {
        stopListener()
        currentUid = uid
        self.onCloudUpdate = onCloudUpdate

        let docRef = Firestore.firestore().collection(usersCollection).document(uid)
        status = .listening
        listener = docRef.addSnapshotListener { [weak self] snapshot, error in
            // Firestore 콜백은 메인 큐 — Task 로 @MainActor 격리에 명시 진입.
            Task { @MainActor in self?.handleSnapshot(snapshot, error: error) }
        }
    }

    func stopListener() {
        listener?.remove()
        listener = nil
        currentUid = nil
        debounceTask?.cancel()
        debounceTask = nil
        retryTask?.cancel()
        retryTask = nil
        retryAttempt = 0
        pendingProgress = nil
        pendingDaily = nil
        pendingRetention = nil
        pendingOnboarding = nil
        hasLocalPendingWrite = false
        status = .idle
    }

    private func handleSnapshot(_ snapshot: DocumentSnapshot?, error: Error?) {
        guard let snapshot, error == nil else { return }
        guard snapshot.exists else { return }              // 문서 미존재 — 신규 계정
        if snapshot.metadata.hasPendingWrites { return }   // (1) 자기 write 메아리
        if isUpdatingFromCloud { return }                  // (2) 재진입 차단
        if hasLocalPendingWrite { return }                 // (3) stale snapshot 무시

        // 손상 snapshot 가드 — 디코딩 실패 = 무효 (웹 isValidProgress 와 동치).
        let userDoc: UserDoc
        do {
            userDoc = try snapshot.data(as: UserDoc.self)
        } catch {
            return  // 손상 문서 — 로컬을 덮어쓰지 않음
        }
        guard let progress = userDoc.progress else { return }

        isUpdatingFromCloud = true
        let daily = FirestoreSchema.hydrateDaily(
            userDoc.daily ?? emptyDailyDoc(),
            catalog: { CardCatalog.card(id: $0) })
        onCloudUpdate?(progress, daily, userDoc.retention)
        isUpdatingFromCloud = false
    }

    // MARK: - 로컬 → 클라우드 (디바운스 300ms)

    func syncProgress(_ progress: UserProgress) {
        enqueue { self.pendingProgress = progress }
    }

    func syncDaily(_ daily: DailyState) {
        enqueue { self.pendingDaily = FirestoreSchema.dehydrateDaily(daily) }
    }

    func syncRetention(_ retention: RetentionState) {
        enqueue { self.pendingRetention = retention }
    }

    func syncOnboarding(_ complete: Bool) {
        enqueue { self.pendingOnboarding = complete }
    }

    private func enqueue(_ mutate: () -> Void) {
        guard let queuedUid = currentUid, !isUpdatingFromCloud, isSyncReady else { return }
        mutate()
        hasLocalPendingWrite = true
        debounceTask?.cancel()
        debounceTask = Task { [weak self] in
            try? await Task.sleep(nanoseconds: 300_000_000)  // 300ms 디바운스
            guard !Task.isCancelled else { return }
            await self?.flushSync(expectedUid: queuedUid)
        }
    }

    private var hasPending: Bool {
        pendingProgress != nil || pendingDaily != nil || pendingRetention != nil || pendingOnboarding != nil
    }

    /// `expectedUid` 는 enqueue 시점의 uid — 디바운스 300ms 동안 로그아웃→재로그인이
    /// 발생하면 `currentUid` 가 새 사용자 uid 로 바뀐다. 이 경우 *이전 사용자의 pending
    /// write 가 새 사용자 문서에 기록되는 cross-account corruption* 을 방지하기 위해
    /// uid 가 바뀌었으면 pending 을 통째로 폐기. retry/scheduleRetry 경로는 currentUid
    /// 그대로 사용 (이전 사용자가 다시 로그인해 재시도하는 의미 있는 케이스).
    private func flushSync(expectedUid: String? = nil) async {
        guard let uid = currentUid else { hasLocalPendingWrite = false; return }
        if let expectedUid, expectedUid != uid {
            // 계정 전환 — 이전 사용자 pending 폐기.
            pendingProgress = nil
            pendingDaily = nil
            pendingRetention = nil
            pendingOnboarding = nil
            hasLocalPendingWrite = false
            return
        }
        // 전송분을 스냅샷으로 떠내고 pending 슬롯을 await 전에 즉시 비운다.
        //   await(setData) 중 도착하는 새 enqueue 는 비워진 슬롯에 쌓여 다음 flush 대상이
        //   되며, in-flight write 의 완료 처리가 그 새 값을 덮어쓰지 않는다 (데이터 유실 방지).
        let sentProgress = pendingProgress
        let sentDaily = pendingDaily
        let sentRetention = pendingRetention
        let sentOnboarding = pendingOnboarding
        guard sentProgress != nil || sentDaily != nil || sentRetention != nil || sentOnboarding != nil else {
            hasLocalPendingWrite = false
            return
        }
        pendingProgress = nil
        pendingDaily = nil
        pendingRetention = nil
        pendingOnboarding = nil
        status = .syncing

        var payload: [String: Any] = [
            "meta": [
                "lastSyncedAt": FieldValue.serverTimestamp(),
                "lastDeviceId": Self.deviceId(),
            ],
        ]
        do {
            if let p = sentProgress {
                payload["progress"] = try Firestore.Encoder().encode(p)
            }
            if let d = sentDaily {
                payload["daily"] = try Firestore.Encoder().encode(d)
            }
            if let r = sentRetention {
                payload["retention"] = try Firestore.Encoder().encode(r)
            }
            if let o = sentOnboarding {
                payload["onboardingComplete"] = o
            }
        } catch {
            // 인코딩 실패 — 같은 값을 재시도해도 실패하므로 전송분은 버린다.
            status = .error("인코딩 실패: \(error.localizedDescription)")
            hasLocalPendingWrite = hasPending
            return
        }

        let docRef = Firestore.firestore().collection(usersCollection).document(uid)
        do {
            try await docRef.setData(payload, merge: true)
            // 전송분은 이미 비웠다 — await 중 새로 쌓인 pending 은 그쪽 debounceTask 가 처리.
            hasLocalPendingWrite = hasPending
            retryAttempt = 0
            retryTask?.cancel()
            retryTask = nil
            status = .synced
        } catch {
            // 실패 — 전송분을 pending 으로 되돌린다. 단 await 중 새 값이 쌓인 슬롯은
            //   그 값이 더 최신이므로 덮어쓰지 않는다.
            if pendingProgress == nil { pendingProgress = sentProgress }
            if pendingDaily == nil { pendingDaily = sentDaily }
            if pendingRetention == nil { pendingRetention = sentRetention }
            if pendingOnboarding == nil { pendingOnboarding = sentOnboarding }
            hasLocalPendingWrite = true
            scheduleRetry()
        }
    }

    private func scheduleRetry() {
        guard retryAttempt < maxRetryAttempts else {
            // 재시도 소진 — 데이터는 보존하되 snapshot suppression 은 해제(읽기 경로 복구).
            // 다음 로컬 write 가 들어오면 새 enqueue 가 재시도를 다시 킥오프.
            hasLocalPendingWrite = false
            retryAttempt = 0
            status = .error("동기화 재시도 소진 — 다음 변경 시 재시도")
            return
        }
        let delay = Self.retryDelaySeconds(attempt: retryAttempt)
        retryAttempt += 1
        status = .retrying(attempt: retryAttempt)
        retryTask?.cancel()
        retryTask = Task { [weak self] in
            try? await Task.sleep(nanoseconds: UInt64(delay * 1_000_000_000))
            guard !Task.isCancelled else { return }
            await self?.flushSync()
        }
    }

    /// 웹 computeRetryDelay 대응 — min(30, 2^attempt) 초. 1·2·4·8·16·30(cap).
    static func retryDelaySeconds(attempt: Int) -> Double {
        min(30.0, pow(2.0, Double(attempt)))
    }

    // MARK: - 초기 업로드 / 조회 / 삭제

    /// 로컬 데이터를 클라우드에 최초 업로드 (웹 uploadLocalData). 디바운스 우회.
    func uploadLocalData(uid: String, progress: UserProgress, daily: DailyState, retention: RetentionState) async {
        hasLocalPendingWrite = true
        status = .syncing
        let docRef = Firestore.firestore().collection(usersCollection).document(uid)
        do {
            let payload: [String: Any] = [
                "progress": try Firestore.Encoder().encode(progress),
                "daily": try Firestore.Encoder().encode(FirestoreSchema.dehydrateDaily(daily)),
                "retention": try Firestore.Encoder().encode(retention),
                "onboardingComplete": true,
                "meta": [
                    "createdAt": FieldValue.serverTimestamp(),
                    "lastSyncedAt": FieldValue.serverTimestamp(),
                    "lastDeviceId": Self.deviceId(),
                ],
            ]
            // merge: true — `notFound` 경로(신규 계정) 에선 효과 동일하나, 다른 기기가
            // getCloudData ↔ setData 사이에 fields 를 써넣은 경우 그 fields 를 보존한다
            // (no-merge 면 통째 덮어쓰기 = 데이터 손실).
            try await docRef.setData(payload, merge: true)
            status = .synced
        } catch {
            status = .error("업로드 실패: \(error.localizedDescription)")
        }
        hasLocalPendingWrite = false
    }

    /// 클라우드 데이터 조회 (웹 getCloudData).
    ///
    /// "문서 없음(.notFound)" 과 "조회 실패(.failed)" 를 구분한다 — 부트스트랩이 둘을
    /// 혼동하면, 네트워크 블립 때 신규 계정으로 오판해 기본 상태를 만들고 uploadLocalData
    /// 로 기존 클라우드 데이터를 덮어쓰는 데이터 유실이 발생한다. 손상 문서도 .failed
    /// (신규 취급해 덮어쓰면 안 됨).
    func getCloudData(uid: String) async -> CloudLoad {
        let docRef = Firestore.firestore().collection(usersCollection).document(uid)
        let snapshot: DocumentSnapshot
        do {
            snapshot = try await docRef.getDocument()
        } catch {
            return .failed   // 네트워크/권한 오류 — "데이터 없음" 으로 오판 금지
        }
        guard snapshot.exists else { return .notFound }
        do {
            let userDoc = try snapshot.data(as: UserDoc.self)
            guard let progress = userDoc.progress else { return .failed }
            let daily = FirestoreSchema.hydrateDaily(
                userDoc.daily ?? emptyDailyDoc(),
                catalog: { CardCatalog.card(id: $0) })
            return .loaded(progress: progress, daily: daily, retention: userDoc.retention)
        } catch {
            return .failed   // 손상 문서 — 신규 취급해 덮어쓰면 기존 데이터 유실
        }
    }

    func deleteCloudData(uid: String) async {
        let docRef = Firestore.firestore().collection(usersCollection).document(uid)
        try? await docRef.delete()
    }

    // MARK: - 헬퍼

    /// daily 필드 부재 시 빈 문서 — 웹 hydrateDaily(data.daily || {}) 의 `|| {}` 대응.
    /// 관대 디코더라 {} 디코딩은 throw 불가.
    private func emptyDailyDoc() -> DailyDoc {
        try! JSONDecoder().decode(DailyDoc.self, from: Data("{}".utf8))
    }

    /// 기기 ID — 웹 getDeviceId 대응. 첫 호출 시 생성 후 UserDefaults 영속.
    static func deviceId() -> String {
        let key = "upnext_device_id"
        if let existing = UserDefaults.standard.string(forKey: key) { return existing }
        let id = UUID().uuidString.replacingOccurrences(of: "-", with: "").prefix(8).lowercased()
        UserDefaults.standard.set(String(id), forKey: key)
        return String(id)
    }
}

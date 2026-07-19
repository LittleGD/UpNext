//
//  DuoStore.swift
//  UpNext — small 1:1 duo streak experiment.
//

import Foundation
import Combine
import FirebaseFirestore

struct DuoMember: Identifiable, Equatable {
    var id: String { uid }
    var uid: String
    var displayName: String
}

struct DuoSnapshot: Identifiable, Equatable {
    var id: String
    var memberIds: [String]
    var memberNames: [String: String]
    var checkIns: [String: [String]]
    var nudges: [String: [String]]
    var createdAt: Int

    func checkedIn(uid: String, on day: String) -> Bool {
        checkIns[uid, default: []].contains(day)
    }

    /// uid 가 day 에 콕 찌르기를 보냈는지. 쿨다운/배너 판정의 단일 근거 —
    /// 로컬 플래그가 아니라 서버 nudges 배열을 보므로 앱 재시작에도 일관.
    func poked(uid: String, on day: String) -> Bool {
        nudges[uid, default: []].contains(day)
    }

    func sharedDays(currentUid: String) -> [String] {
        guard memberIds.count == 2 else { return [] }
        let other = memberIds.first { $0 != currentUid } ?? ""
        let mine = Set(checkIns[currentUid, default: []])
        let theirs = Set(checkIns[other, default: []])
        return mine.intersection(theirs).sorted()
    }
}

@MainActor
final class DuoStore: ObservableObject {
    @Published private(set) var activeDuo: DuoSnapshot?
    @Published private(set) var inviteCode: String?
    @Published private(set) var isWorking = false
    @Published private(set) var message: String?
    /// 친구가 오늘 나를 콕 찔렀을 때 1회 true — 받는 쪽 로컬 배너 트리거.
    @Published private(set) var friendNudgedMe = false

    private var uid: String?
    private var displayName: String = "UpNext"
    private var listener: ListenerRegistration?
    /// 리스너 첫 스냅샷 워밍업 플래그. 앱 시작/리스너 재부착 직후 첫 콜백은 배너를
    /// 띄우지 않게 한다 — 안 그러면 친구가 이전에 찌른 상태가 재시작마다 배너로 뜬다.
    private var duoWarmedUp = false

    private let db = Firestore.firestore()

    func start(uid: String, displayName: String?) {
        self.uid = uid
        // 양 끝 공백/줄바꿈 제거 + 40자 cap — rules 의 memberNames[uid].size() <= 40
        // 검증과 일치시켜 createInvite/join 이 long name 으로 silent 거절되는 일을 막는다.
        let trimmed = (displayName ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
        self.displayName = trimmed.isEmpty ? "UpNext" : String(trimmed.prefix(40))
        observeActiveDuo()
    }

    func reset() {
        listener?.remove()
        listener = nil
        uid = nil
        activeDuo = nil
        inviteCode = nil
        isWorking = false
        message = nil
        friendNudgedMe = false
        duoWarmedUp = false
    }

    func createInvite() {
        guard activeDuo == nil, !isWorking else { return }
        // uid 가 nil(익명) 이면 이전엔 조용히 return 해 버튼이 무반응이었다. UI 는 로그인
        // 게이트(RetentionSectionView.inviteControls → store.promptLogin)로 선차단하지만,
        // 직접 호출 방어로 여기서도 사유를 message 에 표면화한다(기존 message 표시 경로 재사용).
        guard let uid else {
            message = "로그인하면 친구와 함께 불꽃을 켤 수 있어요"
            return
        }
        isWorking = true
        message = nil
        let code = Self.makeCode()
        let duoId = db.collection("duos").document().documentID
        let now = UpHeroStore.nowMillis()
        let batch = db.batch()
        let duoRef = db.collection("duos").document(duoId)
        batch.setData([
            "memberIds": [uid],
            "memberNames": [uid: displayName],
            "checkIns": [uid: []],
            "createdAt": now,
            "updatedAt": now,
        ], forDocument: duoRef)
        let inviteRef = db.collection("duoInvites").document(code)
        batch.setData([
            "code": code,
            "duoId": duoId,
            "createdBy": uid,
            "createdAt": now,
            "expiresAt": now + 72 * 60 * 60 * 1000,
            "status": "open",
        ], forDocument: inviteRef)
        batch.commit { [weak self] error in
            Task { @MainActor [weak self] in
                self?.isWorking = false
                if let error {
                    self?.message = "초대 생성 실패: \(error.localizedDescription)"
                    return
                }
                self?.inviteCode = code
                self?.message = "초대코드가 준비됐어요"
                self?.observeActiveDuo()
            }
        }
    }

    func joinInvite(code rawCode: String) {
        guard activeDuo == nil, !isWorking else { return }
        // createInvite 와 동일 — 익명 상태의 조용한 무반응을 방어적으로 표면화.
        guard uid != nil else {
            message = "로그인하면 친구와 함께 불꽃을 켤 수 있어요"
            return
        }
        let code = rawCode.trimmingCharacters(in: .whitespacesAndNewlines).uppercased()
        guard code.count >= 4 else { return }
        isWorking = true
        message = nil
        let inviteRef = db.collection("duoInvites").document(code)
        inviteRef.getDocument { [weak self] snapshot, error in
            Task { @MainActor [weak self] in
                guard let self else { return }
                if let error {
                    self.isWorking = false
                    self.message = "초대 조회 실패: \(error.localizedDescription)"
                    return
                }
                guard let data = snapshot?.data(),
                      (data["status"] as? String) == "open",
                      let duoId = data["duoId"] as? String,
                      let expiresAt = Self.millisValue(data["expiresAt"]),
                      expiresAt > UpHeroStore.nowMillis() else {
                    self.isWorking = false
                    self.message = "유효하지 않은 초대코드예요"
                    return
                }
                self.joinDuo(duoId: duoId, inviteRef: inviteRef)
            }
        }
    }

    private func joinDuo(duoId: String, inviteRef: DocumentReference) {
        guard let uid else { return }
        let displayName = displayName
        let duoRef = db.collection("duos").document(duoId)
        db.runTransaction({ transaction, errorPointer in
            do {
                let doc = try transaction.getDocument(duoRef)
                var memberIds = doc.data()?["memberIds"] as? [String] ?? []
                guard memberIds.count < 2 || memberIds.contains(uid) else {
                    errorPointer?.pointee = NSError(domain: "DuoStore", code: 409)
                    return nil
                }
                if !memberIds.contains(uid) { memberIds.append(uid) }
                var memberNames = doc.data()?["memberNames"] as? [String: String] ?? [:]
                memberNames[uid] = displayName
                var checkIns = doc.data()?["checkIns"] as? [String: [String]] ?? [:]
                checkIns[uid] = checkIns[uid] ?? []
                transaction.updateData([
                    "memberIds": memberIds,
                    "memberNames": memberNames,
                    "checkIns": checkIns,
                    "updatedAt": UpHeroStore.nowMillis(),
                ], forDocument: duoRef)
                transaction.updateData(["status": "joined"], forDocument: inviteRef)
            } catch {
                errorPointer?.pointee = error as NSError
            }
            return nil
        }) { [weak self] _, error in
            Task { @MainActor [weak self] in
                self?.isWorking = false
                if let error {
                    self?.message = "듀오 참여 실패: \(error.localizedDescription)"
                    return
                }
                self?.inviteCode = nil
                self?.message = "2인 불꽃이 시작됐어요"
                self?.observeActiveDuo()
            }
        }
    }

    /// leaveDuo 의 await 가능 버전 — 계정 삭제 플로우 전용.
    /// Auth 레코드 삭제 *전*에 완료를 보장해야 파트너 문서에서 내 PII(표시이름·체크인·nudge)가
    /// 확실히 제거된다(콜백형 leaveDuo 는 fire-and-forget 이라 삭제 레이스 위험). best-effort —
    /// 실패해도 계정 삭제 자체는 진행한다(users/{uid} 문서는 별도로 삭제됨).
    func leaveDuoAsync() async {
        guard let uid, let activeDuo else { return }
        try? await db.collection("duos").document(activeDuo.id).updateData([
            "memberIds": FieldValue.arrayRemove([uid]),
            "memberNames.\(uid)": FieldValue.delete(),
            "checkIns.\(uid)": FieldValue.delete(),
            "nudges.\(uid)": FieldValue.delete(),
            "updatedAt": UpHeroStore.nowMillis(),
        ])
        self.activeDuo = nil
        self.inviteCode = nil
    }

    func leaveDuo() {
        guard let uid, let activeDuo, !isWorking else { return }
        isWorking = true
        // 본인만 atomic 으로 빠진다 — 두 명이 동시에 leave 해도 부분 결과 race 없음.
        // 이전 setData(merge:) 패턴은 인메모리 snapshot 의 memberIds 를 통째로 덮어쓰다
        // 보니 동시 leave 시 "각자 자기만 제외한 다른 멤버 명단" 두 개가 race 로 덮어써져
        // 한 사람이 살아남아 보이는 결과가 가능. arrayRemove + FieldValue.delete 는
        // 서버측 atomic 이라 순서·동시성과 무관하게 최종 상태가 정확하다.
        db.collection("duos").document(activeDuo.id).updateData([
            "memberIds": FieldValue.arrayRemove([uid]),
            "memberNames.\(uid)": FieldValue.delete(),
            "checkIns.\(uid)": FieldValue.delete(),
            "nudges.\(uid)": FieldValue.delete(),
            "updatedAt": UpHeroStore.nowMillis(),
        ]) { [weak self] _ in
            Task { @MainActor [weak self] in
                self?.isWorking = false
                self?.activeDuo = nil
                self?.inviteCode = nil
            }
        }
    }

    func publishCheckIn(date: String) {
        guard let uid, let duo = activeDuo else { return }
        // dot-path 업데이트 + arrayUnion — 본인 키만 atomic 으로 변경.
        // 이전 read-modify-write 패턴은 인메모리 snapshot 을 베이스로 setData(merge:)
        // 하다 보니 파트너가 같은 순간에 체크인하면 (리스너 콜백이 read 와 write 사이
        // fire) 파트너 체크인이 sliced suffix 에서 사라지는 race 가 있었음. arrayUnion
        // 은 Firestore 서버측에서 중복 제거 + 원자 병합을 보장하므로 race 발생 안 함.
        //
        // 60일 cap 은 여기서 강제하지 않음 — 한 op 안에 trim 까지 넣으면 다시 race.
        // 듀오 실험 수명상 array 가 폭주할 가능성 낮고, 필요 시 별도 정리 path 로 분리.
        db.collection("duos").document(duo.id).updateData([
            "checkIns.\(uid)": FieldValue.arrayUnion([date]),
            "updatedAt": UpHeroStore.nowMillis(),
        ])
    }

    /// 친구를 콕 찌른다 — 내가 켰지만 친구가 아직일 때의 CTA.
    /// publishCheckIn 과 동일한 race-free dot-path + arrayUnion 으로 본인 nudges 키만
    /// atomic 병합 (파트너가 동시에 무엇을 하든 충돌·유실 없음). 하루 1회 쿨다운은
    /// 로컬 상태가 아니라 nudges[uid] 에 오늘 날짜가 있는지로 판정 — 앱 재시작 일관.
    func nudge() {
        guard let uid, let duo = activeDuo, duo.memberIds.count == 2 else { return }
        let today = GameStore.todayString()
        guard !duo.poked(uid: uid, on: today) else { return }
        // 낙관적 로컬 반영 — 서버 왕복을 기다리지 않고 버튼이 즉시 "콕 찔렀어요"로.
        // 성공 시 리스너가 동일 값(arrayUnion)을 echo 하므로 깜빡임/불일치 없음.
        applyLocalNudge(uid: uid, day: today, add: true)
        // completion handler — 실패(예: rules 미배포 → PERMISSION_DENIED)를 표면화한다.
        // 이전엔 fire-and-forget 이라 거절이 조용히 삼켜져 "무반응"으로 보였음.
        db.collection("duos").document(duo.id).updateData([
            "nudges.\(uid)": FieldValue.arrayUnion([today]),
            "updatedAt": UpHeroStore.nowMillis(),
        ]) { [weak self] error in
            guard let error else { return }
            Task { @MainActor [weak self] in
                guard let self else { return }
                #if DEBUG
                print("[DuoStore] nudge write failed: \(error.localizedDescription)")
                #endif
                self.message = "콕 찌르기를 보내지 못했어요"
                self.applyLocalNudge(uid: uid, day: today, add: false)  // 낙관값 롤백
            }
        }
    }

    /// activeDuo.nudges[uid] 에 day 를 더하거나(add) 빼서(rollback) 로컬 즉시 반영.
    /// 본인 키만 건드리므로 detectIncomingNudge(친구 키 감시)와 간섭 없음.
    private func applyLocalNudge(uid: String, day: String, add: Bool) {
        guard var snap = activeDuo else { return }
        var arr = snap.nudges[uid, default: []]
        if add {
            guard !arr.contains(day) else { return }
            arr.append(day)
        } else {
            arr.removeAll { $0 == day }
        }
        snap.nudges[uid] = arr
        activeDuo = snap
    }

    /// 받는 쪽 배너 확인(닫기). 다시 false 로 — 같은 찌르기로 재노출되지 않게.
    func acknowledgeNudge() {
        friendNudgedMe = false
    }

    private func observeActiveDuo() {
        guard let uid else { return }
        listener?.remove()
        duoWarmedUp = false
        listener = db.collection("duos")
            .whereField("memberIds", arrayContains: uid)
            .limit(to: 1)
            .addSnapshotListener { [weak self] snapshot, _ in
                Task { @MainActor [weak self] in
                    guard let self else { return }
                    guard let doc = snapshot?.documents.first else {
                        self.activeDuo = nil
                        return
                    }
                    let next = Self.decodeDuo(doc)
                    self.detectIncomingNudge(previous: self.activeDuo, next: next)
                    self.activeDuo = next
                }
            }
    }

    /// 친구가 나를 콕 찔렀는지 — nudges[friend] 에 오늘 날짜가 false→true 로 바뀐
    /// 전이일 때만 배너 1회. 첫 스냅샷(duoWarmedUp == false)은 무시해 재시작마다 뜨지 않게.
    private func detectIncomingNudge(previous: DuoSnapshot?, next: DuoSnapshot) {
        defer { duoWarmedUp = true }
        guard duoWarmedUp,
              let uid,
              next.memberIds.count == 2,
              let friend = next.memberIds.first(where: { $0 != uid }) else { return }
        let today = GameStore.todayString()
        let was = previous?.poked(uid: friend, on: today) ?? false
        let now = next.poked(uid: friend, on: today)
        if now && !was {
            friendNudgedMe = true
            Haptics.play(.medium)
        }
    }

    private static func decodeDuo(_ doc: QueryDocumentSnapshot) -> DuoSnapshot {
        let data = doc.data()
        return DuoSnapshot(
            id: doc.documentID,
            memberIds: data["memberIds"] as? [String] ?? [],
            memberNames: data["memberNames"] as? [String: String] ?? [:],
            checkIns: data["checkIns"] as? [String: [String]] ?? [:],
            nudges: data["nudges"] as? [String: [String]] ?? [:],
            createdAt: millisValue(data["createdAt"]) ?? 0
        )
    }

    private static func makeCode() -> String {
        let alphabet = Array("ABCDEFGHJKLMNPQRSTUVWXYZ23456789")
        return String((0..<6).compactMap { _ in alphabet.randomElement() })
    }

    private static func millisValue(_ value: Any?) -> Int? {
        if let value = value as? Int { return value }
        if let value = value as? Int64 { return Int(value) }
        if let value = value as? Double { return Int(value) }
        return nil
    }
}

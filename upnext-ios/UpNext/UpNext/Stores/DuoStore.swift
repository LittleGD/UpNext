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
    var createdAt: Int

    func checkedIn(uid: String, on day: String) -> Bool {
        checkIns[uid, default: []].contains(day)
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

    private var uid: String?
    private var displayName: String = "UpNext"
    private var listener: ListenerRegistration?

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
    }

    func createInvite() {
        guard let uid, activeDuo == nil, !isWorking else { return }
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
        guard uid != nil, activeDuo == nil, !isWorking else { return }
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

    private func observeActiveDuo() {
        guard let uid else { return }
        listener?.remove()
        listener = db.collection("duos")
            .whereField("memberIds", arrayContains: uid)
            .limit(to: 1)
            .addSnapshotListener { [weak self] snapshot, _ in
                Task { @MainActor [weak self] in
                    guard let doc = snapshot?.documents.first else {
                        self?.activeDuo = nil
                        return
                    }
                    self?.activeDuo = Self.decodeDuo(doc)
                }
            }
    }

    private static func decodeDuo(_ doc: QueryDocumentSnapshot) -> DuoSnapshot {
        let data = doc.data()
        return DuoSnapshot(
            id: doc.documentID,
            memberIds: data["memberIds"] as? [String] ?? [],
            memberNames: data["memberNames"] as? [String: String] ?? [:],
            checkIns: data["checkIns"] as? [String: [String]] ?? [:],
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

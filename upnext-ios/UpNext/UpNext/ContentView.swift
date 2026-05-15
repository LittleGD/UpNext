//
//  ContentView.swift
//  UpNext — Phase 0.4 검증 화면.
//
//  목적: Firebase iOS SDK 통합이 제대로 됐는지 end-to-end 검증.
//   1. FirebaseAuth로 익명 로그인 (UID 발급)
//   2. Firestore에서 /users/{uid}/progress 문서 read 시도
//   3. 결과(연결됨 / 새 사용자 / 에러)를 화면에 표시
//
//  Phase 1 이후엔 이 화면이 통째로 SwiftUI Daily Home으로 교체될 예정.
//

import SwiftUI
import FirebaseAuth
import FirebaseFirestore

struct ContentView: View {
    @State private var status: ConnectionStatus = .idle

    var body: some View {
        VStack(spacing: 16) {
            Text("UpNext")
                .font(.system(size: 32, weight: .bold, design: .rounded))
                .foregroundStyle(Color(red: 0.78, green: 0.95, blue: 0.42))

            Text("Phase 0.4 — Firebase 연결 검증")
                .font(.caption)
                .foregroundStyle(.secondary)

            Divider().padding(.vertical, 8)

            statusView

            if case .success(let uid, let docExists) = status {
                VStack(alignment: .leading, spacing: 6) {
                    Text("UID: \(uid.prefix(12))…")
                        .font(.system(.caption, design: .monospaced))
                    Text(docExists ? "기존 progress 발견" : "새 사용자 (progress 없음)")
                        .font(.caption2)
                        .foregroundStyle(.secondary)
                }
                .padding(.top, 8)
            }

            if case .error = status {
                Button("다시 시도") {
                    Task { await runCheck() }
                }
                .buttonStyle(.borderedProminent)
                .padding(.top, 8)
            }
        }
        .padding()
        .task {
            await runCheck()
        }
    }

    @ViewBuilder
    private var statusView: some View {
        switch status {
        case .idle:
            ProgressView("초기화 중…")
        case .signingIn:
            ProgressView("익명 로그인 중…")
        case .reading:
            ProgressView("Firestore 읽기 중…")
        case .success:
            Label("연결 성공", systemImage: "checkmark.circle.fill")
                .foregroundStyle(.green)
                .font(.headline)
        case .error(let msg):
            VStack(spacing: 6) {
                Label("연결 실패", systemImage: "xmark.octagon.fill")
                    .foregroundStyle(.red)
                    .font(.headline)
                Text(msg)
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .multilineTextAlignment(.center)
            }
        }
    }

    private func runCheck() async {
        status = .signingIn
        do {
            // 1. 익명 로그인 — 이미 로그인되어 있으면 그 user 재사용
            let user: User
            if let existing = Auth.auth().currentUser {
                user = existing
            } else {
                let result = try await Auth.auth().signInAnonymously()
                user = result.user
            }

            // 2. Firestore에서 자기 progress 문서 read 시도
            status = .reading
            let db = Firestore.firestore()
            let docRef = db.collection("users").document(user.uid).collection("progress").document("main")
            let snapshot = try await docRef.getDocument()

            status = .success(uid: user.uid, docExists: snapshot.exists)
        } catch {
            status = .error(message: error.localizedDescription)
        }
    }
}

private enum ConnectionStatus {
    case idle
    case signingIn
    case reading
    case success(uid: String, docExists: Bool)
    case error(message: String)
}

#Preview {
    ContentView()
}

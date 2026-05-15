//
//  ContentView.swift
//  UpNext — 앱 루트 뷰.
//
//  현재는 마이그레이션 검증용 2탭:
//   - 디자인 시스템 갤러리 (Phase 1 산출물)
//   - Firebase 연결 검증 (Phase 0 산출물)
//
//  Phase 4에서 실제 Daily Home / Collection / Camp 등 화면으로 교체될 예정.
//

import SwiftUI
import FirebaseAuth
import FirebaseFirestore

struct ContentView: View {
    var body: some View {
        TabView {
            DesignSystemGallery()
                .tabItem { Label("디자인", systemImage: "paintpalette") }

            FirebaseCheckView()
                .tabItem { Label("Firebase", systemImage: "checkmark.icloud") }
        }
        .tint(Color.accentPrimary)
    }
}

// MARK: - Firebase 연결 검증 (Phase 0.4)

struct FirebaseCheckView: View {
    @State private var status: ConnectionStatus = .idle

    var body: some View {
        VStack(spacing: 16) {
            Text("UpNext")
                .typography(.display)
                .foregroundStyle(Color.accentPrimary)

            Text("Phase 0.4 — Firebase 연결 검증")
                .typography(.caption)
                .foregroundStyle(Color.textTertiary)

            Divider().padding(.vertical, 8)

            statusView

            if case .success(let uid, let docExists) = status {
                VStack(alignment: .leading, spacing: 6) {
                    Text("UID: \(uid.prefix(12))…")
                        .font(.system(.caption, design: .monospaced))
                    Text(docExists ? "기존 progress 발견" : "새 사용자 (progress 없음)")
                        .typography(.micro)
                        .foregroundStyle(Color.textTertiary)
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
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(Color.bgPrimary)
        .task { await runCheck() }
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
                .typography(.heading)
        case .error(let msg):
            VStack(spacing: 6) {
                Label("연결 실패", systemImage: "xmark.octagon.fill")
                    .foregroundStyle(Color.colorError)
                    .typography(.heading)
                Text(msg)
                    .typography(.caption)
                    .foregroundStyle(Color.textTertiary)
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

            // 2. Firestore에서 자기 user doc read 시도 — 웹과 동일한 스키마 /users/{uid}
            //    (src/lib/sync.ts:139의 doc(db, "users", uid)와 1:1 매칭)
            status = .reading
            let db = Firestore.firestore()
            let docRef = db.collection(AppConfig.firestoreUsersCollection).document(user.uid)
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

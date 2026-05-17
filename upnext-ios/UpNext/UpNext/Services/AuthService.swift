//
//  AuthService.swift
//  UpNext — Sign in with Apple / Google + Firebase Auth (Phase 3.2).
//
//  Capacitor @capacitor-firebase/authentication 플러그인을 폐기하고 native SDK 직통합:
//   - Apple : AuthenticationServices (ASAuthorizationController) → OAuthProvider credential
//   - Google: GoogleSignIn-iOS → GoogleAuthProvider credential
//  두 provider 모두 Firebase credential 로 변환해 Auth.auth().signIn(with:) 로 통합.
//
//  로그인 상태는 Firebase Auth 상태 리스너가 단일 진실의 원천 — 앱 재시작 시
//  세션 자동 복원, 로그인/로그아웃이 한 경로(applyUser)로 수렴.
//

import Foundation
import Combine
import UIKit
import Security
import AuthenticationServices
import CryptoKit
import FirebaseAuth
import FirebaseCore
import GoogleSignIn

@MainActor
final class AuthService: NSObject, ObservableObject {

    /// 로그인 상태 — 뷰가 관찰.
    enum AuthState: Equatable {
        case unknown                                       // Auth 상태 확인 전 (앱 시작 직후)
        case signedOut
        case signedIn(uid: String, provider: String, displayName: String?)
    }

    @Published private(set) var state: AuthState = .unknown
    @Published private(set) var lastError: String?
    @Published private(set) var isWorking = false

    private var authHandle: AuthStateDidChangeListenerHandle?
    // Apple Sign-In replay 방지 nonce — 요청 시 생성, 콜백 credential 에 rawNonce 로 전달.
    private var currentNonce: String?
    // ASAuthorizationController 는 요청이 끝날 때까지 강한 참조가 유지돼야 함.
    private var appleController: ASAuthorizationController?
    private var appleContinuation: CheckedContinuation<Void, Error>?

    /// 현재 로그인 uid (없으면 nil) — SyncManager 가 사용.
    var uid: String? {
        if case let .signedIn(uid, _, _) = state { return uid }
        return nil
    }

    override init() {
        super.init()
        // Firebase Auth 상태 리스너 — 로그인/로그아웃/앱 재시작(세션 복원) 시 state 갱신.
        authHandle = Auth.auth().addStateDidChangeListener { [weak self] _, user in
            Task { @MainActor in self?.applyUser(user) }
        }
    }

    private func applyUser(_ user: User?) {
        guard let user else {
            state = .signedOut
            return
        }
        let providerID = user.providerData.first?.providerID ?? "firebase"
        let label: String
        switch providerID {
        case "apple.com":  label = "Apple"
        case "google.com": label = "Google"
        default:           label = providerID
        }
        state = .signedIn(uid: user.uid, provider: label, displayName: user.displayName)
    }

    // MARK: - 로그아웃

    func signOut() {
        do {
            try Auth.auth().signOut()
            GIDSignIn.sharedInstance.signOut()
            lastError = nil
        } catch {
            lastError = "로그아웃 실패: \(error.localizedDescription)"
        }
    }

    // MARK: - Google 로그인

    func signInWithGoogle() async {
        guard !isWorking else { return }
        lastError = nil
        isWorking = true
        defer { isWorking = false }

        guard let clientID = FirebaseApp.app()?.options.clientID else {
            lastError = "Google: clientID 없음 — GoogleService-Info.plist 확인"
            return
        }
        GIDSignIn.sharedInstance.configuration = GIDConfiguration(clientID: clientID)

        guard let presenter = Self.topViewController() else {
            lastError = "Google: 표시할 뷰 컨트롤러 없음"
            return
        }
        do {
            let result = try await GIDSignIn.sharedInstance.signIn(withPresenting: presenter)
            guard let idToken = result.user.idToken?.tokenString else {
                lastError = "Google: idToken 없음"
                return
            }
            let credential = GoogleAuthProvider.credential(
                withIDToken: idToken,
                accessToken: result.user.accessToken.tokenString)
            try await Auth.auth().signIn(with: credential)
            // state 갱신은 addStateDidChangeListener 가 담당.
        } catch {
            lastError = "Google 로그인 실패: \(error.localizedDescription)"
        }
    }

    // MARK: - Apple 로그인

    func signInWithApple() async {
        guard !isWorking else { return }
        lastError = nil
        isWorking = true
        defer { isWorking = false }

        let nonce = Self.randomNonceString()
        currentNonce = nonce

        let request = ASAuthorizationAppleIDProvider().createRequest()
        request.requestedScopes = [.fullName, .email]
        request.nonce = Self.sha256(nonce)

        let controller = ASAuthorizationController(authorizationRequests: [request])
        controller.delegate = self
        controller.presentationContextProvider = self
        appleController = controller

        do {
            try await withCheckedThrowingContinuation { (continuation: CheckedContinuation<Void, Error>) in
                appleContinuation = continuation
                controller.performRequests()
            }
        } catch {
            lastError = "Apple 로그인 실패: \(error.localizedDescription)"
        }
        appleController = nil
    }

    // MARK: - 헬퍼

    /// Apple Sign-In nonce — Firebase 공식 스니펫 (charset 64자, modulo bias 없는 균등 추출).
    private static func randomNonceString(length: Int = 32) -> String {
        let charset: [Character] =
            Array("0123456789ABCDEFGHIJKLMNOPQRSTUVXYZabcdefghijklmnopqrstuvwxyz-._")
        var result = ""
        var remaining = length
        while remaining > 0 {
            var randoms = [UInt8](repeating: 0, count: 16)
            let status = SecRandomCopyBytes(kSecRandomDefault, randoms.count, &randoms)
            precondition(status == errSecSuccess, "nonce 난수 생성 실패: \(status)")
            for random in randoms where remaining > 0 {
                if random < charset.count {
                    result.append(charset[Int(random)])
                    remaining -= 1
                }
            }
        }
        return result
    }

    private static func sha256(_ input: String) -> String {
        SHA256.hash(data: Data(input.utf8))
            .map { String(format: "%02x", $0) }
            .joined()
    }

    /// 현재 화면 최상단 뷰 컨트롤러 — Google 로그인 시트 표시 anchor.
    static func topViewController() -> UIViewController? {
        var vc = keyWindow()?.rootViewController
        while let presented = vc?.presentedViewController { vc = presented }
        return vc
    }

    static func keyWindow() -> UIWindow? {
        UIApplication.shared.connectedScenes
            .compactMap { $0 as? UIWindowScene }
            .flatMap { $0.windows }
            .first { $0.isKeyWindow }
    }
}

// MARK: - Apple Sign-In 델리게이트

extension AuthService: ASAuthorizationControllerDelegate {
    func authorizationController(
        controller: ASAuthorizationController,
        didCompleteWithAuthorization authorization: ASAuthorization
    ) {
        let continuation = appleContinuation
        appleContinuation = nil
        guard
            let appleCredential = authorization.credential as? ASAuthorizationAppleIDCredential,
            let nonce = currentNonce,
            let tokenData = appleCredential.identityToken,
            let idToken = String(data: tokenData, encoding: .utf8)
        else {
            continuation?.resume(throwing: AuthServiceError.appleTokenMissing)
            return
        }
        // FirebaseAuth 10.12+ — Apple credential 직접 생성 (rawNonce 로 replay 검증).
        let credential = OAuthProvider.appleCredential(
            withIDToken: idToken, rawNonce: nonce, fullName: appleCredential.fullName)
        Task {
            do {
                try await Auth.auth().signIn(with: credential)
                continuation?.resume()
            } catch {
                continuation?.resume(throwing: error)
            }
        }
    }

    func authorizationController(
        controller: ASAuthorizationController,
        didCompleteWithError error: Error
    ) {
        appleContinuation?.resume(throwing: error)
        appleContinuation = nil
    }
}

// MARK: - Apple Sign-In 표시 anchor

extension AuthService: ASAuthorizationControllerPresentationContextProviding {
    func presentationAnchor(for controller: ASAuthorizationController) -> ASPresentationAnchor {
        Self.keyWindow() ?? ASPresentationAnchor()
    }
}

enum AuthServiceError: Error {
    case appleTokenMissing
}

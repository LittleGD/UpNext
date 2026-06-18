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
            lastError = AppConfig.loc("구글 설정을 불러올 수 없어요")
            return
        }
        GIDSignIn.sharedInstance.configuration = GIDConfiguration(clientID: clientID)

        guard let presenter = Self.topViewController() else {
            lastError = AppConfig.loc("잠시 후 다시 시도해주세요")
            return
        }
        do {
            let result = try await GIDSignIn.sharedInstance.signIn(withPresenting: presenter)
            guard let idToken = result.user.idToken?.tokenString else {
                lastError = AppConfig.loc("구글 인증 정보를 받지 못했어요")
                return
            }
            let credential = GoogleAuthProvider.credential(
                withIDToken: idToken,
                accessToken: result.user.accessToken.tokenString)
            try await Auth.auth().signIn(with: credential)
            // state 갱신은 addStateDidChangeListener 가 담당.
        } catch {
            lastError = Self.friendlyGoogleError(error)
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
            // 사용자 취소(.canceled) 는 에러로 노출 안 함 — 자연스러운 흐름.
            if let msg = Self.friendlyAppleError(error) {
                lastError = msg
            }
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
    /// AuthorizationServices 콜백은 main thread 보장이나 *nonisolated* 호출이라
    /// MainActor 격리된 stored property(appleContinuation·currentNonce) 직접 mutate 는
    /// Swift 6 strict concurrency 에서 data race 위반(또는 iOS 18 isolation check crash).
    /// 본문을 `Task { @MainActor in ... }` 로 감싸 격리 위반 차단.
    nonisolated func authorizationController(
        controller: ASAuthorizationController,
        didCompleteWithAuthorization authorization: ASAuthorization
    ) {
        Task { @MainActor [weak self] in
            guard let self else { return }
            let continuation = self.appleContinuation
            self.appleContinuation = nil
            let savedNonce = self.currentNonce
            self.currentNonce = nil  // nonce 재사용 방지 — 매 시도마다 새로 생성됨.
            guard
                let appleCredential = authorization.credential as? ASAuthorizationAppleIDCredential,
                let nonce = savedNonce,
                let tokenData = appleCredential.identityToken,
                let idToken = String(data: tokenData, encoding: .utf8)
            else {
                continuation?.resume(throwing: AuthServiceError.appleTokenMissing)
                return
            }
            // FirebaseAuth 10.12+ — Apple credential 직접 생성 (rawNonce 로 replay 검증).
            let credential = OAuthProvider.appleCredential(
                withIDToken: idToken, rawNonce: nonce, fullName: appleCredential.fullName)
            do {
                try await Auth.auth().signIn(with: credential)
                continuation?.resume()
            } catch {
                continuation?.resume(throwing: error)
            }
        }
    }

    nonisolated func authorizationController(
        controller: ASAuthorizationController,
        didCompleteWithError error: Error
    ) {
        Task { @MainActor [weak self] in
            self?.appleContinuation?.resume(throwing: error)
            self?.appleContinuation = nil
            self?.currentNonce = nil
        }
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

// MARK: - 친절 에러 메시지 (Localizable.xcstrings 경유 다국어)

extension AuthService {
    /// Apple Sign-In 에러를 사용자 친화 메시지로 변환. 취소(.canceled)는 nil 반환 —
    /// 호출부에서 lastError 를 그대로 두면 토스트/배너 미노출. 시스템 영어 메시지
    /// 그대로 노출하던 이전 동작을 폐기.
    static func friendlyAppleError(_ error: Error) -> String? {
        let ns = error as NSError
        // ASAuthorizationError 도메인 — code 1000~1005.
        if ns.domain == ASAuthorizationError.errorDomain {
            switch ns.code {
            case ASAuthorizationError.canceled.rawValue:
                return nil  // 사용자 취소 — 조용히.
            case ASAuthorizationError.notHandled.rawValue:
                return AppConfig.loc("Apple 로그인을 처리할 수 없어요 — 잠시 후 다시 시도해주세요")
            case ASAuthorizationError.invalidResponse.rawValue:
                return AppConfig.loc("Apple ID 응답을 확인할 수 없어요")
            case ASAuthorizationError.notInteractive.rawValue:
                return AppConfig.loc("Apple ID 로그인이 필요해요")
            case ASAuthorizationError.failed.rawValue:
                return AppConfig.loc("Apple 로그인이 실패했어요 — 다시 시도해주세요")
            default:
                return AppConfig.loc("Apple 로그인 중 오류가 발생했어요")
            }
        }
        // FirebaseAuth / 기타 — 일반 메시지.
        return AppConfig.loc("Apple 로그인 중 오류가 발생했어요")
    }

    /// Google Sign-In 에러를 사용자 친화 메시지로 변환. 취소 케이스 silent.
    static func friendlyGoogleError(_ error: Error) -> String? {
        let ns = error as NSError
        // GIDSignInError 도메인 — code -5 가 cancel.
        if ns.domain == "com.google.GIDSignIn", ns.code == -5 {
            return nil  // 사용자 취소 — 조용히.
        }
        return AppConfig.loc("구글 로그인 중 오류가 발생했어요 — 다시 시도해주세요")
    }
}

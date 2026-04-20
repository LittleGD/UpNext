/**
 * iOS 네이티브 Sign-In 브릿지.
 *
 * WKWebView에서 signInWithPopup이 차단되는 문제를 우회하기 위해
 * @capacitor-firebase/authentication 플러그인으로 OS 네이티브 sheet(Google) /
 * Face ID·Touch ID flow(Apple)를 거친 뒤 얻은 ID 토큰을 Firebase signInWithCredential로
 * 주입 → 기존 `onAuthStateChanged` 리스너와 동일한 궤도로 합류시킨다.
 *
 * 동적 import로 웹/Android 번들에 Capacitor 플러그인 코드가 섞이지 않도록 격리.
 * 네이티브 환경 분기는 호출부(useAuthStore)가 책임 — 이 파일은 iOS native에서만 호출됨을 가정.
 */
"use client";

/** 사용자 취소 판별용 마커. 호출부에서 catch 시 조용히 무시하도록 사용. */
export class AuthCanceledError extends Error {
  constructor() {
    super("auth-canceled");
    this.name = "AuthCanceledError";
  }
}

/**
 * Capacitor Firebase Auth가 throw하는 네이티브 에러 중 "사용자 취소" 패턴을 감지.
 * - iOS ASAuthorization: "The user canceled the authorize request." (code 1001)
 * - Google Sign-In: "The user canceled the sign-in-flow."
 * 문자열 기반 감지는 SDK 버전에 따라 달라질 수 있어 복수 패턴 커버.
 */
function isNativeCancelError(e: unknown): boolean {
  const msg = (e as { message?: string })?.message?.toLowerCase() ?? "";
  const code = (e as { code?: string | number })?.code;
  if (code === 1001 || code === "1001") return true;
  return (
    msg.includes("canceled") ||
    msg.includes("cancelled") ||
    msg.includes("the user canceled")
  );
}

export async function signInWithGoogleNative(): Promise<void> {
  const { FirebaseAuthentication } = await import("@capacitor-firebase/authentication");
  const { getFirebase } = await import("@/lib/firebase");
  const { signInWithCredential, GoogleAuthProvider } = await import("firebase/auth");

  try {
    const result = await FirebaseAuthentication.signInWithGoogle();
    const idToken = result.credential?.idToken;
    if (!idToken) throw new Error("google-missing-idtoken");

    const { auth } = await getFirebase();
    await signInWithCredential(auth, GoogleAuthProvider.credential(idToken));
  } catch (e) {
    if (isNativeCancelError(e)) throw new AuthCanceledError();
    throw e;
  }
}

export async function signInWithAppleNative(): Promise<void> {
  const { FirebaseAuthentication } = await import("@capacitor-firebase/authentication");
  const { getFirebase } = await import("@/lib/firebase");
  const { signInWithCredential, OAuthProvider } = await import("firebase/auth");

  try {
    // Capacitor Firebase Auth 가 내부적으로 nonce를 생성·검증해줌.
    const result = await FirebaseAuthentication.signInWithApple();
    const idToken = result.credential?.idToken;
    const rawNonce = result.credential?.nonce;
    if (!idToken) throw new Error("apple-missing-idtoken");

    const { auth } = await getFirebase();
    const provider = new OAuthProvider("apple.com");
    const credential = provider.credential({ idToken, rawNonce });
    await signInWithCredential(auth, credential);
  } catch (e) {
    if (isNativeCancelError(e)) throw new AuthCanceledError();
    throw e;
  }
}

"use client";

import type { FirebaseApp } from "firebase/app";
import type { Auth, GoogleAuthProvider } from "firebase/auth";
import type { Firestore } from "firebase/firestore";

// Firebase가 설정되었는지 확인 (env 변수가 비어있으면 false)
export const isFirebaseConfigured = Boolean(process.env.NEXT_PUBLIC_FIREBASE_API_KEY);

// ── Phase 2A: 동적 import 싱글턴 ──
// 기존: 정적 import로 ~250KiB 초기 로딩
// 개선: 실제 필요 시점에만 동적 import

interface FirebaseInstance {
  app: FirebaseApp;
  auth: Auth;
  googleProvider: GoogleAuthProvider;
  db: Firestore;
}

let _instance: FirebaseInstance | null = null;
let _promise: Promise<FirebaseInstance> | null = null;

export async function getFirebase(): Promise<FirebaseInstance> {
  if (_instance) return _instance;
  if (_promise) return _promise;

  _promise = (async () => {
    // Phase 14 code-review Low #23 — 필수 env var 누락 시 Firebase SDK 는 내부
    //   깊숙한 곳에서 "FirebaseError: ... auth/invalid-api-key" 같은 모호한
    //   메시지로 fail. 셋업 단계에서 어떤 키가 비었는지 한 번에 드러내 디버깅
    //   시간을 절감. 이 싱글턴은 auth 액션 때만 호출되므로 assert 실패해도
    //   앱 전체 크래시는 아니다.
    const firebaseConfig = {
      apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
      authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
      projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
      storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
      messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
      appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
    };
    const missing = (Object.keys(firebaseConfig) as Array<keyof typeof firebaseConfig>)
      .filter((k) => !firebaseConfig[k]);
    if (missing.length > 0) {
      const envKeyFor: Record<keyof typeof firebaseConfig, string> = {
        apiKey: "NEXT_PUBLIC_FIREBASE_API_KEY",
        authDomain: "NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN",
        projectId: "NEXT_PUBLIC_FIREBASE_PROJECT_ID",
        storageBucket: "NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET",
        messagingSenderId: "NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID",
        appId: "NEXT_PUBLIC_FIREBASE_APP_ID",
      };
      // 실패를 미루지 않고 즉시 throw — Promise.all 로딩된 SDK 는 자동 tree-shaking.
      _promise = null;
      throw new Error(
        `[firebase] Missing required env vars: ${missing.map((k) => envKeyFor[k]).join(", ")}`,
      );
    }

    const [
      { initializeApp, getApps },
      { getAuth, GoogleAuthProvider },
      { initializeFirestore, persistentLocalCache, persistentMultipleTabManager },
    ] = await Promise.all([
      import("firebase/app"),
      import("firebase/auth"),
      import("firebase/firestore"),
    ]);

    const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];
    const auth = getAuth(app);
    const googleProvider = new GoogleAuthProvider();
    const db = initializeFirestore(app, {
      localCache: persistentLocalCache({
        tabManager: persistentMultipleTabManager(),
      }),
    });

    _instance = { app, auth, googleProvider, db };
    return _instance;
  })();

  return _promise;
}

// 하위 호환: 동기 접근자 (이미 초기화된 경우에만)
export function getFirebaseSync() {
  return _instance;
}

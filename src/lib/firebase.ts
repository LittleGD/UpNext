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
    const [
      { initializeApp, getApps },
      { getAuth, GoogleAuthProvider },
      { initializeFirestore, persistentLocalCache, persistentMultipleTabManager },
    ] = await Promise.all([
      import("firebase/app"),
      import("firebase/auth"),
      import("firebase/firestore"),
    ]);

    const firebaseConfig = {
      apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
      authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
      projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
      storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
      messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
      appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
    };

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

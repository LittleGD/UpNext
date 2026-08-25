// LocalStorage 헬퍼 — 브라우저에 데이터를 저장/불러오기
// JSON.stringify로 객체를 문자열로 변환하여 저장하고,
// JSON.parse로 문자열을 다시 객체로 변환하여 불러옴
//
// 클라우드 동기화 대상 키 (saveToStorage 가 sync.ts syncToCloud 로 라우팅):
//   progress / daily / onboarding_complete / retention (트랙 2-1)
// 그 외 키(growth, uphero 등)는 로컬 전용으로 저장만 된다.

import { syncToCloud } from "@/lib/sync";

const PREFIX = "upnext_";

export function saveToStorage<T>(key: string, value: T): void {
  if (typeof window === "undefined") return;
  try {
    const serialized = JSON.stringify(value);
    localStorage.setItem(PREFIX + key, serialized);
    // 로그인 상태면 클라우드에도 동기화 (비로그인이면 no-op)
    syncToCloud(key, value);
  } catch {
    console.error(`Failed to save ${key} to localStorage`);
  }
}

export function loadFromStorage<T>(key: string): T | null {
  if (typeof window === "undefined") return null;
  try {
    const item = localStorage.getItem(PREFIX + key);
    if (item === null) return null;
    return JSON.parse(item) as T;
  } catch {
    console.error(`Failed to load ${key} from localStorage`);
    return null;
  }
}

export function removeFromStorage(key: string): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem(PREFIX + key);
}

/**
 * 모든 upnext_* 키 제거. 로그아웃 시 사용자 간 상태 누출 방지 용도.
 * Firebase Auth signOut 과 별개로 호출 필요 — Firebase 는 Auth 세션만 지운다.
 */
export function clearAllAppStorage(): void {
  if (typeof window === "undefined") return;
  const keysToRemove: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (k && k.startsWith(PREFIX)) keysToRemove.push(k);
  }
  for (const k of keysToRemove) {
    try {
      localStorage.removeItem(k);
    } catch {
      // ignore
    }
  }
}

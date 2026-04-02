// LocalStorage 헬퍼 — 브라우저에 데이터를 저장/불러오기
// JSON.stringify로 객체를 문자열로 변환하여 저장하고,
// JSON.parse로 문자열을 다시 객체로 변환하여 불러옴

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

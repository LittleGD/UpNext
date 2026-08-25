/**
 * Widget + Live Activity 브릿지 (Capacitor 네이티브 공용).
 *
 * 네이티브 측 구현:
 *   - Android: WidgetBridge Kotlin 플러그인 (트랙3 C2) — updateWidget 은
 *     SharedPreferences 저장 + AppWidgetManager 갱신, Live Activity 계열은
 *     { supported: false } 를 반환 (안드로이드에 대응 개념 없음).
 *   - (참고) 폐기된 iOS Capacitor 셸의 WidgetBridge.swift 와 동일 인터페이스.
 *     네이티브 iOS 앱은 upnext-ios/UpNext/UpNext/WidgetSync.swift 가 같은
 *     페이로드 스키마를 직접 빌드하므로 필드명을 반드시 일치시킬 것.
 *
 * 데이터 흐름:
 *   JS state → WidgetBridge.updateWidget(payload)
 *     → 네이티브 저장소(SharedPreferences / App Group)에 JSON 저장
 *     → 위젯 타임라인 갱신 트리거
 *     → 위젯(AppWidgetProvider / TimelineProvider)이 다시 읽음
 *
 * 순수 웹(브라우저/TWA) 환경에서는 모두 no-op (isNative 체크).
 */
"use client";

import { isNative } from "@/lib/platform";
import type { Language } from "@/types/game";

/** 위젯 체크리스트 한 줄. title 은 인앱 언어로 미리 해석된 카드 제목. */
export interface WidgetTask {
  title: string;
  done: boolean;
}

/**
 * 위젯 페이로드. iOS WidgetState.swift 와 필드명 1:1 대응 (+ lang 은 Android
 * 위젯 chrome 다국어용 추가 필드 — 위젯이 자체 리소스로 라벨을 그릴 때 사용).
 */
export interface WidgetState {
  /** 제품일 "2026-08-24" — useGameStore getTodayString 과 동일한 01:00 경계 */
  date: string;
  streak: number;
  todayCount: number;
  todayDone: number;
  xp: number;
  xpForNext: number;
  level: number;
  levelTitle: string;
  mainChallengeTitle: string;
  /** 오늘 선택 카드들(현재 페이즈) — 체크리스트 렌더용 */
  tasks: WidgetTask[];
  /** 인앱 언어 — 위젯 chrome("오늘의 챌린지" 등) 로컬라이즈용 */
  lang: Language;
  /** 페이로드 생성 시각 (ms epoch) — 위젯의 stale 판정용 */
  updatedAt: number;
}

interface WidgetBridgePlugin {
  updateWidget(state: WidgetState): Promise<{ ok: boolean }>;
  startChallengeActivity(opts: {
    challengeId: string;
    title: string;
    expiresAt: number; // ms epoch
  }): Promise<{ activityId?: string; supported: boolean; enabled?: boolean }>;
  endChallengeActivity(opts: { challengeId: string }): Promise<{ ok?: boolean; supported?: boolean }>;
  endAllActivities(): Promise<{ ok?: boolean; supported?: boolean }>;
}

let cachedPlugin: WidgetBridgePlugin | null = null;

async function getPlugin(): Promise<WidgetBridgePlugin | null> {
  if (!isNative()) return null;
  if (cachedPlugin) return cachedPlugin;
  try {
    const { registerPlugin } = await import("@capacitor/core");
    cachedPlugin = registerPlugin<WidgetBridgePlugin>("WidgetBridge");
    return cachedPlugin;
  } catch {
    return null;
  }
}

/**
 * 게임 상태를 위젯 표시용 payload로 압축해서 네이티브에 푸시.
 * 호출처는 useGameStore의 챌린지·XP·streak 변화 액션에서 디바운스해서 부르는 게 효율적.
 */
export async function pushWidgetState(state: WidgetState): Promise<void> {
  if (!isNative()) return;
  const plugin = await getPlugin();
  if (!plugin) return;
  try {
    await plugin.updateWidget(state);
  } catch {
    // 위젯 업데이트 실패는 앱 동작에 영향 없음 — 조용히 실패
  }
}

/**
 * 4시간 챌린지 시작 시 호출 → 잠금화면 + 다이나믹 아일랜드에 카운트다운 노출.
 * Android 플러그인은 { supported: false } 를 반환 — 호출은 유지하되 no-op.
 * @param expiresAt 만료 시각 (ms epoch)
 */
export async function startChallengeActivity(
  challengeId: string,
  title: string,
  expiresAt: number
): Promise<void> {
  if (!isNative()) return;
  const plugin = await getPlugin();
  if (!plugin) return;
  try {
    await plugin.startChallengeActivity({ challengeId, title, expiresAt });
  } catch {
    // Live Activity 실패는 silent — 사용자 시스템 설정에서 비활성화했거나 iOS 16 미만
  }
}

/** 챌린지 완료/만료 시 호출 → Live Activity 즉시 dismiss */
export async function endChallengeActivity(challengeId: string): Promise<void> {
  if (!isNative()) return;
  const plugin = await getPlugin();
  if (!plugin) return;
  try {
    await plugin.endChallengeActivity({ challengeId });
  } catch { /* ignore */ }
}

/** 앱 리셋·로그아웃 등에서 모든 활성 Live Activity 종료 */
export async function endAllChallengeActivities(): Promise<void> {
  if (!isNative()) return;
  const plugin = await getPlugin();
  if (!plugin) return;
  try {
    await plugin.endAllActivities();
  } catch { /* ignore */ }
}

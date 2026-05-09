/**
 * Widget + Live Activity 브릿지 (iOS only).
 *
 * 네이티브 측 구현:
 *   - WidgetBridge.swift (Capacitor 커스텀 플러그인, App 타깃 위치)
 *   - UpNextWidget.swift (SwiftUI Widget Extension 타깃)
 *
 * 데이터 흐름:
 *   JS state → WidgetBridge.updateWidget(payload)
 *     → App Group `group.com.littlegd.upnext` 의 UserDefaults에 JSON 저장
 *     → WidgetCenter.reloadAllTimelines()
 *     → Widget Extension의 TimelineProvider.getTimeline에서 다시 읽음
 *
 * 웹/Android 환경에서는 모두 no-op (isNative 체크).
 */
"use client";

import { isNative, isIos } from "@/lib/platform";

export interface WidgetState {
  streak: number;
  todayCount: number;
  todayDone: number;
  xp: number;
  xpForNext: number;
  level: number;
  levelTitle: string;
  mainChallengeTitle: string;
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
  if (!isIos()) return null;
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
 * @param expiresAt 만료 시각 (ms epoch)
 */
export async function startChallengeActivity(
  challengeId: string,
  title: string,
  expiresAt: number
): Promise<void> {
  if (!isIos()) return;
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
  if (!isIos()) return;
  const plugin = await getPlugin();
  if (!plugin) return;
  try {
    await plugin.endChallengeActivity({ challengeId });
  } catch { /* ignore */ }
}

/** 앱 리셋·로그아웃 등에서 모든 활성 Live Activity 종료 */
export async function endAllChallengeActivities(): Promise<void> {
  if (!isIos()) return;
  const plugin = await getPlugin();
  if (!plugin) return;
  try {
    await plugin.endAllActivities();
  } catch { /* ignore */ }
}

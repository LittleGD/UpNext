"use client";

import { useState, useEffect, useCallback, useRef, useSyncExternalStore } from "react";
import { useMotionValue, type MotionValue } from "framer-motion";
import { useReducedMotion } from "./useReducedMotion";
import { isLowEndDeviceCached } from "@/lib/devicePerformance";

const GYRO_SENSITIVITY = 0.6; // 원시 beta/gamma → degree 매핑 비율
const MAX_GYRO = 10;          // ±10° (드래그보다 부드럽게)
// deviceorientation 이벤트는 대부분 기기에서 60Hz. MotionValue set + spring 은
// 저렴하지만 끝단 (transform/matrix) 까지 가면 저성능 기기에서 jank 의 원인.
// 저성능 기기에서는 ~30Hz 로 sample-down. 사람 손목의 지연을 고려하면 시각
// 차이는 거의 없음.
const LOW_END_MIN_INTERVAL_MS = 33;

export interface GyroscopeState {
  /** 앞-뒤 기울기 MotionValue (±10°, 리렌더 없음) */
  beta: MotionValue<number>;
  /** 좌-우 기울기 MotionValue (±10°, 리렌더 없음) */
  gamma: MotionValue<number>;
  /** 자이로 센서 사용 가능 여부 */
  isAvailable: boolean;
  /** 활성 상태인지 */
  isActive: boolean;
  /** iOS 13+에서 아직 권한 요청이 필요한 상태 */
  needsPermission: boolean;
  /** iOS 13+ 권한 요청 (사용자 제스처 컨텍스트에서 호출) */
  requestPermission: () => Promise<boolean>;
}

// 클라이언트에서만 알 수 있는 정적 환경 정보 — mount 후 값이 바뀌지 않으므로
// 구독 없는 useSyncExternalStore 로 읽는다 (SSR/hydration 첫 렌더는 false).
const noopSubscribe = () => () => {};
const getHasAPI = () => "DeviceOrientationEvent" in window;
const getServerFalse = () => false;
const getNeedsPermissionAPI = () => {
  if (!("DeviceOrientationEvent" in window)) return false;
  const DOE = DeviceOrientationEvent as unknown as {
    requestPermission?: () => Promise<"granted" | "denied">;
  };
  return typeof DOE.requestPermission === "function";
};

/**
 * DeviceOrientation 이벤트를 래핑하여 3D 카드 기울기에 쓸 수 있는 beta/gamma MotionValue 반환.
 * - MotionValue 기반이라 리렌더 없이 60fps 유지
 * - 비iOS: 자동 활성화 (디폴트)
 * - iOS 13+: requestPermission() 호출 필요 (사용자 탭 후)
 * - prefers-reduced-motion 시 비활성
 */
export function useGyroscope(): GyroscopeState {
  const reducedMotion = useReducedMotion();
  const beta = useMotionValue(0);
  const gamma = useMotionValue(0);
  const hasAPI = useSyncExternalStore(noopSubscribe, getHasAPI, getServerFalse);
  const permissionAPIRequired = useSyncExternalStore(
    noopSubscribe,
    getNeedsPermissionAPI,
    getServerFalse,
  );
  const [granted, setGranted] = useState(false);
  const initialRef = useRef<{ beta: number; gamma: number } | null>(null);

  const isAvailable = !reducedMotion && hasAPI;
  // 비iOS: 자동 활성화 / iOS 13+: 권한 승인 후 활성화
  const isActive = isAvailable && (!permissionAPIRequired || granted);
  const needsPermission = isAvailable && permissionAPIRequired && !granted;

  // 리스너 등록/해제
  useEffect(() => {
    if (!isActive || reducedMotion) return;

    // (재)활성화 시점마다 기준 자세를 다시 잡는다
    initialRef.current = null;

    const lowEnd = isLowEndDeviceCached();
    let lastUpdate = 0;

    const handler = (e: DeviceOrientationEvent) => {
      if (e.beta == null || e.gamma == null) return;

      if (lowEnd) {
        const now = performance.now();
        if (now - lastUpdate < LOW_END_MIN_INTERVAL_MS) return;
        lastUpdate = now;
      }

      // 첫 이벤트를 "기준"으로 잡아서, 손에 들고 있는 기본 자세를 0°로 설정
      if (!initialRef.current) {
        initialRef.current = { beta: e.beta, gamma: e.gamma };
      }

      const db = e.beta - initialRef.current.beta;
      const dg = e.gamma - initialRef.current.gamma;
      const clamp = (v: number) => Math.max(-MAX_GYRO, Math.min(MAX_GYRO, v));
      beta.set(clamp(db * GYRO_SENSITIVITY));
      gamma.set(clamp(dg * GYRO_SENSITIVITY));
    };

    window.addEventListener("deviceorientation", handler);
    return () => window.removeEventListener("deviceorientation", handler);
  }, [isActive, reducedMotion, beta, gamma]);

  const requestPermission = useCallback(async (): Promise<boolean> => {
    if (!isAvailable) return false;

    const DOE = DeviceOrientationEvent as unknown as {
      requestPermission?: () => Promise<"granted" | "denied">;
    };

    if (typeof DOE.requestPermission === "function") {
      try {
        const result = await DOE.requestPermission();
        if (result === "granted") {
          setGranted(true);
          return true;
        }
        return false;
      } catch {
        return false;
      }
    }

    // iOS 미만 또는 Android — 권한 불필요
    setGranted(true);
    return true;
  }, [isAvailable]);

  return {
    beta,
    gamma,
    isAvailable,
    isActive,
    needsPermission,
    requestPermission,
  };
}

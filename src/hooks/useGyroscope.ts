"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useMotionValue, type MotionValue } from "framer-motion";
import { useReducedMotion } from "./useReducedMotion";

const GYRO_SENSITIVITY = 0.6; // 원시 beta/gamma → degree 매핑 비율
const MAX_GYRO = 10;          // ±10° (드래그보다 부드럽게)

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
  const [isAvailable, setIsAvailable] = useState(false);
  const [isActive, setIsActive] = useState(false);
  const [needsPermission, setNeedsPermission] = useState(false);
  const initialRef = useRef<{ beta: number; gamma: number } | null>(null);

  // 센서 존재 여부 판단 + 자동 활성화
  useEffect(() => {
    if (reducedMotion) return;
    const hasAPI = typeof window !== "undefined" && "DeviceOrientationEvent" in window;
    setIsAvailable(hasAPI);
    if (!hasAPI) return;

    const DOE = DeviceOrientationEvent as unknown as {
      requestPermission?: () => Promise<"granted" | "denied">;
    };

    if (typeof DOE.requestPermission === "function") {
      // iOS 13+ — 사용자 제스처 필요
      setNeedsPermission(true);
    } else {
      // Android / 데스크탑 — 자동 활성화
      initialRef.current = null;
      setIsActive(true);
    }
  }, [reducedMotion]);

  // 리스너 등록/해제
  useEffect(() => {
    if (!isActive || reducedMotion) return;

    const handler = (e: DeviceOrientationEvent) => {
      if (e.beta == null || e.gamma == null) return;

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
    if (reducedMotion || !isAvailable) return false;

    const DOE = DeviceOrientationEvent as unknown as {
      requestPermission?: () => Promise<"granted" | "denied">;
    };

    if (typeof DOE.requestPermission === "function") {
      try {
        const result = await DOE.requestPermission();
        if (result === "granted") {
          initialRef.current = null;
          setIsActive(true);
          setNeedsPermission(false);
          return true;
        }
        return false;
      } catch {
        return false;
      }
    }

    // iOS 미만 또는 Android — 권한 불필요
    initialRef.current = null;
    setIsActive(true);
    return true;
  }, [reducedMotion, isAvailable]);

  return {
    beta,
    gamma,
    isAvailable,
    isActive,
    needsPermission: reducedMotion ? false : needsPermission,
    requestPermission,
  };
}

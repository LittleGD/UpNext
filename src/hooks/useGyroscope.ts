"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useReducedMotion } from "./useReducedMotion";

const GYRO_SENSITIVITY = 0.6; // 원시 beta/gamma → degree 매핑 비율
const MAX_GYRO = 10;          // ±10° (드래그보다 부드럽게)

export interface GyroscopeState {
  /** 앞-뒤 기울기 (mapped to rotateX, ±10°). null = 미지원/비활성 */
  beta: number | null;
  /** 좌-우 기울기 (mapped to rotateY, ±10°). null = 미지원/비활성 */
  gamma: number | null;
  /** 자이로 센서 사용 가능 여부 */
  isAvailable: boolean;
  /** iOS 13+ 에서 권한 요청. 사용자 제스처 컨텍스트에서 호출해야 함 */
  requestPermission: () => Promise<boolean>;
  /** 권한이 승인되어 활성 상태인지 */
  isActive: boolean;
}

/**
 * DeviceOrientation 이벤트를 래핑하여 3D 카드 기울기에 쓸 수 있는 beta/gamma 반환.
 * - iOS 13+: requestPermission() 호출 필요 (사용자 탭 후)
 * - prefers-reduced-motion 시 비활성
 */
export function useGyroscope(): GyroscopeState {
  const reducedMotion = useReducedMotion();
  const [isAvailable, setIsAvailable] = useState(false);
  const [isActive, setIsActive] = useState(false);
  const [tilt, setTilt] = useState<{ beta: number | null; gamma: number | null }>({
    beta: null,
    gamma: null,
  });
  const initialRef = useRef<{ beta: number; gamma: number } | null>(null);

  // 센서 존재 여부 판단
  useEffect(() => {
    if (reducedMotion) return;
    const hasAPI = typeof window !== "undefined" && "DeviceOrientationEvent" in window;
    setIsAvailable(hasAPI);
  }, [reducedMotion]);

  // 리스너 등록/해제
  useEffect(() => {
    if (!isActive) return;

    const handler = (e: DeviceOrientationEvent) => {
      if (e.beta == null || e.gamma == null) return;

      // 첫 이벤트를 "기준" 으로 잡아서, 손에 들고 있는 기본 자세를 0°로 설정
      if (!initialRef.current) {
        initialRef.current = { beta: e.beta, gamma: e.gamma };
      }

      const db = e.beta - initialRef.current.beta;
      const dg = e.gamma - initialRef.current.gamma;

      const clamp = (v: number) => Math.max(-MAX_GYRO, Math.min(MAX_GYRO, v));
      setTilt({
        beta: clamp(db * GYRO_SENSITIVITY),
        gamma: clamp(dg * GYRO_SENSITIVITY),
      });
    };

    window.addEventListener("deviceorientation", handler);
    return () => window.removeEventListener("deviceorientation", handler);
  }, [isActive]);

  const requestPermission = useCallback(async (): Promise<boolean> => {
    if (reducedMotion || !isAvailable) return false;

    // iOS 13+ permission 모델
    const DOE = DeviceOrientationEvent as unknown as {
      requestPermission?: () => Promise<"granted" | "denied">;
    };

    if (typeof DOE.requestPermission === "function") {
      try {
        const result = await DOE.requestPermission();
        if (result === "granted") {
          initialRef.current = null; // 새 기준점
          setIsActive(true);
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

  if (reducedMotion) {
    return {
      beta: null,
      gamma: null,
      isAvailable: false,
      requestPermission: async () => false,
      isActive: false,
    };
  }

  return {
    beta: tilt.beta,
    gamma: tilt.gamma,
    isAvailable,
    requestPermission,
    isActive,
  };
}

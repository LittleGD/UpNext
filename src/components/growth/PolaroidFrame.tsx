"use client";

import PolaroidFrame1 from "./PolaroidFrame1";
import PolaroidFrame2 from "./PolaroidFrame2";
import PolaroidFrame3 from "./PolaroidFrame3";
import PolaroidFrame4 from "./PolaroidFrame4";

interface Props {
  imageSrc: string;
  timestamp: number;
  variant?: number; // 0-3, 생략 시 timestamp 기반 결정
  children?: React.ReactNode; // 서명/캡션 캔버스 슬롯
}

/**
 * 폴라로이드 프레임 디스패처 — Figma 기반 4가지 디자인 중 하나를 고른다.
 *
 * 선택 규칙:
 *   - variant 명시 시: 해당 인덱스(0-3) 사용
 *   - 미지정 시: timestamp 기반 deterministic 선택
 *     → 사진을 찍는 "순간" 에는 랜덤하게 보이지만(ms 단위 변동),
 *       한번 저장된 사진을 재방문할 때마다 동일한 프레임이 재현된다.
 *       (timestamp 가 저장 메타의 일부이므로 프레임도 사실상 사진의 영구 속성)
 *
 * timestamp % 4 는 ms 단위 시계 분포상 균등에 가깝다. 단, 유저가 초 단위로
 * 동기화해 연속 촬영하면 편향될 수 있으나 실사용 패턴에서는 무시 가능.
 */
const FRAMES = [PolaroidFrame1, PolaroidFrame2, PolaroidFrame3, PolaroidFrame4] as const;

export default function PolaroidFrame({ imageSrc, timestamp, variant, children }: Props) {
  // 음수/오버플로우 방지용 safe 모듈러 — variant 가 실수로 4 이상/음수로 전달돼도
  // 0-3 범위에 안전하게 매핑된다.
  const raw = variant ?? timestamp;
  const v = ((raw % 4) + 4) % 4;
  const Frame = FRAMES[v];
  return (
    <Frame imageSrc={imageSrc} timestamp={timestamp}>
      {children}
    </Frame>
  );
}

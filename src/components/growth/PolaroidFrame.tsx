"use client";

import PolaroidFrame1 from "./PolaroidFrame1";
import PolaroidFrame2 from "./PolaroidFrame2";
import PolaroidFrame3 from "./PolaroidFrame3";
import PolaroidFrame4 from "./PolaroidFrame4";
import PolaroidFrame5 from "./PolaroidFrame5";

interface Props {
  imageSrc: string;
  timestamp: number;
  variant?: number; // 0-4, 생략 시 timestamp 기반 가중치 분포 결정
  children?: React.ReactNode; // 서명/캡션 캔버스 슬롯
}

/**
 * 폴라로이드 프레임 디스패처 — Figma 기반 5가지 디자인 중 하나를 고른다.
 *
 * 선택 규칙:
 *   - variant 명시 시: 해당 인덱스(0-4) 사용, 범위 밖은 safe clamp
 *   - 미지정 시: timestamp 기반 deterministic 가중치 분포 선택
 *     · Frame5 (장식 없는 흰색): 60%
 *     · Frame1~4 (장식 있는 베이지): 각 10%
 *
 * 왜 해시하는가:
 *   - 직접 `timestamp % 100` 은 ms 하위 비트가 편향되어 있어(시계 해상도, 연속 촬영
 *     패턴) 장기적으로 분포가 기울어진다. Knuth multiplicative hashing 으로
 *     상위 비트를 섞은 뒤 modulo 하면 실사용 범위에서 균등에 가까워진다.
 *   - timestamp 가 저장 메타의 일부이므로 재방문 시 동일 프레임이 재현된다
 *     (프레임은 사실상 사진의 영구 속성).
 */
const FRAMES = [PolaroidFrame1, PolaroidFrame2, PolaroidFrame3, PolaroidFrame4, PolaroidFrame5] as const;

// 누적 가중치 버킷 — 0-9 F1, 10-19 F2, 20-29 F3, 30-39 F4, 40-99 F5
function pickVariant(timestamp: number): number {
  const h = ((timestamp * 2654435761) >>> 0) % 100;
  if (h < 10) return 0;
  if (h < 20) return 1;
  if (h < 30) return 2;
  if (h < 40) return 3;
  return 4;
}

export default function PolaroidFrame({ imageSrc, timestamp, variant, children }: Props) {
  // variant 명시 시 0-4 범위 safe clamp — 실수로 5 이상/음수가 들어와도 안전하게 매핑
  const v =
    variant !== undefined ? ((variant % 5) + 5) % 5 : pickVariant(timestamp);
  const Frame = FRAMES[v];
  return (
    <Frame imageSrc={imageSrc} timestamp={timestamp}>
      {children}
    </Frame>
  );
}

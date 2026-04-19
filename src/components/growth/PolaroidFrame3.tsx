"use client";

import PolaroidFrameBase from "./PolaroidFrameBase";

interface Props {
  imageSrc: string;
  timestamp: number;
  children?: React.ReactNode;
}

/**
 * PolaroidFrame3 — Figma `p-frame3` 기반, 우하단 fold + 좌측 밖으로 뻗는 크랙.
 * 공통 렌더링은 PolaroidFrameBase 로 위임 (Phase 14 code-review High #5).
 *
 * 크랙 위치: Figma 원본 y=189 (223 의 ~84.75%), 좌측 -16px 로 프레임 밖까지 뻗음.
 */
export default function PolaroidFrame3({ imageSrc, timestamp, children }: Props) {
  return (
    <PolaroidFrameBase
      imageSrc={imageSrc}
      timestamp={timestamp}
      dataNodeId="346:2616"
      dataName="p-frame3"
      decorations={[
        {
          kind: "crack",
          src: "/polaroid/frame-crack.png",
          width: 141,
          height: 21,
          left: -16,
          topPct: (189 / 223) * 100,
          opacity: 0.7,
        },
        {
          kind: "fold",
          src: "/polaroid/frame-right-bottom-fold.png",
          width: 13,
          height: 12,
          position: "br",
        },
      ]}
    >
      {children}
    </PolaroidFrameBase>
  );
}

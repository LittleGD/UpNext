"use client";

import PolaroidFrameBase from "./PolaroidFrameBase";

interface Props {
  imageSrc: string;
  timestamp: number;
  children?: React.ReactNode;
}

/**
 * PolaroidFrame1 — Figma `p-frame1` 기반, 좌상단 모서리 fold 1 개.
 * 공통 렌더링은 PolaroidFrameBase 로 위임 (Phase 14 code-review High #5).
 */
export default function PolaroidFrame1({ imageSrc, timestamp, children }: Props) {
  return (
    <PolaroidFrameBase
      imageSrc={imageSrc}
      timestamp={timestamp}
      dataNodeId="346:2605"
      dataName="p-frame1"
      decorations={[
        {
          kind: "fold",
          src: "/polaroid/frame-left-top-fold.png",
          width: 14,
          height: 14,
          position: "tl",
        },
      ]}
    >
      {children}
    </PolaroidFrameBase>
  );
}

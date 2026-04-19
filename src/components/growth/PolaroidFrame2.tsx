"use client";

import PolaroidFrameBase from "./PolaroidFrameBase";

interface Props {
  imageSrc: string;
  timestamp: number;
  children?: React.ReactNode;
}

/**
 * PolaroidFrame2 — Figma `p-frame2` 기반, 우상단 모서리 fold 1 개.
 * 공통 렌더링은 PolaroidFrameBase 로 위임 (Phase 14 code-review High #5).
 */
export default function PolaroidFrame2({ imageSrc, timestamp, children }: Props) {
  return (
    <PolaroidFrameBase
      imageSrc={imageSrc}
      timestamp={timestamp}
      decorations={[
        {
          kind: "fold",
          src: "/polaroid/frame-right-top-fold.png",
          width: 19,
          height: 7,
          position: "tr",
        },
      ]}
    >
      {children}
    </PolaroidFrameBase>
  );
}

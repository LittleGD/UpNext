"use client";

import PolaroidFrameBase from "./PolaroidFrameBase";

interface Props {
  imageSrc: string;
  timestamp: number;
  children?: React.ReactNode;
}

/**
 * PolaroidFrame4 — Figma `p-frame4` 기반, 좌하단 모서리 fold 1 개.
 * ※ Frame4 만 원본 높이 224 (다른 프레임은 223). aspectRatio 로 유일한 차이.
 * 공통 렌더링은 PolaroidFrameBase 로 위임 (Phase 14 code-review High #5).
 */
export default function PolaroidFrame4({ imageSrc, timestamp, children }: Props) {
  return (
    <PolaroidFrameBase
      imageSrc={imageSrc}
      timestamp={timestamp}
      aspectRatio="184 / 224"
      decorations={[
        {
          kind: "fold",
          src: "/polaroid/frame-left-bottom-fold.png",
          width: 9,
          height: 19,
          position: "bl",
        },
      ]}
    >
      {children}
    </PolaroidFrameBase>
  );
}

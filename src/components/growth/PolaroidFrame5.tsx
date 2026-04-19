"use client";

import PolaroidFrameBase from "./PolaroidFrameBase";

interface Props {
  imageSrc: string;
  timestamp: number;
  children?: React.ReactNode;
}

/**
 * PolaroidFrame5 — 장식 없는 기본형 밝은 아이보리 폴라로이드.
 * 베이지(#f2f1ee) 대신 더 밝은 #f9f8f5 배경 + decorations 없음.
 * 공통 렌더링은 PolaroidFrameBase 로 위임 (Phase 14 code-review High #5).
 */
export default function PolaroidFrame5({ imageSrc, timestamp, children }: Props) {
  return (
    <PolaroidFrameBase
      imageSrc={imageSrc}
      timestamp={timestamp}
      backgroundColor="#f9f8f5"
    >
      {children}
    </PolaroidFrameBase>
  );
}

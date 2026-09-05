"use client";

/**
 * Up Hero — 사진 부적 썸네일 (공용).
 *
 * IndexedDB 에서 thumbnail blob 을 읽어 object URL 로 렌더한다. 로딩 중에는
 * 같은 크기의 dim placeholder 를 두어 레이아웃이 흔들리지 않게 한다.
 *
 * 원래 `EquipmentCard` 안의 `PhotoThumb` 이었다. 격자 가방 타일(BagBoard/BagTray)
 * 도 같은 썸네일이 필요해서 공용으로 뽑았다 — 같은 blob 로딩·해제 규칙을 두 번
 * 쓰면 URL revoke 를 한쪽에서만 놓치는 사고가 난다.
 *
 * `bordered` 는 카드 쪽 기존 룩(1px GB.light 테두리)을 유지하기 위한 스위치다.
 * 가방 타일은 등급 보더가 이미 바깥에 있으므로 false 로 쓴다 — 보더는 등급·선택·
 * 착용에만 쓴다는 디자인 규칙 때문.
 */

import { useEffect, useState } from "react";
import { GB } from "@/lib/upHeroPalette";
import { getThumbnailBlob, blobToUrl } from "@/lib/photoStorage";

interface EquipmentPhotoThumbProps {
  photoId: string;
  size: number;
  /** 1px GB.light 테두리 (EquipmentCard 기존 룩). 기본 true. */
  bordered?: boolean;
  /** 모서리 반경 클래스 override (기본 rounded-sm). */
  className?: string;
}

export default function EquipmentPhotoThumb({
  photoId,
  size,
  bordered = true,
  className = "rounded-sm",
}: EquipmentPhotoThumbProps) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    let objectUrl: string | null = null;
    getThumbnailBlob(photoId)
      .then((blob) => {
        if (!active || !blob) return;
        objectUrl = blobToUrl(blob);
        setUrl(objectUrl);
      })
      .catch(() => {});
    return () => {
      active = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [photoId]);

  if (!url) {
    return (
      <div
        className={className}
        style={{
          width: size,
          height: size,
          background: `${GB.dark}cc`,
          border: bordered ? `1px solid ${GB.light}80` : undefined,
        }}
      />
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={url}
      alt=""
      aria-hidden="true"
      className={className}
      style={{
        width: size,
        height: size,
        objectFit: "cover",
        border: bordered ? `1px solid ${GB.light}` : undefined,
      }}
    />
  );
}

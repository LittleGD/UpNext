"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { springBouncy } from "@/lib/motion";
import { getThumbnailBlob, blobToUrl } from "@/lib/photoStorage";
import { KODAK_FILM_FILTER } from "@/lib/photoFilter";
import type { PhotoMeta } from "@/types/growth";

interface Props {
  meta: PhotoMeta;
  x: number;
  y: number;
}

export default function TreePhotoNode({ meta, x, y }: Props) {
  const [thumbUrl, setThumbUrl] = useState<string | null>(null);

  useEffect(() => {
    let revoke: string | null = null;
    getThumbnailBlob(meta.id).then((blob) => {
      if (blob) {
        const url = blobToUrl(blob);
        revoke = url;
        setThumbUrl(url);
      }
    });
    return () => {
      if (revoke) URL.revokeObjectURL(revoke);
    };
  }, [meta.id]);

  if (!thumbUrl) return null;

  return (
    <motion.div
      initial={{ scale: 0, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      transition={springBouncy}
      className="absolute cursor-pointer"
      style={{
        left: x - 16,
        top: y - 20,
        width: 32,
        height: 38,
      }}
    >
      {/* 미니 폴라로이드 프레임 */}
      <div className="w-full h-full bg-[#f0f0f0] rounded-[2px] p-[2px] pb-[6px] shadow-sm">
        <img
          src={thumbUrl}
          alt=""
          className="w-full h-[26px] object-cover rounded-[1px]"
          draggable={false}
          style={{ filter: KODAK_FILM_FILTER }}
        />
      </div>
    </motion.div>
  );
}

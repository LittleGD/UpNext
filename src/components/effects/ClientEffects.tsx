"use client";

import dynamic from "next/dynamic";

const PixelStars = dynamic(() => import("@/components/effects/PixelStars"), {
  ssr: false,
});
const AmbientBackground = dynamic(
  () => import("@/components/effects/AmbientBackground"),
  { ssr: false },
);

export default function ClientEffects() {
  return (
    <>
      <AmbientBackground />
      <PixelStars />
    </>
  );
}

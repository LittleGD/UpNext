"use client";

// 임시 폴라로이드 프레임 QA 페이지 — 4종 variant 시각 검증용. 검증 후 삭제.
import PolaroidFrame1 from "@/components/growth/PolaroidFrame1";
import PolaroidFrame2 from "@/components/growth/PolaroidFrame2";
import PolaroidFrame3 from "@/components/growth/PolaroidFrame3";
import PolaroidFrame4 from "@/components/growth/PolaroidFrame4";
import PolaroidFrame from "@/components/growth/PolaroidFrame";

// 플레이스홀더 — 카메라 없이도 렌더 확인하기 위한 인물 느낌 SVG
const PLACEHOLDER =
  "data:image/svg+xml;utf8," +
  encodeURIComponent(
    `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 300 300'>
      <defs>
        <linearGradient id='g' x1='0' y1='0' x2='1' y2='1'>
          <stop offset='0%' stop-color='#b08968'/>
          <stop offset='100%' stop-color='#4a3828'/>
        </linearGradient>
      </defs>
      <rect width='300' height='300' fill='url(#g)'/>
      <circle cx='150' cy='120' r='50' fill='#f4e9d8' opacity='0.85'/>
      <path d='M 80 220 Q 150 160 220 220 L 220 300 L 80 300 Z' fill='#2d1f14'/>
      <text x='150' y='290' text-anchor='middle' font-family='Courier New' font-size='14' fill='#f4e9d8' opacity='0.7'>sample 300x300</text>
    </svg>`
  );

// 고정 타임스탬프 — SSR 일관성을 위해 고정값 사용
const NOW = Date.UTC(2026, 3, 16, 4, 30);

function Wrap({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-2 items-center">
      <h2 className="typo-body text-text-secondary">{label}</h2>
      {children}
    </section>
  );
}

export default function DevPolaroidPreview() {
  return (
    <div className="min-h-dvh bg-bg-primary px-6 py-10 flex flex-col gap-12 items-center">
      <h1 className="typo-heading text-text-primary">Polaroid Frames — QA preview</h1>

      <Wrap label="Variant 1 (direct)">
        <PolaroidFrame1 imageSrc={PLACEHOLDER} timestamp={NOW}>
          <div className="p-2 text-center typo-caption text-text-tertiary">frame1 caption</div>
        </PolaroidFrame1>
      </Wrap>

      <Wrap label="Variant 2 (direct)">
        <PolaroidFrame2 imageSrc={PLACEHOLDER} timestamp={NOW}>
          <div className="p-2 text-center typo-caption text-text-tertiary">frame2 caption</div>
        </PolaroidFrame2>
      </Wrap>

      <Wrap label="Variant 3 (direct)">
        <PolaroidFrame3 imageSrc={PLACEHOLDER} timestamp={NOW}>
          <div className="p-2 text-center typo-caption text-text-tertiary">frame3 caption</div>
        </PolaroidFrame3>
      </Wrap>

      <Wrap label="Variant 4 (direct)">
        <PolaroidFrame4 imageSrc={PLACEHOLDER} timestamp={NOW}>
          <div className="p-2 text-center typo-caption text-text-tertiary">frame4 caption</div>
        </PolaroidFrame4>
      </Wrap>

      <hr className="w-2/3 border-white/10" />

      <h2 className="typo-heading text-text-primary">Dispatcher (variant prop 0~3)</h2>
      {[0, 1, 2, 3].map((v) => (
        <Wrap key={v} label={`dispatcher variant=${v}`}>
          <PolaroidFrame imageSrc={PLACEHOLDER} timestamp={NOW} variant={v}>
            <div className="p-2 text-center typo-caption text-text-tertiary">via dispatcher</div>
          </PolaroidFrame>
        </Wrap>
      ))}
    </div>
  );
}

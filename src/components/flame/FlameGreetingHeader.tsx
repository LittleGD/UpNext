"use client";

import PixelIcon from "@/components/icons/PixelIcon";
import { useTranslation } from "@/hooks/useTranslation";
import type { DictKey } from "@/i18n";

/**
 * 시간대 인사 헤더 (iOS RecordTabView.RitualGreetingHeader 포팅).
 *
 * 정적 타이틀 대신 시간대별 인사로 압박 없는 진입, 매 방문 신선함.
 * 데이터 의존이 0이라 항상 안전. pixelarticons 에 Sun 이 없어 iOS 와 동일하게
 * 아침/한낮은 Fire(라임), 저녁/밤은 Moon 으로 대체한다.
 *
 * 시간 버킷은 렌더 시점 로컬 시각 기준 (iOS Calendar.component(.hour) 동일).
 * 페이지가 isLoaded 게이트 뒤에서만 렌더되므로 SSR hydration 불일치 없음
 * (서버는 스켈레톤만 내보낸다).
 */

type GreetingBucket = "morning" | "midday" | "evening" | "night";

const GREETINGS = {
  morning: {
    icon: "Fire",
    title: "flame.greeting.morning.title",
    sub: "flame.greeting.morning.sub",
  },
  midday: {
    icon: "Fire",
    title: "flame.greeting.midday.title",
    sub: "flame.greeting.midday.sub",
  },
  evening: {
    icon: "Moon",
    title: "flame.greeting.evening.title",
    sub: "flame.greeting.evening.sub",
  },
  night: {
    icon: "Moon",
    title: "flame.greeting.night.title",
    sub: "flame.greeting.night.sub",
  },
} satisfies Record<GreetingBucket, { icon: string; title: DictKey; sub: DictKey }>;

function currentBucket(): GreetingBucket {
  const h = new Date().getHours();
  if (h >= 5 && h < 11) return "morning";
  if (h >= 11 && h < 17) return "midday";
  if (h >= 17 && h < 22) return "evening";
  return "night";
}

export default function FlameGreetingHeader() {
  const { t } = useTranslation();
  const greeting = GREETINGS[currentBucket()];

  return (
    <header className="pt-2">
      <div className="flex items-center gap-2">
        <PixelIcon name={greeting.icon} size={18} color="var(--accent-primary)" />
        <h1 className="typo-title text-text-primary">{t(greeting.title)}</h1>
      </div>
      <p className="typo-caption text-text-tertiary mt-1.5">{t(greeting.sub)}</p>
    </header>
  );
}

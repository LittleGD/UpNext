"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { Language } from "@/types/game";

const LANGUAGE_OPTIONS: { code: Language; label: string }[] = [
  { code: "ko", label: "한국어" },
  { code: "en", label: "English" },
  { code: "ja", label: "日本語" },
  { code: "zh", label: "中文" },
];

export default function AboutLanguageSelect({
  language,
  label,
}: {
  language: Language;
  label: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const handleChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
    const nextLanguage = event.target.value as Language;
    const nextParams = new URLSearchParams(searchParams.toString());

    if (nextLanguage === "ko") {
      nextParams.delete("lang");
    } else {
      nextParams.set("lang", nextLanguage);
    }

    const query = nextParams.toString();
    router.push(query ? `${pathname}?${query}` : pathname, { scroll: false });
  };

  return (
    <label className="relative inline-flex items-center">
      <span className="sr-only">{label}</span>
      <select
        aria-label={label}
        value={language}
        onChange={handleChange}
        className="h-9 cursor-pointer appearance-none rounded-[10px] bg-bg-surface px-3 pr-8 typo-caption text-text-secondary outline-none transition-colors hover:bg-bg-elevated focus-visible:ring-2 focus-visible:ring-accent"
      >
        {LANGUAGE_OPTIONS.map((option) => (
          <option key={option.code} value={option.code}>
            {option.label}
          </option>
        ))}
      </select>
      <span
        aria-hidden="true"
        className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[10px] text-text-tertiary"
      >
        ▼
      </span>
    </label>
  );
}

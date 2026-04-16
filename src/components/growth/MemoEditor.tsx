"use client";

import { useTranslation } from "@/hooks/useTranslation";

interface Props {
  value: string;
  onChange: (v: string) => void;
}

const MAX_CHARS = 200;

export default function MemoEditor({ value, onChange }: Props) {
  const { t } = useTranslation();

  return (
    <div className="bg-[#f5f2eb] rounded-[3px] shadow-lg mx-auto max-w-[300px] min-h-[280px] flex flex-col">
      {/* 빈티지 노트 라인 효과 */}
      <div
        className="flex-1 m-3 relative"
        style={{
          backgroundImage: "repeating-linear-gradient(transparent, transparent 23px, #d4c9b8 23px, #d4c9b8 24px)",
          backgroundPosition: "0 8px",
        }}
      >
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value.slice(0, MAX_CHARS))}
          placeholder={t("playground.capture.memo")}
          className="w-full h-full min-h-[220px] bg-transparent resize-none outline-none text-[#2a2a2a] leading-[24px] pt-[9px] typo-body"
          style={{
            fontFamily: "'April16', sans-serif",
            caretColor: "#2a2a2a",
          }}
        />
      </div>

      {/* 글자 수 */}
      <div className="px-4 pb-2 text-right">
        <span
          className="font-mono tabular-nums"
          style={{
            fontSize: 10,
            color: value.length > MAX_CHARS * 0.9 ? "#c44" : "#a09080",
          }}
        >
          {value.length}/{MAX_CHARS}
        </span>
      </div>
    </div>
  );
}

"use client";

import { type ComponentType, type SVGProps, useState, useEffect } from "react";

interface PixelIconProps {
  name: string;
  size?: number;
  className?: string;
  color?: string;
}

// 동적 import 캐시
const iconCache = new Map<string, ComponentType<SVGProps<SVGSVGElement>>>();
const loadingCache = new Map<string, Promise<ComponentType<SVGProps<SVGSVGElement>>>>();

function loadIcon(name: string): Promise<ComponentType<SVGProps<SVGSVGElement>>> {
  if (!name) return Promise.resolve(() => null) as never;
  if (!loadingCache.has(name)) {
    loadingCache.set(
      name,
      import(`pixelarticons/react/${name}.js`)
        .then((mod) => {
          const component = (mod[name] || mod.default) as ComponentType<SVGProps<SVGSVGElement>>;
          iconCache.set(name, component);
          return component;
        })
        .catch(() => {
          // 알 수 없는 아이콘 이름 — 레거시 저장 데이터나 신규 이름에 대비해
          // 크래시 대신 invisible 컴포넌트로 폴백한다.
          if (typeof window !== "undefined" && process.env.NODE_ENV !== "production") {
             
            console.warn(`[PixelIcon] missing pixelarticons icon: "${name}"`);
          }
          const Fallback: ComponentType<SVGProps<SVGSVGElement>> = () => null;
          iconCache.set(name, Fallback);
          return Fallback;
        })
    );
  }
  return loadingCache.get(name)!;
}

export default function PixelIcon({
  name,
  size = 24,
  className = "",
  color = "currentColor",
}: PixelIconProps) {
  // Icon 은 state 로 보관 (렌더 중 캐시 파생은 react-hooks/static-components 위반).
  // name 변경 시 캐시 동기화는 렌더 단계 prev-비교 setState 패턴, 비동기 로드 완료는
  // then 콜백에서 반영 (effect 내 동기 setState 없음).
  const [Icon, setIcon] = useState<ComponentType<SVGProps<SVGSVGElement>> | null>(
    () => iconCache.get(name) ?? null
  );
  const [prevName, setPrevName] = useState(name);
  if (prevName !== name) {
    setPrevName(name);
    setIcon(() => iconCache.get(name) ?? null);
  }

  useEffect(() => {
    if (!name || iconCache.has(name)) return;
    let cancelled = false;
    loadIcon(name).then((component) => {
      if (!cancelled) setIcon(() => component);
    });
    return () => {
      cancelled = true;
    };
  }, [name]);

  if (!Icon) {
    return <span style={{ width: size, height: size, display: "inline-block" }} />;
  }

  return (
    <Icon
      width={size}
      height={size}
      className={className}
      style={{ color }}
    />
  );
}

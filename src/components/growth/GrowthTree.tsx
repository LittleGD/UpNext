"use client";

import { useEffect, useRef, useState, useMemo } from "react";
import { useGrowthStore } from "@/store/useGrowthStore";
import { useGameStore } from "@/store/useGameStore";
import { getTreeStage, type TreeStage } from "@/types/growth";
import { useTranslation } from "@/hooks/useTranslation";
import PixelIcon from "@/components/icons/PixelIcon";
import TreePhotoNode from "./TreePhotoNode";
import type { DictKey } from "@/i18n";

// === 도트 색상 ===
const TRUNK_COLOR = [128, 128, 128] as const;     // --text-tertiary
const BRANCH_COLOR = [72, 72, 72] as const;        // dark branch base
const LEAF_PRIMARY = [205, 245, 100] as const;     // --accent-primary
const LEAF_CYAN = [155, 240, 225] as const;        // --accent-cyan
const GROUND_COLOR = [40, 40, 40] as const;

// === 나무 구조 생성 ===
interface Dot {
  x: number;
  y: number;
  size: number;
  color: readonly [number, number, number];
  alpha: number;
}

interface Branch {
  dots: Dot[];
  /** 사진 노드가 붙을 앵커 좌표 (가지 끝 근처) */
  anchorX: number;
  anchorY: number;
}

function generateTree(
  stage: TreeStage,
  w: number,
  h: number,
): { trunk: Dot[]; branches: Branch[]; leaves: Dot[]; ground: Dot[] } {
  const cx = Math.floor(w / 2);
  const bottom = h - 30;
  const trunk: Dot[] = [];
  const branches: Branch[] = [];
  const leaves: Dot[] = [];
  const ground: Dot[] = [];

  // 지면 도트
  for (let i = -40; i <= 40; i += 3) {
    ground.push({
      x: cx + i, y: bottom + 2, size: 1,
      color: GROUND_COLOR, alpha: 0.3 + Math.abs(i) * 0.005,
    });
  }

  if (stage === "seed") {
    // 씨앗: 작은 점 하나
    trunk.push({ x: cx, y: bottom - 4, size: 3, color: TRUNK_COLOR, alpha: 0.6 });
    trunk.push({ x: cx, y: bottom, size: 2, color: TRUNK_COLOR, alpha: 0.4 });
    return { trunk, branches, leaves, ground };
  }

  // 줄기 높이 (단계별)
  const trunkHeights: Record<TreeStage, number> = {
    seed: 0, sprout: 30, sapling: 60, young: 100, mature: 140, ancient: 180,
  };
  const trunkH = trunkHeights[stage];
  const trunkTop = bottom - trunkH;

  // 줄기 도트
  for (let y = bottom; y >= trunkTop; y -= 2) {
    const thickness = stage === "sprout" ? 1 : stage === "sapling" ? 1 : 2;
    for (let dx = -thickness; dx <= thickness; dx++) {
      trunk.push({
        x: cx + dx, y, size: 1,
        color: TRUNK_COLOR,
        alpha: 0.5 + (bottom - y) / trunkH * 0.3,
      });
    }
  }

  // 가지 구성
  const branchConfigs: Record<TreeStage, { count: number; lenRange: [number, number] }> = {
    seed: { count: 0, lenRange: [0, 0] },
    sprout: { count: 2, lenRange: [12, 18] },
    sapling: { count: 4, lenRange: [18, 30] },
    young: { count: 6, lenRange: [25, 40] },
    mature: { count: 8, lenRange: [30, 50] },
    ancient: { count: 10, lenRange: [35, 60] },
  };

  const { count: branchCount, lenRange } = branchConfigs[stage];

  // 골든 앵글 기반 가지 배치 (결정적)
  for (let i = 0; i < branchCount; i++) {
    const t = (i + 1) / (branchCount + 1);
    const branchY = Math.floor(trunkTop + trunkH * (1 - t) * 0.85);
    const dir = i % 2 === 0 ? 1 : -1;
    // 시드 기반 길이 결정
    const seed = (i * 137.5) % 1;
    const len = Math.floor(lenRange[0] + seed * (lenRange[1] - lenRange[0]));
    const angle = -0.3 - seed * 0.4; // 약간 위쪽으로

    const branchDots: Dot[] = [];
    let endX = cx;
    let endY = branchY;

    for (let d = 0; d < len; d += 2) {
      const px = Math.floor(cx + dir * d * Math.cos(angle));
      const py = Math.floor(branchY + d * Math.sin(angle));
      const progress = d / len;
      branchDots.push({
        x: px, y: py, size: 1,
        color: BRANCH_COLOR,
        alpha: 0.4 + (1 - progress) * 0.3,
      });
      endX = px;
      endY = py;

      // 잎 도트 (가지 중간~끝에 밀집)
      if (progress > 0.3) {
        const leafCount = stage === "ancient" ? 3 : stage === "mature" ? 2 : 1;
        for (let l = 0; l < leafCount; l++) {
          const lSeed = (d * 73 + l * 31 + i * 17) % 100 / 100;
          const lx = px + Math.floor((lSeed - 0.5) * 8);
          const ly = py + Math.floor((((d * 47 + l * 19) % 100) / 100 - 0.5) * 8);
          const isAccent = lSeed > 0.8;
          leaves.push({
            x: lx, y: ly, size: 1,
            color: isAccent ? LEAF_CYAN : LEAF_PRIMARY,
            alpha: 0.3 + lSeed * 0.5,
          });
        }
      }
    }

    branches.push({ dots: branchDots, anchorX: endX, anchorY: endY });
  }

  // sprout에는 줄기 꼭대기에 작은 잎 추가
  if (stage === "sprout") {
    for (let i = 0; i < 4; i++) {
      const seed = (i * 137.5) % 1;
      leaves.push({
        x: cx + Math.floor((seed - 0.5) * 10),
        y: trunkTop - 2 + Math.floor(((i * 47) % 4)),
        size: 1,
        color: i < 3 ? LEAF_PRIMARY : LEAF_CYAN,
        alpha: 0.5 + seed * 0.3,
      });
    }
  }

  return { trunk, branches, leaves, ground };
}

// === 컴포넌트 ===
export default function GrowthTree() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const photoMetas = useGrowthStore((s) => s.photoMetas);
  const progress = useGameStore((s) => s.progress);
  const { t } = useTranslation();

  const totalCompletions = progress.totalDaysCompleted;
  const stage = getTreeStage(totalCompletions);

  const stageLabel = t(`playground.tree.stage.${stage}` as DictKey);

  // 캔버스 크기
  const [dims, setDims] = useState({ w: 360, h: 400 });

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const obs = new ResizeObserver((entries) => {
      const { width } = entries[0].contentRect;
      const h = stage === "seed" ? 200 : stage === "sprout" ? 260 : stage === "sapling" ? 320 : 400;
      setDims({ w: Math.floor(width), h });
    });
    obs.observe(el);
    return () => obs.disconnect();
  }, [stage]);

  // 나무 데이터 (dims/stage 변경 시 재생성)
  const treeData = useMemo(
    () => generateTree(stage, dims.w, dims.h),
    [stage, dims.w, dims.h],
  );

  // 캔버스 렌더링
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = dims.w * dpr;
    canvas.height = dims.h * dpr;
    canvas.style.width = `${dims.w}px`;
    canvas.style.height = `${dims.h}px`;
    ctx.scale(dpr, dpr);

    ctx.clearRect(0, 0, dims.w, dims.h);

    const drawDot = (d: Dot) => {
      const [r, g, b] = d.color;
      ctx.fillStyle = `rgba(${r},${g},${b},${d.alpha})`;
      ctx.fillRect(d.x, d.y, d.size, d.size);
    };

    // 렌더 순서: 지면 → 줄기 → 가지 → 잎
    treeData.ground.forEach(drawDot);
    treeData.trunk.forEach(drawDot);
    treeData.branches.forEach((b) => b.dots.forEach(drawDot));
    treeData.leaves.forEach(drawDot);
  }, [treeData, dims]);

  return (
    <div className="space-y-4">
      {/* 단계 라벨 */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <PixelIcon name="Leaf" size={16} color="var(--accent-primary)" />
          <span className="typo-caption text-text-secondary">{stageLabel}</span>
        </div>
        <span className="typo-micro text-text-tertiary">
          {totalCompletions} days
        </span>
      </div>

      {/* 나무 캔버스 + 사진 노드 */}
      <div ref={containerRef} className="relative w-full">
        <canvas
          ref={canvasRef}
          className="w-full"
          style={{ height: dims.h }}
          aria-hidden="true"
        />

        {/* 사진 노드 오버레이 */}
        {treeData.branches.map((branch, bIdx) => {
          const photos = photoMetas.filter(
            (m) => m.treePosition?.branchIndex === bIdx,
          );
          return photos.map((meta) => (
            <TreePhotoNode
              key={meta.id}
              meta={meta}
              x={branch.anchorX}
              y={branch.anchorY}
            />
          ));
        })}

        {/* 빈 나무 메시지 */}
        {stage === "seed" && photoMetas.length === 0 && (
          <div className="absolute inset-0 flex items-center justify-center">
            <p className="typo-body text-text-tertiary text-center whitespace-pre-line mt-12">
              {t("playground.tree.empty")}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

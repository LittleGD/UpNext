"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import { springSnappy } from "@/lib/motion";
import { useGrowthStore } from "@/store/useGrowthStore";
import { useSound } from "@/hooks/useSound";
import { useTranslation } from "@/hooks/useTranslation";
import { cardTitle } from "@/i18n";
import PolaroidFrame from "./PolaroidFrame";
import SignatureCanvas from "./SignatureCanvas";
import StickerLayer from "./StickerLayer";
import DecorationToolbar, { INK_COLORS } from "./DecorationToolbar";
import PhotoDetailModal from "./PhotoDetailModal";
import PixelIcon from "@/components/icons/PixelIcon";
import UpNextLogoMark from "./UpNextLogoMark";
import type { ChallengeCard } from "@/types/card";
import type { PhotoMeta, Sticker } from "@/types/growth";

interface Props {
  card: ChallengeCard;
  onComplete: () => void;
}

const RAINBOW = ["#FF0000", "#FF8000", "#FFD700", "#00C853", "#2196F3", "#7B1FA2"];

export default function PhotoCaptureModal({ card, onComplete }: Props) {
  const savePhoto = useGrowthStore((s) => s.savePhoto);
  const cancelCapture = useGrowthStore((s) => s.cancelCapture);
  const capturePhase = useGrowthStore((s) => s.capturePhase);
  const setCapturePhase = useGrowthStore((s) => s.setCapturePhase);
  const photoCount = useGrowthStore((s) => s.photoMetas.length);
  const { play } = useSound();
  const { t, language } = useTranslation();

  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const [captureTimestamp, setCaptureTimestamp] = useState(0);
  const [signatureData, setSignatureData] = useState<string | null>(null);
  // capture 단계의 데코레이션 상태 — 사인 잉크 색 + 굵기 + 스티커 배열
  const [penColor, setPenColor] = useState<string>(INK_COLORS[0]);
  const [penWidth, setPenWidth] = useState<number>(1.0); // multiplier
  const [stickers, setStickers] = useState<Sticker[]>([]);
  // Done 후 디테일 뷰 (savePhoto 가 반환한 meta 를 set 하면 PhotoDetailModal 렌더)
  const [savedMeta, setSavedMeta] = useState<PhotoMeta | null>(null);
  const [showFlash, setShowFlash] = useState(false);
  const [flashOn, setFlashOn] = useState(false);
  const [exposureEV, setExposureEV] = useState(0); // -2..+2 (EV stops)
  const [isExposureDragging, setIsExposureDragging] = useState(false);
  // 드래그로 한 번이라도 건드리면 자동 샘플 중단 → 사용자 의도 우선
  const [isExposureManual, setIsExposureManual] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const meterCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const exposureTrackRef = useRef<HTMLDivElement>(null);
  const exposureDragStartRef = useRef({ x: 0, ev: 0 });
  // 연속 pointermove 가 React 렌더 사이에 들어오므로 ref 로 즉시 갱신
  const isExposureDraggingRef = useRef(false);
  // Phase 12 R7 — 카메라 접근 실패 상태. 권한 거부 / 기기 미지원 / 하드웨어
  //   오류 등 모든 케이스. 기존엔 silent catch 였으나 유저는 "뷰파인더 검정"
  //   만 보고 무슨 일인지 모름. 이 플래그로 명시적 안내 + 파일 선택 CTA 노출.
  const [cameraError, setCameraError] = useState(false);

  // 카메라 시작
  useEffect(() => {
    if (capturePhase !== "camera") return;

    let mounted = true;
    setCameraError(false);
    const startCamera = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "environment", width: { ideal: 800 }, height: { ideal: 800 } },
        });
        if (!mounted) { stream.getTracks().forEach((t) => t.stop()); return; }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
        }
      } catch {
        // 카메라 접근 실패 → UI 상태 세팅, shutter 탭 시 파일 input 으로 fallback.
        if (mounted) setCameraError(true);
      }
    };
    startCamera();

    return () => {
      mounted = false;
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    };
  }, [capturePhase]);

  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  // 노출계 바늘 — 실제 비디오 프레임의 평균 휘도를 EV 오프셋으로 환산해
  // 바늘이 실시간으로 움직이게 한다 (Canon AE-1 / Nikon FM 스타일).
  useEffect(() => {
    if (capturePhase !== "camera") {
      setExposureEV(0);
      setIsExposureManual(false);
      return;
    }
    // 사용자가 EXPOSURE 다이얼을 건드렸으면 자동 샘플 중단 — 수동 값 우선
    if (isExposureManual) return;

    let raf = 0;
    let cancelled = false;
    let current = 0; // 부드러운 lerp 을 위한 내부 상태

    const sample = () => {
      if (cancelled) return;
      const video = videoRef.current;
      // readyState >= 2 (HAVE_CURRENT_DATA) 여야 frame 을 draw 가능
      if (!video || video.readyState < 2 || !video.videoWidth) {
        raf = requestAnimationFrame(sample);
        return;
      }

      if (!meterCanvasRef.current) {
        const c = document.createElement("canvas");
        c.width = 32;
        c.height = 32;
        meterCanvasRef.current = c;
      }
      const canvas = meterCanvasRef.current;
      const ctx = canvas.getContext("2d", { willReadFrequently: true });
      if (!ctx) {
        raf = requestAnimationFrame(sample);
        return;
      }

      let target = current;
      try {
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);
        let sum = 0;
        const pixelCount = data.length / 4;
        for (let i = 0; i < data.length; i += 4) {
          // ITU-R BT.601 luma
          sum += 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
        }
        const avg = sum / pixelCount; // 0..255
        // 중위 밝기 = 128 (EV 0). log2(avg/128) = 오프셋 (full stops)
        // 조명 환경에서 실내는 보통 70–90, 야외는 180+ 라 ±2 클램프로 충분.
        const evRaw = avg > 1 ? Math.log2(avg / 128) : -4;
        target = Math.max(-2, Math.min(2, evRaw));
      } catch {
        // getImageData 실패시 무시 (타 오리진 등 — 여기선 같은 오리진이라 사실상 발생 안 함)
      }

      // 15% lerp — 바늘이 바로 튀지 않고 물리적으로 스며들 듯 움직임
      current = current + (target - current) * 0.15;
      setExposureEV(current);
      raf = requestAnimationFrame(sample);
    };

    raf = requestAnimationFrame(sample);
    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
    };
  }, [capturePhase, isExposureManual]);

  // EXPOSURE 드래그 핸들러 — 바 너비의 1/4 당 1 EV stop (−2..+2 클램프)
  // isExposureDraggingRef 로 동기 추적 — pointermove 가 렌더 사이에 여러 번
  // 들어오므로 state closure 로는 항상 stale false 를 읽어 early-return 하는
  // 버그가 있었다.
  const handleExposurePointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    const track = exposureTrackRef.current;
    if (!track) return;
    track.setPointerCapture(e.pointerId);
    exposureDragStartRef.current = { x: e.clientX, ev: exposureEV };
    isExposureDraggingRef.current = true;
    setIsExposureDragging(true);
    setIsExposureManual(true);
  }, [exposureEV]);

  const handleExposurePointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (!isExposureDraggingRef.current) return;
    const track = exposureTrackRef.current;
    if (!track) return;
    const rect = track.getBoundingClientRect();
    const dx = e.clientX - exposureDragStartRef.current.x;
    const dEV = dx / (rect.width / 4); // 바 폭의 1/4 = 1 stop
    const next = Math.max(-2, Math.min(2, exposureDragStartRef.current.ev + dEV));
    setExposureEV(next);
  }, []);

  const handleExposurePointerUp = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    const track = exposureTrackRef.current;
    if (track && track.hasPointerCapture(e.pointerId)) {
      track.releasePointerCapture(e.pointerId);
    }
    isExposureDraggingRef.current = false;
    setIsExposureDragging(false);
  }, []);

  // 바늘 기하 — 피벗 (85,50) 고정, 길이 5.15, EV → 각도 (-22.5°/EV)
  // EV +2 (과노출) → θ = -45° (위로 향함, "+" 쪽)
  // EV  0 (정노출) → θ = 0° (우측 수평, "○" 쪽)
  // EV -2 (부족노출) → θ = +45° (아래로 향함, "−" 쪽)
  const needleAngleRad = -exposureEV * (Math.PI / 8);
  const needleLen = 5.15;
  const needleTipX = 85 + needleLen * Math.cos(needleAngleRad);
  const needleTipY = 50 + needleLen * Math.sin(needleAngleRad);

  // 사진 촬영 → 바로 ejecting 단계로 (재촬영 없음)
  const captureFromVideo = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    const canvas = document.createElement("canvas");
    const size = Math.min(video.videoWidth || 800, video.videoHeight || 800);
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d")!;
    const sx = (video.videoWidth - size) / 2;
    const sy = (video.videoHeight - size) / 2;

    // Phase 13 review Critical — flash/exposure UI 가 실제 capture 에 반영됨.
    //   이전: drawImage 전후 filter 미적용 → UI 에서 -2EV 로 맞춰도 결과 동일.
    //   수정:
    //   (1) exposureEV (-2..+2) 를 Math.pow(2, ev) brightness multiplier 로 변환.
    //       0 EV = 1.0, +1 EV = 2.0, -1 EV = 0.5 (카메라 노출 EV 수학).
    //   (2) flashOn 시 추가 brightness +15% + 흰색 오버레이 15% alpha 로 실제 발광.
    const exposureMult = Math.pow(2, exposureEV);
    const flashBoost = flashOn ? 1.15 : 1.0;
    const totalBrightness = exposureMult * flashBoost;
    if (Math.abs(totalBrightness - 1) > 0.01) {
      ctx.filter = `brightness(${totalBrightness.toFixed(3)})`;
    }
    ctx.drawImage(video, sx, sy, size, size, 0, 0, size, size);
    ctx.filter = "none";
    if (flashOn) {
      // 플래시는 반사광 흰 오버레이 추가 (15% alpha) — 필터만으로는 "반짝"
      //   느낌 약함.
      ctx.fillStyle = "rgba(255, 255, 255, 0.15)";
      ctx.fillRect(0, 0, size, size);
    }

    const dataUrl = canvas.toDataURL("image/jpeg", 0.85);

    setShowFlash(true);
    play("cameraShutter");
    setTimeout(() => setShowFlash(false), 200);

    const ts = Date.now();
    setCapturedImage(dataUrl);
    setCaptureTimestamp(ts);
    stopCamera();
    setCapturePhase("ejecting");

    setTimeout(() => play("polaroidSlide"), 400);
    setTimeout(() => setCapturePhase("polaroid"), 2500);
  }, [stopCamera, play, setCapturePhase, exposureEV, flashOn]);

  // 파일 선택 폴백
  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const ts = Date.now();
      setCapturedImage(reader.result as string);
      setCaptureTimestamp(ts);
      play("cameraShutter");
      setShowFlash(true);
      setTimeout(() => setShowFlash(false), 200);
      setCapturePhase("ejecting");
      setTimeout(() => play("polaroidSlide"), 400);
      setTimeout(() => setCapturePhase("polaroid"), 2500);
    };
    reader.readAsDataURL(file);
  }, [play, setCapturePhase]);

  // Done — 사진 저장 + 디테일 뷰 표시 (즉시 close 안 함)
  // savedMeta 가 set 되면 PhotoDetailModal 이 렌더되어 사용자가 바로 확인/편집 가능.
  // 디테일 뷰 close 시 onComplete (챌린지 완료 + 모달 닫기) 호출됨.
  //
  // Phase 13 review Critical — double-click 가드. 이전엔 await 중 재탭 시
  //   compressImage + savePhoto 2회 실행 → 같은 순간 두 id 로 중복 저장 +
  //   IndexedDB 블롭 2배. `isSaving` ref 로 in-flight lock.
  const isSavingRef = useRef(false);
  const [isSaving, setIsSaving] = useState(false);
  const handleDone = useCallback(async () => {
    if (!capturedImage || !signatureData) return;
    if (isSavingRef.current) return;
    isSavingRef.current = true;
    setIsSaving(true);
    try {
      const meta = await savePhoto(
        capturedImage,
        signatureData,
        "", // memo 는 capture 단계에서 입력 안 함 — detail 뷰에서 이어서 작성
        cardTitle(card, language),
        card.category,
        stickers,
      );
      play("collect");
      if (meta) setSavedMeta(meta);
      else onComplete(); // savePhoto 가 null 반환 (pendingCaptureCardId 없음)
    } finally {
      isSavingRef.current = false;
      setIsSaving(false);
    }
  }, [capturedImage, signatureData, stickers, savePhoto, card, language, play, onComplete]);

  // 스티커 추가 — position 주어지면 그 위치 (드래그-앤-드롭 결과), 없으면 중앙 (탭).
  // UpNext 로고는 항상 최상단 (zIndex 999), 다른 스티커는 시퀀셜.
  const handleAddSticker = useCallback(
    (type: "emoji" | "image", content: string, position?: { x: number; y: number }) => {
      setStickers((prev) => [
        ...prev,
        {
          id: `s_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
          type,
          content,
          x: position?.x ?? 50,
          y: position?.y ?? 50,
          rotation: (Math.random() - 0.5) * 20,
          scale: 1,
          zIndex: content === "upnext-logo" ? 999 : prev.length + 1,
        },
      ]);
    },
    [],
  );

  // 건너뛰기
  const handleSkip = useCallback(() => {
    stopCamera();
    cancelCapture();
    onComplete();
  }, [stopCamera, cancelCapture, onComplete]);

  // 닫기
  const handleClose = useCallback(() => {
    stopCamera();
    cancelCapture();
  }, [stopCamera, cancelCapture]);

  // Phase 13 review Critical — ESC + back button (popstate) 로 camera/ejecting
  //   phase 이탈 시 getUserMedia stream leak 방지. 이전엔 유저가 ESC 눌러도
  //   stream 이 살아있어 camera indicator 가 남음.
  //   savedMeta 가 있으면 detail 뷰라 handle 안 함 (detail 자체가 별도 close UX).
  useEffect(() => {
    if (savedMeta) return;
    if (capturePhase !== "camera" && capturePhase !== "ejecting") return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        handleClose();
      }
    };
    const onPopState = () => handleClose();
    window.addEventListener("keydown", onKey);
    window.addEventListener("popstate", onPopState);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("popstate", onPopState);
    };
  }, [capturePhase, handleClose, savedMeta]);

  // Portal mount 가드 (SSR safe)
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  // Phase 11a-fix — savePhoto 가 성공하면 savePhoto 가 capturePhase 를 "idle" 로
  //   set 하는데, 그 순간 이 early return 이 발동해서 PhotoDetailModal 까지 함께
  //   unmount 됨 → 유저가 detail 에서 onClose 를 누를 기회가 사라지고,
  //   결과적으로 onComplete 가 never fire → 챌린지 완료/XP 누락 버그.
  //   savedMeta 가 존재하면 이 early-return 을 건너뛰어 detail 뷰는 유지.
  if (!savedMeta && (capturePhase === "idle" || capturePhase === "saving")) return null;
  if (!mounted) return null;

  // ⚠ Portal 로 document.body 에 마운트 — 페이지 헤더 (sticky z-10) 의 stacking context
  // 를 escape. 로컬 마운트 시 z:60 이어도 헤더가 뚫고 올라옴.
  return createPortal(
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className={`fixed inset-0 z-[100] flex flex-col ${
          capturePhase === "camera" ? "bg-[#DCD5BC]" : "bg-black"
        }`}
      >
        {/* 헤더 — 카메라/이젝팅 시에는 숨김.
            Close 버튼: 아이콘 + "Close" 텍스트 (다른 모달과 일관성). */}
        {(capturePhase === "polaroid" || capturePhase === "memo") && (
          <div className="flex items-center justify-between px-4 pt-[calc(env(safe-area-inset-top)+12px)] pb-3">
            <button
              onClick={handleClose}
              className="flex items-center gap-1.5 px-2 py-1.5 rounded-md active:opacity-60 transition-opacity"
              aria-label="Close"
            >
              <PixelIcon name="Cancel" size={18} color="var(--text-secondary)" />
              <span className="typo-caption text-text-secondary">Close</span>
            </button>
            <h2 className="typo-body text-text-primary">{t("playground.capture.title")}</h2>
            <div className="w-[60px]" />
          </div>
        )}

        {/* 콘텐츠 */}
        <div className={`flex-1 flex flex-col items-center px-4 ${
          capturePhase === "ejecting"
            ? "justify-start pt-8"
            : "justify-center overflow-hidden"
        }`}>

          {/* ========== CAMERA PHASE — Figma node 340:2189 (정밀 구현) ========== */}
          {/* 모바일 기준 max-width 430px — 데스크탑/태블릿에서도 모바일 카메라 바디 크기 유지.
              세로는 inset-y-0 로 뷰포트 풀 스트레치, 가로는 max-w + mx-auto 로 중앙 정렬.
              좌우 여백은 outer wrapper 의 bg-[#DCD5BC] (카메라 바디 엣지색) 로 채워져 이음새 자연스러움. */}
          {capturePhase === "camera" && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="absolute inset-0 mx-auto max-w-[430px] flex flex-col items-center justify-between overflow-hidden"
              style={{
                paddingTop: "calc(env(safe-area-inset-top) + 80px)",
                paddingLeft: 8,
                paddingRight: 8,
                paddingBottom: 0,
                // Figma 스펙: 두 겹 그라디언트
                // Layer 1 (180deg, 20% alpha): #D7CFB1 → #C3BB9C (세로 어둠 오버레이)
                // Layer 2 (270deg): #DCD5BC → #EDE7D2 → #EDE7D2 → #DCD5BC (가로 중앙 하이라이트)
                background:
                  "linear-gradient(180deg, rgba(215,207,177,0.20) 0%, rgba(195,187,156,0.20) 100%), linear-gradient(270deg, #DCD5BC 0%, #EDE7D2 34.62%, #EDE7D2 67.31%, #DCD5BC 100%)",
              }}
            >
              {/* 상단 중앙 녹색 액센트 스트라이프 — top:-13px, 108×216 */}
              <div
                aria-hidden
                className="absolute left-1/2 -translate-x-1/2 pointer-events-none"
                style={{ top: -13, width: 108, height: 216, backgroundColor: "#cdf564" }}
              />

              {/* 필름 그레인 — 전체 바디에 은은하게 입히는 아날로그 입자감
                  baseFrequency 2.8 = 고해상도 미세 입자 (실제 ISO 400 필름 느낌)
                  multiply + overlay 2겹으로 깊이감 확보 */}
              <svg
                aria-hidden
                className="absolute inset-0 w-full h-full pointer-events-none"
                style={{ mixBlendMode: "multiply", opacity: 0.38 }}
              >
                <filter id="camera-grain-dark">
                  <feTurbulence
                    type="fractalNoise"
                    baseFrequency="2.8"
                    numOctaves="2"
                    stitchTiles="stitch"
                    seed="3"
                  />
                  <feColorMatrix
                    type="matrix"
                    values="0 0 0 0 0.25  0 0 0 0 0.22  0 0 0 0 0.15  0 0 0 0.9 0"
                  />
                </filter>
                <rect width="100%" height="100%" filter="url(#camera-grain-dark)" />
              </svg>
              <svg
                aria-hidden
                className="absolute inset-0 w-full h-full pointer-events-none"
                style={{ mixBlendMode: "screen", opacity: 0.22 }}
              >
                <filter id="camera-grain-light">
                  <feTurbulence
                    type="fractalNoise"
                    baseFrequency="2.8"
                    numOctaves="2"
                    stitchTiles="stitch"
                    seed="7"
                  />
                  <feColorMatrix
                    type="matrix"
                    values="0 0 0 0 1  0 0 0 0 0.96  0 0 0 0 0.88  0 0 0 0.6 0"
                  />
                </filter>
                <rect width="100%" height="100%" filter="url(#camera-grain-light)" />
              </svg>

              {/* ============ HEADER ROW — 로고 + CLOSE ============ */}
              <div
                className="relative flex items-center justify-between w-full overflow-clip"
                style={{ padding: 8 }}
              >
                <div style={{ width: 64.689, height: 24 }} className="relative">
                  <UpNextLogoMark width={64.689} color="#212727" />
                </div>
                <button
                  onClick={handleClose}
                  className="relative flex items-center justify-center active:scale-[0.97] active:brightness-90 transition-all"
                  style={{
                    width: 80,
                    height: 40,
                    border: "4px solid #000",
                    borderRadius: 8,
                    // 외곽 드롭섀도우 — 다른 컨트롤 프레임과 일관성
                    boxShadow: "0 2px 4px rgba(0,0,0,0.25)",
                  }}
                  aria-label="Close camera"
                >
                  {/* 이너 배경 — 수직 그라디언트로 몰드된 플라스틱 깊이감 */}
                  <span
                    aria-hidden
                    className="absolute inset-0 pointer-events-none"
                    style={{
                      background:
                        "linear-gradient(180deg, #2a2f2f 0%, #212727 55%, #161b1b 100%)",
                      borderRadius: 4,
                    }}
                  />
                  {/* CLOSE 텍스트 — 미묘한 양각 엠보스 (상단 하이라이트 + 하단 그림자) */}
                  <span
                    className="relative z-[1] whitespace-nowrap"
                    style={{
                      color: "#ffffff",
                      fontSize: 10,
                      fontWeight: 700,
                      letterSpacing: "0.04em",
                      lineHeight: "normal",
                      textShadow:
                        "0 1px 0 rgba(0,0,0,0.55), 0 -1px 0 rgba(255,255,255,0.06)",
                    }}
                  >
                    CLOSE
                  </span>
                  {/* 이너 하이라이트 + 하단 그림자 복합 섀도우 */}
                  <span
                    aria-hidden
                    className="absolute inset-0 pointer-events-none"
                    style={{
                      boxShadow:
                        "inset 0 4px 4px rgba(255,255,255,0.25), inset 0 -3px 3px rgba(0,0,0,0.35)",
                      borderRadius: 4,
                    }}
                  />
                </button>
              </div>

              {/* ============ VIEWFINDER — 이중 베젤 (Figma 340:2190 + 340:2191) ============ */}
              <div
                className="relative overflow-clip flex items-center justify-center"
                style={{
                  width: "100%",
                  maxWidth: 386,
                  aspectRatio: "1 / 1",
                  padding: 8,
                  // Figma: "Linear Gradient · 10%" (#ECE9DE → #46443E)
                  // 투명 보더 + dual background trick 으로 그라디언트 보더 구현
                  border: "2px solid transparent",
                  borderRadius: 32,
                  background:
                    "linear-gradient(transparent, transparent) padding-box, " +
                    "linear-gradient(180deg, rgba(236,233,222,0.1) 0%, rgba(70,68,62,0.1) 100%) border-box",
                  boxShadow: "0 0 4px 0 rgba(0,0,0,0.15)",
                }}
              >
                <div
                  className="relative w-full h-full overflow-clip"
                  style={{
                    // Figma 340:2191: 플랫 rgba(172,167,152,0.2) 세이지 — 외곽 크림 그라디언트 비침
                    backgroundColor: "rgba(172,167,152,0.2)",
                    border: "1px solid #b7ae91",
                    borderRadius: 24,
                    padding: 11,
                  }}
                >
                  <div
                    className="relative w-full h-full overflow-hidden"
                    style={{ backgroundColor: "#1a1d1e", borderRadius: 18 }}
                  >
                    <video
                      ref={videoRef}
                      autoPlay
                      playsInline
                      muted
                      className="w-full h-full object-cover"
                    />

                    {/* Phase 12 R7 — 카메라 접근 실패 시 검정 뷰파인더 위에
                         명시적 안내 overlay. 탭 시 파일 선택으로 이동.
                         aria-live="polite" 로 SR 사용자에게도 상태 전달. */}
                    {cameraError && (
                      <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        aria-live="polite"
                        className="absolute inset-0 flex flex-col items-center justify-center gap-2 px-5 text-center active:scale-[0.98] transition-transform"
                        style={{
                          background: "rgba(26, 29, 30, 0.85)",
                          color: "#ECE9DE",
                          borderRadius: 18,
                          zIndex: 2,
                        }}
                      >
                        <span
                          style={{
                            fontSize: 14,
                            fontWeight: 600,
                            letterSpacing: "0.02em",
                          }}
                        >
                          카메라에 접근할 수 없어요
                        </span>
                        <span
                          style={{
                            fontSize: 11,
                            opacity: 0.75,
                            lineHeight: 1.4,
                          }}
                        >
                          탭하면 갤러리에서 사진을 선택할 수 있어요
                        </span>
                      </button>
                    )}

                    {/* 초점 스크린 그레인 — 매트 스크린의 미세 노이즈 */}
                    <svg
                      aria-hidden
                      className="absolute inset-0 w-full h-full pointer-events-none"
                      style={{ mixBlendMode: "overlay", opacity: 0.28, borderRadius: 18 }}
                    >
                      <filter id="vf-matte-grain">
                        <feTurbulence type="fractalNoise" baseFrequency="2.4" numOctaves="2" stitchTiles="stitch" />
                        <feColorMatrix type="matrix" values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 0 0.45 0" />
                      </filter>
                      <rect width="100%" height="100%" filter="url(#vf-matte-grain)" />
                    </svg>

                    {/* 비네트 — 필름 파인더의 자연스러운 어둠 (엣지 인셋) */}
                    <div
                      aria-hidden
                      className="absolute inset-0 pointer-events-none"
                      style={{
                        boxShadow: "inset 0 0 56px rgba(0,0,0,0.45), inset 0 0 12px rgba(0,0,0,0.28)",
                        borderRadius: 18,
                      }}
                    />
                    {/* 광학 원형 비네트 — 아이피스 광학 가장자리의 둥근 어둠 (레이디얼) */}
                    <div
                      aria-hidden
                      className="absolute inset-0 pointer-events-none"
                      style={{
                        background:
                          "radial-gradient(ellipse at center, transparent 38%, rgba(0,0,0,0.18) 68%, rgba(0,0,0,0.48) 92%, rgba(0,0,0,0.62) 100%)",
                        borderRadius: 18,
                      }}
                    />

                    {/* ========== 필름 카메라 광학 파인더 오버레이 ========== */}
                    <svg
                      aria-hidden
                      className="absolute inset-0 w-full h-full pointer-events-none"
                      viewBox="0 0 100 100"
                      preserveAspectRatio="none"
                    >
                      {/* 필름 프레임 경계선 — 35mm 프레임 라인 (3:2 비율 가이드, 은은하게) */}
                      <g stroke="rgba(255,255,255,0.22)" strokeWidth="0.25" fill="none">
                        <rect x="6" y="16" width="88" height="68" />
                      </g>

                      {/* 중앙 스플릿 이미지 원 + 마이크로프리즘 칼라 */}
                      {/* 외곽 마이크로프리즘 링 (점각 패턴) */}
                      <g fill="rgba(255,255,255,0.2)">
                        {Array.from({ length: 48 }, (_, i) => {
                          const angle = (i / 48) * Math.PI * 2;
                          const rInner = 6.2;
                          const cx = 50 + Math.cos(angle) * rInner;
                          const cy = 50 + Math.sin(angle) * rInner;
                          return <circle key={i} cx={cx} cy={cy} r="0.28" />;
                        })}
                      </g>
                      <g fill="rgba(255,255,255,0.15)">
                        {Array.from({ length: 56 }, (_, i) => {
                          const angle = ((i + 0.5) / 56) * Math.PI * 2;
                          const rOuter = 7.6;
                          const cx = 50 + Math.cos(angle) * rOuter;
                          const cy = 50 + Math.sin(angle) * rOuter;
                          return <circle key={i} cx={cx} cy={cy} r="0.22" />;
                        })}
                      </g>

                      {/* 스플릿 이미지 원 — 수평 반으로 나뉜 초점 보조 */}
                      <g stroke="rgba(255,255,255,0.55)" strokeWidth="0.32" fill="none">
                        <circle cx="50" cy="50" r="4.2" />
                        {/* 수평 스플릿 라인 */}
                        <line x1="45.8" y1="50" x2="54.2" y2="50" strokeWidth="0.28" />
                      </g>

                      {/* 우측 노출 미터 — 세로 스케일 + 바늘 (Canon AE-1 / Nikon FM 스타일) */}
                      <g stroke="rgba(255,255,255,0.45)" strokeWidth="0.2">
                        {/* 세로 메인 라인 */}
                        <line x1="90" y1="32" x2="90" y2="68" />
                        {/* 틱마크 — +2, +1, 0(긴틱), -1, -2 */}
                        <line x1="88.5" y1="32" x2="90" y2="32" />
                        <line x1="89" y1="41" x2="90" y2="41" />
                        <line x1="87.5" y1="50" x2="90" y2="50" strokeWidth="0.3" />
                        <line x1="89" y1="59" x2="90" y2="59" />
                        <line x1="88.5" y1="68" x2="90" y2="68" />
                      </g>
                      {/* 바늘 — 실제 장면 밝기에 반응하는 노출 계측기 */}
                      <g stroke="rgba(255,255,255,0.75)" strokeWidth="0.42" strokeLinecap="round">
                        <line
                          x1="85"
                          y1="50"
                          x2={needleTipX.toFixed(2)}
                          y2={needleTipY.toFixed(2)}
                          style={{ transition: "none" }}
                        />
                      </g>
                      <g fill="rgba(255,255,255,0.75)">
                        <circle cx="85" cy="50" r="0.55" />
                      </g>
                    </svg>

                    {/* ========== 우측 노출 스케일 라벨 (파인더 우측 광학 스크린 느낌) ========== */}
                    <div
                      className="absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none flex flex-col items-center tabular-nums"
                      style={{
                        fontFamily: "'Times New Roman', serif",
                        color: "rgba(255,255,255,0.55)",
                        fontSize: 7,
                        letterSpacing: "0.02em",
                        textShadow: "0 1px 1.5px rgba(0,0,0,0.9)",
                        gap: 9,
                      }}
                    >
                      <span>+</span>
                      <span style={{ fontSize: 8, fontWeight: 700 }}>○</span>
                      <span>−</span>
                    </div>

                    {/* 플래시 */}
                    {showFlash && (
                      <motion.div
                        initial={{ opacity: 1 }}
                        animate={{ opacity: 0 }}
                        transition={{ duration: 0.2 }}
                        className="absolute inset-0 bg-white z-10"
                      />
                    )}
                  </div>
                </div>
                {/* 바깥 베젤 이너 하이라이트 */}
                <span
                  aria-hidden
                  className="absolute inset-0 pointer-events-none"
                  style={{
                    boxShadow: "inset 0 4px 4px rgba(255,255,255,0.25)",
                    borderRadius: 32,
                  }}
                />
              </div>

              {/* ============ CONTROLS SECTION — 하나의 움푹 들어간 컨트롤 트레이 ============ */}
              <div
                className="relative flex flex-col items-stretch w-full"
                style={{
                  gap: 8,
                  padding: "10px 12px 12px",
                  borderRadius: 14,
                  // 바디보다 살짝 어두운 톤 (트레이가 움푹 들어간 효과)
                  backgroundColor: "rgba(70, 68, 62, 0.06)",
                  // 상단 인셋 섀도우 (움푹) + 하단 1px 화이트 라이트 (바디 플러시 엣지)
                  boxShadow:
                    "inset 0 2px 3px rgba(0,0,0,0.15), inset 0 -1px 0 rgba(255,255,255,0.3), 0 0 0 0.5px rgba(70,68,62,0.15)",
                }}
              >
                {/* ── ROW 1: FLASH 토글 (좌) + SHUTTER 버튼 (우, flex-1) ── */}
                <div
                  className="flex items-center justify-center w-full overflow-clip"
                  style={{ gap: 16, padding: "4px 0 0" }}
                >
                  {/* FLASH 그룹 (label + toggle + OFF/ON labels) */}
                  <div className="flex flex-col items-center justify-center" style={{ gap: 4 }}>
                    <p
                      className="whitespace-nowrap text-center"
                      style={{ color: "#212328", fontSize: 10, fontWeight: 700, lineHeight: "normal" }}
                    >
                      FLASH
                    </p>
                    <button
                      onClick={() => setFlashOn((v) => !v)}
                      className="relative flex items-center justify-between active:opacity-80 transition-opacity"
                      style={{
                        width: 80,
                        height: 40,
                        border: "4px solid #000",
                        borderRadius: 8,
                        padding: 4,
                      }}
                      aria-pressed={flashOn}
                      aria-label={flashOn ? "Flash on" : "Flash off"}
                    >
                      {/* 통짜 리브 그릴 트랙 — 버튼 내부 전체 */}
                      <span
                        aria-hidden
                        className="absolute inset-0 pointer-events-none overflow-hidden"
                        style={{
                          backgroundColor: "#434039",
                          backgroundImage:
                            // 수직 리브: 0.5px 하이라이트 릿지 + 1.5px 면 + 1px 섀도우 밸리
                            "repeating-linear-gradient(90deg, rgba(255,255,255,0.06) 0 0.5px, rgba(0,0,0,0) 0.5px 2px, rgba(0,0,0,0.45) 2px 3px)",
                          borderRadius: 4,
                          // 트랙이 버튼 바디 안으로 살짝 움푹 들어간 느낌
                          boxShadow:
                            "inset 0 2px 3px rgba(0,0,0,0.4), inset 0 -1px 1px rgba(255,255,255,0.08)",
                        }}
                      />
                      {/* 슬라이드 토글 놉 — 아이보리 플라스틱, 리브 트랙 위를 활주 */}
                      <motion.span
                        aria-hidden
                        className="absolute pointer-events-none"
                        style={{
                          top: 2,
                          height: "calc(100% - 4px)",
                          width: "calc(50% - 4px)",
                          zIndex: 2,
                        }}
                        initial={false}
                        animate={{
                          left: flashOn ? "calc(50% + 2px)" : "2px",
                        }}
                        transition={{
                          type: "spring",
                          stiffness: 520,
                          damping: 32,
                          mass: 0.55,
                        }}
                      >
                        <span
                          className="relative flex items-center justify-center w-full h-full"
                          style={{
                            // 아이보리 플라스틱 놉 — 상단 밝고 하단 가라앉는 수직 그라디언트
                            background:
                              "linear-gradient(180deg, #f6f1dc 0%, #ede7d2 55%, #cfc6a6 100%)",
                            borderRadius: 3,
                            border: "1px solid #7d7660",
                            // 상단 하이라이트 + 하단 그림자 + 외곽 드롭섀도우 (리브 트랙 위에 떠있음)
                            boxShadow:
                              "inset 0 1px 0 rgba(255,255,255,0.7), inset 0 -1px 0 rgba(0,0,0,0.18), 0 2px 4px rgba(0,0,0,0.5), 0 0 0 0.5px rgba(0,0,0,0.2)",
                          }}
                        >
                          {/* Zap 아이콘 — 아이보리 놉 위에 어두운 색 */}
                          <span
                            className="relative z-[1]"
                            style={{ color: "#212727" }}
                          >
                            <PixelIcon name="Zap" size={12} color="currentColor" />
                          </span>
                        </span>
                      </motion.span>
                      {/* 버튼 전체 이너 하이라이트 */}
                      <span
                        aria-hidden
                        className="absolute inset-0 pointer-events-none"
                        style={{
                          boxShadow: "inset 0 4px 4px rgba(255,255,255,0.25)",
                          borderRadius: 4,
                        }}
                      />
                    </button>
                    <div
                      className="flex items-start justify-between text-center w-full"
                      style={{ color: "rgba(33,35,40,0.4)", fontSize: 10, fontWeight: 700, lineHeight: "normal" }}
                    >
                      <span>OFF</span>
                      <span>ON</span>
                    </div>
                  </div>

                  {/* SHUTTER 그룹 (label + button, flex-1) */}
                  <div
                    className="flex flex-col items-center justify-center"
                    style={{ flex: 1, minWidth: 0, gap: 4 }}
                  >
                    <p
                      className="whitespace-nowrap text-center"
                      style={{ color: "#212328", fontSize: 10, fontWeight: 700, lineHeight: "normal" }}
                    >
                      SHUTTER
                    </p>
                    <button
                      onClick={() => {
                        if (streamRef.current) captureFromVideo();
                        else fileInputRef.current?.click();
                      }}
                      className="relative flex flex-col items-center justify-center overflow-clip active:scale-[0.98] transition-transform"
                      style={{
                        width: "100%",
                        height: 80,
                        padding: 4,
                        // Figma "Linear Gradient · 10%" (#ECE9DE → #46443E) — 바깥 림 라이트
                        border: "2px solid transparent",
                        borderRadius: 9999,
                        background:
                          "linear-gradient(transparent, transparent) padding-box, " +
                          "linear-gradient(180deg, rgba(236,233,222,0.1) 0%, rgba(70,68,62,0.1) 100%) border-box",
                        boxShadow: "0 0 4px 0 rgba(0,0,0,0.15)",
                      }}
                      aria-label="Take photo"
                    >
                      {/* 내부 red1 — border #232829 (다크 아웃라인) */}
                      <div
                        className="relative flex flex-col items-start flex-1 w-full"
                        style={{
                          backgroundColor: "#ca3024",
                          border: "1px solid #232829",
                          borderRadius: 9999,
                          padding: 4,
                        }}
                      >
                        {/* 내부 red2 — Figma "Linear Gradient · 50%" (#E38F7C → #871D14)
                            피치 하이라이트 → 다크 레드 쉐이드 그라디언트 보더 */}
                        <div
                          className="flex-1 w-full"
                          style={{
                            border: "2px solid transparent",
                            borderRadius: 9999,
                            background:
                              "linear-gradient(#ca3024, #ca3024) padding-box, " +
                              "linear-gradient(180deg, rgba(227,143,124,0.5) 0%, rgba(135,29,20,0.5) 100%) border-box",
                          }}
                        />
                      </div>
                      <span
                        aria-hidden
                        className="absolute inset-0 pointer-events-none"
                        style={{
                          boxShadow: "inset 0 4px 4px rgba(255,255,255,0.25)",
                          borderRadius: 9999,
                        }}
                      />
                    </button>
                    {/* 하단 스페이서 — FLASH 그룹의 OFF/ON 라벨 행과 매칭해서 버튼 센터 정렬 */}
                    <div
                      aria-hidden
                      className="flex items-start justify-between text-center w-full"
                      style={{ fontSize: 10, fontWeight: 700, lineHeight: "normal", visibility: "hidden" }}
                    >
                      <span>OFF</span>
                      <span>ON</span>
                    </div>
                  </div>
                </div>

                {/* ── ROW 2: EXPOSURE 라벨 + 리브드 바 ── */}
                <div
                  className="flex items-center w-full overflow-clip"
                  style={{ gap: 8, padding: "0 0 2px" }}
                >
                  <p
                    className="whitespace-nowrap text-center shrink-0"
                    style={{ color: "#212328", fontSize: 10, fontWeight: 700, lineHeight: "normal" }}
                  >
                    EXPOSURE
                  </p>
                  <div
                    ref={exposureTrackRef}
                    className="relative flex items-center justify-between overflow-clip select-none"
                    style={{
                      flex: 1,
                      minWidth: 0,
                      height: 24,
                      border: "4px solid #000",
                      borderRadius: 8,
                      padding: "4px 16px",
                      touchAction: "none",
                      cursor: isExposureDragging ? "grabbing" : "ew-resize",
                    }}
                    onPointerDown={handleExposurePointerDown}
                    onPointerMove={handleExposurePointerMove}
                    onPointerUp={handleExposurePointerUp}
                    onPointerCancel={handleExposurePointerUp}
                  >
                    {/* 이너 그라디언트 배경 — Figma rounded-[8px] */}
                    <span
                      aria-hidden
                      className="absolute inset-0 pointer-events-none"
                      style={{
                        background:
                          "linear-gradient(90deg, #212727 0%, #939595 50%, #212727 100%)",
                        borderRadius: 4,
                      }}
                    />
                    <span
                      className="relative text-center whitespace-nowrap pointer-events-none"
                      style={{ color: "#7c7c7c", fontSize: 10, fontWeight: 700, lineHeight: "normal" }}
                    >
                      −
                    </span>
                    {/* 미끄럼방지 리브 그룹 — 드래그 값(EV)에 따라 translateX 로 이동 */}
                    <div
                      className="relative flex items-center h-full pointer-events-none"
                      style={{
                        gap: 4,
                        transform: `translateX(${exposureEV * 24}px)`,
                        transition: isExposureDragging
                          ? "none"
                          : "transform 160ms cubic-bezier(0.2, 0.8, 0.2, 1)",
                        willChange: "transform",
                      }}
                    >
                      {Array.from({ length: 25 }).map((_, i) => (
                        <div
                          key={i}
                          className="relative h-full shrink-0"
                          style={{ width: 2, borderRadius: 8 }}
                        >
                          <span
                            aria-hidden
                            className="absolute inset-0"
                            style={{ backgroundColor: "#1d1e18", borderRadius: 8 }}
                          />
                          <span
                            aria-hidden
                            className="absolute inset-0"
                            style={{
                              boxShadow: "inset 0 4px 4px rgba(255,255,255,0.25)",
                              borderRadius: 8,
                            }}
                          />
                        </div>
                      ))}
                    </div>
                    <span
                      className="relative text-center whitespace-nowrap pointer-events-none"
                      style={{ color: "#7c7c7c", fontSize: 10, fontWeight: 700, lineHeight: "normal" }}
                    >
                      +
                    </span>
                    {/* 바 전체 이너 하이라이트 */}
                    <span
                      aria-hidden
                      className="absolute inset-0 pointer-events-none"
                      style={{
                        boxShadow: "inset 0 4px 4px rgba(255,255,255,0.25)",
                        borderRadius: 4,
                      }}
                    />
                  </div>
                </div>
              </div>

              {/* ============ 필름 출력 슬롯 — 75.867px, 라운드-탑 99px ============ */}
              <div
                className="relative w-full pointer-events-none"
                style={{
                  height: 75.867,
                  borderTopLeftRadius: 99,
                  borderTopRightRadius: 99,
                  boxShadow: "0 0 4px 0 rgba(0,0,0,0.15)",
                }}
              >
                <span
                  aria-hidden
                  className="absolute inset-0"
                  style={{
                    backgroundColor: "#191a13",
                    borderTopLeftRadius: 99,
                    borderTopRightRadius: 99,
                  }}
                />
                <span
                  aria-hidden
                  className="absolute inset-0"
                  style={{
                    boxShadow: "inset 0 4px 4px rgba(255,255,255,0.25)",
                    borderTopLeftRadius: 99,
                    borderTopRightRadius: 99,
                  }}
                />
              </div>

              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                capture="environment"
                onChange={handleFileSelect}
                className="hidden"
              />
            </motion.div>
          )}

          {/* ========== EJECTING PHASE — UpNext 카메라 (PNG 레이어 샌드위치) + 폴라로이드 슬롯 출력 ========== */}
          {/* 구조: bottom-layer(z1) · 폴라로이드(z2) · top-layer(z3)
              슬롯 라인은 top-layer 하단 = 전체 높이의 1238/1426 ≈ 86.8% 지점.
              폴라로이드는 슬롯 라인에서 위로 숨겨진 채 시작 → y 증가로 슬롯 밖으로 밀려나옴.
              위쪽 부분은 top-layer 가 가려주고, 아래쪽 부분만 bottom-layer 위에서 드러난다. */}
          {capturePhase === "ejecting" && capturedImage && (
            <div className="relative w-full max-w-[340px] mx-auto flex flex-col items-center">
              {/* 플래시 잔상 */}
              {showFlash && (
                <motion.div
                  initial={{ opacity: 1 }}
                  animate={{ opacity: 0 }}
                  transition={{ duration: 0.3 }}
                  className="fixed inset-0 bg-white z-50"
                />
              )}

              {/* 카메라 샌드위치 조립체 — 3키프레임 시퀀스 (총 2.5s)
                  ① 0→50%  직선 슬라이드 아웃
                  ② 50→100% 카메라 퇴장 + 폴라로이드 확대 1.3x + 화면 중앙 */}
              <div
                className="relative w-full"
                style={{ aspectRatio: "1525 / 1426" }}
              >
                {/* Bottom layer (z=1) — 위로 빠르게 퇴장 */}
                <motion.img
                  src="/polaroid-bottom.png"
                  alt=""
                  aria-hidden
                  draggable={false}
                  className="absolute inset-x-0 bottom-0 w-full select-none pointer-events-none"
                  style={{ height: `${(188 / 1426) * 100}%`, zIndex: 1 }}
                  initial={{ y: 0 }}
                  animate={{ y: [0, 0, -700] }}
                  transition={{
                    duration: 2.5,
                    times: [0, 0.5, 1],
                    ease: ["linear", [0.33, 1, 0.68, 1]],
                  }}
                />

                {/* Polaroid (z=2) — 3키프레임: 직선출력 → 퇴장+확대
                    left:50% + framer x:"-50%" — Tailwind translate 충돌 방지 */}
                <motion.div
                  className="absolute"
                  style={{
                    top: `${(1238 / 1426) * 100}%`,
                    left: "50%",
                    width: "62%",
                    zIndex: 2,
                    transformOrigin: "center top",
                  }}
                  initial={{ x: "-50%", y: "-100%", scale: 1 }}
                  animate={{
                    x: "-50%",
                    y: ["-100%", "15%", "-45%"],
                    scale: [1, 1, 1.3],
                  }}
                  transition={{
                    duration: 2.5,
                    times: [0, 0.5, 1],
                    ease: [[0.23, 1, 0.32, 1], [0.77, 0, 0.175, 1]],
                  }}
                >
                  <motion.div
                    initial={{ filter: "sepia(0.8) brightness(0.85) contrast(0.9)" }}
                    animate={{ filter: "sepia(0) brightness(1) contrast(1)" }}
                    transition={{ duration: 1.8, delay: 0.6, ease: [0.23, 1, 0.32, 1] }}
                  >
                    <PolaroidFrame imageSrc={capturedImage} timestamp={captureTimestamp} />
                  </motion.div>
                </motion.div>

                {/* Top layer (z=3) — 위로 빠르게 퇴장 */}
                <motion.img
                  src="/polaroid-top.png"
                  alt=""
                  aria-hidden
                  draggable={false}
                  className="absolute inset-x-0 top-0 w-full select-none pointer-events-none"
                  style={{ height: `${(1238 / 1426) * 100}%`, zIndex: 3 }}
                  initial={{ y: 0 }}
                  animate={{ y: [0, 0, -700] }}
                  transition={{
                    duration: 2.5,
                    times: [0, 0.5, 1],
                    ease: ["linear", [0.33, 1, 0.68, 1]],
                  }}
                />
              </div>
            </div>
          )}

          {/* ========== POLAROID PHASE — 자유 낙서 + 스티커 + 데코레이션 툴바 ==========
              구조: 폴라로이드 (사진 + 사인 캔버스 + 스티커 레이어) + 툴바 + Done 버튼
              사인은 잉크 색 변경 가능 (toolbar). 스티커는 탭으로 추가, drag 로 이동.
              메모는 capture 단계에서 받지 않음 — Done 후 디테일 뷰에서 작성. */}
          {(capturePhase === "polaroid" || capturePhase === "memo") && capturedImage && (
            <motion.div
              initial={{ opacity: 0, scale: 0.97, y: 8 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              transition={{ duration: 0.35, ease: [0.23, 1, 0.32, 1] }}
              className="w-full max-w-[320px] flex flex-col items-center gap-3"
            >
              {/* 폴라로이드 (사진 + 사인 + 스티커).
                  data-sticker-target — DecorationToolbar 의 sticker 드래그-앤-드롭 대상. */}
              <div className="w-full max-w-[300px] relative" data-sticker-target>
                <PolaroidFrame imageSrc={capturedImage} timestamp={captureTimestamp} />
                {/* 사인 캔버스 — 폴라로이드 전체 위 absolute */}
                <div
                  className="absolute inset-0 z-[5]"
                  onClick={(e) => e.stopPropagation()}
                >
                  <SignatureCanvas
                    width={300}
                    height={363}
                    inkColor={penColor}
                    widthMultiplier={penWidth}
                    onSignatureChange={setSignatureData}
                    className="w-full h-full"
                  />
                </div>
                {/* 스티커 레이어 — 사인 위에 배치 (z-10), drag 가능 */}
                <StickerLayer
                  stickers={stickers}
                  editable
                  onChange={setStickers}
                  className="z-10"
                />
                {/* 펄스 힌트 — 미사인 시 */}
                {!signatureData && stickers.length === 0 && (
                  <motion.p
                    initial={{ opacity: 0 }}
                    animate={{ opacity: [0.5, 0.9, 0.5] }}
                    transition={{ duration: 1.8, repeat: Infinity, ease: "easeInOut" }}
                    className="absolute bottom-3 left-0 right-0 text-center pointer-events-none z-[15]"
                    style={{
                      fontSize: 12,
                      fontWeight: 600,
                      color: "rgba(0,0,0,0.55)",
                      letterSpacing: "0.02em",
                      textShadow: "0 1px 2px rgba(255,255,255,0.5)",
                    }}
                  >
                    ✍ {t("playground.capture.sign")}
                  </motion.p>
                )}
              </div>

              {/* 데코레이션 툴바 — 잉크 색 + 굵기 + 스티커 팔레트 */}
              <DecorationToolbar
                selectedColor={penColor}
                onColorChange={setPenColor}
                selectedWidth={penWidth}
                onWidthChange={setPenWidth}
                onAddSticker={handleAddSticker}
              />

              {/* Done 버튼 — 서명이 있어야 활성 (스티커만으로는 저장 불가).
                   Phase 13 review Critical #2 — 이전엔 (signature || stickers)
                   로 sticker 만 있어도 버튼이 떴지만 handleDone 내부에서 signatureData
                   없으면 silent return → 유저는 눌렀는데 반응 없는 dead state.
                   이제 signature 없으면 명시적 disabled + hint 표기. */}
              <div className="w-full flex flex-col items-stretch gap-2.5 mt-1 min-h-[60px]">
                <motion.button
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.3, ease: [0.23, 1, 0.32, 1] }}
                  onClick={handleDone}
                  disabled={!signatureData || isSaving}
                  aria-busy={isSaving}
                  className="w-full py-3.5 rounded-xl bg-accent text-bg-primary typo-body active:scale-[0.97] transition-transform disabled:opacity-40 disabled:cursor-not-allowed disabled:active:scale-100"
                >
                  {isSaving ? "…" : t("common.done")}
                </motion.button>
                {!signatureData && (
                  <div
                    className="typo-micro text-center"
                    style={{
                      color: "rgba(0, 0, 0, 0.55)",
                      letterSpacing: "0.02em",
                    }}
                  >
                    {t("playground.capture.signRequired")}
                  </div>
                )}
              </div>
            </motion.div>
          )}
        </div>

        {/* Done 후 디테일 뷰 — savedMeta 가 set 되면 PhotoDetailModal 렌더.
            close 시 onComplete (챌린지 완료 처리 + 모달 닫기) 호출. */}
        {savedMeta && (
          <PhotoDetailModal meta={savedMeta} onClose={onComplete} />
        )}
      </motion.div>
    </AnimatePresence>,
    document.body,
  );
}

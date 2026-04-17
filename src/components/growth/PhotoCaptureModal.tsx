"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { springSnappy } from "@/lib/motion";
import { useGrowthStore } from "@/store/useGrowthStore";
import { useSound } from "@/hooks/useSound";
import { useTranslation } from "@/hooks/useTranslation";
import { cardTitle } from "@/i18n";
import PolaroidFrame from "./PolaroidFrame";
import PolaroidFlip from "./PolaroidFlip";
import SignatureCanvas from "./SignatureCanvas";
import MemoEditor from "./MemoEditor";
import PixelIcon from "@/components/icons/PixelIcon";
import type { ChallengeCard } from "@/types/card";

// UpNext 로고 — public assets 경로 의존성 제거를 위해 인라인
function UpNextLogo({ width = 96, color = "#212727" }: { width?: number; color?: string }) {
  return (
    <svg
      width={width}
      height={width * (52 / 139)}
      viewBox="0 0 139 52"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-label="UpNext"
    >
      <path d="M135.8 40.256C137.507 40.256 138.36 41.1093 138.36 42.816V43.52C138.36 45.2267 137.507 46.08 135.8 46.08H131.384C130.147 46.08 129.101 45.6533 128.248 44.8L126.136 42.688C125.283 41.8347 124.856 40.7893 124.856 39.552V22.784C124.856 21.9733 124.643 21.3547 124.216 20.928C123.789 20.4587 123.171 20.224 122.36 20.224C120.653 20.224 119.8 19.3707 119.8 17.664V17.024C119.8 16.2133 120.013 15.5947 120.44 15.168C120.909 14.6987 121.549 14.464 122.36 14.464C123.171 14.464 123.789 14.2507 124.216 13.824C124.643 13.3547 124.856 12.7147 124.856 11.904V9.60001C124.856 7.89334 125.709 7.04001 127.416 7.04001H128.12C129.827 7.04001 130.68 7.89334 130.68 9.60001V11.904C130.68 13.6107 131.533 14.464 133.24 14.464H135.8C137.507 14.464 138.36 15.3173 138.36 17.024V17.664C138.36 19.3707 137.507 20.224 135.8 20.224H133.24C131.533 20.224 130.68 21.0773 130.68 22.784V37.696C130.68 39.4027 131.533 40.256 133.24 40.256H135.8Z" fill={color}/>
      <path d="M98.184 17.472C97.928 16.96 97.8 16.512 97.8 16.128C97.8 15.616 97.9707 15.2107 98.312 14.912C98.6533 14.6133 99.144 14.464 99.784 14.464H100.68C102.088 14.464 103.091 15.0827 103.688 16.32L106.76 22.72C107.229 23.7013 107.805 24.192 108.488 24.192C109.171 24.192 109.768 23.7013 110.28 22.72L113.544 16.32C114.184 15.0827 115.187 14.464 116.552 14.464H117.192C118.643 14.464 119.368 14.9973 119.368 16.064C119.368 16.4907 119.24 16.96 118.984 17.472L112.968 29.056C112.627 29.7387 112.456 30.336 112.456 30.848C112.456 31.2747 112.605 31.8293 112.904 32.512L118.408 43.712C118.664 44.224 118.792 44.6933 118.792 45.12C118.792 45.632 118.621 46.016 118.28 46.272C117.939 46.5707 117.469 46.72 116.872 46.72H115.976C114.568 46.72 113.565 46.1013 112.968 44.864L110.024 38.912C109.555 37.9307 108.979 37.44 108.296 37.44C107.613 37.44 107.016 37.9307 106.504 38.912L103.432 44.864C102.835 46.1013 101.832 46.72 100.424 46.72H100.104C99.4213 46.72 98.8667 46.5707 98.44 46.272C98.056 45.9733 97.864 45.568 97.864 45.056C97.864 44.672 97.992 44.224 98.248 43.712L103.88 32.64C104.221 31.9573 104.392 31.36 104.392 30.848C104.392 30.336 104.243 29.7813 103.944 29.184L98.184 17.472Z" fill={color}/>
      <path d="M97.6 31.616C97.6 33.3227 96.7467 34.176 95.04 34.176H85.184C83.4773 34.176 82.624 35.0293 82.624 36.736V37.632C82.624 39.3387 83.4773 40.192 85.184 40.192H95.04C96.7467 40.192 97.6 41.0453 97.6 42.752V43.456C97.6 45.1627 96.7467 46.016 95.04 46.016H83.264C82.0267 46.016 80.9813 45.568 80.128 44.672L78.08 42.624C77.2267 41.7707 76.8 40.7253 76.8 39.488V20.928C76.8 19.6907 77.2267 18.6453 78.08 17.792L80.128 15.744C80.9813 14.8907 82.0267 14.464 83.264 14.464H91.136C92.3733 14.464 93.4187 14.8907 94.272 15.744L96.32 17.792C97.1733 18.6453 97.6 19.6907 97.6 20.928V31.616ZM82.624 26.496C82.624 28.2027 83.4773 29.056 85.184 29.056H89.216C90.9227 29.056 91.776 28.2027 91.776 26.496V22.784C91.776 21.0773 90.9227 20.224 89.216 20.224H85.184C83.4773 20.224 82.624 21.0773 82.624 22.784V26.496Z" fill={color}/>
      <path d="M55.624 43.52C55.624 45.2267 54.7707 46.08 53.064 46.08H52.36C50.6533 46.08 49.8 45.2267 49.8 43.52V2.624C49.8 0.917329 50.6533 0.0639954 52.36 0.0639954H53.64C55.048 0.0639954 56.0293 0.703996 56.584 1.984L66.888 25.728C67.1013 26.1973 67.3573 26.5813 67.656 26.88C67.9973 27.136 68.3173 27.264 68.616 27.264C69 27.264 69.2987 27.0933 69.512 26.752C69.768 26.368 69.896 25.8347 69.896 25.152V2.624C69.896 0.917329 70.7493 0.0639954 72.456 0.0639954H73.16C74.8667 0.0639954 75.72 0.917329 75.72 2.624V43.52C75.72 45.2267 74.8667 46.08 73.16 46.08H72.456C71.048 46.08 70.0667 45.44 69.512 44.16L58.632 19.264C58.2053 18.24 57.6507 17.728 56.968 17.728C56.584 17.728 56.264 17.92 56.008 18.304C55.752 18.688 55.624 19.2213 55.624 19.904V43.52Z" fill={color}/>
      <path d="M19.52 2.56C19.52 0.853334 20.3733 0 22.08 0H22.784C24.4907 0 25.344 0.853334 25.344 2.56V39.488C25.344 40.7253 24.9173 41.792 24.064 42.688L22.016 44.736C21.1627 45.5893 20.1173 46.016 18.88 46.016H6.528C5.29067 46.016 4.24533 45.5893 3.392 44.736L1.28 42.624C0.426667 41.7707 0 40.7253 0 39.488V2.56C0 0.853334 0.853333 0 2.56 0H3.264C4.97067 0 5.824 0.853334 5.824 2.56V37.632C5.824 39.3387 6.67733 40.192 8.384 40.192H16.96C18.6667 40.192 19.52 39.3387 19.52 37.632V2.56Z" fill={color}/>
      <path d="M48.2442 43.504C48.2442 44.4359 48.2442 44.9018 48.0919 45.2694C47.889 45.7594 47.4996 46.1488 47.0096 46.3518C46.642 46.504 46.1761 46.504 45.2442 46.504C44.3123 46.504 43.8464 46.504 43.4788 46.3518C42.9888 46.1488 42.5994 45.7594 42.3964 45.2694C42.2442 44.9018 42.2442 44.4359 42.2442 43.504V43.0014C42.2442 39.951 42.2442 38.4258 41.5106 37.8256C41.206 37.5765 40.8348 37.4227 40.4432 37.3836C39.5001 37.2892 38.4217 38.3677 36.2648 40.5247L26.3355 50.4546C25.6765 51.1136 25.347 51.4431 24.9794 51.5954C24.4893 51.7984 23.9386 51.7984 23.4485 51.5953C23.081 51.443 22.7515 51.1135 22.0925 50.4544C21.4338 49.7955 21.1044 49.466 20.9522 49.0985C20.7492 48.6084 20.7493 48.0579 20.9523 47.5678C21.1045 47.2003 21.4339 46.8709 22.0928 46.212L32.5225 35.7823C34.0794 34.2255 34.8578 33.447 34.9522 32.7874C35.0558 32.0641 34.7566 31.3419 34.172 30.9037C33.6388 30.504 32.516 30.504 30.2705 30.504C29.3211 30.504 28.8464 30.504 28.4788 30.3518C27.9888 30.1488 27.5994 29.7594 27.3964 29.2694C27.2442 28.9018 27.2442 28.4359 27.2442 27.504C27.2442 26.5721 27.2442 26.1062 27.3964 25.7386C27.5994 25.2486 27.9888 24.8592 28.4788 24.6562C28.8464 24.504 29.3123 24.504 30.2442 24.504H44.2442C46.1298 24.504 47.0726 24.504 47.6584 25.0898C48.2442 25.6756 48.2442 26.6184 48.2442 28.504V43.504Z" fill={color}/>
    </svg>
  );
}

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
  const [memo, setMemo] = useState("");
  const [isFlipped, setIsFlipped] = useState(false);
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

  // 카메라 시작
  useEffect(() => {
    if (capturePhase !== "camera") return;

    let mounted = true;
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
        // 카메라 접근 실패 → 파일 입력 폴백
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
    ctx.drawImage(video, sx, sy, size, size, 0, 0, size, size);
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
  }, [stopCamera, play, setCapturePhase]);

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

  // 저장
  const handleSave = useCallback(async () => {
    if (!capturedImage || !signatureData) return;
    await savePhoto(
      capturedImage,
      signatureData,
      memo,
      cardTitle(card, language),
      card.category,
    );
    play("collect");
    onComplete();
  }, [capturedImage, signatureData, memo, savePhoto, card, language, play, onComplete]);

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

  if (capturePhase === "idle" || capturePhase === "saving") return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className={`fixed inset-0 z-[60] flex flex-col ${
          capturePhase === "camera" ? "bg-[#DCD5BC]" : "bg-black"
        }`}
      >
        {/* 헤더 — 카메라/이젝팅 시에는 숨김 */}
        {(capturePhase === "polaroid" || capturePhase === "memo") && (
          <div className="flex items-center justify-between px-4 pt-[calc(env(safe-area-inset-top)+12px)] pb-3">
            <button onClick={handleClose} className="p-2 active:opacity-60">
              <PixelIcon name="Cancel" size={20} color="var(--text-secondary)" />
            </button>
            <h2 className="typo-body text-text-primary">{t("playground.capture.title")}</h2>
            <div className="w-9" />
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
                  <UpNextLogo width={64.689} color="#212727" />
                </div>
                <button
                  onClick={handleSkip}
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

          {/* ========== POLAROID PHASE — 서명 + 메모 편집 ==========
              ⚠ PolaroidTilt 제거 이유: 서명 캔버스의 pointermove 와 충돌해서
                서명 그리는 동안 폴라로이드가 흔들림. 틸트 인터랙션은 PhotoDetailModal
                (관람 전용) 에서만 활성. Capture flow 는 액션 중심.

              ⚠ wiggle motion.div 에 명시적 width 필요: flex-col items-center 부모에서
                width 미지정 자식은 min-content 로 0×0 이 됨 (PolaroidFrame 의 w-full
                이 0 이 되어 폴라로이드 통째로 사라지는 버그). max-w-[300px] w-full 로 고정. */}
          {(capturePhase === "polaroid" || capturePhase === "memo") && capturedImage && (
            <motion.div
              initial={{ opacity: 0, scale: 0.97, y: 8 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              transition={{ duration: 0.35, ease: [0.23, 1, 0.32, 1] }}
              className="w-full max-w-[320px] flex flex-col items-center gap-4"
            >
              {/* 수평 넛지 힌트 (플립 가능 알림) — rotateZ 대신 translateX 가 더 직관적 */}
              <motion.div
                className="w-full max-w-[300px]"
                initial={{ x: 0 }}
                animate={{ x: [0, 4, -4, 2, 0] }}
                transition={{ duration: 0.6, delay: 0.5, ease: [0.77, 0, 0.175, 1] }}
              >
                <PolaroidFlip
                  flipped={isFlipped}
                  onFlip={setIsFlipped}
                  front={
                    <PolaroidFrame imageSrc={capturedImage} timestamp={captureTimestamp}>
                      {/* 서명 영역 — 비어있을 때 placeholder + 펄스로 유도 */}
                      <div onClick={(e) => e.stopPropagation()} className="relative">
                        {!signatureData && (
                          <motion.div
                            initial={{ opacity: 0.5 }}
                            animate={{ opacity: [0.5, 0.9, 0.5] }}
                            transition={{ duration: 1.8, repeat: Infinity, ease: "easeInOut" }}
                            className="absolute inset-0 rounded-md pointer-events-none"
                            style={{
                              border: "1.5px dashed rgba(0,0,0,0.35)",
                              background: "rgba(205, 245, 100, 0.10)",
                            }}
                          />
                        )}
                        <SignatureCanvas
                          width={274}
                          height={50}
                          onSignatureChange={setSignatureData}
                        />
                        {!signatureData && (
                          <p
                            className="absolute inset-0 flex items-center justify-center pointer-events-none"
                            style={{
                              fontSize: 13,
                              fontWeight: 600,
                              color: "rgba(0,0,0,0.45)",
                              letterSpacing: "0.02em",
                            }}
                          >
                            ✍ {t("playground.capture.sign")}
                          </p>
                        )}
                      </div>
                    </PolaroidFrame>
                  }
                  back={
                    <div onClick={(e) => e.stopPropagation()}>
                      <MemoEditor value={memo} onChange={setMemo} />
                    </div>
                  }
                />
              </motion.div>

              {/* 액션 영역 — 서명 안내 → 저장 → 건너뛰기 (위에서 아래로 우선순위) */}
              <div className="w-full flex flex-col items-stretch gap-2.5 mt-1">
                {/* 서명 안내 — 미서명 시에만, 저장 버튼 바로 위에 명확히 */}
                {!signatureData && !isFlipped && (
                  <motion.p
                    initial={{ opacity: 0, y: -4 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.4, duration: 0.3 }}
                    className="typo-caption text-text-secondary text-center"
                  >
                    ↑ {t("playground.capture.signRequired")}
                  </motion.p>
                )}

                {/* 저장 버튼 — 미서명 시 비활성, 서명 시 accent */}
                <button
                  onClick={handleSave}
                  disabled={!signatureData}
                  aria-disabled={!signatureData}
                  className={`w-full py-3.5 rounded-xl typo-body active:scale-[0.97] transition-all ${
                    signatureData
                      ? "bg-accent text-bg-primary"
                      : "bg-bg-elevated text-text-tertiary cursor-not-allowed"
                  }`}
                >
                  {t("playground.capture.save")}
                </button>

                {/* 건너뛰기 — 명확한 버튼 영역 (탭 타겟 확보) */}
                <button
                  onClick={handleSkip}
                  className="w-full py-3 typo-caption text-text-secondary active:opacity-60 transition-opacity"
                >
                  {t("playground.capture.skip")}
                </button>
              </div>
            </motion.div>
          )}
        </div>
      </motion.div>
    </AnimatePresence>
  );
}

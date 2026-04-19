/**
 * 폴라로이드 합성 → 단일 이미지 Blob 생성.
 *
 * Web Share API 로 공유하거나 다운로드할 때 사용.
 * 사진 + 사인 캔버스 + 베이지 프레임 + 날짜 스탬프를 하나의 PNG 로 합성.
 *
 * 향후 스티커 추가 시 sticker layer 도 여기서 합성.
 */

const POLAROID_WIDTH = 600; // 2x of display 300px (retina)
const POLAROID_HEIGHT = 727; // 600 * 223/184

/** Phase 13 review Critical — 공유 PNG 에 스티커 포함용 타입. */
export interface CompositeSticker {
  id: string;
  type: "emoji" | "image";
  content: string; // emoji char 또는 image URL / asset key ("upnext-logo")
  /** polaroid 영역 기준 % 좌표 (0-100) */
  x: number;
  y: number;
  rotation: number;
  scale: number;
  zIndex?: number;
}

interface CompositeInput {
  photoBlob: Blob;
  signatureBlob?: Blob | null;
  timestamp: number;
  /** 베이지 (#f2f1ee) 또는 white-cream (#f9f8f5) — PolaroidFrame variant 와 매칭 */
  frameBg?: string;
  /** Phase 13 review — 공유 PNG 에 포함할 스티커 배열 */
  stickers?: CompositeSticker[];
}

export async function compositePolaroid({
  photoBlob,
  signatureBlob,
  timestamp,
  frameBg = "#f9f8f5",
  stickers,
}: CompositeInput): Promise<Blob> {
  const canvas = document.createElement("canvas");
  canvas.width = POLAROID_WIDTH;
  canvas.height = POLAROID_HEIGHT;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas context not available");

  // 1. 베이지 프레임 배경
  ctx.fillStyle = frameBg;
  ctx.fillRect(0, 0, POLAROID_WIDTH, POLAROID_HEIGHT);

  // 2. 사진 영역 — Figma 좌표 (15, 14, 154x157) → 600px 기준 비례
  const PHOTO_X = (15 / 184) * POLAROID_WIDTH;
  const PHOTO_Y = (14 / 223) * POLAROID_HEIGHT;
  const PHOTO_W = (154 / 184) * POLAROID_WIDTH;
  const PHOTO_H = (157 / 223) * POLAROID_HEIGHT;

  // 사진 로드 + draw (Kodak 필터는 합성 시 simplified)
  const photoUrl = URL.createObjectURL(photoBlob);
  try {
    const photo = await loadImage(photoUrl);
    // 검은 배경 (사진 영역)
    ctx.fillStyle = "#010101";
    ctx.fillRect(PHOTO_X, PHOTO_Y, PHOTO_W, PHOTO_H);
    // object-cover 처리 — 사진을 영역에 채움 (잘림 가능)
    drawImageCover(ctx, photo, PHOTO_X, PHOTO_Y, PHOTO_W, PHOTO_H);

    // 3. 날짜 스탬프 — 우하단 오렌지
    const d = new Date(timestamp);
    const dateStr = `'${String(d.getFullYear()).slice(2)} ${String(d.getMonth() + 1).padStart(2, "0")} ${String(d.getDate()).padStart(2, "0")}`;
    const timeStr = `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
    ctx.fillStyle = "#ff6b35";
    ctx.font = "bold 22px 'Courier New', monospace";
    ctx.textAlign = "right";
    ctx.fillText(`${dateStr} ${timeStr}`, PHOTO_X + PHOTO_W - 16, PHOTO_Y + PHOTO_H - 16);

    // Phase 13 review Critical — 스티커 레이어 (사인 전에 배치 → 사인이 스티커
    //   위에 덮임; UI 에서 signature 가 topmost 이므로 동일).
    //   zIndex 오름차순 정렬 → 낮은 것부터 그리면 높은 것이 위에.
    if (stickers && stickers.length > 0) {
      const sorted = [...stickers].sort(
        (a, b) => (a.zIndex ?? 0) - (b.zIndex ?? 0),
      );
      for (const s of sorted) {
        await drawSticker(ctx, s, POLAROID_WIDTH, POLAROID_HEIGHT);
      }
    }

    // 4. 사인 오버레이 — 폴라로이드 전체 위 (사진 + 캡션 영역 모두)
    if (signatureBlob) {
      const sigUrl = URL.createObjectURL(signatureBlob);
      try {
        const sig = await loadImage(sigUrl);
        ctx.drawImage(sig, 0, 0, POLAROID_WIDTH, POLAROID_HEIGHT);
      } finally {
        URL.revokeObjectURL(sigUrl);
      }
    }
  } finally {
    URL.revokeObjectURL(photoUrl);
  }

  // 5. PNG Blob 생성
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("Canvas blob failed"))),
      "image/png",
    );
  });
}

/**
 * Phase 13 review Critical — 스티커 1개를 canvas 에 렌더.
 *
 *   emoji 는 fillText 로, "upnext-logo" 이미지 스티커는 assets/upnext-logo.png
 *   로 로드. 실패 시 silently skip (1 스티커 실패가 공유 전체 망가뜨리지 않게).
 *
 *   StickerLayer.tsx 렌더 로직과 수치 맞춤:
 *     - position % 좌표 (x, y) → canvas absolute px 변환
 *     - base size 48px × scale (UpNext 로고 64px)
 *     - rotation deg → radian
 *     - translate 로 중심 정렬 (StickerLayer 가 translate(-50%, -50%) 사용)
 */
async function drawSticker(
  ctx: CanvasRenderingContext2D,
  s: CompositeSticker,
  containerW: number,
  containerH: number,
): Promise<void> {
  const cx = (s.x / 100) * containerW;
  const cy = (s.y / 100) * containerH;
  // UI 의 base size (StickerLayer 와 일치): emoji 48px, logo 64px.
  //   canvas 는 polaroid 가 2x (600/300) 이므로 base 를 2 배로.
  const baseSize = s.content === "upnext-logo" ? 64 : 48;
  const size = baseSize * s.scale * 2;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate((s.rotation * Math.PI) / 180);
  try {
    if (s.type === "emoji") {
      // emoji 는 textBaseline=middle + textAlign=center 로 중앙 정렬.
      ctx.font = `${size}px "Apple Color Emoji", "Segoe UI Emoji", sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(s.content, 0, 0);
    } else if (s.type === "image") {
      // "upnext-logo" 또는 URL. 로고는 `/assets/upnext-logo.png` 정적 경로.
      const src =
        s.content === "upnext-logo" ? "/assets/upnext-logo.png" : s.content;
      const img = await loadImage(src).catch(() => null);
      if (img) {
        ctx.drawImage(img, -size / 2, -size / 2, size, size);
      }
    }
  } finally {
    ctx.restore();
  }
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

/**
 * object-cover 와 동일 — 이미지를 영역에 채우되 종횡비 유지 (잘림 허용).
 */
function drawImageCover(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  dx: number,
  dy: number,
  dw: number,
  dh: number,
) {
  const imgRatio = img.width / img.height;
  const dstRatio = dw / dh;
  let sx = 0,
    sy = 0,
    sw = img.width,
    sh = img.height;
  if (imgRatio > dstRatio) {
    // 이미지가 더 가로 길음 — 좌우 잘라냄
    sw = img.height * dstRatio;
    sx = (img.width - sw) / 2;
  } else {
    // 이미지가 더 세로 길음 — 위아래 잘라냄
    sh = img.width / dstRatio;
    sy = (img.height - sh) / 2;
  }
  ctx.drawImage(img, sx, sy, sw, sh, dx, dy, dw, dh);
}

/**
 * Web Share API 를 통해 폴라로이드 공유.
 * 지원 안 되면 download fallback.
 */
export async function sharePolaroid(blob: Blob, filename = "polaroid.png"): Promise<{ shared: boolean; method: "share" | "download" }> {
  const file = new File([blob], filename, { type: "image/png" });

  // Web Share API — 파일 공유 가능 체크
  if (
    typeof navigator !== "undefined" &&
    typeof navigator.canShare === "function" &&
    navigator.canShare({ files: [file] })
  ) {
    try {
      await navigator.share({ files: [file], title: "UpNext Polaroid" });
      return { shared: true, method: "share" };
    } catch (e) {
      // 사용자가 취소한 경우 등 — fallback 으로 진행
      if ((e as DOMException)?.name === "AbortError") {
        return { shared: false, method: "share" };
      }
      // 그 외 에러는 download fallback
    }
  }

  // Download fallback
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return { shared: true, method: "download" };
}

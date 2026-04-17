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

interface CompositeInput {
  photoBlob: Blob;
  signatureBlob?: Blob | null;
  timestamp: number;
  /** 베이지 (#f2f1ee) 또는 white-cream (#f9f8f5) — PolaroidFrame variant 와 매칭 */
  frameBg?: string;
}

export async function compositePolaroid({
  photoBlob,
  signatureBlob,
  timestamp,
  frameBg = "#f9f8f5",
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

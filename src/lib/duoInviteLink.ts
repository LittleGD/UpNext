export const DUO_INVITE_ORIGIN = "https://up-next-phi.vercel.app";
export const IOS_STORE_URL = "https://apps.apple.com/app/id6762550135";
export const ANDROID_STORE_URL =
  "https://play.google.com/store/apps/details?id=app.vercel.upnext";
const PENDING_INVITE_KEY = "upnext.pendingDuoInvite";
export function readPendingDuoInvite(): string | null {
  try {
    return duoInviteCode(window.localStorage.getItem(PENDING_INVITE_KEY) ?? "");
  } catch {
    return null;
  }
}
export function savePendingDuoInvite(code: string | null): void {
  try {
    if (code) window.localStorage.setItem(PENDING_INVITE_KEY, code);
    else window.localStorage.removeItem(PENDING_INVITE_KEY);
  } catch {
    /* The current link still works when storage is unavailable. */
  }
}
export function duoInviteCode(raw: string): string | null {
  const code = raw.trim().toUpperCase();
  return /^[A-Z2-9]{6}$/.test(code) ? code : null;
}
export function duoInviteURL(code: string): string {
  const normalized = duoInviteCode(code);
  if (!normalized) throw new Error("Invalid invite code");
  return `${DUO_INVITE_ORIGIN}/i/${normalized}`;
}
export function parseDuoInviteURL(raw: string): string | null {
  try {
    const url = new URL(raw);
    if (url.username || url.password) return null;
    const path =
      url.protocol === "upnext:" && url.hostname === "invite" && !url.port
        ? url.pathname
        : url.origin === DUO_INVITE_ORIGIN && url.pathname.startsWith("/i/")
          ? url.pathname.slice(2)
          : null;
    return path && /^\/[A-Za-z2-9]{6}\/?$/.test(path)
      ? duoInviteCode(path.replaceAll("/", ""))
      : null;
  } catch {
    return null;
  }
}

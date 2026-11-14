"use client"

import { parseProductReturnTarget, type ProductReturnTarget } from "@/lib/product-return-target"

const SIGN_IN_RETURN_KEY = "kokoro.product-sign-in-return";
const SIGN_IN_RETURN_TTL_MS = 300_000;

/** Per-tab navigation only. This hint never admits a Session or replays an OIDC transaction. */
export function readProductSignInReturnTarget(): ProductReturnTarget | null {
  try {
    const raw: unknown = JSON.parse(window.sessionStorage.getItem(SIGN_IN_RETURN_KEY) ?? "null");
    if (typeof raw === "object" && raw !== null && !Array.isArray(raw)) {
      const value = raw as Record<string, unknown>;
      const now = Date.now();
      const target = typeof value.target === "string" ? parseProductReturnTarget(value.target) : null;
      if (Object.keys(value).sort().join(",") === "expiresAt,target" && target !== null &&
          typeof value.expiresAt === "number" && Number.isFinite(value.expiresAt) &&
          value.expiresAt > now && value.expiresAt <= now + SIGN_IN_RETURN_TTL_MS) return target;
    }
  } catch { /* Storage is optional; normal login still works without a navigation hint. */ }
  return null;
}


export function openProductSignIn(
  navigate: (url: string) => void = (url) => window.location.replace(url),
): void {
  const path = `${window.location.pathname}${window.location.search}`;
  const target = parseProductReturnTarget(`${path}${window.location.hash}`) ?? parseProductReturnTarget(path);
  try {
    if (target === null) window.sessionStorage.removeItem(SIGN_IN_RETURN_KEY);
    else window.sessionStorage.setItem(SIGN_IN_RETURN_KEY, JSON.stringify({ target, expiresAt: Date.now() + SIGN_IN_RETURN_TTL_MS }));
  } catch { /* The signed RP return intent below remains authoritative. */ }
  navigate(target === null ? "/login" : `/login?${new URLSearchParams({ return_to: target })}`);
}

/** Complete logout through the canonical IAM native-session adapter. */
export async function endProductSession(
  navigate: (url: string) => void = (url) => window.location.assign(url),
  signal?: AbortSignal,
): Promise<void> {
  signal?.throwIfAborted()
  const response = await fetch("/iam/sign-out", {
    method: "POST",
    cache: "no-store",
    ...(signal ? { signal } : {}),
  })
  signal?.throwIfAborted()
  if (response.ok || response.status === 401 || response.status === 303 || response.status === 307) {
    // A no-secret invalidation signal retires other tabs, including same-subject replacement sessions.
    try { window.localStorage.setItem("kokoro.web.auth-invalidation", crypto.randomUUID()) } catch { /* Local retirement still runs when storage is unavailable. */ }
    window.dispatchEvent(new Event("kokoro:auth-invalidated"))
    navigate("/")
    return
  }
  throw new Error("Native sign-out unavailable")
}

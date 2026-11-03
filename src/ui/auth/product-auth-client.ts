"use client";

import { parseProductReturnTarget, type ProductReturnTarget } from "@/lib/product-return-target";
import { AUTH_INDEX_SUBJECT_KEY, readBrowserAuthIndexSubject } from "@/ui/shell/page-clients";

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

export async function currentCsrf(signal?: AbortSignal): Promise<string> {
  signal?.throwIfAborted();
  const response = await fetch("/api/auth/csrf", { cache: "no-store", ...(signal ? { signal } : {}) });
  const raw: unknown = response.ok
    ? await response.json().catch(() => null)
    : null;
  signal?.throwIfAborted();
  const token =
    typeof raw === "object" && raw !== null
      ? (raw as { csrfToken?: unknown }).csrfToken
      : null;
  if (typeof token !== "string" || !/^[A-Za-z0-9]+$/u.test(token))
    throw new Error("Product authentication unavailable");
  return token;
}

export async function endProductSession(
  navigate: (url: string) => void = (url) => window.location.assign(url),
  signal?: AbortSignal,
): Promise<void> {
  signal?.throwIfAborted();
  const readMarker = (): string | null | undefined => {
    try { return readBrowserAuthIndexSubject(); } catch { return undefined; }
  };
  const originalMarker = readMarker();
  let retired = false;
  const onStorage = (event: StorageEvent): void => {
    try { if (event.storageArea !== window.localStorage) return; } catch { return; }
    if ((event.key === null || event.key === AUTH_INDEX_SUBJECT_KEY) &&
        (event.key === null || event.oldValue !== event.newValue)) retired = true;
  };
  const assertCurrent = (): void => {
    signal?.throwIfAborted();
    const currentMarker = readMarker();
    if (retired || (originalMarker !== undefined && currentMarker !== undefined && currentMarker !== originalMarker))
      throw new Error("Product sign-out retired");
  };
  window.addEventListener("storage", onStorage);
  try {
    const csrfToken = await currentCsrf(signal);
    assertCurrent();
    const response = await fetch("/api/auth/signout", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ csrfToken }),
      ...(signal ? { signal } : {}),
    });
    assertCurrent();
    const raw: unknown = await response.json().catch(() => null);
    assertCurrent();
    const ack = typeof raw === "object" && raw !== null && !Array.isArray(raw)
      ? raw as { status?: unknown; issuer_end_session_url?: unknown } : null;
    // A stale-generation ACK deliberately leaves the current cookie intact.
    if (!((response.status === 200 && ack?.status === "signed_out") ||
          (response.status === 503 && ack?.status === "browser_cookie_cleared")))
      throw new Error("Product sign-out unavailable");
    assertCurrent();
    if (typeof originalMarker === "string" && readMarker() === originalMarker) {
      // This is only a cache hint. Other tabs retire data and verify their cookie.
      // Storage restrictions must not prevent a confirmed server-side signout.
      try { window.localStorage.removeItem(AUTH_INDEX_SUBJECT_KEY); } catch { /* no broadcast */ }
    }
    signal?.throwIfAborted();
    const url = ack?.issuer_end_session_url;
    navigate(typeof url === "string" && url.startsWith("/iam/oauth2/end-session?") ? url : "/");
  } finally {
    window.removeEventListener("storage", onStorage);
  }
}


/** The caller owns the single budget for CSRF, refresh and optional read confirmation. */
export async function refreshProductSession(
  signal: AbortSignal,
  onRefreshDispatch?: () => void,
  prefetchedCsrf?: Promise<string>,
): Promise<{ mode: "authenticated"; subject: string } | { mode: "confirm" }> {
  signal.throwIfAborted();
  const csrfToken = await (prefetchedCsrf ?? currentCsrf(signal));
  signal.throwIfAborted();
  // CSRF reads can fail or be cancelled without creating an uncertain mutation.
  onRefreshDispatch?.();
  const response = await fetch("/api/auth/session", {
    method: "POST",
    cache: "no-store",
    signal,
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ csrfToken }),
  });
  signal.throwIfAborted();
  // A different tab can own the CAS reservation. Never retry this POST.
  if (response.status === 409 || response.status === 401) return { mode: "confirm" };
  if (response.status !== 200) throw new Error("Product session refresh unavailable");
  const raw: unknown = await response.json();
  signal.throwIfAborted();
  if (typeof raw !== "object" || raw === null || Array.isArray(raw))
    throw new Error("Product session refresh unavailable");
  const projection = raw as Record<string, unknown>;
  if (Object.keys(projection).sort().join(",") !== "authenticated,expires_at,subject" ||
      projection.authenticated !== true ||
      typeof projection.subject !== "string" || projection.subject.trim() === "" ||
      typeof projection.expires_at !== "number" || !Number.isFinite(projection.expires_at) ||
      projection.expires_at <= Date.now())
    throw new Error("Product session refresh unavailable");
  return { mode: "authenticated", subject: projection.subject };
}

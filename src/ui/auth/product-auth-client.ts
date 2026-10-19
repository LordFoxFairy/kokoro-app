"use client";

import { parseProductReturnTarget } from "@/lib/product-return-target";

export function openProductSignIn(
  navigate: (url: string) => void = (url) => window.location.replace(url),
): void {
  const path = `${window.location.pathname}${window.location.search}`;
  const target = parseProductReturnTarget(`${path}${window.location.hash}`) ?? parseProductReturnTarget(path);
  navigate(target === null ? "/login" : `/login?${new URLSearchParams({ return_to: target })}`);
}

async function currentCsrf(signal?: AbortSignal): Promise<string> {
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
): Promise<void> {
  const response = await fetch("/api/auth/signout", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ csrfToken: await currentCsrf() }),
  });
  const raw: unknown = await response.json().catch(() => null);
  const url =
    typeof raw === "object" && raw !== null
      ? (raw as { issuer_end_session_url?: unknown }).issuer_end_session_url
      : null;
  if (
    (response.ok || response.status === 503) &&
    typeof url === "string" &&
    url.startsWith("/iam/oauth2/end-session?")
  ) {
    navigate(url);
    return;
  }
  if (response.ok) navigate("/");
  else throw new Error("Product sign-out unavailable");
}


/** The caller owns the single budget for CSRF, refresh and optional read confirmation. */
export async function refreshProductSession(
  signal: AbortSignal,
  onRefreshDispatch?: () => void,
): Promise<{ mode: "authenticated"; subject: string } | { mode: "confirm" }> {
  const csrfToken = await currentCsrf(signal);
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

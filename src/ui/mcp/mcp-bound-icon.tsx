"use client";

import { useEffect, useState, type ReactNode } from "react";
import type { McpIconBinding } from "@/hub/mcp-icon.schema";

/** Displays an already-admitted binding; it never obtains or refreshes owner facts. */
export function McpBoundIcon({ icon, alt, fallback, className }: {
  icon?: McpIconBinding | undefined;
  alt: string;
  fallback: ReactNode;
  className?: string | undefined;
}) {
  const reference = icon?.preview_reference;
  const expiresAt = reference ? Date.parse(reference.expires_at) : Number.NaN;
  const url = reference?.method === "GET" && Object.keys(reference.required_headers).length === 0 && Number.isFinite(expiresAt) ? reference.url : undefined;
  if (!url) return <>{fallback}</>;
  return <BoundPreview key={`${url}\0${expiresAt}`} url={url} expiresAt={expiresAt} alt={alt} fallback={fallback} className={className} />;
}

/** Each newly supplied capability has its own failure/deadline lifetime. */
function BoundPreview({ url, expiresAt, alt, fallback, className }: {
  url: string; expiresAt: number; alt: string; fallback: ReactNode; className?: string | undefined;
}) {
  const [failed, setFailed] = useState(false);
  const [clock, setClock] = useState(() => Date.now());
  useEffect(() => {
    const remaining = expiresAt - Date.now();
    if (failed || expiresAt <= clock) return;
    // A local deadline only: no owner GET, retry, or URL renewal. Clamp browser
    // timers so even a malformed far-future deadline cannot create a tight loop.
    const timer = setTimeout(() => setClock(Date.now()), Math.max(0, Math.min(remaining, 2_147_483_647)));
    return () => clearTimeout(timer);
  }, [expiresAt, failed, clock]);
  if (failed || expiresAt <= clock) return <>{fallback}</>;
  // eslint-disable-next-line @next/next/no-img-element -- Signed capabilities must not enter Next's image optimizer/cache.
  return <img src={url} alt={alt} className={className} crossOrigin="anonymous" referrerPolicy="no-referrer" onError={() => setFailed(true)} style={{ width: "100%", height: "100%", objectFit: "contain" }} />;
}

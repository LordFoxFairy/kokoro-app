"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

/** Independent private media read; load/error is never a Connector or icon-binding fact. */
export function McpServerIcon({ serverId, mediaRevision, fallback }: {
  serverId: string;
  mediaRevision: number;
  fallback: ReactNode;
}) {
  return <ServerImage key={JSON.stringify([serverId, mediaRevision])} serverId={serverId} fallback={fallback} />;
}

type ImageState = { kind: "pending" | "failed" } | { kind: "decoding" | "loaded"; src: string };
function ServerImage({ serverId, fallback }: { serverId: string; fallback: ReactNode }) {
  const frame = useRef<HTMLSpanElement>(null);
  const [state, setState] = useState<ImageState>({ kind: "pending" });
  useEffect(() => {
    const controller = new AbortController();
    let retired = false, started = false, ownedUrl: string | undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let observer: IntersectionObserver | undefined;
    const within = <T,>(work: Promise<T>): Promise<T> => new Promise((resolve, reject) => {
      const abort = () => reject(controller.signal.reason);
      controller.signal.addEventListener("abort", abort, { once: true });
      void work.then(resolve, reject).finally(() => controller.signal.removeEventListener("abort", abort));
      if (controller.signal.aborted) abort();
    });
    const start = async () => {
      if (started || retired) return;
      started = true; observer?.disconnect();
      const deadlineAt = performance.now() + 10_000;
      timer = setTimeout(() => controller.abort(new Error("media_deadline")), 10_000);
      const check = () => { controller.signal.throwIfAborted(); if (retired || performance.now() >= deadlineAt) throw new Error("media_retired"); };
      let response: Response | undefined;
      try {
        check();
        // A new DOM img with the same URL can reuse Chromium's decoded image even
        // with HTTP no-store. Explicit fetch + per-lifetime object URL prevents that.
        response = await within(fetch(`/api/hub/mcp/servers/${encodeURIComponent(serverId)}/icon`, {
          cache: "no-store", credentials: "same-origin", redirect: "error", signal: controller.signal,
        }).then(value => { if (retired || controller.signal.aborted) void value.body?.cancel().catch(() => undefined); return value; }));
        check();
        if (!response) throw new Error("media_response_missing");
        const type = response.headers.get("content-type"), length = response.headers.get("content-length");
        if (response.status !== 200 || !["image/png", "image/jpeg"].includes(type ?? "") || length === null || !/^[1-9][0-9]*$/u.test(length) || Number(length) > 1_048_576 || !response.body)
          throw new Error("media_response_invalid");
        const reader = response.body.getReader(), chunks: Uint8Array[] = [];
        let size = 0;
        const cancel = () => { void reader.cancel().catch(() => undefined); };
        controller.signal.addEventListener("abort", cancel, { once: true });
        try {
          for (;;) {
            check(); const part = await within(reader.read()); check();
            if (part.done) break;
            size += part.value.byteLength;
            if (size > 1_048_576 || size > Number(length)) throw new Error("media_body_too_large");
            chunks.push(part.value);
          }
        } finally { controller.signal.removeEventListener("abort", cancel); void reader.cancel().catch(() => undefined); reader.releaseLock(); }
        check();
        if (size !== Number(length)) throw new Error("media_body_incomplete");
        const bytes = new Uint8Array(size); let offset = 0;
        for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
        ownedUrl = URL.createObjectURL(new Blob([bytes], { type: type! }));
        setState({ kind: "decoding", src: ownedUrl });
      } catch {
        if (!retired) setState({ kind: "failed" });
      } finally { clearTimeout(timer); void response?.body?.cancel().catch(() => undefined); }
    };
    if (typeof IntersectionObserver === "undefined") void start();
    else {
      observer = new IntersectionObserver(entries => { if (entries.some(entry => entry.isIntersecting)) void start(); });
      if (frame.current) observer.observe(frame.current);
    }
    return () => { retired = true; observer?.disconnect(); clearTimeout(timer); controller.abort(); if (ownedUrl) URL.revokeObjectURL(ownedUrl); };
  }, [serverId]);
  const src = "src" in state ? state.src : undefined;
  return <span ref={frame} style={{ position: "absolute", inset: 0, display: "inline-flex", alignItems: "center", justifyContent: "center" }}>
    {state.kind !== "loaded" ? fallback : null}
    {src ? (
      // eslint-disable-next-line @next/next/no-img-element -- Per-lifetime private bytes must not enter an optimizer or decoded URL cache.
      <img src={src} alt="" loading="lazy" decoding="async" referrerPolicy="no-referrer"
        onLoad={() => setState({ kind: "loaded", src })} onError={() => setState({ kind: "failed" })}
        style={{ position: "absolute", inset: 0, width: "100%", height: "100%", opacity: state.kind === "loaded" ? 1 : 0 }} />
    ) : null}
  </span>;
}

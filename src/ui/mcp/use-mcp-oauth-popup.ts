"use client";

import { useCallback, useEffect, useLayoutEffect, useRef } from "react";

const CHANNEL = "kokoro:mcp-oauth-complete:v1";
const PENDING_TIMEOUT_MS = 120_000;

type Authorization = Readonly<{
  connectorId: string;
  authorizationUrl: string;
  expiresAt: string;
}>;

type ActivePopup = {
  popup: Window | null;
  controller: AbortController;
  connectorId?: string;
  channel?: BroadcastChannel;
  interval?: ReturnType<typeof setInterval>;
  timeout?: ReturnType<typeof setTimeout>;
  reloaded?: boolean;
};

function validOwnerUrl(value: string): boolean {
  try {
    const url = new URL(value);
    const developmentLoopback =
      process.env.NODE_ENV !== "production" &&
      url.protocol === "http:" &&
      (url.hostname === "localhost" ||
        url.hostname === "127.0.0.1" ||
        url.hostname === "[::1]");
    return (
      (url.protocol === "https:" || developmentLoopback) &&
      url.username === "" &&
      url.password === ""
    );
  } catch {
    return false;
  }
}

export function useMcpOAuthPopup({
  onAuthorizationNavigate,
  onReload,
  lifecycle,
}: {
  onAuthorizationNavigate?: (authorizationUrl: string) => void;
  onReload: () => void;
  /** Local admission owner; it never goes on the OAuth wire. */
  lifecycle?: Readonly<{ admitted: boolean }>;
}) {
  const active = useRef<ActivePopup | null>(null);
  const lifecycleRef = useRef(lifecycle);
  const reload = useRef(onReload);
  useEffect(() => {
    reload.current = onReload;
  }, [onReload]);

  const cleanup = useCallback((current: ActivePopup, close = true) => {
    if (active.current === current) active.current = null;
    current.controller.abort();
    if (current.interval) clearInterval(current.interval);
    if (current.timeout) clearTimeout(current.timeout);
    current.channel?.close();
    if (close && current.popup && !current.popup.closed) current.popup.close();
  }, []);

  const reloadOnce = useCallback((current: ActivePopup) => {
    if (current.reloaded) return;
    current.reloaded = true;
    reload.current();
  }, []);

  useLayoutEffect(
    () => {
      lifecycleRef.current = lifecycle;
      return () => {
        const current = active.current;
        if (current) cleanup(current);
      };
    },
    [cleanup, lifecycle],
  );

  const start = useCallback(
    async (
      request: (signal: AbortSignal) => Promise<Authorization>,
    ): Promise<void> => {
      if (lifecycleRef.current !== lifecycle || lifecycle?.admitted === false) throw new Error("oauth admission retired");
      const previous = active.current;
      if (previous) cleanup(previous);
      const popup = onAuthorizationNavigate
        ? null
        : window.open("", "_blank", "popup=yes,width=560,height=720");
      if (!onAuthorizationNavigate && popup === null)
        throw new Error("oauth popup blocked");
      if (popup) popup.opener = null;
      const current: ActivePopup = {
        popup,
        controller: new AbortController(),
      };
      active.current = current;
      if (popup) {
        current.interval = setInterval(() => {
          if (active.current !== current || !popup.closed) return;
          cleanup(current, false);
          reloadOnce(current);
        }, 250);
      }
      current.timeout = setTimeout(() => {
        if (active.current !== current) return;
        cleanup(current);
        reloadOnce(current);
      }, PENDING_TIMEOUT_MS);
      try {
        const authorization = await request(current.controller.signal);
        if (active.current !== current || lifecycleRef.current !== lifecycle)
          throw new Error("oauth popup request was superseded");
        if (!validOwnerUrl(authorization.authorizationUrl))
          throw new Error("invalid owner authorization URL");
        current.connectorId = authorization.connectorId;
        if (typeof BroadcastChannel !== "undefined") {
          const channel = new BroadcastChannel(CHANNEL);
          current.channel = channel;
          channel.onmessage = (event: MessageEvent<unknown>) => {
            const value = event.data;
            if (
              typeof value !== "object" ||
              value === null ||
              (value as { connector_id?: unknown }).connector_id !==
                current.connectorId
            )
              return;
            if (active.current !== current) return;
            cleanup(current, false);
            reloadOnce(current);
          };
        }
        if (popup) {
          popup.location.replace(authorization.authorizationUrl);
        } else {
          onAuthorizationNavigate?.(authorization.authorizationUrl);
        }
        const expiresAt = Date.parse(authorization.expiresAt);
        const delay = Number.isFinite(expiresAt)
          ? Math.max(0, Math.min(expiresAt - Date.now(), 2_147_483_647))
          : 0;
        if (current.timeout) clearTimeout(current.timeout);
        current.timeout = setTimeout(() => {
          if (active.current !== current) return;
          cleanup(current);
          reloadOnce(current);
        }, delay);
      } catch (error) {
        if (active.current === current) cleanup(current);
        throw error;
      }
    },
    [cleanup, onAuthorizationNavigate, reloadOnce, lifecycle],
  );

  return start;
}

export function publishMcpOAuthCompletion(connectorId: string): void {
  if (typeof BroadcastChannel === "undefined") return;
  const channel = new BroadcastChannel(CHANNEL);
  channel.postMessage({ connector_id: connectorId });
  channel.close();
}

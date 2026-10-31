import { randomUUID } from "node:crypto";
import { z } from "zod";
import { configuredDomain } from "./domain-context";
import { currentProductSession, type ProductClaims } from "./product-session";
import { configuredBffBaseUrl } from "./service-config";
import { requestWithDomain } from "./upstream-http";

export const SERVICE_HEADER = "x-kokoro-service";
export const SERVICE_VALUE = "web-bff";
export const INTERNAL_SECRET_HEADER = "x-kokoro-internal-secret";

export type ProductBffConfig = Readonly<{
  bffBaseUrl: string;
  domain: string;
  internalSecret: string | null;
  session: Readonly<{ redisUrl: string; webOrigin: string; secret: string }>;
}>;

export class ProductSessionUnavailableError extends Error {}

const NATIVE_SESSION_COOKIE_NAMES = new Set([
  "kokoro-issuer.session_token",
  "kokoro-issuer.session_data",
  "kokoro-issuer.dont_remember",
  "kokoro-issuer.session_token.oauth_logout_confirmation",
  "__Secure-kokoro-issuer.session_token",
  "__Secure-kokoro-issuer.session_data",
  "__Secure-kokoro-issuer.dont_remember",
  "__Secure-kokoro-issuer.session_token.oauth_logout_confirmation",
]);

export type NativeSessionBffHeaders =
  | Readonly<{ state: "valid"; headers: Headers }>
  | Readonly<{ state: "missing" | "invalid" }>;

const nativeCurrentUserResponse = z.strictObject({
  data: z.strictObject({
    user_id: z.string().min(1),
    tenant_id: z.string().min(1),
    platform_admin: z.boolean(),
  }),
  meta: z.strictObject({ request_id: z.string().min(1) }),
});

export function productBffConfig(
  env: NodeJS.ProcessEnv = process.env,
): ProductBffConfig | null {
  const bffBaseUrl = configuredBffBaseUrl(env);
  const domain = configuredDomain(env);
  const redisUrl = env.KOKORO_WEB_REDIS_URL?.trim();
  const webOrigin = env.KOKORO_WEB_ORIGIN?.trim();
  const secret = env.KOKORO_WEB_AUTH_SECRET?.trim();
  const internalSecret = env.KOKORO_INTERNAL_SECRET_WEB_BFF?.trim() || null;
  if (
    !bffBaseUrl ||
    !domain ||
    !redisUrl ||
    !webOrigin ||
    !secret ||
    secret.length < 32
  )
    return null;
  try {
    const origin = new URL(webOrigin);
    if (!/^https?:$/u.test(origin.protocol) || origin.origin !== webOrigin)
      return null;
  } catch {
    return null;
  }
  if (env.NODE_ENV === "production" && internalSecret === null) return null;
  return {
    bffBaseUrl,
    domain,
    internalSecret,
    session: { redisUrl, webOrigin, secret },
  };
}

export async function admittedProductSession(
  request: Request,
  config: ProductBffConfig,
): Promise<ProductClaims | null> {
  const requestId = request.headers.get("x-kokoro-request-id") ?? randomUUID();
  const native = nativeSessionBffHeaders(request, config, requestId);
  if (native.state === "invalid") return null;
  if (native.state === "valid") {
    try {
      const upstream = await requestWithDomain(`${config.bffBaseUrl}/v1/me`, config.domain, {
        method: "GET",
        headers: native.headers,
        signal: request.signal,
        timeoutMs: 10_000,
        maxResponseBytes: 65_536,
      });
      const raw = await upstream.json().catch(() => null);
      if (upstream.status === 401 || upstream.status === 403) return null;
      if (upstream.status !== 200) throw new Error("native_session_admission_unavailable");
      const parsed = nativeCurrentUserResponse.safeParse(raw);
      if (!parsed.success) throw new Error("native_session_response_invalid");
      const expiresAt = Date.now() + 60_000;
      return {
        id: "native-session",
        generation: 0,
        access: "",
        accessExpiresAt: expiresAt,
        expiresAt,
        subject: parsed.data.data.user_id,
        issuerSessionId: "native-session",
        ...(native.headers.get("cookie") === null ? {} : { nativeCookie: native.headers.get("cookie")! }),
      };
    } catch (error) {
      if (error instanceof Error && error.message === "native_session_admission_unavailable")
        throw new ProductSessionUnavailableError("Native session admission unavailable");
      if (request.signal.aborted) throw error;
      throw new ProductSessionUnavailableError("Native session admission unavailable");
    }
  }
  try {
    const claims = await currentProductSession(request, config.session);
    if (claims === null || claims.accessExpiresAt <= Date.now()) return null;
    return claims;
  } catch {
    throw new ProductSessionUnavailableError(
      "Product Session inspection unavailable",
    );
  }
}

export function productBffHeaders(
  config: ProductBffConfig,
  claims: ProductClaims,
  requestId: string,
): Headers {
  if (typeof claims.nativeCookie === "string" && claims.nativeCookie.length > 0) {
    const headers = new Headers({
      cookie: claims.nativeCookie,
      origin: config.session.webOrigin,
      accept: "application/json",
      [SERVICE_HEADER]: SERVICE_VALUE,
      "x-kokoro-request-id": requestId,
    });
    if (config.internalSecret !== null) headers.set(INTERNAL_SECRET_HEADER, config.internalSecret);
    return headers;
  }
  const headers = new Headers({
    authorization: `Bearer ${claims.access}`,
    [SERVICE_HEADER]: SERVICE_VALUE,
    "x-kokoro-request-id": requestId,
  });
  if (config.internalSecret !== null)
    headers.set(INTERNAL_SECRET_HEADER, config.internalSecret);
  return headers;
}

/**
 * Same-origin adapter for the IAM native session boundary.
 *
 * The browser's complete Cookie header never crosses into BFF. Unknown
 * cookies are dropped, duplicate/empty allowlisted cookies fail closed, and
 * the adapter supplies the configured web Origin rather than trusting a
 * browser-provided identity or tenant header.
 */
export function nativeSessionBffHeaders(
  request: Request,
  config: ProductBffConfig,
  requestId: string,
): NativeSessionBffHeaders {
  const raw = request.headers.get("cookie");
  if (raw === null || raw.trim() === "") return { state: "missing" };
  const values = new Map<string, string>();
  let found = false;
  for (const part of raw.split(";")) {
    const separator = part.indexOf("=");
    const name = (separator <= 0 ? part : part.slice(0, separator)).trim();
    if (!NATIVE_SESSION_COOKIE_NAMES.has(name)) continue;
    if (separator <= 0) return { state: "invalid" };
    const value = part.slice(separator + 1).trim();
    found = true;
    if (value.length === 0 || values.has(name)) return { state: "invalid" };
    values.set(name, value);
  }
  if (!found || values.size === 0) return { state: "missing" };
  const headers = new Headers({
    cookie: [...values].map(([name, value]) => `${name}=${value}`).join("; "),
    origin: config.session.webOrigin,
    accept: "application/json",
    [SERVICE_HEADER]: SERVICE_VALUE,
    "x-kokoro-request-id": requestId,
  });
  if (config.internalSecret !== null)
    headers.set(INTERNAL_SECRET_HEADER, config.internalSecret);
  return { state: "valid", headers };
}

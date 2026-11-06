import { configuredDomain } from "./domain-context";
import { configuredBffBaseUrl } from "./service-config";

export const SERVICE_HEADER = "x-kokoro-service";
export const SERVICE_VALUE = "web-bff";
export const INTERNAL_SECRET_HEADER = "x-kokoro-internal-secret";

export type ProductBffConfig = Readonly<{
  bffBaseUrl: string;
  domain: string;
  internalSecret: string | null;
  session: Readonly<{ webOrigin: string }>;
}>;

const NATIVE_SESSION_COOKIE_NAMES = new Set([
  "kokoro-issuer.session_token",
  "kokoro-issuer.session_data",
  "kokoro-issuer.dont_remember",
  "__Secure-kokoro-issuer.session_token",
  "__Secure-kokoro-issuer.session_data",
  "__Secure-kokoro-issuer.dont_remember",
]);

export type NativeSessionBffHeaders =
  | Readonly<{ state: "valid"; headers: Headers }>
  | Readonly<{ state: "missing" | "invalid" }>;

function validWebOrigin(raw: string | undefined): string | null {
  const value = raw?.trim();
  if (!value) return null;
  try {
    const origin = new URL(value);
    if (!/^https?:$/u.test(origin.protocol) || origin.origin !== value) return null;
    return origin.origin;
  } catch {
    return null;
  }
}

export function nativeProductBffConfig(
  env: NodeJS.ProcessEnv = process.env,
): ProductBffConfig | null {
  const bffBaseUrl = configuredBffBaseUrl(env);
  const domain = configuredDomain(env);
  const webOrigin = validWebOrigin(env.KOKORO_WEB_ORIGIN);
  const internalSecret = env.KOKORO_INTERNAL_SECRET_WEB_BFF?.trim() || null;
  if (!bffBaseUrl || !domain || !webOrigin) return null;
  if (env.NODE_ENV === "production" && internalSecret === null) return null;
  return { bffBaseUrl, domain, internalSecret, session: { webOrigin } };
}

export function productBffConfig(
  env: NodeJS.ProcessEnv = process.env,
): ProductBffConfig | null {
  return nativeProductBffConfig(env);
}

export class InvalidBrowserCookieError extends Error {}

/** Build only the credential transport; BFF authenticates the current user. */
export function productBffHeaders(config: ProductBffConfig, request: Request, requestId: string): Headers {
  const native = nativeSessionBffHeaders(request, config, requestId)
  if (native.state === "invalid") throw new InvalidBrowserCookieError("Ambiguous browser cookies")
  if (native.state === "valid") return native.headers
  return new Headers({
    origin: config.session.webOrigin, accept: "application/json",
    [SERVICE_HEADER]: SERVICE_VALUE, "x-kokoro-request-id": requestId,
    ...(config.internalSecret === null ? {} : { [INTERNAL_SECRET_HEADER]: config.internalSecret }),
  })
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
  config: Pick<ProductBffConfig, "internalSecret" | "session">,
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
    if (value.length === 0 || /[\u0000-\u001f\u007f]/u.test(value) || values.has(name)) return { state: "invalid" };
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

import { configuredDomain } from "./domain-context";
import { currentProductSession, type ProductClaims } from "./product-session";
import { configuredBffBaseUrl } from "./service-config";

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
  const headers = new Headers({
    authorization: `Bearer ${claims.access}`,
    [SERVICE_HEADER]: SERVICE_VALUE,
    "x-kokoro-request-id": requestId,
  });
  if (config.internalSecret !== null)
    headers.set(INTERNAL_SECRET_HEADER, config.internalSecret);
  return headers;
}

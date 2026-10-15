/**
 * Browser-side mirror of the Product MCP header admission boundary.
 *
 * Header values deliberately remain opaque to the UI.  This only prevents a
 * user from submitting hop-by-hop, credential, or Kokoro-reserved names that
 * the BFF will reject before it can create or update a connector.
 */
const FORBIDDEN_HEADER_NAMES = new Set([
  "authorization",
  "connection",
  "content-length",
  "cookie",
  "host",
  "proxy-authorization",
  "proxy-connection",
  "forwarded",
  "traceparent",
  "tracestate",
  "baggage",
  "transfer-encoding",
]);

export function isMcpCustomHeaderName(value: string): boolean {
  const name = value.trim().toLowerCase();
  return (
    /^[!#$%&'*+.^_`|~0-9a-z-]{1,128}$/u.test(name) &&
    !FORBIDDEN_HEADER_NAMES.has(name) &&
    !["proxy-", "sec-", "x-kokoro-", "x-forwarded-"].some((prefix) =>
      name.startsWith(prefix),
    )
  );
}

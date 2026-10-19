import { randomUUID } from "node:crypto"

/** Same nonce policy at the final Proxy and the standalone failure document. */
export function oidcLoginDocumentPolicy(nonce: string): string {
  return `default-src 'none'; style-src 'nonce-${nonce}'; form-action 'none'; base-uri 'none'; frame-ancestors 'none'`
}

/** Browser navigation recovery only: API clients keep the original error contract. */
export function oidcLoginRecovery(request: Request, status: number): Response | null {
  const acceptsHtml = request.headers.get("accept")?.split(",").some(value => {
    const [mediaType, ...parameters] = value.split(";").map(part => part.trim())
    if (mediaType?.toLowerCase() !== "text/html") return false
    const weights = parameters.filter(parameter => /^q\s*=/iu.test(parameter))
    if (weights.length === 0) return true
    if (weights.length !== 1) return false
    const quality = /^q\s*=\s*(0(?:\.[0-9]{0,3})?|1(?:\.0{0,3})?)$/iu.exec(weights[0]!)
    return quality !== null && Number(quality[1]) > 0
  })
  if (!acceptsHtml) return null
  const nonce = request.headers.get("x-nonce")
  if (!nonce || !/^[A-Za-z0-9_-]{16,128}$/u.test(nonce)) return null
  return new Response(`<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="referrer" content="no-referrer"><meta name="robots" content="noindex"><title>重新登录 · Kokoro</title><style nonce="${nonce}">body{margin:0;min-height:100dvh;display:grid;place-items:center;background:#fafafa;color:#202020;font:14px/1.5 system-ui,sans-serif}main{max-width:360px;margin:24px;padding:32px}h1{font-size:20px;font-weight:500}p{color:#666}a{display:inline-block;margin-top:16px;padding:8px 16px;border-radius:8px;background:#202020;color:white;text-decoration:none}a:focus-visible{outline:2px solid Highlight;outline-offset:4px}</style></head><body><main><h1>请重新发起登录</h1><p>这次登录尚未完成。请重新登录后继续；若仍未成功，请稍后再试。</p><a href="/login">重新登录</a></main></body></html>`, {
    status,
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
      "referrer-policy": "no-referrer",
      "content-security-policy": oidcLoginDocumentPolicy(nonce),
      "x-request-id": randomUUID(),
      vary: "Accept",
    },
  })
}

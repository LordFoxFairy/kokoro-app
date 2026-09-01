// 浏览器端 Chat / artifact client 的兼容 base：同源 BFF 代理前缀（AUTH-P0）。
// 真实业务地址只留在服务端 `/api/session` adapter；浏览器不读取独立服务基址、不持 bearer。
// `SESSION_PROXY_BASE` 与 `sessionBaseUrl()` 是现有 client/mocks 的稳定导出，保持兼容。
export const CHAT_PROXY_BASE = "/api/session"
export const SESSION_PROXY_BASE = CHAT_PROXY_BASE

export function sessionBaseUrl(): string {
  return SESSION_PROXY_BASE
}

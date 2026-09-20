import { useT } from "@/i18n/context"
import { HubClientError } from "@/hub/client"
import type { McpSecret, McpServerView, McpTransport } from "@/hub/schemas"

export const OFFICIAL_SCOPE = "official"
export const MCP_KEY = "hub/mcp"

export type Translate = ReturnType<typeof useT>
export type McpData = { servers: McpServerView[]; secrets: McpSecret[] }
export type ServerBusy = { name: string; action: "toggle" | "delete" } | null
export type McpCreateMode = "form" | "json" | "url"

// hub 稳定错误码 → 人话文案。非 HubClientError 或未知码回退通用失败。
export function humanizeError(t: Translate, error: unknown): string {
  if (!(error instanceof HubClientError)) {
    return t("mcp.errGeneric")
  }
  switch (error.code) {
    case "capability_registration_disabled":
      return t("mcp.errMutationOff")
    case "secret_broker_disabled":
      return t("mcp.errSecretOff")
    case "hub.mcp_url_forbidden":
      return t("mcp.errUrl")
    case "hub.mcp_secret_ref_invalid":
    case "hub.mcp_secret_ref_unknown":
      return t("mcp.errSecretRef")
    case "hub.mcp_server_not_found":
      return t("mcp.errNotFound")
    case "request.invalid":
      return t("mcp.errInvalid")
    default:
      return t("mcp.errGeneric")
  }
}

export function transportLabel(t: Translate, transport: McpTransport): string {
  return transport === "http" ? t("mcp.transportHttp") : t("mcp.transportStreamable")
}

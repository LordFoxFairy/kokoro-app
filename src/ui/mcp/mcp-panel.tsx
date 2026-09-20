"use client"

import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog"
import { useT } from "@/i18n/context"
import { cn } from "@/lib/utils"
import type { HubClient } from "@/hub/client"

import styles from "./mcp-panel.module.css"
import { McpContent } from "./mcp-content"
import { useOverlayClose } from "@/ui/shell/use-overlay-close"

export type { McpCreateMode } from "./mcp-panel-model"
export { McpContent } from "./mcp-content"
export { McpCreateDialog } from "./mcp-create-dialog"

// 连接面板（MCP-UX）：hub self 面的 MCP server 池（注册/启停/软删）+ 凭据 handle 管理
// （创建/列表/删除，值只进不出）。scope 恒由 BFF 从信封 namespace 派生，前端不碰身份轴。
// official 位只读（徽标标注），namespace 自有项可启停/软删。revision/config_hash 是内部机制，
// 不向用户呈现——只呈现「已更新」语义。hub 拒绝（mutation 门 / 私网 URL / 非法凭据引用）经错误码人话化。

type McpPanelProps = {
  client: HubClient
  onClose: () => void
  brandName?: string
}

export function McpPanel({ client, onClose, brandName }: McpPanelProps) {
  const t = useT()
  const { open, requestClose, onCloseAutoFocus } = useOverlayClose(onClose)
  return (
    <Dialog open={open} onOpenChange={(nextOpen) => { if (!nextOpen) requestClose() }}>
      <DialogContent
        className={cn(styles.panel, "p-0 box-border")}
        data-testid="mcp-panel"
        closeLabel={t("mcp.close")}
        closeButtonTestId="mcp-close"
        onCloseAutoFocus={onCloseAutoFocus}
      >
        <DialogTitle className="sr-only">{t("mcp.title")}</DialogTitle>
        <header className={styles.head}>
          <div>
            <h2 className={styles.title}>{t("mcp.title")}</h2>
            <p className={styles.subtitle}>{t("mcp.subtitle")}</p>
          </div>
        </header>
        <McpContent client={client} {...(brandName === undefined ? {} : { brandName })} />
      </DialogContent>
    </Dialog>
  )
}

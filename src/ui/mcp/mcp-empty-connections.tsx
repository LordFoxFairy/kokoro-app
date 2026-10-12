"use client"

import { Cable, Plus } from "lucide-react"

import { Button } from "@/components/ui/button"
import { useT } from "@/i18n/context"

import styles from "./mcp-projection-read.module.css"

export function McpEmptyConnections({ brandName, onBrowse }: { brandName: string; onBrowse: () => void }) {
  const t = useT()
  return (
    <div className={styles.emptyConnections}>
      <Cable aria-hidden="true" />
      <span className="sr-only">{t("mcp.empty")}</span>
      <p>{t("mcp.emptyGuideEmbedded", { brand: brandName })}</p>
      <Button type="button" variant="outline" className={styles.emptyAddButton} onClick={onBrowse}>
        <Plus aria-hidden="true" />{t("mcp.addConnector")}
      </Button>
    </div>
  )
}

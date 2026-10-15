"use client"

import { useRef } from "react"
import { Braces, ChevronDown, Globe2, KeyRound, Plus, Search, Server } from "lucide-react"

import { Button } from "@/components/ui/button"
import { DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import { useT } from "@/i18n/context"

import type { McpCreateMode } from "./mcp-panel-model"
import styles from "./mcp-projection-read.module.css"

export function McpSettingsToolbar({
  view,
  query,
  onQueryChange,
  onBrowse,
  onCreate,
  showBrowse = true,
  showSearch = true,
  settingsLayout = false,
}: {
  view: "catalog" | "connections"
  settingsLayout?: boolean
  query: string
  onQueryChange: (value: string) => void
  onBrowse: (target: HTMLElement) => void
  onCreate?: (mode: McpCreateMode, target: HTMLElement | null) => void
  showBrowse?: boolean
  /** The plaza owns its directory search below the featured/header row. */
  showSearch?: boolean
}) {
  const t = useT()
  const triggerRef = useRef<HTMLButtonElement | null>(null)

  return (
    <div className={styles.settingsToolbar}>
      {showSearch ? <label className={styles.searchField}>
          <Search aria-hidden="true" />
          <span className="sr-only">{t("plugins.search")}</span>
          <Input type="search" value={query} onChange={(event) => onQueryChange(event.target.value)} placeholder={t("plugins.search")} />
        </label> : null}
      <div className={styles.toolbarActions}>
        {showBrowse ? <Button type="button" variant="outline" className={styles.toolbarButton} data-settings-layout={settingsLayout || undefined} data-settings-control="browse" onClick={(event) => onBrowse(event.currentTarget)}>
          {view === "connections" ? t("mcp.browse") : t("plugins.manageConnectors")}
        </Button> : null}
        {onCreate ? <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button ref={triggerRef} type="button" variant="outline" className={styles.toolbarButton} data-settings-layout={settingsLayout || undefined} data-settings-control="create">
              {settingsLayout ? null : <Plus aria-hidden="true" />}{t("plugins.create")}<ChevronDown aria-hidden="true" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className={styles.createMenu}>
            <DropdownMenuGroup>
              <DropdownMenuItem onSelect={() => onCreate("custom-api", triggerRef.current)}><KeyRound aria-hidden="true" />{t("connectorCatalog.customApi")}</DropdownMenuItem>
              <DropdownMenuItem onSelect={() => onCreate("form", triggerRef.current)}><Server aria-hidden="true" />{t("connectorCatalog.customMcp")}</DropdownMenuItem>
              <DropdownMenuItem onSelect={() => onCreate("json", triggerRef.current)}><Braces aria-hidden="true" />{t("connectorCatalog.importMcpJson")}</DropdownMenuItem>
              <DropdownMenuSeparator className={styles.createMenuDivider} />
              <DropdownMenuItem onSelect={() => onCreate("url", triggerRef.current)}><Globe2 aria-hidden="true" />{t("connectorCatalog.addMcpUrl")}<span className={styles.betaBadge}>{t("connectorCatalog.beta")}</span></DropdownMenuItem>
            </DropdownMenuGroup>
          </DropdownMenuContent>
        </DropdownMenu> : null}
      </div>
    </div>
  )
}

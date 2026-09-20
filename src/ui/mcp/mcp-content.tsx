"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { Button } from "@/components/ui/button"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Skeleton } from "@/components/ui/skeleton"
import { Spinner } from "@/components/ui/spinner"
import { useT } from "@/i18n/context"
import { cn } from "@/lib/utils"
import { invalidate, useResource } from "@/lib/query"
import type { HubClient } from "@/hub/client"

import styles from "./mcp-panel.module.css"
import { MCP_KEY, type McpData } from "./mcp-panel-model"
import { ServersTab } from "./mcp-servers-tab"
import { SecretsTab } from "./mcp-secrets-tab"

export type McpContentProps = {
  client: HubClient
  embedded?: boolean
  brandName?: string
}

export function McpContent({ client, embedded = false, brandName = "Workspace" }: McpContentProps) {
  const t = useT()
  const [tab, setTab] = useState<"servers" | "secrets">("servers")
  const activeTabRef = useRef<HTMLButtonElement | null>(null)

  useEffect(() => {
    activeTabRef.current?.scrollIntoView({ block: "nearest", inline: "nearest" })
  }, [tab])

  // server + secret 合并读经查询层：servers 是主体（失败即 error）；secrets 尽力而为——secret
  // broker 未配置（503 secret_broker_disabled）不该拖垮整个连接面板，容错回空池。
  const data = useResource<McpData>(
    MCP_KEY,
    useCallback(async (): Promise<McpData> => {
      const [servers, secrets] = await Promise.all([
        client.listMcpServers(),
        client.listMcpSecrets().catch(() => []),
      ])
      return { servers, secrets }
    }, [client]),
  )

  // 变更后失活重取（保持 async 签名，子组件仍可 await；invalidate 本身同步）。
  const reload = useCallback(async () => {
    invalidate(MCP_KEY)
  }, [])

  const servers = data.data?.servers ?? []
  const secrets = data.data?.secrets ?? []
  const failed = data.error !== undefined && data.data === undefined

  const renderUnavailable = () => data.data === undefined ? (
    failed ? (
      <div className={styles.hint}>
        <p>{t("mcp.loadError")}</p>
        <Button variant="outline" type="button" className={styles.retry} disabled={data.loading} aria-busy={data.loading} onClick={data.refetch}>
          {data.loading ? <Spinner aria-hidden="true" /> : null}
          {data.loading ? t("mcp.loading") : t("mcp.retry")}
        </Button>
      </div>
    ) : (
      <div className={styles.loadingState} role="status" aria-label={t("mcp.loading")}>
        <Skeleton className={styles.loadingLine} />
        <Skeleton className={styles.loadingLine} />
        <Skeleton className={styles.loadingLineShort} />
      </div>
    )
  ) : null

  return (
    <Tabs
      value={tab}
      onValueChange={(value) => setTab(value as "servers" | "secrets")}
      className={cn(styles.tabs, embedded && styles.embeddedTabs)}
    >
      <TabsList variant="line" className={styles.tabList}>
        <TabsTrigger
          value="servers"
          className={styles.tab}
          ref={tab === "servers" ? activeTabRef : undefined}
          aria-label={embedded ? `${t("mcp.tabServers")} (${t("mcp.title")})` : undefined}
          onClick={() => setTab("servers")}
        >
          {t("mcp.tabServers")}
        </TabsTrigger>
        <TabsTrigger
          value="secrets"
          className={styles.tab}
          ref={tab === "secrets" ? activeTabRef : undefined}
          aria-label={embedded ? `${t("mcp.tabSecrets")} (${t("mcp.title")})` : undefined}
          onClick={() => setTab("secrets")}
        >
          {t("mcp.tabSecrets")}
        </TabsTrigger>
      </TabsList>

      <TabsContent value="servers" className={cn(styles.body, embedded && styles.embeddedBody)} data-embedded={embedded || undefined}>
        {data.data === undefined ? renderUnavailable() : <ServersTab client={client} servers={servers} secrets={secrets} onChanged={reload} embedded={embedded} brandName={brandName} />}
      </TabsContent>
      <TabsContent value="secrets" className={cn(styles.body, embedded && styles.embeddedBody)} data-embedded={embedded || undefined}>
        {data.data === undefined ? renderUnavailable() : <SecretsTab client={client} secrets={secrets} onChanged={reload} />}
      </TabsContent>
    </Tabs>
  )
}

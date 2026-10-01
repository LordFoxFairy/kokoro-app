"use client"

import { Folder } from "lucide-react"

import { DEFAULT_BRAND } from "@/config/brand"
import { useT } from "@/i18n/context"
import { cn } from "@/lib/utils"

import styles from "./kokoro-project-workspace.module.css"
import layoutStyles from "./project-workspace-layout.module.css"
import { Button } from "@/components/ui/button"
import type { Project } from "@/contract/project"
import type { ProjectReadState } from "./use-project-list"

export function ProjectIdentity({ brandName = DEFAULT_BRAND.name, preview = false, projectDetail, onRetryProjectRead }: {
  brandName?: string
  preview?: boolean
  projectDetail?: ProjectReadState<Project>
  onRetryProjectRead?: () => void
}) {
  const t = useT()

  return (
    <header className={cn(styles.projectIdentity, layoutStyles.projectIdentity)}>
      <span className={styles.projectMark} aria-hidden="true"><Folder /></span>
      <div>
        <h1>{preview ? t("firstSite.kokoro", { brand: brandName }) : projectDetail?.status === "ready" ? projectDetail.data.name : t("firstSite.projectsUnavailable")}</h1>
        {preview ? <p className={styles.projectMeta}>
          <span>{t("firstSite.projectCreatedBy")}</span>
          <span aria-hidden="true"> · </span>
          <span>{t("firstSite.projectUpdatedToday")}</span>
        </p> : projectDetail?.status === "ready" ? (
          <p className={styles.projectMeta}><time dateTime={projectDetail.data.updated_at}>{projectDetail.data.updated_at}</time></p>
        ) : projectDetail?.status === "error" ? (
          <div role="alert" data-testid="project-detail-error">
            <p>{t("firstSite.projectsError")}</p>
            <Button type="button" variant="outline" onClick={onRetryProjectRead} disabled={!onRetryProjectRead || !projectDetail.retryable}>{t("firstSite.retry")}</Button>
          </div>
        ) : <p role="status" data-testid="project-detail-loading">{t(projectDetail?.status === "loading" ? "firstSite.projectsLoading" : "firstSite.projectsUnavailable")}</p>}
      </div>
    </header>
  )
}

"use client"

import { Folder } from "lucide-react"

import { DEFAULT_BRAND } from "@/config/brand"
import { useT } from "@/i18n/context"

import styles from "./kokoro-project-workspace.module.css"

export function ProjectIdentity({ brandName = DEFAULT_BRAND.name }: { brandName?: string }) {
  const t = useT()

  return (
    <header className={styles.projectIdentity}>
      <span className={styles.projectMark} aria-hidden="true"><Folder /></span>
      <div>
        <h1>{t("firstSite.kokoro", { brand: brandName })}</h1>
        <p className={styles.projectMeta}>
          <span>{t("firstSite.projectCreatedBy")}</span>
          <span aria-hidden="true"> · </span>
          <span>{t("firstSite.projectUpdatedToday")}</span>
        </p>
      </div>
    </header>
  )
}

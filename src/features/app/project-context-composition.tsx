"use client"
import { ChevronDown, ChevronRight, ListFilter, Plus, Upload, X } from "lucide-react"
import { useLayoutEffect, useRef, type MouseEvent, type ReactNode } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import type { EmptyStateProps } from "@/components/blocks/app-frame/app-frame.types"
import { useT } from "@/i18n/context"
import { ProjectContextSection } from "./project-context-card"
import { ProjectSkillsSection } from "./project-skills-section"
import { ProjectMcpRecommendationsSection } from "./project-mcp-recommendations-section"
import type { ResourceKind } from "./project-workspace-model"
import styles from "./kokoro-project-workspace.module.css"
import layoutStyles from "./project-workspace-layout.module.css"
import contextStyles from "./project-context-composition.module.css"
type ContextProps = Pick<EmptyStateProps, "preview" | "workspaceCapabilities" | "projectDetail" | "projectReadBoundary" | "projectRef" | "projectHistoryStatus" | "projectHistoryRetryable" | "onRetryProjectRead" | "onOpenSettings" | "projectMcpRecommendations">
type Props = { [K in keyof ContextProps]?: ContextProps[K] | undefined } & {
 retirementKey: number; active: boolean; task: boolean; onClose?: (() => void) | undefined; children?: ReactNode;
 instructionsAvailable: boolean;
 onInstructions: (event: MouseEvent<HTMLButtonElement>) => void;
 onResources: (event: MouseEvent<HTMLButtonElement>, kind?: ResourceKind) => void;
 onUpload: (event: MouseEvent<HTMLButtonElement>) => void;
}
export function ProjectContextComposition({ retirementKey, active, task, onClose, children, instructionsAvailable, onInstructions, onResources, onUpload,
 preview = false, workspaceCapabilities: capabilities, projectDetail, projectReadBoundary, projectRef, onOpenSettings, projectMcpRecommendations }: Props) {
 const t = useT()
 const heading = useRef<HTMLHeadingElement>(null)
 useLayoutEffect(() => {
   if (!task || !active) return
   const frame = requestAnimationFrame(() => { if (!document.querySelector('[role="dialog"],[role="menu"]')) heading.current?.focus({ preventScroll: true }) })
   return () => cancelAnimationFrame(frame)
 }, [task, active])
 return <aside className={`${styles.context} ${task ? contextStyles.task : layoutStyles.context}`} data-project-context="true" hidden={!active} inert={!active ? true : undefined} aria-label={t("firstSite.workspaceStatus")}
 onKeyDown={event => { if (event.key === "Escape" && event.currentTarget.contains(event.target as Node) && !(event.target as Element).closest('[role="dialog"],[role="menu"]')) { event.stopPropagation(); onClose?.() } }}>
 {task ? <header className={contextStyles.header}><h2 ref={heading} tabIndex={-1}>{t("firstSite.projectSettings")}</h2><Button type="button" size="icon-sm" variant="ghost" aria-label={t("firstSite.closeProjectSettings")} onClick={onClose}><X aria-hidden="true" /></Button></header> : null}
          {(capabilities?.instructions || capabilities?.connectors) ? (
            <Card className={styles.contextCard} data-context-kind="instructions">
              {capabilities?.instructions ? (
                <CardHeader className={styles.cardHeader}>
                  <CardTitle className={styles.cardTitle}>
                    <Button type="button" variant="ghost" size="sm" disabled={!instructionsAvailable} onClick={onInstructions}>
                      {t("firstSite.instructions")}
                      <ChevronRight data-icon="inline-end" aria-hidden="true" />
                    </Button>
                  </CardTitle>
                </CardHeader>
              ) : null}
              {capabilities?.instructions ? (
                <CardContent className={styles.cardDescription}>
                  {t("firstSite.instructionsHint")}
                </CardContent>
              ) : null}
              {capabilities?.instructions ? (
                <CardFooter className={styles.instructionAction}>
                  <Button type="button" variant="outline" size="sm"
                    aria-label={`${t("firstSite.add")}${t("firstSite.instructions")}`}
                    disabled={!instructionsAvailable}
                    onClick={onInstructions}>
                    <Plus aria-hidden="true" />{t("firstSite.add")}
                  </Button>
                </CardFooter>
              ) : null}
              {capabilities?.connectors ? (
                <ProjectMcpRecommendationsSection active={active} model={projectMcpRecommendations} />
              ) : null}
            </Card>
          ) : null}

          {(capabilities?.resources || capabilities?.skills) ? (
            <Card className={styles.contextCard} data-context-kind="resources-skills">
              {capabilities.resources ? (
                <section data-context-section="resources" aria-label={t("firstSite.filesAndResources")}><ProjectContextSection
                  title={t("firstSite.filesAndResources")}
                  description={t("firstSite.filesHint")}
                  actions={[
                    { id: "upload", label: t("firstSite.upload"), icon: Upload, trailingIcon: ChevronDown },
                    { id: "search-web", label: t("firstSite.searchWeb"), icon: ListFilter },
                  ]}
                  showChevron
                  onClick={(event) => {
                    onResources(event)
                  }}
                  onAction={(id, event) => {
                    if (id === "upload") {
                      onUpload(event)
                      return
                    }
                    if (id === "search-web") {
                      onResources(event, "web")
                    }
                  }}
                /></section>
              ) : null}
              {capabilities.skills ? (
                <ProjectSkillsSection active={active} key={JSON.stringify([projectReadBoundary?.subject ?? null, projectRef ?? null, retirementKey])}
                  preview={preview} {...(projectDetail === undefined ? {} : { projectDetail })}
                  {...(projectReadBoundary === undefined ? {} : { projectReadBoundary })}
                  {...(onOpenSettings === undefined ? {} : { onOpenSettings })} />
              ) : null}
            </Card>
          ) : null}
{children}</aside>
}

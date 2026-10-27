import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogTitle } from "@/components/ui/dialog"
import { useT } from "@/i18n/context"
import type { ProjectResourcePreview } from "./project-workspace-model"
import type { useProjectResourceActions } from "./use-project-resource-actions"
import styles from "./project-resource-detail.module.css"
export type ProjectResourceActions = ReturnType<typeof useProjectResourceActions>
export function ProjectResourceDetail({
  actions,
  presentation,
  onReturnFocus,
}: {
  actions: ProjectResourceActions
  presentation?: ProjectResourcePreview | undefined
  onReturnFocus: () => void
}) {
  const t = useT(),
    item = actions.metadata
  const knownRow = presentation?.id === actions.selected ? presentation : undefined
  const pending = actions.deleteState === "pending"
  return (
    <Dialog
      open={actions.selected !== null}
      onOpenChange={(open) => {
        if (!open) actions.close()
      }}
    >
      <DialogContent
        className={styles.detail}
        aria-busy={actions.loading || actions.downloadState === "pending"}
        closeLabel={t("shell.closeDialog")}
        onCloseAutoFocus={(event) => {
          event.preventDefault()
          onReturnFocus()
        }}
      >
        <DialogTitle>{item?.filename ?? knownRow?.name ?? t("firstSite.resourceDetail")}</DialogTitle>
        <DialogDescription>{t("firstSite.resourceDetailDescription")}</DialogDescription>
        {!item && knownRow ? <p>{knownRow.detail}</p> : null}
        {actions.loading ? (
          <p role="status" className="sr-only">
            {t("firstSite.resourceListLoading")}
          </p>
        ) : null}
        {actions.error ? (
          <p role="status" className="sr-only">
            {t("firstSite.resourceListFailed")}
          </p>
        ) : null}
        {
          <dl className={styles.metadata}>
            <div>
              <dt>{t("library.detailFilename")}</dt>
              <dd>{item?.filename ?? knownRow?.name ?? "—"}</dd>
            </div>
            <div>
              <dt>{t("library.detailType")}</dt>
              <dd>{item?.mime_type ?? "—"}</dd>
            </div>
            <div>
              <dt>{t("library.detailSize")}</dt>
              <dd>{item ? `${item.size_bytes} B` : "—"}</dd>
            </div>
          </dl>
        }
        {actions.deleteState === "confirm" ? (
          <p role="alert">{t("firstSite.resourceDeleteConfirm", { name: item?.filename ?? actions.selected ?? "" })}</p>
        ) : null}
        {actions.deleteState === "unknown" ? <p role="alert">{t("firstSite.resourceDeleteUnknown")}</p> : null}
        {actions.deleteState === "pending" ? <p role="status">{t("firstSite.resourceDeleting")}</p> : null}
        {actions.deleteState === "rejected" || actions.deleteState === "forbidden" ? (
          <p role="alert">{t(actions.deleteState === "forbidden" ? "firstSite.resourceDeleteForbidden" : "firstSite.resourceDeleteRejected")}</p>
        ) : null}
        {actions.downloadState !== "idle" ? (
          <p className={actions.downloadState === "pending" ? "sr-only" : undefined} role={actions.downloadState === "error" ? "alert" : "status"}>
            {t(
              actions.downloadState === "error"
                ? "library.downloadFailed"
                : actions.downloadState === "pending"
                  ? "library.downloading"
                  : "library.downloadStarted",
            )}
          </p>
        ) : null}
        <DialogFooter className={styles.actions}>
          <Button variant="outline" onClick={actions.close}>
            {t("firstSite.cancel")}
          </Button>
          <Button aria-busy={actions.downloadState === "pending"} disabled={!item || pending || actions.downloadState === "pending"} onClick={actions.download}>
            {t("library.fileDownload")}
          </Button>
          {actions.deleteState === "confirm" || actions.deleteState === "unknown" ? (
            <Button variant="destructive" disabled={pending} onClick={actions.confirmDelete}>
              {t(actions.deleteState === "unknown" ? "firstSite.resourceDeleteRetry" : "firstSite.resourceDelete")}
            </Button>
          ) : (
            <Button variant="destructive" disabled={!item || pending || actions.deleteState === "forbidden"} onClick={actions.askDelete}>
              {t("firstSite.resourceDelete")}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

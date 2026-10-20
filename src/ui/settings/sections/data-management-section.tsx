"use client";
import { useId, useLayoutEffect, useRef, useState } from "react";
import { ArrowLeft } from "lucide-react";
import { useLocale } from "@/i18n/context";
import { Button } from "@/components/ui/button";
import type { ProjectReadBoundary } from "@/ui/auth/use-session-state";
import { useArchivedTasks } from "../use-archived-tasks";
import { archiveIdAvailable, type ArchiveState } from "@/lib/archived-tasks.schema";
import { useSharedTasks } from "../use-shared-tasks";
import { DataManagementDetails, DataManagementDetailsDialog, type DataManagementDetailKind } from "./data-management-details-dialog";
import styles from "./settings-sections.module.css";

export function DataManagementSection({
  preview,
  readBoundary,
  onArchiveChanged,
}: {
  preview: boolean;
  readBoundary?: ProjectReadBoundary;
  onArchiveChanged?: (state:ArchiveState)=>void;
}) {
  const { t } = useLocale();
  const scope = readBoundary?.admitted
    ? `${readBoundary.subject}:${readBoundary.generation}`
    : null;
  return (
    <DataContent
      key={`${preview}:${scope}`}
      preview={preview}
      {...(readBoundary === undefined ? {} : { readBoundary })}
      {...(onArchiveChanged===undefined?{}:{onArchiveChanged})}
      t={t}
    />
  );
}
function DataContent({
  preview,
  readBoundary,
  t,
  onArchiveChanged,
}: {
  preview: boolean;
  readBoundary?: ProjectReadBoundary;
  onArchiveChanged?: (state:ArchiveState)=>void;
  t: ReturnType<typeof useLocale>["t"];
}) {
  const archived=useArchivedTasks({preview,...(readBoundary?{boundary:readBoundary}:{}),...(onArchiveChanged?{onChanged:onArchiveChanged}:{})});
  const managementId = useId();
  const data = useSharedTasks(preview, readBoundary),
    [target, setTarget] = useState<string | null>(null);
  const [detail, setDetail] = useState<DataManagementDetailKind | null>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const managementRefs = useRef<Partial<Record<DataManagementDetailKind, HTMLButtonElement | null>>>({});
  const previousDetail = useRef<DataManagementDetailKind | null>(null);
  useLayoutEffect(() => {
    if (detail) {
      previousDetail.current = detail;
      headingRef.current?.focus();
    } else if (previousDetail.current) {
      managementRefs.current[previousDetail.current]?.focus();
      previousDetail.current = null;
    }
  }, [detail]);
  const title = detail === "apps" ? t("data.authorizedApps") : detail === "browser" ? t("data.cloudBrowser") : detail === "domains" ? t("data.domains") : t("settings.dataManagementTitle");
  return (
    <div
      className={styles.dataManagement}
      data-testid="settings-data-management"
      role={detail ? "region" : undefined}
      aria-label={detail ? title : undefined}
    >
      <header className={styles.serviceSubpageHeader}>
        {detail ? <Button type="button" variant="ghost" size="icon" aria-label={t("data.back")} onClick={() => setDetail(null)}><ArrowLeft aria-hidden="true" /></Button> : null}
        <h1 ref={headingRef} tabIndex={detail ? -1 : undefined}>{title}</h1>
      </header>
      {detail ? <DataManagementDetails kind={detail} /> : <>
      <section>
        <div className={styles.dataSectionHeading}>
          <h2>{t("data.sharedTasks")}</h2>
          {data.available ? <Button type="button" variant="outline" size="sm" disabled={data.busy} onClick={() => void data.reload()}>{t("data.reload")}</Button> : null}
        </div>
        {!data.available ? (
          <p>{t("data.unavailable")}</p>
        ) : (
          <>
            <p role={data.error ? "alert" : undefined}>
              {data.busy
                ? t("data.loading")
                : data.blocked
                  ? t("data.unknown")
                  : data.error
                    ? t("data.error")
                    : data.pages > 0 && data.items.length === 0
                      ? t("data.empty")
                      : null}
            </p>
            {data.review ? (
              <Button variant="outline" size="sm" type="button" disabled={data.busy} onClick={data.proceed}>
                {t("data.continue")}
              </Button>
            ) : null}
            <ul>
              {data.items.map((item) => (
                <li key={item.session_id}>
                  <span>{item.title}</span>
                  <time dateTime={item.shared_at}>
                    {new Date(item.shared_at).toLocaleString()}
                  </time>
                  <span>
                    {item.expires_at === null
                      ? t("data.noExpiry")
                      : new Date(item.expires_at).toLocaleString()}
                  </span>
                  <Button variant="outline" size="sm"
                    type="button"
                    disabled={data.busy || data.blocked}
                    onClick={() => setTarget(item.session_id)}
                  >
                    {t("data.stop")}
                  </Button>
                </li>
              ))}
            </ul>
            {data.cursor ? (
              <Button variant="outline" size="sm"
                type="button"
                disabled={data.busy}
                onClick={() => void data.more()}
              >
                {t("data.more")}
              </Button>
            ) : null}
            {target ? (
              <div role="group" aria-label={t("data.confirm")}>
                <p>{t("data.confirm")}</p>
                <Button variant="destructive" size="sm"
                  type="button"
                  disabled={data.busy || data.blocked}
                  onClick={() => {
                    const id = target;
                    setTarget(null);
                    void data.revoke(id);
                  }}
                >
                  {t("data.stop")}
                </Button>
                <Button variant="outline" size="sm" type="button" onClick={() => setTarget(null)}>
                  {t("data.cancel")}
                </Button>
              </div>
            ) : null}
          </>
        )}
      </section>
      {[t("data.sharedFiles")].map((name) => (
        <section key={name}>
          <div className={styles.dataSectionHeading}><h2>{name}</h2><DataManagementDetailsDialog /></div>
          <p>{t("data.unavailable")}</p>
        </section>
      ))}
      <section>
        <div className={styles.dataSectionHeading}>
          <h2>{t("data.archivedTasks")}</h2>
          {archived.available ? <Button variant="outline" size="sm" type="button" disabled={archived.busy} onClick={()=>void archived.reload()}>{t("data.reload")}</Button> : null}
        </div>
        {!archived.available ? <p>{t("data.unavailable")}</p> : <>
          <p role={archived.error?"alert":"status"}>{archived.busy?t("data.loading"):archived.blocked?t("data.unknown"):archived.error?t("data.error"):archived.pages>0&&archived.items.length===0?t("archive.empty"):null}</p>
          {archived.review?<Button variant="outline" size="sm" type="button" disabled={archived.busy} onClick={archived.proceed}>{t("data.continue")}</Button>:null}
          <ul>{archived.items.map(item=><li key={item.session_id}><span>{item.title}</span><time dateTime={item.archived_at}>{new Date(item.archived_at).toLocaleString()}</time><Button variant="outline" size="sm" type="button" disabled={archived.busy||archived.blocked||!archiveIdAvailable(item.session_id)} title={!archiveIdAvailable(item.session_id)?t("archive.idUnavailable"):undefined} onClick={()=>void archived.restore(item.session_id)}>{t("archive.restore")}</Button>{!archiveIdAvailable(item.session_id)?<span>{t("archive.idUnavailable")}</span>:null}</li>)}</ul>
          {archived.cursor?<Button variant="outline" size="sm" type="button" disabled={archived.busy||archived.blocked} onClick={()=>void archived.more()}>{t("data.more")}</Button>:null}
        </>}
      </section>
      {([
        ["data.authorizedApps", "data.authorizedAppsDescription", "apps"],
        ["data.cloudBrowser", "data.cloudBrowserDescription", "browser"],
        ["data.domains", "data.domainsDescription", "domains"],
      ] as const).map(([title, description, kind]) => (
        <section key={title} className={styles.dataManagementRow} aria-labelledby={`${managementId}-${title}`}>
          <div>
            <h2 id={`${managementId}-${title}`}>{t(title)}</h2>
            <p>{t(description)}</p>
          </div>
          <Button ref={(element) => { managementRefs.current[kind] = element; }} type="button" variant="outline" aria-label={t("settingsServices.manageData", { name: t(title) })} onClick={() => setDetail(kind)}>{t("data.manage")}</Button>
        </section>
      ))}
      </>}
    </div>
  );
}

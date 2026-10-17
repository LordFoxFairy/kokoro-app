"use client";
import { useId, useState } from "react";
import { useLocale } from "@/i18n/context";
import type { ProjectReadBoundary } from "@/ui/auth/use-session-state";
import { useArchivedTasks } from "../use-archived-tasks";
import { archiveIdAvailable, type ArchiveState } from "@/lib/archived-tasks.schema";
import { useSharedTasks } from "../use-shared-tasks";
import styles from "../settings-modal.module.css";

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
  return (
    <div
      className={styles.dataManagement}
      data-testid="settings-data-management"
    >
      <section>
        <h2>{t("data.sharedTasks")}</h2>
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
            <button
              type="button"
              disabled={data.busy}
              onClick={() => void data.reload()}
            >
              {t("data.reload")}
            </button>
            {data.review ? (
              <button type="button" disabled={data.busy} onClick={data.proceed}>
                {t("data.continue")}
              </button>
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
                  <button
                    type="button"
                    disabled={data.busy || data.blocked}
                    onClick={() => setTarget(item.session_id)}
                  >
                    {t("data.stop")}
                  </button>
                </li>
              ))}
            </ul>
            {data.cursor ? (
              <button
                type="button"
                disabled={data.busy}
                onClick={() => void data.more()}
              >
                {t("data.more")}
              </button>
            ) : null}
            {target ? (
              <div role="group" aria-label={t("data.confirm")}>
                <p>{t("data.confirm")}</p>
                <button
                  type="button"
                  disabled={data.busy || data.blocked}
                  onClick={() => {
                    const id = target;
                    setTarget(null);
                    void data.revoke(id);
                  }}
                >
                  {t("data.stop")}
                </button>
                <button type="button" onClick={() => setTarget(null)}>
                  {t("data.cancel")}
                </button>
              </div>
            ) : null}
          </>
        )}
      </section>
      {[t("data.sharedFiles")].map((name) => (
        <section key={name}>
          <h2>{name}</h2>
          <p>{t("data.unavailable")}</p>
        </section>
      ))}
      <section>
        <h2>{t("data.archivedTasks")}</h2>
        {!archived.available ? <p>{t("data.unavailable")}</p> : <>
          <p role={archived.error?"alert":"status"}>{archived.busy?t("data.loading"):archived.blocked?t("data.unknown"):archived.error?t("data.error"):archived.pages>0&&archived.items.length===0?t("archive.empty"):null}</p>
          <button type="button" disabled={archived.busy} onClick={()=>void archived.reload()}>{t("data.reload")}</button>
          {archived.review?<button type="button" disabled={archived.busy} onClick={archived.proceed}>{t("data.continue")}</button>:null}
          <ul>{archived.items.map(item=><li key={item.session_id}><span>{item.title}</span><time dateTime={item.archived_at}>{new Date(item.archived_at).toLocaleString()}</time><button type="button" disabled={archived.busy||archived.blocked||!archiveIdAvailable(item.session_id)} title={!archiveIdAvailable(item.session_id)?t("archive.idUnavailable"):undefined} onClick={()=>void archived.restore(item.session_id)}>{t("archive.restore")}</button>{!archiveIdAvailable(item.session_id)?<span>{t("archive.idUnavailable")}</span>:null}</li>)}</ul>
          {archived.cursor?<button type="button" disabled={archived.busy||archived.blocked} onClick={()=>void archived.more()}>{t("data.more")}</button>:null}
        </>}
      </section>
      {([
        ["data.authorizedApps", "data.authorizedAppsDescription"],
        ["data.cloudBrowser", "data.cloudBrowserDescription"],
        ["data.domains", "data.domainsDescription"],
      ] as const).map(([title, description]) => (
        <section key={title} className={styles.dataManagementRow} aria-labelledby={`${managementId}-${title}`}>
          <div>
            <h2 id={`${managementId}-${title}`}>{t(title)}</h2>
            <p>{t(description)}</p>
            <p id={`${managementId}-${title}-reason`}>{t("data.unavailable")}</p>
          </div>
          <button type="button" disabled aria-describedby={`${managementId}-${title}-reason`}>
            {t("data.manage")}
          </button>
        </section>
      ))}
    </div>
  );
}

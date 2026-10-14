"use client";
import { useState } from "react";
import { useLocale } from "@/i18n/context";
import type { ProjectReadBoundary } from "@/ui/auth/use-session-state";
import { useSharedTasks } from "../use-shared-tasks";
import styles from "../settings-modal.module.css";

export function DataManagementSection({
  preview,
  readBoundary,
}: {
  preview: boolean;
  readBoundary?: ProjectReadBoundary;
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
      t={t}
    />
  );
}
function DataContent({
  preview,
  readBoundary,
  t,
}: {
  preview: boolean;
  readBoundary?: ProjectReadBoundary;
  t: ReturnType<typeof useLocale>["t"];
}) {
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
      {[t("data.sharedFiles"), t("data.archivedTasks")].map((name) => (
        <section key={name}>
          <h2>{name}</h2>
          <p>{t("data.unavailable")}</p>
        </section>
      ))}
      {[
        t("data.authorizedApps"),
        t("data.cloudBrowser"),
        t("data.domains"),
      ].map((name) => (
        <section key={name}>
          <h2>{name}</h2>
          <p>{t("data.unavailable")}</p>
          <button type="button" disabled>
            {t("data.manage")}
          </button>
        </section>
      ))}
    </div>
  );
}

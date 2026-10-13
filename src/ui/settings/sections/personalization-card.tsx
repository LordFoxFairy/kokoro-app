"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useT } from "@/i18n/context";
import type { ProjectReadBoundary } from "@/ui/auth/use-session-state";
import { usePersonalization } from "../use-personalization";
import styles from "./settings-sections.module.css";

/** Four BFF-owned fields; memory and knowledge import have no owner contract. */
export function PersonalizationCard({
  preview = false,
  readBoundary,
}: {
  preview?: boolean;
  readBoundary?: ProjectReadBoundary;
}) {
  const t = useT();
  const profile = usePersonalization(preview, readBoundary);
  const { fields, disabled, update, persist, phase } = profile;
  const message =
    phase === "load-error"
      ? t("settings.personalizationLoadFailed")
      : phase === "conflict"
        ? t("settings.personalizationConflict")
        : phase === "unknown"
          ? t("settings.personalizationUnknown")
          : phase === "review"
            ? t("settings.personalizationReview")
            : profile.saved
              ? t("settings.saved")
              : null;
  return (
    <section
      className={styles.personalization}
      data-testid="settings-personalization"
    >
      <div className={styles.personalizationProfile}>
        {phase === "loading" ? (
          <p className={styles.profileStatus}>{t("settings.loading")}</p>
        ) : null}
        {message !== null ? (
          <p className={styles.profileStatus} role="status">
            {message}
          </p>
        ) : null}
        {["load-error", "conflict", "unknown"].includes(phase) ? (
          <Button variant="outline" onClick={profile.retry}>
            {t("settings.personalizationReload")}
          </Button>
        ) : null}
        {phase === "review" && profile.server !== null ? (
          <div>
            <dl>
              <dt>{t("settings.nickname")}</dt>
              <dd>{profile.server.personalization?.nickname || "—"}</dd>
              <dt>{t("settings.occupation")}</dt>
              <dd>{profile.server.personalization?.occupation || "—"}</dd>
              <dt>{t("settings.aboutYou")}</dt>
              <dd style={{ whiteSpace: "pre-wrap" }}>
                {profile.server.personalization?.about || "—"}
              </dd>
              <dt>{t("settings.customInstructions")}</dt>
              <dd style={{ whiteSpace: "pre-wrap" }}>
                {profile.server.personalization?.instructions || "—"}
              </dd>
            </dl>
            <Button variant="outline" onClick={profile.chooseServer}>
              {t("settings.personalizationUseServer")}
            </Button>
            <Button onClick={profile.saveDraft}>
              {t("settings.personalizationSaveDraft")}
            </Button>
          </div>
        ) : null}
        <div className={styles.profileColumns}>
          <label>
            <span>{t("settings.nickname")}</span>
            <Input
              aria-label={t("settings.nickname")}
              disabled={disabled}
              placeholder={t("settings.nicknamePlaceholder")}
              value={fields.nickname}
              onBlur={persist}
              onChange={(event) => update("nickname", event.target.value)}
            />
          </label>
          <label>
            <span>{t("settings.occupation")}</span>
            <Input
              aria-label={t("settings.occupation")}
              disabled={disabled}
              placeholder={t("settings.occupationPlaceholder")}
              value={fields.occupation}
              onBlur={persist}
              onChange={(event) => update("occupation", event.target.value)}
            />
          </label>
        </div>
        <label className={styles.profileTextarea}>
          <span>{t("settings.aboutYou")}</span>
          <Textarea
            aria-label={t("settings.aboutYou")}
            disabled={disabled}
            placeholder={t("settings.aboutYouPlaceholder")}
            value={fields.about}
            onBlur={persist}
            onChange={(event) => update("about", event.target.value)}
          />
        </label>
        <p className={styles.profileHint}>{t("settings.aboutYouHint")}</p>
        <label className={styles.profileTextarea}>
          <span>{t("settings.customInstructions")}</span>
          <Textarea
            aria-label={t("settings.customInstructions")}
            disabled={disabled}
            placeholder={t("settings.customInstructionsPlaceholder")}
            value={fields.instructions}
            onBlur={persist}
            onChange={(event) => update("instructions", event.target.value)}
          />
        </label>
      </div>
    </section>
  );
}

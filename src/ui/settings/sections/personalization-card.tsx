"use client";

import { useId, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useT } from "@/i18n/context";
import type { ProjectReadBoundary } from "@/ui/auth/use-session-state";
import { PERSONALIZATION_FIELD_LIMITS, type PersonalizationFields } from "../personalization-schema";
import { usePersonalization } from "../use-personalization";
import { MemoryImportDialog } from "./memory-import-dialog";
import { KnowledgePanel } from "../knowledge/knowledge-panel";
import { PersonalizationKnowledgePanel } from "./personalization-knowledge-panel";
import styles from "./settings-sections.module.css";

/** Profile editing retains its existing flow; knowledge has its own owner-backed session. */
export function PersonalizationCard({
  preview = false,
  readBoundary,
}: {
  preview?: boolean;
  readBoundary?: ProjectReadBoundary;
}) {
  const t = useT();
  const unavailableId = useId();
  const fieldFeedbackId = useId();
  const draftScope = JSON.stringify([preview, readBoundary?.admitted, readBoundary?.subject, readBoundary?.generation]);
  const [validation, setValidation] = useState<{
    scope: string;
    errors: Partial<Record<keyof PersonalizationFields, boolean>>;
  }>({ scope: draftScope, errors: {} });
  if (validation.scope !== draftScope) {
    setValidation({ scope: draftScope, errors: {} });
  }
  const fieldErrors = validation.scope === draftScope ? validation.errors : {};
  const hasFieldErrors = Object.values(fieldErrors).some(Boolean);
  const profile = usePersonalization(preview, readBoundary);
  const { fields, disabled, update, persist, phase } = profile;
  const changeField = (field: keyof PersonalizationFields, value: string) => {
    const tooLong = [...value].length > PERSONALIZATION_FIELD_LIMITS[field];
    setValidation((current) => ({
      scope: draftScope,
      errors: {
        ...(current.scope === draftScope ? current.errors : {}),
        [field]: tooLong,
      },
    }));
    if (!tooLong) update(field, value);
  };
  const fieldDescription = (field: keyof PersonalizationFields) =>
    `${fieldFeedbackId}-${field}-count${fieldErrors[field] ? ` ${fieldFeedbackId}-${field}-error` : ""}`;
  const fieldFeedback = (field: keyof PersonalizationFields) => (
    <small className={styles.profileFieldFeedback}>
      <span id={`${fieldFeedbackId}-${field}-count`} className={styles.profileFieldCount}>
        {t("settings.personalizationCharacterCount", {
          count: [...fields[field]].length,
          limit: PERSONALIZATION_FIELD_LIMITS[field],
        })}
      </span>
      {fieldErrors[field] ? (
        <span id={`${fieldFeedbackId}-${field}-error`} role="alert" className={styles.profileFieldError}>
          {t("settings.personalizationTooLong", { limit: PERSONALIZATION_FIELD_LIMITS[field] })}
        </span>
      ) : null}
    </small>
  );
  const message =
    phase === "load-error"
      ? t("settings.personalizationLoadFailed")
      : phase === "conflict"
        ? t("settings.personalizationConflict")
        : phase === "unknown"
          ? t("settings.personalizationUnknown")
          : phase === "review"
            ? t("settings.personalizationReview")
            : phase === "saving"
              ? t("settings.personalizationSaving")
              : profile.saved && !hasFieldErrors
                ? t("settings.saved")
                : null;
  return (
    <section
      className={styles.personalization}
      data-testid="settings-personalization"
    >
      <Tabs defaultValue="profile" className={styles.personalizationTabs}>
        <TabsList variant="line">
          <TabsTrigger value="profile">{t("settings.personalProfile")}</TabsTrigger>
          <TabsTrigger value="knowledge">
            {t("settings.knowledge")}
          </TabsTrigger>
        </TabsList>
        <TabsContent value="profile">
          <p id={unavailableId} className={styles.personalizationUnavailable}>
            {t("settings.personalizationMemoryUnavailable")}
          </p>
          <div className={styles.personalizationImport}>
            <div>
              <h3>{t("settings.importFromAi")}</h3>
              <p>{t("settings.importFromAiHint")}</p>
            </div>
            <MemoryImportDialog key={`intro:${draftScope}`} triggerLabel={t("settings.importMemoryAction")} />
          </div>
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
              aria-describedby={fieldDescription("nickname")}
              aria-invalid={fieldErrors.nickname || undefined}
              disabled={disabled}
              placeholder={t("settings.nicknamePlaceholder")}
              value={fields.nickname}
              onBlur={persist}
              onChange={(event) => changeField("nickname", event.target.value)}
            />
            {fieldFeedback("nickname")}
          </label>
          <label>
            <span>{t("settings.occupation")}</span>
            <Input
              aria-label={t("settings.occupation")}
              aria-describedby={fieldDescription("occupation")}
              aria-invalid={fieldErrors.occupation || undefined}
              disabled={disabled}
              placeholder={t("settings.occupationPlaceholder")}
              value={fields.occupation}
              onBlur={persist}
              onChange={(event) => changeField("occupation", event.target.value)}
            />
            {fieldFeedback("occupation")}
          </label>
        </div>
        <label className={styles.profileTextarea}>
          <span>{t("settings.aboutYou")}</span>
          <Textarea
            aria-label={t("settings.aboutYou")}
            aria-describedby={fieldDescription("about")}
            aria-invalid={fieldErrors.about || undefined}
            disabled={disabled}
            placeholder={t("settings.aboutYouPlaceholder")}
            value={fields.about}
            onBlur={persist}
            onChange={(event) => changeField("about", event.target.value)}
          />
          {fieldFeedback("about")}
        </label>
        <p className={styles.profileHint}>{t("settings.aboutYouHint")}</p>
        <label className={styles.profileTextarea}>
          <span>{t("settings.customInstructions")}</span>
          <Textarea
            aria-label={t("settings.customInstructions")}
            aria-describedby={fieldDescription("instructions")}
            aria-invalid={fieldErrors.instructions || undefined}
            disabled={disabled}
            placeholder={t("settings.customInstructionsPlaceholder")}
            value={fields.instructions}
            onBlur={persist}
            onChange={(event) => changeField("instructions", event.target.value)}
          />
          {fieldFeedback("instructions")}
        </label>
      </div>
          <div className={styles.personalizationImport}>
            <div>
              <h3>{t("settings.importMemory")}</h3>
            </div>
            <MemoryImportDialog key={`footer:${draftScope}`} triggerLabel={t("settings.importMemory")} />
          </div>
        </TabsContent>
        <TabsContent value="knowledge">
          {preview ? <PersonalizationKnowledgePanel key={draftScope} /> : <KnowledgePanel key={JSON.stringify([preview, readBoundary?.subject ?? null])} admitted={readBoundary?.admitted ?? false} generation={readBoundary?.generation ?? 0} />}
        </TabsContent>
      </Tabs>
    </section>
  );
}

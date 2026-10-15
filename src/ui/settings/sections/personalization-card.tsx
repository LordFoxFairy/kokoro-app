"use client";

import { useEffect, useState } from "react";

import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useT } from "@/i18n/context";
import {
  cachedPersonalization,
  PersonalizationClientError,
  readPersonalization,
  replacePersonalization,
} from "@/ui/settings/personalization-client";

import styles from "./settings-sections.module.css";

type ProfileState = "loading" | "ready" | "saving" | "error";

type PersonalizationFields = {
  nickname: string;
  occupation: string;
  about: string;
  instructions: string;
};

function readPreviewFields(): PersonalizationFields {
  if (typeof window === "undefined") return emptyFields();
  const raw = window.localStorage.getItem("kokoro.personalization.preview");
  if (raw === null) return emptyFields();
  try {
    const value = JSON.parse(raw) as Partial<PersonalizationFields>;
    return {
      nickname: value.nickname ?? "",
      occupation: value.occupation ?? "",
      about: value.about ?? "",
      instructions: value.instructions ?? "",
    };
  } catch {
    return emptyFields();
  }
}

function emptyFields(): PersonalizationFields {
  return { nickname: "", occupation: "", about: "", instructions: "" };
}

/** BFF-backed profile preferences. Memory import and knowledge entries remain
 * hidden until their owner exposes a durable contract instead of dead routes. */
export function PersonalizationCard({
  subject,
  preview = false,
}: {
  subject: string | null;
  preview?: boolean;
}) {
  const t = useT();
  const cached =
    !preview && subject !== null ? cachedPersonalization(subject) : undefined;
  const [fields, setFields] = useState<PersonalizationFields>(() =>
    preview ? readPreviewFields() : (cached?.personalization ?? emptyFields()),
  );
  const [revision, setRevision] = useState(cached?.revision ?? 0);
  const [state, setState] = useState<ProfileState>(
    preview || cached !== undefined ? "ready" : "loading",
  );
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (preview || subject === null) return;
    let active = true;
    void readPersonalization(subject)
      .then((snapshot) => {
        if (!active) return;
        setFields(snapshot.personalization ?? emptyFields());
        setRevision(snapshot.revision);
        setState("ready");
      })
      .catch(() => {
        if (!active) return;
        setMessage(t("settings.personalizationLoadFailed"));
        setState("error");
      });
    return () => {
      active = false;
    };
  }, [preview, subject, t]);

  const update = (field: keyof PersonalizationFields, value: string): void => {
    setFields((current) => ({ ...current, [field]: value }));
  };

  const persist = async (): Promise<void> => {
    if (preview) {
      window.localStorage.setItem(
        "kokoro.personalization.preview",
        JSON.stringify(fields),
      );
      return;
    }
    if (state === "loading" || state === "saving") return;
    setState("saving");
    setMessage(null);
    try {
      if (subject === null) return;
      const snapshot = await replacePersonalization(subject, fields, revision);
      setRevision(snapshot.revision);
      setState("ready");
      setMessage(t("settings.saved"));
    } catch (error) {
      setState("error");
      setMessage(
        error instanceof PersonalizationClientError &&
          error.code === "personalization_revision_conflict"
          ? t("settings.personalizationConflict")
          : t("settings.personalizationSaveFailed"),
      );
    }
  };

  const disabled = !preview && (state === "loading" || state === "saving");

  return (
    <section
      className={styles.personalization}
      data-testid="settings-personalization"
    >
      <div
        className={styles.personalizationProfile}
        aria-busy={state === "loading" || undefined}
      >
        <div className={styles.profileStatusSlot} aria-live="polite">
          {state === "loading" ? (
            <span className="sr-only" role="status">
              {t("settings.loading")}
            </span>
          ) : null}
          {message !== null ? (
            <p className={styles.profileStatus} role="status">
              {message}
            </p>
          ) : null}
        </div>
        <div className={styles.profileColumns}>
          <label>
            <span>{t("settings.nickname")}</span>
            <Input
              aria-label={t("settings.nickname")}
              disabled={disabled}
              maxLength={128}
              placeholder={t("settings.nicknamePlaceholder")}
              value={fields.nickname}
              onBlur={() => void persist()}
              onChange={(event) => update("nickname", event.target.value)}
            />
          </label>
          <label>
            <span>{t("settings.occupation")}</span>
            <Input
              aria-label={t("settings.occupation")}
              disabled={disabled}
              maxLength={256}
              placeholder={t("settings.occupationPlaceholder")}
              value={fields.occupation}
              onBlur={() => void persist()}
              onChange={(event) => update("occupation", event.target.value)}
            />
          </label>
        </div>
        <label className={styles.profileTextarea}>
          <span>{t("settings.aboutYou")}</span>
          <Textarea
            aria-label={t("settings.aboutYou")}
            disabled={disabled}
            maxLength={2000}
            placeholder={t("settings.aboutYouPlaceholder")}
            value={fields.about}
            onBlur={() => void persist()}
            onChange={(event) => update("about", event.target.value)}
          />
        </label>
        <p className={styles.profileHint}>{t("settings.aboutYouHint")}</p>
        <label className={styles.profileTextarea}>
          <span>{t("settings.customInstructions")}</span>
          <Textarea
            aria-label={t("settings.customInstructions")}
            disabled={disabled}
            maxLength={8000}
            placeholder={t("settings.customInstructionsPlaceholder")}
            value={fields.instructions}
            onBlur={() => void persist()}
            onChange={(event) => update("instructions", event.target.value)}
          />
        </label>
      </div>
    </section>
  );
}

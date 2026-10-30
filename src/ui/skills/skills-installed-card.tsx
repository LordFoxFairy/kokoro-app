import { useRef } from "react";
import { ShieldCheck } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import type { SkillCard } from "@/hub/schemas";
import { useT } from "@/i18n/context";
import { cn } from "@/lib/utils";
import { formatSkillDate } from "./skills-format";
import styles from "./skills-panel.module.css";
import { PersonalSkillActions } from "./personal-skill-actions";

type InstalledSkillCardProps = {
  skill: SkillCard;
  enabled: boolean;
  busy: boolean;
  pending: boolean;
  locked: boolean;
  error: string | null;
  detailAvailable: boolean;
  onEnabledChange: (enabled: boolean) => void;
  onUpdate: (source: HTMLElement) => void;
  onOpenDetail: (source: HTMLElement) => void;
  onRemoveInstallation?: (source: HTMLElement) => void;
};

export function InstalledSkillCard({
  skill,
  enabled,
  busy,
  pending,
  locked,
  error,
  detailAvailable,
  onEnabledChange,
  onOpenDetail,
  onUpdate,
  onRemoveInstallation,
}: InstalledSkillCardProps) {
  const t = useT();
  const removeTrigger = useRef<HTMLButtonElement | null>(null);
  const sourceUnavailable = skill.source_status !== undefined && skill.source_status !== "active";
  return (
    <Card
      className={cn(
        styles.installedCard,
        error ? styles.installedCardWithError : undefined,
      )}
    >
      <CardContent className={styles.installedCardContent}>
        <div className={styles.installedCardHead}>
          <div className={styles.installedCardIdentity}>
            <Button
              variant="ghost"
              type="button"
              className={styles.installedCardName}
              title={detailAvailable ? skill.name : t("skills.detailUnavailable")}
              disabled={!detailAvailable || skill.source_status === "deleted"}
              onClick={(event) => onOpenDetail(event.currentTarget)}
            >
              {skill.name}
            </Button>
            {locked ? (
              <Badge variant="outline" title={t("skills.requiredTip")}>
                {t("skills.requiredLock")}
              </Badge>
            ) : null}
          </div>
          {skill.source_status === "deleted" && skill.installation_id && onRemoveInstallation ? <PersonalSkillActions
            disabled={busy || locked} writable={false} triggerRef={removeTrigger}
            onRemoveInstallation={() => { if (removeTrigger.current) onRemoveInstallation(removeTrigger.current); }}
          /> : null}
          <Switch
            size="sm"
            checked={enabled}
            disabled={locked || busy || (!enabled && sourceUnavailable)}
            aria-busy={pending}
            aria-label={`${enabled ? t("skills.disable") : t("skills.enable")} ${skill.name}`}
            onCheckedChange={onEnabledChange}
          />
        </div>
        <p className={styles.installedCardDescription}>{skill.description}</p>
        <div className={styles.installedCardFooter}>
        {sourceUnavailable ? <p className={styles.installedCardMeta} role="status">{t("skills.sourceUnavailable")}</p> : skill.updated_at ? (
          <p className={styles.installedCardMeta}>
            <ShieldCheck aria-hidden="true" />
            {t("skills.updatedAt", { date: formatSkillDate(skill.updated_at) })}
          </p>
        ) : null}
        {skill.available_update ? <Button type="button" variant="ghost" className={styles.installedCardUpdate} disabled={busy || skill.source_status === "deleted"} aria-label={`${t("skills.update.available", { revision: skill.available_update.revision })} ${skill.name}`} onClick={event => onUpdate(event.currentTarget)}>{t("skills.update.available", { revision: skill.available_update.revision })}</Button> : null}
        </div>
        {error ? (
          <Alert variant="destructive" className={styles.installedCardError}>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}
      </CardContent>
    </Card>
  );
}

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

type InstalledSkillCardProps = {
  skill: SkillCard;
  enabled: boolean;
  busy: boolean;
  pending: boolean;
  locked: boolean;
  error: string | null;
  detailAvailable: boolean;
  onEnabledChange: (enabled: boolean) => void;
  onOpenDetail: (source: HTMLElement) => void;
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
}: InstalledSkillCardProps) {
  const t = useT();
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
              disabled={!detailAvailable}
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
          <Switch
            size="sm"
            checked={enabled}
            disabled={locked || busy}
            aria-busy={pending}
            aria-label={`${enabled ? t("skills.disable") : t("skills.enable")} ${skill.name}`}
            onCheckedChange={onEnabledChange}
          />
        </div>
        <p className={styles.installedCardDescription}>{skill.description}</p>
        {skill.updated_at ? (
          <p className={styles.installedCardMeta}>
            <ShieldCheck aria-hidden="true" />
            {t("skills.updatedAt", { date: formatSkillDate(skill.updated_at) })}
          </p>
        ) : null}
        {error ? (
          <Alert variant="destructive" className={styles.installedCardError}>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}
      </CardContent>
    </Card>
  );
}

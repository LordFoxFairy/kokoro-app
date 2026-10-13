"use client";

import type { ProjectReadBoundary } from "@/ui/auth/use-session-state";
import { Contrast, Moon, Sun } from "lucide-react";

import { useLocale, useT } from "@/i18n/context";
import { LOCALES, LOCALE_NAMES, type Locale } from "@/i18n/messages";
import { useTheme, type ThemeMode } from "@/ui/theme/theme-context";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";

import { TaskDeliveryPreferencesSection } from "./task-delivery-preferences-section";
import { CommunicationPreferencesSection } from "./communication-preferences-section";
import styles from "./settings-sections.module.css";

// —— 卡二：外观与语言 —— 主题三档（WEB-THEME）/ 语言（i18n）即时生效。
export function AppearanceCard({ preview = false, readBoundary }: { preview?: boolean; readBoundary?: ProjectReadBoundary }) {
  const t = useT();
  const { mode, setMode } = useTheme();
  const { locale, setLocale } = useLocale();
  const themeOptions: { value: ThemeMode; label: string }[] = [
    { value: "light", label: t("theme.light") },
    { value: "dark", label: t("theme.dark") },
    // Manus presents automatic/system last, after the explicit light/dark
    // choices. The value remains the shared ThemeMode contract.
    { value: "system", label: t("theme.system") },
  ];
  const themeIcons = { system: Contrast, light: Sun, dark: Moon } as const;
  return (
    <div className={styles.generalSettings} data-testid="settings-appearance">
      <section
        className={styles.generalSection}
        aria-labelledby="settings-appearance-heading"
      >
        <h3 id="settings-appearance-heading">
          {t("settings.appearanceSection")}
        </h3>
        <div className={styles.generalRowStackCompact}>
          <span className={styles.rowLabel}>{t("settings.language")}</span>
          <Select
            value={locale}
            onValueChange={(value) => setLocale(value as Locale)}
          >
            <SelectTrigger
              className={styles.select}
              aria-label={t("lang.switchAria")}
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent
              position="popper"
              align="start"
              sideOffset={0}
              className={styles.languageSelectContent}
            >
              <SelectGroup>
                {LOCALES.map((code) => (
                  <SelectItem key={code} value={code}>
                    {LOCALE_NAMES[code]}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
        </div>
        <div className={styles.generalRowStack}>
          <span className={styles.rowLabel}>{t("settings.theme")}</span>
          <ToggleGroup
            type="single"
            value={mode}
            onValueChange={(value) => {
              if (value) setMode(value as ThemeMode);
            }}
            className={styles.themeChoices}
            aria-label={t("theme.switchAria")}
          >
            {themeOptions.map((option) => {
              const Icon = themeIcons[option.value];
              return (
                <ToggleGroupItem
                  key={option.value}
                  value={option.value}
                  variant="default"
                  className={styles.themeChoice}
                >
                  <Icon aria-hidden="true" />
                  <span>{option.label}</span>
                </ToggleGroupItem>
              );
            })}
          </ToggleGroup>
        </div>
      </section>
      <TaskDeliveryPreferencesSection />
      <CommunicationPreferencesSection preview={preview} {...(readBoundary === undefined ? {} : { readBoundary })} />
    </div>
  );
}

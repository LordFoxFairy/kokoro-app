"use client";
import { useId, useRef, useState } from "react";
import { BookOpen, ChevronRight, Database, LifeBuoy, Search, SlidersHorizontal, UserRound, WalletCards } from "lucide-react";
import { useLocale } from "@/i18n/context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import type { SettingsTab } from "../settings-types";
import styles from "./settings-sections.module.css";

const categories = [
  { id: "account", title: "help.accountTitle", Icon: UserRound },
  { id: "preferences", title: "help.preferencesTitle", Icon: SlidersHorizontal },
  { id: "billing", title: "billing.title", Icon: WalletCards },
  { id: "data", title: "settings.dataManagementTitle", Icon: Database },
] as const;
const guides = [
  { id: "name", category: "account", title: "help.nameTitle", body: "help.nameBody", note: "help.account", tab: "account", action: "settings.accountTitle" },
  { id: "devices", category: "account", title: "help.devicesTitle", body: "help.devicesBody", tab: "account", action: "settings.accountTitle" },
  { id: "appearance", category: "preferences", title: "help.appearanceTitle", body: "help.appearanceBody", tab: "appearance", action: "settings.generalTitle" },
  { id: "shortcuts", category: "preferences", title: "help.shortcutsTitle", body: "help.shortcutsBody", tab: "shortcuts", action: "settings.shortcutsTitle" },
  { id: "credits", category: "billing", title: "help.creditsTitle", body: "help.creditsBody", tab: "credits", action: "settings.creditsTitle" },
  { id: "plans", category: "billing", title: "help.plansTitle", body: "help.plansBody", tab: "subscription", action: "settings.subTitle" },
  { id: "sharing", category: "data", title: "help.sharingTitle", body: "help.share", tab: "data-management", action: "settings.dataManagementTitle" },
  { id: "archive", category: "data", title: "help.archiveTitle", body: "help.archiveBody", tab: "data-management", action: "settings.dataManagementTitle" },
] as const;

export function HelpSection({
  onSelectSetting,
}: {
  onSelectSetting: (tab: SettingsTab) => void;
}) {
  const { t, locale } = useLocale();
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<"all" | typeof categories[number]["id"]>("all");
  const [expanded, setExpanded] = useState("");
  const search = useRef<HTMLInputElement>(null);
  const id = useId();
  const normalized = query.trim().toLocaleLowerCase(locale);
  const matches = guides.filter((guide) => (category === "all" || guide.category === category) &&
    `${t(guide.title)} ${t(guide.body)} ${"note" in guide ? t(guide.note) : ""}`.toLocaleLowerCase(locale).includes(normalized));
  const reset = () => { setQuery(""); setCategory("all"); setExpanded(""); search.current?.focus(); };
  return (
    <div className={styles.helpCenter} data-testid="settings-help">
      <section className={styles.helpHero}>
        <span className={styles.helpHeroIcon}><LifeBuoy aria-hidden="true" /></span>
        <h2>{t("help.heroTitle")}</h2>
        <p>{t("help.heroHint")}</p>
        <label className="sr-only" htmlFor={`${id}-search`}>{t("help.searchLabel")}</label>
        <div className={styles.helpSearch}>
          <Search aria-hidden="true" />
          <Input id={`${id}-search`} ref={search} type="search" maxLength={200} value={query} placeholder={t("help.searchPlaceholder")} onChange={(event) => { setQuery(event.target.value); setExpanded(""); }} />
          {query.length > 0 ? <Button variant="ghost" size="sm" type="button" onClick={() => { setQuery(""); setExpanded(""); search.current?.focus(); }}>{t("help.clearSearch")}</Button> : null}
        </div>
      </section>

      <div className={styles.helpCategoryGrid} aria-label={t("help.categoriesTitle")} role="group">
        {categories.map(({ id: categoryId, title, Icon }) => <Button key={categoryId} className={styles.helpCategory} variant="outline" type="button" aria-label={t(title)} aria-describedby={`${id}-${categoryId}-count`} aria-pressed={category === categoryId} onClick={() => { setCategory(categoryId); setExpanded(""); }}>
          <Icon aria-hidden="true" />
          <span><strong>{t(title)}</strong><span id={`${id}-${categoryId}-count`}>{t("help.categoryCount", { count: guides.filter((guide) => guide.category === categoryId).length })}</span></span>
          <ChevronRight aria-hidden="true" />
        </Button>)}
      </div>

      <section className={styles.helpGuides} aria-label={t("help.guidesTitle")}>
        <div className={styles.helpGuidesHeader}>
          <h2><BookOpen aria-hidden="true" />{t("help.guidesTitle")}</h2>
          <Button variant="outline" size="sm" type="button" aria-pressed={category === "all"} onClick={() => { setCategory("all"); setExpanded(""); }}>{t("help.allCategories")}</Button>
        </div>
        <p className={styles.helpResultCount} role="status" aria-live="polite" aria-atomic="true">{t("help.resultCount", { count: matches.length })}</p>
        {matches.length === 0 ? <div className={styles.helpEmpty}>
          <Search aria-hidden="true" /><h3>{t("help.emptyTitle")}</h3><p>{t("help.emptyHint")}</p>
          <Button variant="outline" type="button" onClick={reset}>{t("help.reset")}</Button>
        </div> : <Accordion type="single" collapsible value={matches.some((guide) => guide.id === expanded) ? expanded : ""} onValueChange={setExpanded}>
          {matches.map((guide) => <AccordionItem key={guide.id} value={guide.id}>
            <AccordionTrigger className={styles.helpGuideTrigger}>{t(guide.title)}</AccordionTrigger>
            <AccordionContent className={styles.helpGuideContent}>
              <p>{t(guide.body)}</p>
              {"note" in guide ? <p>{t(guide.note)}</p> : null}
              <Button variant="outline" size="sm" type="button" onClick={() => onSelectSetting(guide.tab)}>{t(guide.action)}<ChevronRight aria-hidden="true" /></Button>
            </AccordionContent>
          </AccordionItem>)}
        </Accordion>}
      </section>

      <section className={styles.helpExisting}>
        <h2>{t("help.limitsTitle")}</h2>
        <p>{t("help.limits")}</p>
      </section>
    </div>
  );
}

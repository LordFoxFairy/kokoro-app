import type { Locale } from "@/i18n/messages";

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** The Skill owner projects Unix seconds; preserve older millisecond values. */
export function formatSkillDate(timestamp: number, locale: Locale): string {
  const milliseconds =
    timestamp < 10_000_000_000 ? timestamp * 1_000 : timestamp;
  return new Intl.DateTimeFormat(locale, {
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  }).format(milliseconds);
}

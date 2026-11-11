import { LOCALES, type Locale } from "@/i18n/messages"

export function creationOptionLines<T extends string>(options: readonly T[], line: (locale: Locale, option: T) => string): ReadonlyMap<string, T> {
  return new Map(LOCALES.flatMap(locale => options.map(option => [line(locale, option), option] as const)))
}

export function readCreationOption<T extends string>(draft: string, lines: ReadonlyMap<string, T>) {
  let selected: { line: string; option: T; start: number } | undefined
  for (const match of draft.matchAll(/[^\r\n]+/gu)) {
    const option = lines.get(match[0])
    // Only an exact, known line is replaceable. If there are several, the
    // last one is the constraint the composer would normally have appended.
    if (option !== undefined) selected = { line: match[0], option, start: match.index }
  }
  return selected
}

export function writeCreationOption(draft: string, line: string, previous?: { line: string; start: number }): string {
  if (previous !== undefined) {
    return draft.slice(0, previous.start) + line + draft.slice(previous.start + previous.line.length)
  }
  return draft === "" ? line : `${draft}\n\n${line}`
}

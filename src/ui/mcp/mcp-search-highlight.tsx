import type { ReactNode } from "react";
import styles from "./mcp-search-highlight.module.css";

/** Literal text only; the plaza's owner-provided results and accessible names stay unchanged. */
export function McpSearchHighlight({ text, query }: { text: string; query: string }) {
  const needle = query.trim();
  if (!needle) return text;
  const pattern = new RegExp(needle.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&"), "giu");
  const parts: ReactNode[] = [];
  let offset = 0;
  for (const match of text.matchAll(pattern)) {
    const start = match.index;
    parts.push(text.slice(offset, start));
    parts.push(<mark key={start} className={styles.match}>{match[0]}</mark>);
    offset = start + match[0].length;
  }
  if (offset === 0) return text;
  parts.push(text.slice(offset));
  return <>{parts}</>;
}

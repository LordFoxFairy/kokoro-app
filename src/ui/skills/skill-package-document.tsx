"use client"

import { Check, Copy } from "lucide-react"
import { useState } from "react"
import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"

import { Button } from "@/components/ui/button"
import { useT } from "@/i18n/context"

import styles from "./manus-skill-detail-dialog.module.css"

type SkillFrontmatter = Readonly<{ yaml: string; markdown: string }>

/** A Skill package stores the machine-readable name and description as a YAML
 * frontmatter block. Keep that block distinct from the human document so the
 * package reader mirrors Manus: compact YAML first, then rendered SKILL.md. */
export function splitSkillFrontmatter(text: string): SkillFrontmatter | null {
  const match = /^(?:\uFEFF)?---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/u.exec(text)
  if (match === null) return null
  return { yaml: match[1] ?? "", markdown: text.slice(match[0].length) }
}

export function SkillPackageDocument({ text }: Readonly<{ text: string }>) {
  const t = useT()
  const frontmatter = splitSkillFrontmatter(text)
  const [copyState, setCopyState] = useState<Readonly<{ text: string; copied: boolean }>>({ text: "", copied: false })
  const copied = copyState.text === text && copyState.copied

  const copyYaml = async () => {
    if (frontmatter === null) return
    try {
      await navigator.clipboard.writeText(frontmatter.yaml)
      setCopyState({ text, copied: true })
    } catch {
      setCopyState({ text, copied: false })
    }
  }

  const markdown = frontmatter?.markdown ?? text
  return <>
    {frontmatter !== null ? <section className={styles.frontmatter} aria-label="YAML">
      <header className={styles.frontmatterHeader}>
        <span>YAML</span>
        <Button type="button" variant="ghost" size="icon-xs" aria-label={t(copied ? "skills.detailCopied" : "skills.detailCopy")} onClick={() => void copyYaml()}>
          {copied ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}
        </Button>
      </header>
      <pre>{frontmatter.yaml}</pre>
    </section> : null}
    {markdown.trim() ? <ReactMarkdown skipHtml remarkPlugins={[remarkGfm]} components={{ img: ({ alt }) => <span>{alt}</span>, a: ({ children }) => <span>{children}</span> }}>{markdown}</ReactMarkdown> : null}
  </>
}

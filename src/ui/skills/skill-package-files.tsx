import { ChevronDown, ChevronRight, FileText, Folder } from "lucide-react"

/** Pure directory presentation: only owner-inspected paths are supplied. */
export function SkillPackageFiles({ files, selectedPath, collapsedFolders, onSelect, onToggle }: {
  files: readonly { path: string }[]
  selectedPath: string | null
  collapsedFolders: ReadonlySet<string>
  onSelect: (path: string) => void
  onToggle: (path: string) => void
}) {
  const render = (prefix: string): React.ReactNode => {
    const entries = new Map<string, { path: string; folder: boolean }>()
    for (const file of files) {
      if (!file.path.startsWith(prefix)) continue
      const remainder = file.path.slice(prefix.length), name = remainder.split("/")[0]!
      entries.set(name, { path: `${prefix}${name}`, folder: remainder.includes("/") })
    }
    return [...entries].map(([name, entry]) => entry.folder ? <li key={entry.path}>
      <button type="button" aria-expanded={!collapsedFolders.has(entry.path)} onClick={() => onToggle(entry.path)}>{collapsedFolders.has(entry.path) ? <ChevronRight aria-hidden="true" /> : <ChevronDown aria-hidden="true" />}<Folder aria-hidden="true" /><span>{name}</span></button>
      {!collapsedFolders.has(entry.path) ? <ul>{render(`${entry.path}/`)}</ul> : null}
    </li> : <li key={entry.path}><button type="button" aria-label={entry.path} aria-pressed={entry.path === selectedPath} onClick={() => onSelect(entry.path)}><FileText aria-hidden="true" /><span>{name}</span></button></li>)
  }
  return render("")
}

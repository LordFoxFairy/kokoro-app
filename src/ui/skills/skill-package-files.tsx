import { ChevronDown, ChevronRight, File, Folder } from "lucide-react"

/** Pure directory presentation: only owner-inspected paths are supplied. */
export function SkillPackageFiles({ files, selectedPath, expandedFolders, onSelect, onToggle }: {
  files: readonly { path: string }[]
  selectedPath: string | null
  expandedFolders: ReadonlySet<string>
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
      <button type="button" aria-expanded={expandedFolders.has(entry.path)} onClick={() => onToggle(entry.path)}>{expandedFolders.has(entry.path) ? <ChevronDown aria-hidden="true" /> : <ChevronRight aria-hidden="true" />}<Folder aria-hidden="true" /><span>{name}</span></button>
      {expandedFolders.has(entry.path) ? <ul>{render(`${entry.path}/`)}</ul> : null}
    </li> : <li key={entry.path}><button type="button" aria-label={entry.path} aria-pressed={entry.path === selectedPath} onClick={() => onSelect(entry.path)}><File aria-hidden="true" /><span>{name}</span></button></li>)
  }
  return render("")
}

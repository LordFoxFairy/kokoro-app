import { existsSync, readFileSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"

const railRoot = path.dirname(fileURLToPath(import.meta.url))

const responsibilityFiles = [
  "workspace-rail.tsx",
  "workspace-rail-shell.tsx",
  "workspace-rail-navigation.tsx",
  "workspace-rail-session-list.tsx",
  "workspace-rail-session-item.tsx",
  "workspace-rail-account.tsx",
  "workspace-rail-delete-dialog.tsx",
  "workspace-rail-actions.ts",
  "workspace-rail-types.ts",
  "workspace-rail.module.css",
  "workspace-rail-navigation.module.css",
  "workspace-rail-items.module.css",
  "workspace-rail-account.module.css",
  "workspace-rail-styles.ts",
]

describe("workspace rail responsibility boundaries", () => {
  it("keeps every rail source and stylesheet below the component size budget", () => {
    for (const fileName of responsibilityFiles) {
      const filePath = path.join(railRoot, fileName)
      expect(existsSync(filePath), `${fileName} is missing`).toBe(true)
      if (!existsSync(filePath)) continue

      const lineCount = readFileSync(filePath, "utf8")
        .split(/\r?\n/u)
        .filter((line, index, lines) => index < lines.length - 1 || line !== "").length
      expect(lineCount, `${fileName} exceeds the 500-line responsibility budget`).toBeLessThan(500)
    }
  })

  it("makes the shell the composition entry for the extracted rail responsibilities", () => {
    const source = readFileSync(path.join(railRoot, "workspace-rail.tsx"), "utf8")
    expect(source).toContain("WorkspaceRailShell")
    expect(source).toContain("WorkspaceDeleteDialog")

    const styles = readFileSync(path.join(railRoot, "workspace-rail-styles.ts"), "utf8")
    for (const fileName of [
      "workspace-rail.module.css",
      "workspace-rail-navigation.module.css",
      "workspace-rail-items.module.css",
      "workspace-rail-account.module.css",
    ]) {
      expect(styles, `${fileName} is not composed by the rail style boundary`).toContain(`./${fileName}`)
    }
  })
})

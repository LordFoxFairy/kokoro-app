// Test-only finite inverse from BFF 7e4ab1c's committed public proof; no SQL or runtime fallback.
import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import { readFileSync } from "node:fs"

type Operation = Readonly<Record<string, unknown>>
type ParentProof = Readonly<{
  source_sha256: string
  inventory_sha256: string
  inverse_changes: readonly Readonly<{ start: number; current_lines: readonly string[]; parent_lines: readonly string[] }>[]
  inventory: readonly Operation[]
}>
type IntegrationProof = Readonly<{
  current_source_sha256: string
  current_inventory_sha256: string
  parents: Readonly<Record<"approved" | "rss", ParentProof>>
}>
const proof = JSON.parse(readFileSync("tests/contract/fixtures/task-b-bff-integration-public.json", "utf8")) as IntegrationProof
const hash = (value: string) => createHash("sha256").update(value).digest("hex")

export function restoreIntegrationParent(source: string, parent: "approved" | "rss"): string {
  const target = proof.parents[parent]
  if (hash(source) === target.source_sha256) return source
  assert.equal(hash(source), proof.current_source_sha256, "complete Public29 integration artifact drift")
  const lines = source.split(/(?<=\n)/u)
  for (const change of [...target.inverse_changes].reverse()) {
    assert.deepEqual(lines.slice(change.start, change.start + change.current_lines.length), change.current_lines, "finite integration inverse")
    lines.splice(change.start, change.current_lines.length, ...change.parent_lines)
  }
  const restored = lines.join("")
  assert.equal(hash(restored), target.source_sha256, "complete exact integration parent bytes")
  return restored
}

export function restoreIntegrationBaseline(baseline: readonly Operation[], parent: "approved" | "rss"): readonly Operation[] {
  const target = proof.parents[parent]
  if (hash(JSON.stringify(baseline)) === target.inventory_sha256) return baseline
  assert.equal(hash(JSON.stringify(baseline)), proof.current_inventory_sha256, "complete current ordered200 inventory drift")
  const restored = structuredClone(target.inventory)
  assert.equal(hash(JSON.stringify(restored)), target.inventory_sha256, "complete exact parent ordered inventory")
  return restored
}

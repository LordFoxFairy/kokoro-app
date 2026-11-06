// Test-only exact Public28.20 -> Public28.19 inverse. Never a runtime fallback.
import { createHash } from "node:crypto"

const hash = (value: string) => createHash("sha256").update(value).digest("hex")
const inverse = [
  {
    "at": 3,
    "count": 1,
    "sha256": "3e7dac203563a15e2fc1bdf97dfd0283b74458be8d74c51826f3db2258d22248",
    "previous": "  version: 28.19.0\n"
  },
  {
    "at": 5214,
    "count": 98,
    "sha256": "f6b3b29ff2b0c46aa05197dbf48751f2a1f29ded3b836fe3ea335ff2c12266db",
    "previous": ""
  },
  {
    "at": 15765,
    "count": 22,
    "sha256": "4c88be0b3f82ea008ed10bacdc2139f5c51905ab4ed447cee70b04dc685111fa",
    "previous": ""
  },
  {
    "at": 23540,
    "count": 1,
    "sha256": "c069140a0b8e85e3de5c2ce472ead6796f46b085b8c1712761194e7142004129",
    "previous": "      required: [id, project_id, title, status, updated_at]\n"
  },
  {
    "at": 23549,
    "count": 32,
    "sha256": "e74ee1c10827e4c91b8d18fc66b0ae2d530ea01f4a365f62e4c39a847a128a16",
    "previous": ""
  },
  {
    "at": 27784,
    "count": 10,
    "sha256": "940b2b19c782cc2ad5f34c4578ecdb2a922065d9d298d5e7011bfe570954f815",
    "previous": ""
  }
] as const

export function restorePublic2819ProjectTaskContract(source: string): string {
  if (!/^  version: 28\.20\.0$/mu.test(source)) {
    if (source.includes("      operationId: createProjectTask\n") ||
        source.includes("    ProjectTaskRevision:\n")) throw Error("Project Task Public28.20 version drift")
    return source
  }
  if (hash(source) !== "c5fc7225901fa5b815cdb7ee5286354d7c4cabed9919676e6e86651fb9910783") throw Error("Project Task Public28.20 child drift")
  const lines = source.match(/[^\n]*\n|[^\n]+$/gu) ?? []
  for (const delta of [...inverse].reverse()) {
    if (hash(lines.slice(delta.at, delta.at + delta.count).join("")) !== delta.sha256) throw Error("Project Task exact delta drift")
    lines.splice(delta.at, delta.count, ...(delta.previous.match(/[^\n]*\n|[^\n]+$/gu) ?? []))
  }
  const parent = lines.join("")
  if (hash(parent) !== "27032917fb272601b6da8ba9227bab5324ac305682a72c94adca72e4f9e25577") throw Error("Project Task Public28.19 parent drift")
  return parent
}

// Test-only exact Public22.3 ->22.2 full artifact inverse. Never imported by runtime code.
import { createHash } from "node:crypto"
const proof = {
  "current": "727159cea88e9f70ca3d1127306e8a6a6bcaa568398de8b0d8fec1cce6b3fae3",
  "parent": "365d61aa5b3b4c01a178f077914e03b5fdbaeebc95fe740b9be46ca8fadc3205",
  "inverse": [
    {
      "at": 3,
      "count": 1,
      "sha256": "d9c47d97294dd477f68a48b220e59d60287ec820be31d406a4e875cf383d955a",
      "previous": "  version: 22.2.0\n"
    },
    {
      "at": 14339,
      "count": 39,
      "sha256": "6df5eecaeb7172aa3b4e66480a42d09433fc1b86c55cce881dae38a65ecb5e26",
      "previous": ""
    },
    {
      "at": 15190,
      "count": 21,
      "sha256": "a8c206faf471fc6e1af94dd59d906d7b7a2cc5133a15166944b131b29cb64242",
      "previous": ""
    }
  ]
} as const
const hash = (value: string) => createHash("sha256").update(value).digest("hex")
export function restoreModelDiscoveryParent(bytes: Uint8Array): Buffer {
  const source = Buffer.from(bytes).toString("utf8")
  if (hash(source) !== proof.current) throw Error("Model discovery fixed source drift")
  const lines = source.split(/(?<=\n)/u)
  for (const h of [...proof.inverse].reverse()) {
    if (hash(lines.slice(h.at, h.at + h.count).join("")) !== h.sha256) throw Error("Model discovery inverse drift")
    lines.splice(h.at, h.count, h.previous)
  }
  const parent = lines.join("")
  if (hash(parent) !== proof.parent) throw Error("Model discovery complete parent drift")
  return Buffer.from(parent)
}

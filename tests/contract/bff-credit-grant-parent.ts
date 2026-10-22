// Test-only exact Public22.4 ->22.3 full-artifact inverse; never imported by runtime.
import { createHash } from "node:crypto"
const proof = {
  current: "f6b8f3bd250c144a2d648af94c9fd5fe068db33991a4289b849a077eef009f32",
  parent: "727159cea88e9f70ca3d1127306e8a6a6bcaa568398de8b0d8fec1cce6b3fae3",
  inverse: [
    {
      at: 3,
      count: 1,
      sha256: "b06fe21a2e0e4583963e59dda2cbdb2adfbb10c9fe50c072bd051513bac48842",
      previous: "  version: 22.3.0\n",
    },
    {
      at: 2984,
      count: 43,
      sha256: "f5e62ae2ee9fa59315a2ecda59fd56bbfb392291df202e91b1f6356a9864061e",
      previous: "",
    },
    {
      at: 19433,
      count: 49,
      sha256: "95c4e18ad3fbedd08ab589c02ed6d604506379347cfd8ad07275144106875c5b",
      previous: "",
    },
  ],
} as const
const hash = (v: string) => createHash("sha256").update(v).digest("hex")
export function restoreCreditGrantParent(bytes: Uint8Array): Buffer {
  const source = Buffer.from(bytes).toString("utf8")
  if (hash(source) !== proof.current) throw new Error("Credit grant fixed source drift")
  const lines = source.split(/(?<=\n)/u)
  for (const h of [...proof.inverse].reverse()) {
    if (hash(lines.slice(h.at, h.at + h.count).join("")) !== h.sha256) throw new Error("Credit grant inverse drift")
    lines.splice(h.at, h.count, h.previous)
  }
  const parent = lines.join("")
  if (hash(parent) !== proof.parent) throw new Error("Credit grant complete parent drift")
  return Buffer.from(parent)
}

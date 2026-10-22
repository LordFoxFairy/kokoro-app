// Test-only exact Public22.5 ->22.4 complete-artifact inverse; no runtime import.
import { createHash } from "node:crypto"
const proof = {
  current: "c77e4921ccce98cfd91d77fc6897cf327599f237ed13438117323b6a3f8555eb",
  parent: "f6b8f3bd250c144a2d648af94c9fd5fe068db33991a4289b849a077eef009f32",
  inverse: [
    {
      at: 3,
      count: 1,
      sha256: "8a9c3a8ebadf0a23471e4ea9fa650e2324a3c50a787d6762f49e53d007546ae6",
      previous: "  version: 22.4.0\n",
    },
    {
      at: 2985,
      count: 142,
      sha256: "b66ae406d3e2b066fcde419a4213e9ded8f44be4af86e8e3c9b56a5c97555bf0",
      previous: "",
    },
    {
      at: 19575,
      count: 311,
      sha256: "23a77d56fed6e096260f33bb6e962d4b2c229e58bb29ff6294fbb07b8eec566c",
      previous: "",
    },
  ],
} as const
const hash = (value: string) => createHash("sha256").update(value).digest("hex")
export function restoreMeteringParent(bytes: Uint8Array): Buffer {
  let source = Buffer.from(bytes).toString("utf8")
  if (/^  version: 23\.0\.0$/mu.test(source)) {
    if (hash(source) !== "34ea71e0aa56256ca00fc5b3c40abd4d142bea82e664a6871190b8547ec2b9e6") throw Error("Exact model binding source drift")
    source = source
      .replace("        - model_revision\n", "")
      .replace(
        "        model_revision:\n          type: object\n          additionalProperties: false\n          required:\n            - id\n            - content_digest\n          properties:\n            id:\n              type: string\n              format: uuid\n              pattern: ^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$(?![\\s\\S])\n            content_digest:\n              type: string\n              pattern: ^[0-9a-f]{64}$(?![\\s\\S])\n",
        "",
      )
      .replace("  version: 23.0.0", "  version: 22.5.0")
  }
  if (hash(source) !== proof.current) throw Error("Metering fixed source drift")
  const lines = source.split(/(?<=\n)/u)
  for (const h of [...proof.inverse].reverse()) {
    if (hash(lines.slice(h.at, h.at + h.count).join("")) !== h.sha256) throw Error("Metering inverse drift")
    lines.splice(h.at, h.count, h.previous)
  }
  const parent = lines.join("")
  if (hash(parent) !== proof.parent) throw Error("Metering complete parent drift")
  return Buffer.from(parent)
}

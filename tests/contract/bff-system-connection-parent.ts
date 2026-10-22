// Test-only exact Public20 -> Public19 inverse. Original Public19 parent proofs remain sealed.
import { createHash } from "node:crypto"
const hash = (bytes: Uint8Array | string) => createHash("sha256").update(bytes).digest("hex")
const changes = [
  {
    "at": 3,
    "current": "  version: 20.0.0\n",
    "previous": "  version: 19.0.0\n"
  },
  {
    "at": 20168,
    "current": "        - request_model\n        - connection\n",
    "previous": "        - transport\n        - gateway_model_name\n"
  },
  {
    "at": 20227,
    "current": "        request_model:\n",
    "previous": "        transport:\n          type: string\n          const: litellm\n        gateway_model_name:\n"
  },
  {
    "at": 20231,
    "current": "        connection:\n          type: object\n          additionalProperties: false\n          required: [protocol, connection_type, base_url, secret_handle_ref]\n          properties:\n            protocol:\n              type: string\n              const: openai_chat_completions\n            connection_type:\n              type: string\n              enum: [direct, litellm]\n            base_url:\n              type: string\n              minLength: 1\n              maxLength: 2048\n              pattern: '^https?:\\/\\/[^\\s\\\\?#]+$'\n            secret_handle_ref:\n              type: string\n              minLength: 1\n              maxLength: 255\n              pattern: '^[A-Za-z0-9][A-Za-z0-9._:/-]*$'\n",
    "previous": ""
  }
] as const
export function restorePublic19(bytes: Uint8Array): Buffer {
  if (hash(bytes) !== "c5e89c7e56663d05d821c7c19115afb0cc913d617a35c6fd96162b13d201514f") throw Error("not fixed Public20")
  const lines = Buffer.from(bytes).toString("utf8").match(/[^\n]*\n|[^\n]+$/gu) ?? []
  for (const change of [...changes].reverse()) {
    const count = change.current.match(/\n/gu)?.length ?? 0
    if (lines.slice(change.at, change.at + count).join("") !== change.current) throw Error("Public20 inverse delta drift")
    lines.splice(change.at, count, ...(change.previous.match(/[^\n]*\n|[^\n]+$/gu) ?? []))
  }
  const result = Buffer.from(lines.join(""))
  if (hash(result) !== "955412b680bf7a2529c4c35f553ff272d7361769ea95bb441ba820b552ffc564") throw Error("Public19 historical bytes drift")
  return result
}

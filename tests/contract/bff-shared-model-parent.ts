import {restorePublic21} from "./bff-configuration-parent";
// Test-only exact Public21 -> Public20 inverse; sealed Public20/Public19 proofs remain unchanged.
import { createHash } from "node:crypto"
const hash = (bytes: Uint8Array | string) => createHash("sha256").update(bytes).digest("hex")
const inverse = [
  {
    "at": 3,
    "count": 1,
    "sha256": "726aedaabebd362fce5f5880973f57a7b95181454cb4f15962a289737034eaab",
    "previous": "  version: 20.0.0\n"
  },
  {
    "at": 20129,
    "count": 1,
    "sha256": "6efe7a2aa24d00210aa09741aa593fc88ce0f758b9aae8370c707e04c5bce796",
    "previous": "          type: string\n"
  },
  {
    "at": 20165,
    "count": 0,
    "sha256": "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    "previous": "        - feature_key\n"
  },
  {
    "at": 20200,
    "count": 0,
    "sha256": "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    "previous": "        feature_key:\n          type: string\n          minLength: 1\n          maxLength: 128\n"
  },
  {
    "at": 20365,
    "count": 2,
    "sha256": "e3e8c60b1f465689162b296a99feba5aacd407b7c272c986751420e61976fdb6",
    "previous": "      required: [provider, name, is_default]\n"
  },
  {
    "at": 20368,
    "count": 6,
    "sha256": "502815504a89f90b50c737be3465492d5562d88846b0c8dec6a098bb949d26c4",
    "previous": "        provider: { type: string }\n        name: { type: string }\n"
  },
  {
    "at": 20375,
    "count": 6,
    "sha256": "23ee8fc973b5f022ab69a751b254ab9f52f48238a642067430bd1a6a72f10915",
    "previous": "        display_name: { type: string }\n"
  },
  {
    "at": 20384,
    "count": 1,
    "sha256": "887e5dbbe661e45add1af1e58f1a9bd88481b48afc03d244135149d032bee1dd",
    "previous": ""
  },
  {
    "at": 20388,
    "count": 2,
    "sha256": "5319f54f5dec403b1a34500a4b6c08fde9eda74613168b41548c160c2c3da0d7",
    "previous": "          required: [models]\n"
  },
  {
    "at": 20394,
    "count": 1,
    "sha256": "08236f6871bc3b0fb862325cfc373467e39b6c5038dd31ada04b052d544787e5",
    "previous": ""
  }
] as const
export function restorePublic20(bytes: Uint8Array): Buffer {
  bytes=restorePublic21(bytes);
  if (hash(bytes) !== "a902a20ad95e46c01bfc8f5a80260c14565cfe557137759d5ecd42bc1a60f7c2") throw Error("not fixed Public21")
  const lines = Buffer.from(bytes).toString("utf8").match(/[^\n]*\n|[^\n]+$/gu) ?? []
  for (const change of [...inverse].reverse()) {
    if (hash(lines.slice(change.at, change.at + change.count).join("")) !== change.sha256) throw Error("Public21 inverse delta drift")
    lines.splice(change.at, change.count, ...(change.previous.match(/[^\n]*\n|[^\n]+$/gu) ?? []))
  }
  const result = Buffer.from(lines.join(""))
  if (hash(result) !== "c5e89c7e56663d05d821c7c19115afb0cc913d617a35c6fd96162b13d201514f") throw Error("Public20 historical bytes drift")
  return result
}

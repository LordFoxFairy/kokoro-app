// Test-only finite owner-release inverse; never a runtime decoder or fallback.
import assert from "node:assert/strict"
import { createHash } from "node:crypto"

const hash = (source: string) => createHash("sha256").update(source).digest("hex")
const currentDigest = "4f27adbea9a63c36d8b11e95c9dde342a6e8d662cab77cb42091384f3b17e333"
const parentDigest = "df5a33d4fa33662e4f70967bf5db60033f71f29511bf5975aa2395d61abb3e9c"
const addition = "                - context_window_exceeded\n"

export function restorePublic292PersonalContextContract(source: string): string {
  if (!/^  version: 29\.3\.0$/mu.test(source)) return source
  assert.equal(hash(source), currentDigest, "complete committed Public29.3 capacity failure artifact drift")
  assert.equal(source.split(addition).length, 3, "exact two nonretryable capacity failure additions")
  const parent = source.replaceAll(addition, "").replace(/^  version: 29\.3\.0$/mu, "  version: 29.2.0")
  assert.equal(hash(parent), parentDigest, "complete committed Public29.2 parent bytes")
  return parent
}

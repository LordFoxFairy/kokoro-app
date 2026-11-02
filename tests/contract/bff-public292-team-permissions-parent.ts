// Test-only finite owner-release inverse; never a runtime decoder or fallback.
import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import { readFileSync } from "node:fs"

const hash = (source: string) => createHash("sha256").update(source).digest("hex")
const currentDigest = "df5a33d4fa33662e4f70967bf5db60033f71f29511bf5975aa2395d61abb3e9c"
const parentDigest = "4e4ce620887b1a1a431a9346d0d259aa5bed3bd5af06f4428f11e9054173418e"
const originalDigest = "258bde9c39f785667cb205976e1547d1cf2c9662a5a2d7f356c4b11e807fcaf7"
const shareProofBytes = readFileSync("tests/contract/fixtures/bff-public291-share-metadata.json", "utf8")
assert.equal(hash(shareProofBytes), "5a4ec5893766e750142908824fe2103976569a8a54db08e2a2f23d9abb4c96cd", "committed owner share inverse proof bytes")
const shareProof = JSON.parse(shareProofBytes)
const parentSkill = "            skill: { type: array, minItems: 1, items: { type: string, enum: [create_draft, create_version, begin_upload, complete_upload, abort_upload, validate_draft, publish, withdraw, set_status, install, set_installation_enabled, remove_installation, update_draft, discard_draft, set_publication_audience] } }\n"
const currentSkill = parentSkill.replace("create_version, begin_upload", "create_version, delete_series, begin_upload")

export function restorePublic291TeamPermissions(source: string): string {
  if (hash(source) === parentDigest) return source
  assert.equal(hash(source), currentDigest, "complete committed Public29.2 Team permissions artifact drift")
  assert.equal(source.split(currentSkill).length, 2, "exact single Team permissions correction")
  source = source.replace(currentSkill, parentSkill).replace(/^  version: 29\.2\.0$/mu, "  version: 29.1.0")
  assert.equal(hash(source), parentDigest, "complete committed Public29.1 parent bytes")
  return source
}

export function restorePublic290ShareMetadata(source: string): string {
  if (hash(source) === originalDigest) return source
  source = restorePublic291TeamPermissions(source)
  assert.equal(hash(source), shareProof.current_source_sha256)
  for (const block of [shareProof.get_block, shareProof.schema_block]) {
    assert.equal(source.split(block).length, 2, "exact single share metadata addition")
    source = source.replace(block, "")
  }
  source = source.replace(/^  version: 29\.1\.0$/mu, "  version: 29.0.0")
  assert.equal(hash(source), originalDigest, "complete committed Public29.0 parent bytes")
  assert.equal(hash(source), shareProof.parent_source_sha256)
  return source
}

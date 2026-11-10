// Build-time exact additive inverse; never a runtime downgrade.
import { createHash } from "node:crypto"
const hash = (source: string) => createHash("sha256").update(source).digest("hex")
export function restorePublic2826LibraryFileSearchContract(source: string): string {
  if (!/^  version: 28\.27\.0$/mu.test(source)) return source
  if (hash(source) !== "52b59b49be42bc3c1126b6fc94b1d88c440b7ac911c2631e8a0305f43f96bd08") throw Error("Library file search Public28.27 child drift")
  const parent = source
    .replace("  version: 28.27.0\n", "  version: 28.26.0\n")
    .replace("      description: A required kind selects either the admitted subject's CLEAN personal ASSET files or FINAL CLEAN Artifacts linked to their active Conversations. File search filters current authorized Storage files before the stable keyset and limit; only a matching file may occupy a page slot. Artifact search matches current authorized FINAL metadata, not unverified delivery claims. Artifact-only q is a case-insensitive NFC substring over title or filename; type uses the documented product taxonomy. Cursors bind kind, tenant, subject, limit and the normalized complete filter tuple. Each Artifact request scans at most min(500, limit * 5) authorized candidates within the existing 30-second deadline; a sparse page may be empty and still have next_cursor. Only next_cursor=null means exhausted. Delivery keyset order is preserved, without relevance ranking or snapshot isolation. Public18 invalidates prior Artifact cursors; clients must restart the query. A cursor never grants access.\n", "      description: A required kind selects either the admitted subject's CLEAN personal ASSET files or FINAL CLEAN Artifacts linked to their active Conversations. Artifact search matches current authorized FINAL metadata, not unverified delivery claims. Artifact-only q is a case-insensitive NFC substring over title or filename; type uses the documented product taxonomy. Cursors bind kind, tenant, subject, limit and the normalized complete filter tuple. Each request scans at most min(500, limit * 5) authorized candidates within the existing 30-second deadline; a sparse page may be empty and still have next_cursor. Only next_cursor=null means exhausted. Delivery keyset order is preserved, without relevance ranking or snapshot isolation. Public18 invalidates prior Artifact cursors; clients must restart the query. A cursor never grants access.\n")
    .replace("          description: Literal text search, at most 200 Unicode code points before normalization. C0 controls and DEL are rejected; empty after trim means no text filter. Files match filename or MIME using NFC and case-insensitive PostgreSQL text semantics. Artifacts match title or filename with trim, NFC and locale-independent lowercase.\n", "          description: Artifact-only search, at most 200 Unicode code points before normalization; trim, NFC and locale-independent lowercase are applied. C0 control characters and DEL are rejected. Empty means no text filter; file queries reject this parameter.\n")
    .replace("          description: Kind-specific type. Files accept all, documents, images, media (audio/video), and other based on MIME. Artifacts retain all, slides, documents, spreadsheets, images, video, audio, and other based on current FINAL MIME/title. Other combinations are invalid.\n", "          description: Artifact-only product type, matched against current FINAL MIME/title according to the Library API taxonomy; file queries reject this parameter.\n")
    .replace("          schema: { type: string, enum: [all, slides, documents, spreadsheets, images, video, audio, other, media], default: all }\n", "          schema: { type: string, enum: [all, slides, documents, spreadsheets, images, video, audio, other], default: all }\n")
  if (hash(parent) !== "c80d5aaba1732eca0fb7bc8f32f500adef99e7d884f579cfb7944b8b11e8901a") throw Error("Library file search complete Public28.26 parent drift")
  return parent
}
export function restorePublic2825LibraryFileDeletionContract(source: string): string {
  source = restorePublic2826LibraryFileSearchContract(source)
  if (!/^  version: 28\.26\.0$/mu.test(source)) return source
  if (hash(source) !== "c80d5aaba1732eca0fb7bc8f32f500adef99e7d884f579cfb7944b8b11e8901a") throw Error("Library file deletion Public28.26 child drift")
  const parent = source
    .replace(/^  \/v1\/library\/files\/\{asset_id\}:\n[\s\S]*?(?=^ {0,2}\S)/mu, "")
    .replace(/^    LibraryFileDeletionResponse:\n[\s\S]*?(?=^ {0,4}\S)/mu, "")
    .replace(/^    LibraryFileDeletionError:\n[\s\S]*?(?=^ {0,4}\S)/mu, "")
    .replace("  version: 28.26.0\n", "  version: 28.25.0\n")
  if (hash(parent) !== "008667f501044dc186e615b83370f96a7401de8027f25e7635248724fb165759") throw Error("Library file deletion complete Public28.25 parent drift")
  return parent
}
export function restorePublic2824FinalAnswerResourceContract(source: string): string {
  source = restorePublic2825LibraryFileDeletionContract(source)
  if (!/^  version: 28\.25\.0$/mu.test(source)) return source
  if (hash(source) !== "008667f501044dc186e615b83370f96a7401de8027f25e7635248724fb165759") throw Error("Final-answer resource Public28.25 child drift")
  const parent = source
    .replace("  version: 28.25.0\n", "  version: 28.24.0\n")
    .replace("              kind: { type: string, enum: [asset, artifact, final_answer] }\n", "              kind: { type: string, enum: [asset, artifact] }\n")
    .replace(" For final_answer, resource_id is the opaque assistant Message ID; no text, scope, segment, revision or digest is accepted.", "")
  if (hash(parent) !== "921c4b7273580a5c64cf6a220808472e828239d4abfbc7b5b93138ecc055a429")
    throw Error("Final-answer resource complete Public28.24 parent drift")
  return parent
}
export function restorePublic2823MessageResourceContract(source: string): string {
  source = restorePublic2824FinalAnswerResourceContract(source)
  if (!/^  version: 28\.24\.0$/mu.test(source)) return source
  if (hash(source) !== "921c4b7273580a5c64cf6a220808472e828239d4abfbc7b5b93138ecc055a429") throw Error("Message resources Public28.24 child drift")
  const field =
    "        selected_resource_refs:\n          type: array\n          maxItems: 16\n          uniqueItems: true\n          x-kokoro-json-byte-limit: 4096\n          description: Ordered opaque resource intent for this message. Omission or [] selects none. Compact UTF-8 JSON is limited to 4096 bytes. Owner scope and exact bytes are resolved by BFF; version_id is not accepted.\n          items:\n            type: object\n            additionalProperties: false\n            required: [kind, resource_id]\n            properties:\n              kind: { type: string, enum: [asset, artifact] }\n              resource_id:\n                type: string\n                minLength: 1\n                maxLength: 191\n                pattern: '^[A-Za-z0-9][A-Za-z0-9._:-]{0,190}(?![\\s\\S])'\n"
  if (source.split(field).length !== 2) throw Error("Message resource exact delta drift")
  const parent = source.replace(field, "").replace("  version: 28.24.0\n", "  version: 28.23.0\n")
  if (hash(parent) !== "0abd300ffc5d50d3aefa19832a32feb53ea358933bcc4df655202517554a7504") throw Error("Message resources complete Public28.23 parent drift")
  return parent
}

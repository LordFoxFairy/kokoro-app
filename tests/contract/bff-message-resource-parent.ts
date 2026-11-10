// Build-time exact additive inverse; never a runtime downgrade.
import { createHash } from "node:crypto"
const hash = (source: string) => createHash("sha256").update(source).digest("hex")
export function restorePublic2830ProjectWebsitesContract(source: string): string {
  if (!/^  version: 28\.31\.0$/mu.test(source)) return source
  if (hash(source) !== "9fea8041e3eac479e5ea008e120729fb37637636bb6bf3ad8b94ac161ac8a88c") throw Error("Project websites Public28.31 child drift")
  const parent = source
    .replace("  version: 28.31.0\n", "  version: 28.30.0\n")
    .replace(/^  \/v1\/projects\/\{project_id\}\/websites:\n[\s\S]*?(?=^  \/v1\/projects\/\{projectId\}:)/mu, "")
    .replace(/^    ProjectWebsitesProjectId:\n[\s\S]*?(?=^    Project:)/mu, "")
    .replace(/^    ProjectWebsitesSuccess:\n[\s\S]*?(?=^    PersonalizationReadSuccess:)/mu, "")
  if (hash(parent) !== "2e459bd39f73686ac6d458011b777f08ea17b79a1467e563cdbb299e044a3cf9") throw Error("Project websites complete Public28.30 parent drift")
  return parent
}
export function restorePublic2829DeliveryDisplayContract(source: string): string {
  source = restorePublic2830ProjectWebsitesContract(source)
  if (!/^  version: 28\.30\.0$/mu.test(source)) return source
  if (hash(source) !== "2e459bd39f73686ac6d458011b777f08ea17b79a1467e563cdbb299e044a3cf9") throw Error("Delivery display Public28.30 child drift")
  const parent = source
    .replace("  version: 28.30.0\n", "  version: 28.29.0\n")
    .replace("              items: { $ref: '#/components/schemas/PrivateDelivery' }\n", "              items: { $ref: '#/components/schemas/Delivery' }\n")
    .replace("        kokoro.delivery.created:\n          $ref: '#/components/schemas/ChatDeliveryCreated'\n", "")
    .replace(/^    PrivateDelivery:\n[\s\S]*?(?=^    MessageCreateRequest:)/mu, "")
    .replace(/^    ChatDeliveryCreated:\n[\s\S]*?(?=^    FinalAnswerResult:)/mu, "")
  if (hash(parent) !== "be6473bfa58332dee9f0417a10f6b21c8320efa79802151fe5b13f93753d4504") throw Error("Delivery display complete Public28.29 parent drift")
  return parent
}
export function restorePublic2828LibraryArtifactCommandsContract(source: string): string {
  source = restorePublic2829DeliveryDisplayContract(source)
  if (!/^  version: 28\.29\.0$/mu.test(source)) return source
  if (hash(source) !== "be6473bfa58332dee9f0417a10f6b21c8320efa79802151fe5b13f93753d4504") throw Error("Library Artifact commands Public28.29 child drift")
  const parent = source
    .replace(/^    delete:\n(?=      tags: \[Library\]\n      operationId: deleteLibraryArtifact\n)[\s\S]*?(?=^  \/v1\/library\/artifacts\/\{conversation_id\}\/\{artifact_id\}\/content:)/mu, "")
    .replace(/^    LibraryArtifactDeletionResponse:\n[\s\S]*?(?=^    LibraryArtifactItem:)/mu, "")
    .replace("        favorited: { type: boolean }\n        project_ref:\n          description: Detail-only canonical source Project ID", "        project_ref:\n          description: Detail-only canonical source Project ID")
    .replace("required: [kind, conversation_id, artifact_id, asset_id, artifact_kind, title, filename, mime_type, size_bytes, content_sha256, source_run_id, delivered_at, favorited]", "required: [kind, conversation_id, artifact_id, asset_id, artifact_kind, title, filename, mime_type, size_bytes, content_sha256, source_run_id, delivered_at]")
    .replace("      description: A required kind selects either the admitted subject's CLEAN personal ASSET files or FINAL CLEAN Artifacts linked to their active Conversations. File search filters current authorized Storage files before the stable keyset and limit; only a matching file may occupy a page slot. Artifact favorites-only filtering runs on the owned BFF relationship before its keyset; it never grants visibility. Artifact search matches current authorized FINAL metadata, not unverified delivery claims. Artifact-only q is a case-insensitive NFC substring over title or filename; type uses the documented product taxonomy. Cursors bind kind, tenant, subject, limit and the normalized complete filter tuple. Each Artifact request scans at most min(500, limit * 5) authorized candidates within the existing 30-second deadline; a sparse page may be empty and still have next_cursor. Only next_cursor=null means exhausted. Delivery keyset order is preserved, without relevance ranking or snapshot isolation. Public18 invalidates prior Artifact cursors; clients must restart the query. A cursor never grants access.", "      description: A required kind selects either the admitted subject's CLEAN personal ASSET files or FINAL CLEAN Artifacts linked to their active Conversations. File search filters current authorized Storage files before the stable keyset and limit; only a matching file may occupy a page slot. Artifact search matches current authorized FINAL metadata, not unverified delivery claims. Artifact-only q is a case-insensitive NFC substring over title or filename; type uses the documented product taxonomy. Cursors bind kind, tenant, subject, limit and the normalized complete filter tuple. Each Artifact request scans at most min(500, limit * 5) authorized candidates within the existing 30-second deadline; a sparse page may be empty and still have next_cursor. Only next_cursor=null means exhausted. Delivery keyset order is preserved, without relevance ranking or snapshot isolation. Public18 invalidates prior Artifact cursors; clients must restart the query. A cursor never grants access.")
    .replace("        - name: favorites_only\n          in: query\n          description: Artifact only. True selects only the current subject's favorited Artifacts; false or absent keeps the ordinary cursor shape. File requests reject this parameter.\n          schema: { type: boolean, default: false }\n", "")
    .replace("  version: 28.29.0\n", "  version: 28.28.0\n")
  if (hash(parent) !== "495afa65989a1308194910b0b5ece62b4f9db0c84f8dc34e7e0f3b00f7c5294f") throw Error("Library Artifact commands complete Public28.28 parent drift")
  return parent
}
export function restorePublic2827LibraryArtifactSourceContract(source: string): string {
  source = restorePublic2828LibraryArtifactCommandsContract(source)
  if (!/^  version: 28\.28\.0$/mu.test(source)) return source
  if (hash(source) !== "495afa65989a1308194910b0b5ece62b4f9db0c84f8dc34e7e0f3b00f7c5294f") throw Error("Library artifact source Public28.28 child drift")
  const parent = source
    .replace("        project_ref:\n          description: Detail-only canonical source Project ID, null for a direct Conversation, or absent when the canonical destination is not established.\n          type: [string, 'null']\n          pattern: '^project_[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}(?![\\s\\S])'\n    LibraryArtifactResponse:\n", "    LibraryArtifactResponse:\n")
    .replace("      summary: Read one delivered Artifact from the current subject's active Conversation\n      description: The detail identifies the source Conversation's canonical Project ID, or null only for a direct Conversation. If the canonical source destination is not established, project_ref is omitted. The project reference is not an access grant.\n", "      summary: Read one delivered Artifact from the current subject's active Conversation\n")
    .replace("  version: 28.28.0\n", "  version: 28.27.0\n")
  if (hash(parent) !== "52b59b49be42bc3c1126b6fc94b1d88c440b7ac911c2631e8a0305f43f96bd08") throw Error("Library artifact source complete Public28.27 parent drift")
  return parent
}
export function restorePublic2826LibraryFileSearchContract(source: string): string {
  source = restorePublic2827LibraryArtifactSourceContract(source)
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

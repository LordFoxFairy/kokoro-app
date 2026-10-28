import { restorePublic286GithubDiscoveryContract } from "./bff-github-discovery-parent"
// Test-only exact Public28.6→28.5 inverse; never a production compatibility reader.
import { createHash } from "node:crypto"
const hash = (source: string) => createHash("sha256").update(source).digest("hex")
const fields = "              product:\n                $ref: \"#/components/schemas/Public9SkillProductFacts\"\n                description: Same authorized current version owner product; absence is only the coordinated predecessor-reader transition, not an inferred publisher.\n              publisher_profile:\n                $ref: \"#/components/schemas/SkillPublisherProfile\"\n                description: Required exactly when product.publisher.kind is iam; kind and id match its iam ref. Omitted for unknown or verified GitHub publisher. Missing never substitutes a creator or default name.\n"
export function restorePublic285SkillPublisherContract(source: string): string {
  source = restorePublic286GithubDiscoveryContract(source)
  if (!/^  version: 28\.6\.0$/mu.test(source)) return source
  if (hash(source) !== "a020e849f740165fa20099f5ab041b76bc480c70a9bbc067955e57f5ec22ae02" || source.split(fields).length !== 2) throw Error("Skill publisher full Public28.6 drift")
  const parent = source.replace(fields, "").replace(/^  version: 28\.6\.0$/mu, "  version: 28.5.0")
  if (hash(parent) !== "109a2ae063b10699ae52776b09533c5622d906679c093d65730a289206043b1a") throw Error("Skill publisher complete Public28.5 parent drift")
  return parent
}

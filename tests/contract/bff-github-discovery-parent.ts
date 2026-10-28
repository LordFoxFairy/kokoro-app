// Test-only exact Public28.7→28.6 inverse; never a production compatibility reader.
import { createHash } from "node:crypto"
const hash = (source: string) => createHash("sha256").update(source).digest("hex")
const discoveryCap = "                paths:\n                  type: array\n                  maxItems: 512\n"
export function restorePublic286GithubDiscoveryContract(source: string): string {
  if (!/^  version: 28\.7\.0$/mu.test(source)) {
    if (source.includes(discoveryCap)) throw Error("GitHub discovery version drift")
    return source
  }
  if (hash(source) !== "818dfe54d5eb50a72725983be136211c63bb17fa7392f94c5c1d46234db3ebd1" || source.split(discoveryCap).length !== 2) throw Error("GitHub discovery full Public28.7 drift")
  const parent = source.replace(discoveryCap, discoveryCap.replace("512", "128")).replace(/^  version: 28\.7\.0$/mu, "  version: 28.6.0")
  if (hash(parent) !== "a020e849f740165fa20099f5ab041b76bc480c70a9bbc067955e57f5ec22ae02") throw Error("GitHub discovery complete Public28.6 parent drift")
  return parent
}

// Test-only exact additive Public28.2→28.1 proof; never imported by production.
import { createHash } from "node:crypto";
import { restorePublic282FileToolDisplayContract } from "./bff-file-tool-display-parent";
const hash = (source: string) =>
  createHash("sha256").update(source).digest("hex");
const blocks = [
  ["PATHS", "ce9b142e9e19beaabfc3e89ca7adcb1abd1ffb78f8995bcf8d0222249c510a31"],
  [
    "SCHEMAS",
    "3ddb3d479f7e2399f7dfb187ca2e19dcdb350c4e9009c274e4dac399a3911071",
  ],
];
export function restorePublic281ProjectMcpRecommendationsContract(
  source: string,
): string {
  source = restorePublic282FileToolDisplayContract(source);
  if (!/^  version: 28\.2\.0$/mu.test(source)) {
    if (source.includes("PROJECT-MCP-RECOMMENDATIONS-"))
      throw Error("Project recommendations version drift");
    return source;
  }
  if (
    hash(source) !==
    "e0bb74069c65fb8d414a6a3cb0d6f4c8d9bcb40bb693c2409a9cbe051b8bac53"
  )
    throw Error("Project recommendations full current drift");
  let parent = source;
  for (const [kind, digest] of blocks) {
    const indent = kind === "PATHS" ? "  " : "    ";
    const block = parent.match(
      new RegExp(
        `^${indent}# PROJECT-MCP-RECOMMENDATIONS-${kind}-BEGIN\n[\\s\\S]*?^${indent}# PROJECT-MCP-RECOMMENDATIONS-${kind}-END\n`,
        "mu",
      ),
    )?.[0];
    if (!block || hash(block) !== digest)
      throw Error("Project recommendations exact delta drift");
    parent = parent.replace(block, "");
  }
  parent = parent.replace(/^  version: 28\.2\.0$/mu, "  version: 28.1.0");
  if (
    hash(parent) !==
    "07e98d803ac3c7342c2e322b507e8760d89e63bc5ecdab3cdf447b68bf3c904c"
  )
    throw Error("Project recommendations full Public28.1 parent drift");
  return parent;
}

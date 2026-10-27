import { expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { MCP_PUBLICATION_PROVENANCE, MCP_PUBLICATION_POLICY } from "@/generated/bff-mcp-project-publication";
import { mcpPublicationErrorPolicy } from "@/hub/mcp-project-publication-error";
it("private publication artifact is exactly pinned and reproducible without modifying the current public contract", () => {
 const bytes = readFileSync("src/generated/bff-mcp-project-publication.json");
 expect(createHash("sha256").update(bytes).digest("hex")).toBe(MCP_PUBLICATION_PROVENANCE.source_sha256);
 expect(MCP_PUBLICATION_POLICY.visibility).toBe("browser-private"); expect(MCP_PUBLICATION_POLICY.execution_ready).toBe(false);
 expect(MCP_PUBLICATION_POLICY.receipt_not_found_proves_no_commit).toBe(false);
 execFileSync(process.execPath, ["scripts/generate-bff-mcp-project-publication.mjs", "--check"]);
 expect(createHash("sha256").update(readFileSync("src/generated/bff-public-openapi.yaml")).digest("hex")).toBe("e0bb74069c65fb8d414a6a3cb0d6f4c8d9bcb40bb693c2409a9cbe051b8bac53");
});
it("all private closed fault tuples reject changed status or retryable bit", () => {
 for (const tuple of [...Object.values(MCP_PUBLICATION_POLICY.faults), ...Object.values(MCP_PUBLICATION_POLICY.admission_faults)]) {
  expect(mcpPublicationErrorPolicy(tuple.status, tuple)).not.toBeNull(); expect(mcpPublicationErrorPolicy(tuple.status, { ...tuple, retryable: !tuple.retryable })).toBeNull(); expect(mcpPublicationErrorPolicy(418, tuple)).toBeNull();
 }
});

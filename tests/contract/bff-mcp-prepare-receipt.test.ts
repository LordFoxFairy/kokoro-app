import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, it } from "vitest";
import { renderMcpPrepareReceipt } from "../../scripts/generate-bff-mcp-prepare-receipt.mjs";
import { MCP_PREPARE_RECEIPT_POLICY, MCP_PREPARE_RECEIPT_PROVENANCE } from "@/generated/bff-mcp-prepare-receipt";
import { mcpPrepareReceiptMatches, mcpPrepareReceiptLookupOnly } from "@/hub/mcp-prepare-receipt.schema";
import { prepareReceiptFixture } from "../hub/fixtures/mcp-prepare-receipt";
const file = (path: string) => readFileSync(resolve(process.cwd(), path));
const bytes = file("src/generated/bff-mcp-prepare-receipt.json");
const provenance = JSON.parse(file("contract/bff-mcp-prepare-receipt-source.json").toString("utf8"));
const digest = (value: Uint8Array) => createHash("sha256").update(value).digest("hex");

it("pins the full formal private artifact independently of the unchanged public and other private sources", () => {
  expect(provenance).toMatchObject({ owner_commit: "6557f1895d4e1a4f6d2ad9e9e37ca4fc18371d45", source_path: "contract/openapi/browser/v1/mcp-prepare-receipt.json", source_sha256: "ad1f842626677c97ee3734aff3663f296cc9c58ccfe886ae116abf8f8b991810", candidate: false });
  expect(digest(bytes)).toBe(provenance.source_sha256); expect(MCP_PREPARE_RECEIPT_PROVENANCE).toEqual(provenance);
  expect(digest(file("src/generated/bff-connector-command-errors.json"))).toBe("5c12e237e03a6be446a564034ec5c18965e996be24ddeb40807ec4b9b074d83d");
  expect(MCP_PREPARE_RECEIPT_POLICY.same_command).toEqual({ method: "GET", target: "original_lookup" });
  expect(mcpPrepareReceiptLookupOnly()).toBe(true);
});
it("regenerates the same TypeScript deterministically and rejects a byte-level artifact drift", () => {
  expect(renderMcpPrepareReceipt(bytes, provenance)).toBe(file("src/generated/bff-mcp-prepare-receipt.ts").toString("utf8"));
  expect(renderMcpPrepareReceipt(bytes, provenance)).toBe(renderMcpPrepareReceipt(bytes, provenance));
  expect(() => renderMcpPrepareReceipt(Buffer.concat([bytes, Buffer.from("\n")]), provenance)).toThrow(/digest drift/u);
});
it.each(["lookup_only", "automatic_retries", "negative_ack", "prepare_authorized", "same_command", "completed_status", "replayed", "open_wrapper"])("rejects semantic %s drift even under a recomputed test-only digest", field => {
  const spec = JSON.parse(bytes.toString("utf8"));
  const policy = spec["x-kokoro-lookup-policy"], response = spec.paths[policy.path].get.responses[200].content["application/json"].schema;
  if (field === "lookup_only") policy.lookup_only = false;
  else if (["automatic_retries", "negative_ack", "prepare_authorized"].includes(field)) policy[field] = true;
  else if (field === "same_command") policy.same_command.method = "POST";
  else if (field === "completed_status") response.properties.data.properties.completed.properties.server.properties.prepare_status.enum.push("pending_prepare");
  else if (field === "replayed") response.properties.data.properties.completed.properties.replayed.const = false;
  else response.additionalProperties = true;
  const changed = Buffer.from(JSON.stringify(spec));
  expect(() => renderMcpPrepareReceipt(changed, { ...provenance, source_sha256: digest(changed) })).toThrow();
});
it("accepts only replayed completed ACK and the original server/CAS, never Current or a negative proof", () => {
  expect(mcpPrepareReceiptMatches(prepareReceiptFixture(), "receipt-server", "1")).toBe(true);
  expect(mcpPrepareReceiptMatches(prepareReceiptFixture(), "receipt-server", "9")).toBe(false);
  expect(mcpPrepareReceiptMatches(prepareReceiptFixture(), "other", "1")).toBe(false);
  expect(mcpPrepareReceiptMatches({ data: { completed: null, reason: "not_executed" } }, "receipt-server", "1")).toBe(false);
});

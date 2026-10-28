import { expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { MCP_SERVER_ICON_POLICY, MCP_SERVER_ICON_PROVENANCE, mcpServerIconErrors } from "@/generated/bff-mcp-server-icon";

it("pins and regenerates only the independent browser-private media profile, without changing public or shared-error artifacts", () => {
  expect(createHash("sha256").update(readFileSync("src/generated/bff-mcp-server-icon.json")).digest("hex")).toBe(MCP_SERVER_ICON_PROVENANCE.source_sha256);
  expect(MCP_SERVER_ICON_PROVENANCE.candidate).toBe(false);
  expect(MCP_SERVER_ICON_POLICY.visibility).toBe("browser-private");
  expect(MCP_SERVER_ICON_POLICY.new_command_authorized).toBe(false);
  expect(MCP_SERVER_ICON_POLICY.automatic_retries).toBe(false);
  execFileSync(process.execPath, ["scripts/generate-bff-mcp-server-icon.mjs", "--check"]);
  expect(createHash("sha256").update(readFileSync("src/generated/bff-public-openapi.yaml")).digest("hex")).toBe("4d93ec15e2931768afafffb2101039b1da64757ea48c760d16ef88aa8753db16");
  expect(createHash("sha256").update(readFileSync("src/generated/bff-connector-command-errors.json")).digest("hex")).toBe("5c12e237e03a6be446a564034ec5c18965e996be24ddeb40807ec4b9b074d83d");
});
it("the producer's status-specific closed tuples reject changed retryability and unknown fields", () => {
  for (const tuple of MCP_SERVER_ICON_POLICY.errors) {
    const validator = mcpServerIconErrors[String(tuple.status) as keyof typeof mcpServerIconErrors];
    const error = { code: tuple.code, message: "Owner failure", retryable: tuple.retryable };
    expect(validator.safeParse({ error }).success).toBe(true);
    expect(validator.safeParse({ error: { ...error, retryable: !error.retryable } }).success).toBe(false);
    expect(validator.safeParse({ error: { ...error, owner: "forged" } }).success).toBe(false);
    expect(validator.safeParse({ error, tenant: "forged" }).success).toBe(false);
  }
});

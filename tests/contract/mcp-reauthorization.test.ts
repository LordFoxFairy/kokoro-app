import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { expect, it } from "vitest";
import { MCP_REAUTHORIZATION_POLICY, MCP_REAUTHORIZATION_PROVENANCE } from "@/generated/bff-mcp-reauthorization";
import { restorePublic2835NativeSessionContract, restorePublic2836SessionShareContract } from "./bff-message-resource-parent";
const hash = (value: string | Uint8Array) => createHash("sha256").update(value).digest("hex");
it("pins only the independent released reauthorization profile and reproducible narrow generator", () => {
  const bytes = readFileSync("src/generated/bff-mcp-reauthorization.json");
  expect(hash(bytes)).toBe("6fd643edfb74160444163dc6669d3370878ab3f44b94cdabe17f139c8c9b1925");
  expect(MCP_REAUTHORIZATION_PROVENANCE.owner_commit).toBe("0a2c98ae6b16e48849c96ccd5fb87c1dcc2b6e97");
  expect(MCP_REAUTHORIZATION_PROVENANCE.candidate).toBe(false);
  expect(MCP_REAUTHORIZATION_POLICY).toMatchObject({ profile: "mcp-private-server-reauthorization", version: "1.0.0", automatic_retries: false, prepare_authorized: false, connected: false, same_command: { method: "POST", target: "original", body: "original_source_and_double_cas", key: "original" } });
  expect(() => execFileSync(process.execPath, ["scripts/generate-bff-mcp-reauthorization.mjs", "--check"])).not.toThrow();
});
it("restores whole unchanged28.36 and28.35 parents including operation order, rejecting metadata, permission and admission drift", () => {
  const raw = readFileSync("src/generated/bff-public-openapi.yaml", "utf8");
  expect(hash(restorePublic2836SessionShareContract(raw))).toBe("7f715f26aa93410514b3876804309e10049f6fc6cbfcbe50847b1ccbd800d434");
  expect(hash(restorePublic2835NativeSessionContract(raw))).toBe("a26431d45ad96c4e80e6751d61e66a14b3933ae7c2ffb6f9e7df57fcc7e6808f");
  for (const changed of [raw + "\n", raw.replace("getSessionShareMetadata", "changedRead"), raw.replace("create_version, delete_series", "create_version, changed_permission"), raw.replace("name: kokoro-issuer.session_token", "name: changed_cookie")]) {
    expect(changed).not.toBe(raw); expect(() => restorePublic2835NativeSessionContract(changed)).toThrow(/drift/);
  }
});

import { expect, it } from "vitest";
import { createHubClient } from "@/hub/client";
import { mcpPrivateServerSchema, mcpConnectorSchema } from "@/hub/mcp-connector.schema";
import { rememberCreatedMcpDetail, readCreatedMcpDetail, retireCreatedMcpDetail } from "@/ui/mcp/mcp-created-detail-handoff";
import { invalidateMcpConnectorProjection } from "@/ui/mcp/use-mcp-projection";
const boundary = { subject: "actor", admitted: true, generation: 1 };
function fixture() {
 const client = createHubClient();
 const target = Object.freeze({ serverId: "source-server", connectorId: "source-connector", providerKey: "source-provider" });
 const facts = {
  server: mcpPrivateServerSchema.parse({ availability: "unavailable", server_id: target.serverId, display_name: "Saved source", server_url: "https://mcp.example.test/mcp", status: "registered", state_version: "2", headers: [], transport: "streamable_http" as const, prepare_status: "pending_prepare", declarations: [], declarations_available: false }),
  connector: mcpConnectorSchema.parse({ availability: "unavailable", connector_id: target.connectorId, server_id: target.serverId, provider_key: target.providerKey, display_name: "Saved source", connector_type: "mcp", status: "pending", enabled: false, state_version: "3", approved_scopes: [] }),
 };
 return { client, target, facts };
}
it("hands off only the exact completion object and immutable safe read facts, without deriving connected status", () => {
 const { client, target, facts } = fixture();
 rememberCreatedMcpDetail(target, client, boundary, facts);
 const read = readCreatedMcpDetail(target, client, boundary);
 expect(read).toEqual(facts); expect(read).not.toBe(facts);
 expect(read?.server.state_version).toBe("2"); expect(read?.connector.state_version).toBe("3");
 expect(read?.connector.enabled).toBe(false); expect(read?.server.prepare_status).toBe("pending_prepare");
 expect(readCreatedMcpDetail({ ...target }, client, boundary)).toBeNull();
 expect(Object.isFrozen(read?.server)).toBe(true); expect(Object.isFrozen(read?.connector)).toBe(true);
 expect(Object.isFrozen(read?.server.headers)).toBe(true);
});
it.each([
 ["different subject", { ...boundary, subject: "other" }],
 ["new generation", { ...boundary, generation: 2 }],
 ["admission loss", { ...boundary, admitted: false }],
 ["absent subject", { ...boundary, subject: null }],
])("retires %s permanently rather than reviving the old observation when the boundary returns", (_name, next) => {
 const { client, target, facts } = fixture(); rememberCreatedMcpDetail(target, client, boundary, facts);
 expect(readCreatedMcpDetail(target, client, next)).toBeNull();
 expect(readCreatedMcpDetail(target, client, boundary)).toBeNull();
});
it("a different client and a changed connector revision cannot borrow the old observation", () => {
 const { client, target, facts } = fixture(); rememberCreatedMcpDetail(target, client, boundary, facts);
 expect(readCreatedMcpDetail(target, createHubClient(), boundary)).toBeNull();
 rememberCreatedMcpDetail(target, client, boundary, facts);
 invalidateMcpConnectorProjection(client, boundary.subject);
 expect(readCreatedMcpDetail(target, client, boundary)).toBeNull();
});
it("explicit source recheck retirement does not need a successful replacement response", () => {
 const { client, target, facts } = fixture(); rememberCreatedMcpDetail(target, client, boundary, facts);
 retireCreatedMcpDetail(target);
 expect(readCreatedMcpDetail(target, client, boundary)).toBeNull();
});
it.each(["serverId", "connectorId", "providerKey"] as const)("rejects a mismatched %s binding", field => {
 const { client, target, facts } = fixture(); const wrong = { ...target, [field]: "other" };
 rememberCreatedMcpDetail(wrong, client, boundary, facts);
 expect(readCreatedMcpDetail(wrong, client, boundary)).toBeNull();
});
it.each(["server", "connector"] as const)("requires the %s version to be a valid owner CAS", field => {
 const { client, target, facts } = fixture(); facts[field].state_version = "0";
 rememberCreatedMcpDetail(target, client, boundary, facts);
 expect(readCreatedMcpDetail(target, client, boundary)).toBeNull();
});
it("rejects revoked/disabled or non-MCP sources", () => {
 for (const change of ["revoked", "disabled", "byok"] as const) {
  const { client, target, facts } = fixture();
  if (change === "revoked") facts.connector.status = change;
  else if (change === "disabled") facts.server.status = change;
  else facts.connector.connector_type = change;
  rememberCreatedMcpDetail(target, client, boundary, facts);
  expect(readCreatedMcpDetail(target, client, boundary)).toBeNull();
 }
});
it("does not retain registration secrets or unrecognized read fields", () => {
 const { client, target, facts } = fixture();
 const unsafe = { ...facts, server: { ...facts.server, headers: [{ name: "authorization", value: "not-a-read-descriptor" }] } };
 rememberCreatedMcpDetail(target, client, boundary, unsafe as unknown as typeof facts);
 expect(readCreatedMcpDetail(target, client, boundary)).toBeNull();
 rememberCreatedMcpDetail(target, client, boundary, { ...facts, connector: { ...facts.connector, extra: "not-a-read-field" } } as typeof facts);
 expect(readCreatedMcpDetail(target, client, boundary)).toBeNull();
});

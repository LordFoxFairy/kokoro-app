import { expect, it, vi } from "vitest";
import { createCustomApiCreateFlow } from "@/ui/mcp/custom-api-create-flow";
import { createMcpJsonImportFlow } from "@/ui/mcp/mcp-json-import-flow";
import { jsonImportReceipt } from "./fixtures/mcp-json-import-receipt";

const boundary = { subject: "completion-owner", admitted: true, generation: 1 };
const profile = { profile_id: "exact-api", name: "Created API", state_version: "1", environment: [],
  created_at: "2026-11-01T00:00:00Z", updated_at: "2026-11-01T00:00:00Z" };
const input = { name: profile.name, environment: [{ name: "TOKEN", value: "fixture-only-secret" }] };

it("retains only the API locator, gates it by completed admission, and clears it at finish", async () => {
  const flow = createCustomApiCreateFlow({ client: { createCustomApi: vi.fn().mockResolvedValue(profile) }, boundary, onConfirmed: vi.fn() });
  expect(await flow.submit(input, boundary)).toBe(true);
  expect(flow.getCompletion(boundary)).toEqual({ profileId: profile.profile_id });
  expect(Object.isFrozen(flow.getCompletion(boundary))).toBe(true);
  const next = { ...boundary, generation: 2 };
  flow.bind({ ...next, admitted: false });
  expect(flow.getCompletion(boundary)).toBeUndefined();
  expect(flow.getCompletion({ ...next, admitted: false })).toBeUndefined();
  flow.bind(next);
  expect(flow.getCompletion(next)).toEqual({ profileId: profile.profile_id });
  expect(flow.finish(next)).toBe(true);
  expect(flow.getCompletion(next)).toBeUndefined();
});

it("preserves every JSON exact binding in owner order without configuration or CAS facts", async () => {
  const receipt = jsonImportReceipt(["Second alphabetically", "First alphabetically"]);
  const flow = createMcpJsonImportFlow({ client: { importPrivateMcpJson: vi.fn().mockResolvedValue(receipt) }, boundary, onConfirmed: vi.fn() });
  expect(await flow.submit("original whole document", boundary)).toBe(true);
  expect(flow.getCompletion(boundary)).toEqual(receipt.imports.map(({ server, connector }) => ({
    serverId: server.server_id, connectorId: connector.connector_id, providerKey: connector.provider_key, name: server.display_name,
  })));
  expect(JSON.stringify(flow.getCompletion(boundary))).not.toMatch(/server_url|headers|state_version|enabled/);
  expect(Object.isFrozen(flow.getCompletion(boundary))).toBe(true);
  expect(Object.isFrozen(flow.getCompletion(boundary)?.[0])).toBe(true);
});

it.each([undefined, { imports: [], replayed: false }])("never guesses a completion from an invalid JSON ACK (%j)", async ack => {
  const confirmed = vi.fn();
  const flow = createMcpJsonImportFlow({ client: { importPrivateMcpJson: vi.fn().mockResolvedValue(ack) }, boundary, onConfirmed: confirmed });
  expect(await flow.submit("original whole document", boundary)).toBe(false);
  expect(flow.getSnapshot().kind).toBe("unknown");
  expect(flow.getCompletion(boundary)).toBeUndefined();
  expect(confirmed).not.toHaveBeenCalled();
});

it("an old actor's late ACK invalidates without publishing its locator to a replacement", async () => {
  let acknowledge!: (value: typeof profile) => void;
  const confirmed = vi.fn();
  const flow = createCustomApiCreateFlow({ client: { createCustomApi: vi.fn(() => new Promise<typeof profile>(resolve => { acknowledge = resolve; })) }, boundary, onConfirmed: confirmed });
  const running = flow.submit(input, boundary);
  const replacement = { ...boundary, subject: "replacement", generation: 2 };
  flow.bind(replacement);
  acknowledge(profile); await running;
  expect(flow.getCompletion(boundary)).toBeUndefined();
  expect(flow.getCompletion(replacement)).toBeUndefined();
  expect(confirmed).toHaveBeenCalledOnce();
});

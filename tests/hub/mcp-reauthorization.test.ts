import { afterEach, expect, it, vi } from "vitest";
import { createHubClient } from "@/hub/client";
import { reauthorizationFixture, reauthorizationInput } from "./fixtures/mcp-reauthorization";
const headers = { "content-type": "application/json", "cache-control": "no-store", "x-request-id": "new-authorization" };
const respond = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers });
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });
it("posts only the frozen source and double CAS under the supplied key; historical pending ACK does not trigger any follow-up command", async () => {
  const fetch = vi.fn().mockResolvedValue(respond(reauthorizationFixture())); vi.stubGlobal("fetch", fetch);
  expect(await createHubClient().reauthorizePrivateMcpServer!("saved-server", reauthorizationInput, "original-key")).toEqual(reauthorizationFixture().data);
  expect(fetch).toHaveBeenCalledOnce(); expect(fetch.mock.calls[0]![0]).toBe("/api/hub/mcp/servers/saved-server/reauthorize");
  const init = fetch.mock.calls[0]![1] as RequestInit;
  expect(init.method).toBe("POST"); expect(init.cache).toBe("no-store"); expect(JSON.parse(init.body as string)).toEqual(reauthorizationInput);
  const sent = new Headers(init.headers); expect(sent.get("idempotency-key")).toBe("original-key"); expect(sent.has("authorization")).toBe(false); expect(sent.has("x-kokoro-internal-secret")).toBe(false);
});
it.each(["provider", "source", "server", "cas", "connection", "enabled", "scopes", "version", "declarations", "extra"] as const)("rejects an unbound or unsafe %s ACK without retry", async fault => {
  const fixture = reauthorizationFixture(); const data = fixture.data;
  const connector = fault === "provider" ? { ...data.connector, provider_key: "private-other-server" } : fault === "source" ? { ...data.connector, connector_id: reauthorizationInput.source_connector_id }
    : fault === "enabled" ? { ...data.connector, enabled: true } : fault === "scopes" ? { ...data.connector, approved_scopes: ["tool:all"] }
    : fault === "version" ? { ...data.connector, state_version: "2" } : data.connector;
  const server = fault === "server" ? { ...data.server, server_id: "other" } : fault === "cas" ? { ...data.server, state_version: "4" }
    : fault === "connection" ? { ...data.server, connection_id: "old-execution" } : fault === "declarations" ? { ...data.server, declarations_available: true } : data.server;
  const fetch = vi.fn().mockResolvedValue(respond({ data: { ...data, server, connector }, ...(fault === "extra" ? { unknown: true } : {}) })); vi.stubGlobal("fetch", fetch);
  await expect(createHubClient().reauthorizePrivateMcpServer!("saved-server", reauthorizationInput, "original-key")).rejects.toMatchObject({ reason: "parse" }); expect(fetch).toHaveBeenCalledOnce();
});
it.each(["0", "01", "2147483647"])("rejects nonincrementable CAS %s before fetch", async version => {
  const fetch = vi.fn(); vi.stubGlobal("fetch", fetch);
  await expect(createHubClient().reauthorizePrivateMcpServer!("saved-server", { ...reauthorizationInput, expected_server_state_version: version }, "original-key")).rejects.toThrow(); expect(fetch).not.toHaveBeenCalled();
});
it("enforces the existing absolute budget even if fetch ignores cancellation", async () => {
  vi.useFakeTimers(); const fetch = vi.fn(() => new Promise(() => undefined)); vi.stubGlobal("fetch", fetch);
  const result = createHubClient().reauthorizePrivateMcpServer!("saved-server", reauthorizationInput, "original-key").catch(error => error);
  await vi.advanceTimersByTimeAsync(10_001); expect(await result).toMatchObject({ reason: "aborted" }); expect(fetch).toHaveBeenCalledOnce();
});
it.each([[503, "mcp_personal_command_outcome_unknown", false], [409, "mcp_personal_command_in_progress", true], [412, "mcp_personal_precondition_failed", false]] as const)("preserves the published %i/%s tuple with zero automatic retry", async (status, code, retryable) => {
  const fetch = vi.fn().mockResolvedValue(respond({ error: { code, message: "QA", retryable } }, status)); vi.stubGlobal("fetch", fetch);
  await expect(createHubClient().reauthorizePrivateMcpServer!("saved-server", reauthorizationInput, "original-key")).rejects.toMatchObject({ reason: "http", status, code, retryable }); expect(fetch).toHaveBeenCalledOnce();
});

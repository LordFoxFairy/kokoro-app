import { afterEach, expect, it, vi } from "vitest";
import { createHubClient } from "@/hub/client";
import { prepareReceiptFixture } from "./fixtures/mcp-prepare-receipt";
const headers = { "content-type": "application/json", "cache-control": "no-store", "x-request-id": "receipt-request" };
const respond = (value: unknown, status = 200, extra: Record<string, string> = {}) => new Response(JSON.stringify(value), { status, headers: { ...headers, ...extra } });
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

it("only GETs the original key/CAS and returns historical completed, never a fresh read or Prepare POST", async () => {
  const fetch = vi.fn().mockResolvedValue(respond(prepareReceiptFixture())); vi.stubGlobal("fetch", fetch);
  const completed = await createHubClient().getMcpPrepareReceipt!("receipt-server", "1", "original-key");
  expect(completed).toEqual(prepareReceiptFixture().data.completed);
  expect(fetch).toHaveBeenCalledOnce();
  expect(fetch.mock.calls[0]![0]).toBe("/api/hub/mcp/servers/receipt-server/prepare-receipt?expected_state_version=1");
  const init = fetch.mock.calls[0]![1] as RequestInit;
  expect(init.method).toBe("GET"); expect(init.body).toBeUndefined(); expect(init.cache).toBe("no-store");
  expect(new Headers(init.headers).get("idempotency-key")).toBe("original-key");
  expect(new Headers(init.headers).has("content-type")).toBe(false);
});

it.each(["pending", "not_replayed", "wrong_server", "extra", "negative", "duplicate"] as const)("rejects %s rather than treating it as a completed receipt", async fault => {
  const valid = prepareReceiptFixture();
  let body: unknown = valid;
  if (fault === "pending") body = { data: { completed: { ...valid.data.completed, server: { ...valid.data.completed.server, prepare_status: "pending_prepare" } } } };
  if (fault === "not_replayed") body = { data: { completed: { ...valid.data.completed, replayed: false } } };
  if (fault === "wrong_server") body = { data: { completed: { ...valid.data.completed, server: { ...valid.data.completed.server, server_id: "other" } } } };
  if (fault === "extra") body = { ...valid, negative: true };
  if (fault === "negative") body = { data: { completed: null } };
  const fetch = vi.fn().mockResolvedValue(fault === "duplicate" ? new Response('{"data":null,' + JSON.stringify(valid).slice(1), { headers }) : respond(body)); vi.stubGlobal("fetch", fetch);
  await expect(createHubClient().getMcpPrepareReceipt!("receipt-server", "1", "original-key")).rejects.toMatchObject({ reason: "parse" });
  expect(fetch).toHaveBeenCalledOnce();
});

it.each([[404, "mcp_personal_not_found", false], [412, "mcp_personal_command_replay_expired", false], [503, "mcp_personal_command_outcome_unknown", false], [429, "session_rate_limited", true]] as const)("keeps %i/%s unknown without automatic GET retry or POST", async (status, code, retryable) => {
  const fetch = vi.fn().mockResolvedValue(respond({ error: { code, message: "Public QA error", retryable } }, status, status === 429 ? { "retry-after": "1" } : {})); vi.stubGlobal("fetch", fetch);
  await expect(createHubClient().getMcpPrepareReceipt!("receipt-server", "1", "original-key")).rejects.toMatchObject({ reason: "http", status, code, retryable });
  expect(fetch).toHaveBeenCalledOnce();
});

it("enforces one absolute ten-second budget even when fetch or body ignores AbortSignal", async () => {
  vi.useFakeTimers();
  const fetch = vi.fn().mockImplementation(() => new Promise(() => undefined)); vi.stubGlobal("fetch", fetch);
  const result = createHubClient().getMcpPrepareReceipt!("receipt-server", "1", "original-key").catch(error => error);
  await vi.advanceTimersByTimeAsync(10_001);
  expect(await result).toMatchObject({ reason: "aborted" }); expect(fetch).toHaveBeenCalledOnce();
});

it("accepts the owner historical needs_oauth ACK with absent transport, without granting Current", async () => {
  const fixture = prepareReceiptFixture();
  const server = { ...fixture.data.completed.server, transport: undefined };
  const completed = { ...fixture.data.completed, connector: { ...fixture.data.completed.connector, enabled: false }, server: { ...server, prepare_status: "needs_oauth", declarations_available: false, declaration_digest: undefined } };
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(respond({ data: { completed } })));
  expect(await createHubClient().getMcpPrepareReceipt!("receipt-server", "1", "original-key")).toEqual(completed);
});
it.each(["length", "utf8", "wrong_tuple", "oversize"])("rejects %s framing/protocol before accepting a receipt", async fault => {
  const response = fault === "length" ? respond(prepareReceiptFixture(), 200, { "content-length": "1" })
    : fault === "utf8" ? new Response(new Uint8Array([0xff]), { headers })
    : fault === "wrong_tuple" ? respond({ error: { code: "mcp_personal_command_replay_expired", message: "QA", retryable: false } }, 409)
    : new Response(" ".repeat(1_048_577), { headers });
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response));
  await expect(createHubClient().getMcpPrepareReceipt!("receipt-server", "1", "original-key")).rejects.toMatchObject({ reason: "parse" });
});
it("bounds slow EOF and cancellation even when the body ignores AbortSignal", async () => {
  vi.useFakeTimers();
  const cancel = vi.fn();
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(new ReadableStream({ cancel }), { headers })));
  const result = createHubClient().getMcpPrepareReceipt!("receipt-server", "1", "original-key").catch(error => error);
  await vi.advanceTimersByTimeAsync(10_001);
  expect(await result).toMatchObject({ reason: "aborted" }); expect(cancel).toHaveBeenCalledOnce();
});

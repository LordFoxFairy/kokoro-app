import { afterEach, expect, it, vi } from "vitest";
import { createMcpProjectPublicationClient } from "@/hub/mcp-project-publication-client";
import { HubClientError } from "@/hub/client";
import { mcpPublicationInputSchema } from "@/hub/mcp-project-publication.schema";
const original = { server_id: "server", connector_id: "connector", expected_source_state_version: "2", targets: [{ project_id: "project", expected_pin: { absent: true as const } }] };
const revision = { revision_id: "revision", server_id: "server", connector_id: "connector", source_state_version: "2", display_name: "MCP", content_digest: "a".repeat(64), created_at: "2026-10-25T00:00:00Z" };
const pin = { pin_id: "pin", project_id: "project", revision, state_version: "1", removed: false, updated_at: "2026-10-25T00:00:00Z", execution_ready: false as const };
const ack = { revision, pins: [pin], replayed: false };
const response = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json", "cache-control": "no-store", "x-request-id": "request-publication" } });
afterEach(() => vi.unstubAllGlobals());
it("publish and receipt use separate routes but exact original command ID and identity", async () => {
 const fetcher = vi.fn().mockResolvedValueOnce(response({ data: ack })).mockResolvedValueOnce(response({ data: { publication: { ...ack, replayed: true } } })); vi.stubGlobal("fetch", fetcher);
 const client = createMcpProjectPublicationClient(); await client.publish(original, "original-key"); await client.receipt(original, "original-key");
 expect(fetcher.mock.calls[0]?.[0]).toBe("/api/hub/mcp/servers/server/project-publications"); expect(fetcher.mock.calls[1]?.[0]).toBe("/api/hub/mcp/project-publication-receipts");
 expect(JSON.parse(fetcher.mock.calls[0]?.[1].body)).toEqual({ connector_id: "connector", expected_source_state_version: "2", targets: original.targets });
 expect(JSON.parse(fetcher.mock.calls[1]?.[1].body)).toEqual({ publication: original }); expect(fetcher.mock.calls[1]?.[1].headers["idempotency-key"]).toBe("original-key");
});
it.each([
 { ...ack, revision: { ...revision, server_id: "wrong" } },
 { ...ack, pins: [{ ...pin, execution_ready: true }] },
 { ...ack, pins: [{ ...pin, state_version: "2" }] },
 { ...ack, pins: [{ ...pin, project_id: "wrong" }] },
 { ...ack, pins: [pin, pin] },
 { ...ack, pins: [{ ...pin, revision: { ...revision, content_digest: "b".repeat(64) } }] },
])("rejects a success body that cannot prove this original command: %j", async value => {
 vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response({ data: value }))); await expect(createMcpProjectPublicationClient().publish(original, "key")).rejects.toMatchObject({ reason: "parse" });
});
it("list is a bounded read without a command key/body and checks project binding", async () => {
 const fetcher = vi.fn().mockResolvedValue(response({ data: { pins: [pin], next_cursor: null } })); vi.stubGlobal("fetch", fetcher);
 await createMcpProjectPublicationClient().list("project"); expect(fetcher.mock.calls[0]?.[1].body).toBeUndefined(); expect(fetcher.mock.calls[0]?.[1].headers["idempotency-key"]).toBeUndefined();
 await expect(createMcpProjectPublicationClient().list("different-project")).rejects.toMatchObject({ reason: "parse" });
});
it("closed error tuples are exposed; mismatched retryable never becomes permission to replay", async () => {
 const fetcher = vi.fn().mockResolvedValueOnce(response({ error: { code: "mcp_project_publication_in_progress", retryable: true, message: "pending" } }, 409)).mockResolvedValueOnce(response({ error: { code: "mcp_project_publication_in_progress", retryable: false, message: "pending" } }, 409)); vi.stubGlobal("fetch", fetcher);
 await expect(createMcpProjectPublicationClient().publish(original, "key")).rejects.toBeInstanceOf(HubClientError);
 await expect(createMcpProjectPublicationClient().publish(original, "key")).rejects.toMatchObject({ reason: "parse" });
});
it("request rejects duplicate project, numeric overflow, whitespace ID and empty targets before transport", () => {
 const input = { connector_id: original.connector_id, expected_source_state_version: original.expected_source_state_version, targets: original.targets };
 for (const value of [{ ...input, targets: [] }, { ...input, targets: [...input.targets, ...input.targets] }, { ...input, expected_source_state_version: "2147483648" }, { ...input, targets: [{ project_id: "project\n", expected_pin: { absent: true } }] }]) expect(mcpPublicationInputSchema.safeParse(value).success).toBe(false);
});

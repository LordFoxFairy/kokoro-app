import publicationContract from "@/generated/bff-mcp-project-publication.json";
import { expect, it, vi } from "vitest";
import { createMcpProjectPublicationCommands } from "@/ui/mcp/mcp-project-publication-commands";
import { HubClientError } from "@/hub/client";
import type { McpPublicationAck, McpPublicationIdentity } from "@/hub/mcp-project-publication.schema";
import { createTestPublicationJournal } from "./mcp-publication-journal-fixture";
const boundary = { subject: "actor", admitted: true, generation: 1 };
const target = { serverId: "server", connectorId: "connector", providerKey: "provider" };
const original: McpPublicationIdentity = { server_id: "server", connector_id: "connector", expected_source_state_version: "2", targets: [{ project_id: "project", expected_pin: { absent: true } }] };
const revision = { revision_id: "revision", server_id: "server", connector_id: "connector", content_digest: "a".repeat(64), source_state_version: "2", display_name: "MCP", created_at: "2026-10-25T00:00:00Z" };
const ack: McpPublicationAck = { revision, pins: [{ project_id: "project", pin_id: "pin", revision, state_version: "1", removed: false, updated_at: "2026-10-25T00:00:00Z", execution_ready: false }], replayed: false };
async function setup() {
 const client = { list: vi.fn(), publish: vi.fn().mockResolvedValue(ack), receipt: vi.fn().mockResolvedValue({ ...ack, replayed: true }) };
 const commands = createMcpProjectPublicationCommands(client, boundary, createTestPublicationJournal()); await commands.restore(boundary); commands.open(target, boundary); return { client, commands };
}
it("canceling a picker without confirm has no write and retains the saved connector elsewhere", async () => {
 const { client, commands } = await setup(); commands.dismiss(); expect(client.publish).not.toHaveBeenCalled(); expect(client.receipt).not.toHaveBeenCalled(); expect(commands.getSnapshot().target).toBeNull();
});
it("unknown commands survive picker dismissal; receipt is read-only and exact original identity", async () => {
 const { client, commands } = await setup(); client.publish.mockRejectedValueOnce(new HubClientError("network", "lost ack", null, null));
 await commands.publish(original, boundary); commands.dismiss(); expect(commands.getSnapshot().phase).toBe("unknown");
 commands.open(target, boundary); await commands.inspect(boundary);
 expect(client.publish).toHaveBeenCalledOnce(); expect(client.receipt.mock.calls[0]?.slice(0, 2)).toEqual(client.publish.mock.calls[0]?.slice(0, 2)); expect(commands.getSnapshot().phase).toBe("completed");
});
it("explicit retry retains body/key/CAS and freezes target inputs", async () => {
 const { client, commands } = await setup(); client.publish.mockRejectedValueOnce(new HubClientError("http", "lost ack", "mcp_personal_command_outcome_unknown", 503, false));
 const input = structuredClone(original); await commands.publish(input, boundary); input.targets[0]!.project_id = "other";
 await commands.retry(boundary); expect(client.publish).toHaveBeenCalledTimes(2); expect(client.publish.mock.calls[1]?.slice(0, 2)).toEqual(client.publish.mock.calls[0]?.slice(0, 2)); expect(client.publish.mock.calls[1]?.[0].targets[0].project_id).toBe("project");
});
it("receipt 404 neither declares noncommit nor unlocks another intent", async () => {
 const { client, commands } = await setup(); client.publish.mockRejectedValueOnce(new HubClientError("network", "lost ack", null, null)); client.receipt.mockRejectedValue(new HubClientError("http", "missing", "mcp_project_publication_not_found", 404));
 await commands.publish(original, boundary); await commands.inspect(boundary); await commands.publish({ ...original, expected_source_state_version: "3" }, boundary);
 expect(client.publish).toHaveBeenCalledOnce(); expect(commands.getSnapshot().phase).toBe("unknown");
});
it("invalid owner ACK is inspect-only, not an automatic replay or new command", async () => {
 const { client, commands } = await setup(); client.publish.mockRejectedValue(new HubClientError("http", "invalid", "mcp_personal_response_invalid", 502));
 await commands.publish(original, boundary); await commands.retry(boundary); expect(commands.getSnapshot().mayRetry).toBe(false); expect(client.publish).toHaveBeenCalledOnce();
});
it("admission generation retirement aborts the flight and rejects a late ACK", async () => {
 const { client, commands } = await setup(); let resolve!: (value: McpPublicationAck) => void; client.publish.mockImplementation(() => new Promise<McpPublicationAck>(done => { resolve = done; }));
 const result = commands.publish(original, boundary); await vi.waitFor(() => expect(client.publish).toHaveBeenCalledOnce()); commands.bind({ ...boundary, generation: 2, admitted: false }); resolve(ack); expect(await result).toBe(false); expect(commands.getSnapshot().phase).toBe("unknown"); expect(client.publish.mock.calls[0]?.[2].aborted).toBe(true);
 commands.bind({ ...boundary, generation: 2 }); await commands.inspect(boundary); expect(client.receipt).not.toHaveBeenCalled(); await commands.inspect({ ...boundary, generation: 2 }); expect(client.receipt).toHaveBeenCalledOnce();
});
it("actor changes discard the old view and never resume for the new actor", async () => {
 const { client, commands } = await setup(); client.publish.mockRejectedValueOnce(new HubClientError("network", "lost ack", null, null)); await commands.publish(original, boundary);
 commands.bind({ ...boundary, subject: "other" }); await commands.inspect({ ...boundary, subject: "other" }); expect(client.receipt).not.toHaveBeenCalled(); expect(commands.getSnapshot().target).toBeNull();
});
it("only a first closed precondition rejection permits explicit revised intent; prior unknown remains inspect-only", async () => {
 const { client, commands } = await setup(); client.publish.mockRejectedValueOnce(new HubClientError("http", "stale", "mcp_project_publication_precondition_failed", 412));
 await commands.publish(original, boundary); expect(commands.getSnapshot().phase).toBe("rejected"); expect(await commands.revise(boundary)).toBe(true);
 client.publish.mockRejectedValueOnce(new HubClientError("http", "lost ack", "mcp_personal_command_outcome_unknown", 503, false));
 await commands.publish({ ...original, expected_source_state_version: "3" }, boundary);
 client.publish.mockRejectedValueOnce(new HubClientError("http", "stale", "mcp_project_publication_precondition_failed", 412)); await commands.retry(boundary);
 expect(commands.getSnapshot().phase).toBe("unknown"); expect(await commands.revise(boundary)).toBe(false); expect(commands.getSnapshot().mayRetry).toBe(false);
});
it("refresh restores an immutable original as unknown without automatic POST, and only explicit receipt can complete", async () => {
 const journal = createTestPublicationJournal();
 const client = { list: vi.fn(), publish: vi.fn().mockRejectedValue(new HubClientError("network", "lost", null, null)), receipt: vi.fn().mockResolvedValue({ ...ack, replayed: true }) };
 const before = createMcpProjectPublicationCommands(client, boundary, journal); await before.restore(boundary); before.open(target, boundary); await before.publish(original, boundary); before.pause();
 const saved = client.publish.mock.calls[0]?.slice(0, 2);
 const after = createMcpProjectPublicationCommands(client, boundary, journal); await after.restore(boundary);
 expect(after.getSnapshot()).toMatchObject({ phase: "unknown", target, mayRetry: false, recovery: "ready" }); expect(client.publish).toHaveBeenCalledOnce();
 expect(await after.revise(boundary)).toBe(false); await after.inspect(boundary); expect(client.receipt.mock.calls[0]?.slice(0, 2)).toEqual(saved); expect(after.getSnapshot().phase).toBe("completed"); expect(await journal.read(boundary.subject)).toBeNull();
});
it("a failed durable reservation prevents every network write and does not fall back to memory", async () => {
 const journal = createTestPublicationJournal(); vi.spyOn(journal, "reserve").mockRejectedValue(Error("storage blocked"));
 const client = { list: vi.fn(), publish: vi.fn(), receipt: vi.fn() };
 const commands = createMcpProjectPublicationCommands(client, boundary, journal); await commands.restore(boundary); commands.open(target, boundary); await commands.publish(original, boundary);
 expect(commands.getSnapshot()).toMatchObject({ phase: "unknown", recovery: "error", mayRetry: false }); expect(client.publish).not.toHaveBeenCalled(); await commands.retry(boundary); expect(client.publish).not.toHaveBeenCalled();
});
it("a competing tab reservation is adopted instead of overwriting or publishing a second key", async () => {
 const journal = createTestPublicationJournal(), client = { list: vi.fn(), publish: vi.fn(), receipt: vi.fn() };
 const commands = createMcpProjectPublicationCommands(client, boundary, journal); await commands.restore(boundary); commands.open(target, boundary);
 const other = { subject: boundary.subject, target, original: { ...original, expected_source_state_version: "4" }, key: "other-tab-key" }; await journal.reserve(other);
 await commands.publish(original, boundary); expect(client.publish).not.toHaveBeenCalled(); expect(commands.getSnapshot().phase).toBe("unknown"); await commands.inspect(boundary);
 expect(client.receipt.mock.calls[0]?.slice(0, 2)).toEqual([other.original, other.key]);
});
it("receipt failures never grant revised-command permission even for an apparent request rejection", async () => {
 const { client, commands } = await setup(); client.publish.mockRejectedValueOnce(new HubClientError("network", "lost", null, null)); client.receipt.mockRejectedValue(new HubClientError("http", "bad receipt", "mcp_project_publication_request_invalid", 400));
 await commands.publish(original, boundary); await commands.inspect(boundary); expect(commands.getSnapshot().phase).toBe("unknown"); expect(await commands.revise(boundary)).toBe(false);
});
it("acknowledgement does not clear or claim completion when the exact durable record changed", async () => {
 const journal = createTestPublicationJournal(); vi.spyOn(journal, "compareClear").mockResolvedValue(false);
 const client = { list: vi.fn(), publish: vi.fn().mockResolvedValue(ack), receipt: vi.fn() };
 const commands = createMcpProjectPublicationCommands(client, boundary, journal); await commands.restore(boundary); commands.open(target, boundary); await commands.publish(original, boundary);
 expect(commands.getSnapshot()).toMatchObject({ phase: "unknown", recovery: "error", ack: null }); expect(await journal.read(boundary.subject)).not.toBeNull();
});
it("a restored first-rejection tuple is unknown and cannot mint a replacement command", async () => {
 const journal = createTestPublicationJournal(), client = { list: vi.fn(), publish: vi.fn(), receipt: vi.fn() };
 const record = { subject: boundary.subject, target, original, key: "rejected-key" }; await journal.reserve(record); await journal.markFailure(record, { status: 412, code: "mcp_project_publication_precondition_failed", retryable: false });
 const commands = createMcpProjectPublicationCommands(client, boundary, journal); await commands.restore(boundary); expect(commands.getSnapshot()).toMatchObject({ phase: "unknown", mayRetry: false }); expect(await commands.revise(boundary)).toBe(false);
 await commands.publish({ ...original, expected_source_state_version: "3" }, boundary); expect(client.publish).not.toHaveBeenCalled();
});
it("storage read failure stays closed until explicit successful read, with no registration or publication side effect", async () => {
 const journal = createTestPublicationJournal(); vi.spyOn(journal, "read").mockRejectedValueOnce(Error("blocked"));
 const client = { list: vi.fn(), publish: vi.fn(), receipt: vi.fn() };
 const commands = createMcpProjectPublicationCommands(client, boundary, journal); await commands.restore(boundary); expect(commands.open(target, boundary)).toBe(false); expect(commands.getSnapshot().recovery).toBe("error");
 await commands.restore(boundary); expect(commands.open(target, boundary)).toBe(true); expect(client.publish).not.toHaveBeenCalled(); expect(client.receipt).not.toHaveBeenCalled();
});
it("another tab's receipt uncertainty atomically prevents a stale first-rejection revise", async () => {
 const journal = createTestPublicationJournal();
 const client = { list: vi.fn(), publish: vi.fn().mockRejectedValue(new HubClientError("http", "stale", "mcp_project_publication_precondition_failed", 412)), receipt: vi.fn().mockRejectedValue(new HubClientError("http", "missing", "mcp_project_publication_not_found", 404)) };
 const first = createMcpProjectPublicationCommands(client, boundary, journal); await first.restore(boundary); first.open(target, boundary); await first.publish(original, boundary); expect(first.getSnapshot().phase).toBe("rejected");
 const second = createMcpProjectPublicationCommands(client, boundary, journal); await second.restore(boundary); await second.inspect(boundary);
 expect(await first.revise(boundary)).toBe(false); expect(await journal.read(boundary.subject)).not.toBeNull(); expect(first.getSnapshot().phase).toBe("unknown");
});

it.each(publicationContract["x-kokoro-publication-error-vectors"])("frozen producer recovery $code/$status prior_unknown=$prior_unknown preserves exact command eligibility", async vector => {
 const { client, commands } = await setup();
 if (vector.prior_unknown) {
   client.publish.mockRejectedValueOnce(new HubClientError("http", "unknown", "mcp_personal_command_outcome_unknown", 503, false));
   await commands.publish(original, boundary);
 }
 client.publish.mockRejectedValueOnce(new HubClientError("http", "producer vector", vector.code, vector.status, vector.retryable));
 if (vector.prior_unknown) await commands.retry(boundary); else await commands.publish(original, boundary);
 expect(commands.getSnapshot().phase).toBe(vector.new_command_authorized ? "rejected" : "unknown");
 expect(commands.getSnapshot().mayRetry).toBe(vector.recovery === "same_command");
 expect(await commands.revise(boundary)).toBe(vector.new_command_authorized);
});

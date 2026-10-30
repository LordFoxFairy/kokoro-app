import { StrictMode } from "react"
import { act, cleanup, renderHook, waitFor } from "@testing-library/react"
import { afterEach, expect, it, vi } from "vitest"
import { createSessionEngine } from "@/engine/machine"
import type { ConversationStore } from "@/core/conversations"
import type { SessionSnapshot } from "@/contract/chat"
import { parseSessionSnapshot, parseSharedSessionSnapshot } from "@/contract/chat"
import { useComposerConnections } from "@/ui/shell/use-composer-connections"
import { makeSnapshot } from "../core/fixtures"
import { createFakeClient, createMemoryStorage, settle } from "../engine/fakes"

const boundary = { admitted: true, subject: "actor:a", generation: 1 }
const saved = (ids: string[]): SessionSnapshot => ({ ...makeSnapshot({sessionId: "conv_1"}), composer_selection: {source_message_id:"msg_sent",selected_mcp_connection_ids:ids} })
function catalog() {
  return {
    listMcpConnections: vi.fn().mockResolvedValue({connections:[{connection_id:"conn_a",connector_id:"a",server_id:"sa",provider_key:"p",status:"active",transport:"streamable_http"}], next_cursor: undefined}),
    getMcpConnector: vi.fn().mockResolvedValue({connector_id:"a",server_id:"sa",provider_key:"p",connector_type:"mcp",status:"active",enabled:true,availability:"available",state_version:"1",approved_scopes:[],display_name:"Docs"}),
  }
}
afterEach(cleanup)
it("accepts strict private choices and rejects them on the public share boundary", () => {
  expect(parseSessionSnapshot(saved(["conn_a"])).composer_selection?.selected_mcp_connection_ids).toEqual(["conn_a"])
  expect(() => parseSharedSessionSnapshot(saved(["conn_a"]))).toThrow()
  expect(() => parseSessionSnapshot(saved(["conn_a", "conn_a"]))).toThrow()
})
it("restores sent eligible choices through a StrictMode remount, never merely from history", async () => {
  const api=createFakeClient(); api.nextSnapshot=async()=>saved(["conn_a"])
  const engine=createSessionEngine({client:api,storage:createMemoryStorage<ConversationStore>(null)})
  engine.openConversation("conv_1")
  const client=catalog()
  const hook=renderHook(()=>useComposerConnections({engine,client,boundary,enforceSubjectMarker:false}), {wrapper:StrictMode})
  await waitFor(()=>expect(hook.result.current.selectedIds).toEqual(["conn_a"]))
  expect(api.createCalls).toHaveLength(0)
  act(()=>engine.newConversation())
  expect(hook.result.current.selectedIds).toEqual([])
  hook.unmount();engine.dispose()
})
it.each([false, true])("manual empty choice wins over late %s snapshot/catalog reads", async afterSnapshot => {
  const api=createFakeClient(); let finish!: (value:SessionSnapshot)=>void
  api.nextSnapshot=()=>new Promise(resolve=>{finish=resolve})
  const engine=createSessionEngine({client:api,storage:createMemoryStorage<ConversationStore>(null)})
  engine.openConversation("conv_1")
  const client=catalog(); let finishCatalog!: (value:unknown)=>void
  client.listMcpConnections.mockImplementation(()=>new Promise(resolve=>{finishCatalog=resolve}))
  const hook=renderHook(()=>useComposerConnections({engine,client,boundary,enforceSubjectMarker:false}))
  if(afterSnapshot) await act(async()=>{finish(saved(["conn_a"]));await settle()})
  act(()=>engine.setSelectedMcpConnectionIds([]))
  if(!afterSnapshot) await act(async()=>{finish(saved(["conn_a"]));await settle()})
  await act(async()=>{finishCatalog({connections:[],next_cursor:undefined});await settle()})
  expect(hook.result.current.selectedIds).toEqual([])
  expect(engine.getSnapshot().mcpSelectionRestore).toBeUndefined()
  hook.unmount();engine.dispose()
})
it("waits for all catalog pages and omits revoked or disabled IDs", async () => {
  const api=createFakeClient();api.nextSnapshot=async()=>saved(["gone","conn_a","conn_b"])
  const engine=createSessionEngine({client:api,storage:createMemoryStorage<ConversationStore>(null)})
  engine.openConversation("conv_1");await settle()
  const client=catalog()
  client.listMcpConnections.mockResolvedValueOnce({connections:[{connection_id:"conn_a",connector_id:"a",server_id:"sa",provider_key:"p",status:"active",transport:"streamable_http"}],next_cursor:"more"})
    .mockResolvedValueOnce({connections:[{connection_id:"conn_b",connector_id:"b",server_id:"sb",provider_key:"p",status:"active",transport:"streamable_http"}],next_cursor:undefined})
  client.getMcpConnector.mockResolvedValueOnce({connector_id:"a",server_id:"sa",provider_key:"p",connector_type:"mcp",status:"active",enabled:false,availability:"available",state_version:"1",approved_scopes:[]})
    .mockResolvedValueOnce({connector_id:"b",server_id:"sb",provider_key:"p",connector_type:"mcp",status:"active",enabled:true,availability:"available",state_version:"1",approved_scopes:[]})
  const hook=renderHook(()=>useComposerConnections({engine,client,boundary,enforceSubjectMarker:false}))
  await waitFor(()=>expect(hook.result.current.selectedIds).toEqual(["conn_b"]))
  expect(client.listMcpConnections).toHaveBeenCalledTimes(2)
  hook.unmount();engine.dispose()
})
it("retires an old restoration when a new message freezes its empty selection", async () => {
  const api=createFakeClient(); api.nextSnapshot=async()=>saved(["conn_a"])
  const engine=createSessionEngine({client:api,storage:createMemoryStorage<ConversationStore>(null)})
  engine.openConversation("conv_1"); await settle()
  const candidate=engine.getSnapshot().mcpSelectionRestore!
  expect(candidate).toBeDefined()
  expect(engine.submit("new empty selection")).toBe(true)
  await settle()
  expect(api.createCalls[0]?.body.selected_mcp_connection_ids).toBeUndefined()
  engine.restoreMcpSelection?.(candidate,["conn_a"])
  expect(engine.getSnapshot().selectedMcpConnectionIds).toEqual([])
  expect(engine.getSnapshot().mcpSelectionRestore).toBeUndefined()
  engine.dispose()
})
it("revalidates availability for a second conversation instead of restoring from the first catalog", async () => {
  const api=createFakeClient(); api.nextSnapshot=async id=>{const snapshot=saved(["conn_a"]);return parseSessionSnapshot({...snapshot,session:{...snapshot.session,session_id:id}})}
  const engine=createSessionEngine({client:api,storage:createMemoryStorage<ConversationStore>(null)})
  engine.openConversation("conv_1")
  const client=catalog()
  const hook=renderHook(()=>useComposerConnections({engine,client,boundary,enforceSubjectMarker:false}))
  await waitFor(()=>expect(hook.result.current.selectedIds).toEqual(["conn_a"]))
  const reads=client.listMcpConnections.mock.calls.length
  client.getMcpConnector.mockResolvedValue({connector_id:"a",server_id:"sa",provider_key:"p",connector_type:"mcp",status:"active",enabled:false,availability:"unavailable",state_version:"2",approved_scopes:[]})
  act(()=>engine.openConversation("conv_2"))
  await waitFor(()=>expect(client.listMcpConnections.mock.calls.length).toBeGreaterThan(reads))
  await waitFor(()=>expect(engine.getSnapshot().mcpSelectionRestore).toBeUndefined())
  expect(hook.result.current.selectedIds).toEqual([])
  hook.unmount();engine.dispose()
})
it("restores original Custom API versions only after current profile validation, independently from MCP eligibility", async () => {
  const api = createFakeClient()
  api.nextSnapshot = async () => ({ ...saved(["conn_a"]), composer_selection: { source_message_id: "sent-original", selected_mcp_connection_ids: ["conn_a"], selected_custom_api_profiles: [{ profile_id: "api:valid", expected_state_version: 7 }, { profile_id: "api:changed", expected_state_version: 1 }] } })
  const engine = createSessionEngine({ client: api, storage: createMemoryStorage<ConversationStore>(null) })
  const profile = { name: "My API", created_at: "2026-10-29T00:00:00Z", updated_at: "2026-10-29T00:00:00Z", environment: [] }
  const client = { ...catalog(), listCustomApis: vi.fn().mockResolvedValue({ items: [{ ...profile, profile_id: "api:valid", state_version: "7" }, { ...profile, profile_id: "api:changed", state_version: "2" }], page: { next_cursor: null } }) }
  engine.openConversation("conv_1")
  const hook = renderHook(() => useComposerConnections({ engine, client, boundary, enforceSubjectMarker: false }))
  await waitFor(() => expect(engine.getSnapshot().selectedCustomApiProfiles).toEqual([{ profileId: "api:valid", expectedStateVersion: "7" }]))
  expect(hook.result.current.selectedIds).toEqual(["conn_a"])
  expect(engine.getSnapshot().customApiSelectionRestore).toBeUndefined()
  expect(api.createCalls).toHaveLength(0)
  hook.unmount(); engine.dispose()
})
it("manual API choices beat a late owner snapshot without discarding its independent MCP restoration", async () => {
  const api = createFakeClient(); let finish!: (value: SessionSnapshot) => void
  api.nextSnapshot = () => new Promise(resolve => { finish = resolve })
  const engine = createSessionEngine({ client: api, storage: createMemoryStorage<ConversationStore>(null) })
  engine.openConversation("conv_1")
  engine.setSelectedCustomApiProfiles!([{ profileId: "api:manual", expectedStateVersion: "8" }])
  await act(async () => { finish({ ...saved(["conn_a"]), composer_selection: { source_message_id: "sent", selected_mcp_connection_ids: ["conn_a"], selected_custom_api_profiles: [{ profile_id: "api:old", expected_state_version: 7 }] } }); await settle() })
  expect(engine.getSnapshot().selectedCustomApiProfiles).toEqual([{ profileId: "api:manual", expectedStateVersion: "8" }])
  expect(engine.getSnapshot().customApiSelectionRestore).toBeUndefined()
  expect(engine.getSnapshot().mcpSelectionRestore?.ids).toEqual(["conn_a"])
  engine.dispose()
})

import { expect, it, vi } from "vitest";
import { prepareReceiptFixture } from "../hub/fixtures/mcp-prepare-receipt";
import { act, renderHook, waitFor, render, screen, fireEvent, cleanup, within } from "@testing-library/react";
import { afterEach } from "vitest";
import { StrictMode } from "react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { CustomMcpForm } from "@/ui/mcp/mcp-custom-form";
import { UrlMcpForm } from "@/ui/mcp/mcp-url-form";
import { createMcpServerCreationFlow } from "@/ui/mcp/mcp-server-creation-flow";
import { LocaleProvider } from "@/i18n/context";
import { McpPreparationStatus } from "@/ui/mcp/mcp-preparation-status";
import { useMcpPreparationHistory } from "@/ui/mcp/use-mcp-preparation-history";
import { HubClientError, type HubClient } from "@/hub/client";
import { createMcpPreparationCommands } from "@/ui/mcp/mcp-preparation-commands";
import * as rules from "@/ui/mcp/mcp-preparation-recovery";
import { createTestPreparationJournal } from "./fixtures/mcp-preparation-journal";
const boundary = { subject: "qa-outcome-subject", admitted: true, generation: 1 };
const target = { serverId: "qa-server", connectorId: "qa-connector", version: "7" };
const rejected = () => new HubClientError("http", "QA rejection", "mcp_personal_prepare_rejected", 412, false);
const fenced = () => new HubClientError("http", "QA unknown", "mcp_personal_prepare_execution_fenced", 409, false);
function setup() {
 const journal = createTestPreparationJournal(rules), confirmed = vi.fn();
 const client = { preparePrivateMcpServer: vi.fn<NonNullable<HubClient["preparePrivateMcpServer"]>>(), getMcpPrepareReceipt: vi.fn<NonNullable<HubClient["getMcpPrepareReceipt"]>>(), getPrivateMcpServer: vi.fn(), getMcpConnector: vi.fn() };
 const commands = createMcpPreparationCommands({ client, recovery: journal, boundary, onConfirmed: confirmed, canPrepare: () => true });
 return { journal, client, commands, confirmed };
}
it.each(["POST", "GET"])("typed4 %s archives exact original intent without generic completion", async method => {
 const { commands, journal, client, confirmed } = setup();
 if (method === "GET") await journal.reserve(boundary.subject, target, "qa-original");
 await commands.restore(boundary);
 (method === "POST" ? client.preparePrivateMcpServer : client.getMcpPrepareReceipt).mockRejectedValueOnce(rejected());
 const clear = vi.spyOn(journal, "complete");
 expect(await commands.prepare(target, boundary)).toBe(false);
 expect(await journal.current(boundary.subject, target.serverId)).toBeUndefined();
 expect((await journal.listRetired(boundary.subject, target.serverId)).items[0]?.disposition).toBe("definite_rejected");
 expect(commands.getSnapshot()).toEqual([]); expect(confirmed).not.toHaveBeenCalled(); expect(clear).not.toHaveBeenCalled();
 expect(commands.getCompletion(target.serverId, target.connectorId, boundary)).toBeNull();
});
it("GET5 stays unknown until explicit exact stop; old resume cannot create or execute K2", async () => {
 const { commands, journal, client, confirmed } = setup();
 const { record } = await journal.reserve(boundary.subject, target, "qa-original"); await commands.restore(boundary);
 client.getMcpPrepareReceipt.mockRejectedValueOnce(fenced());
 expect(await commands.resume(target.serverId, target.connectorId, boundary)).toBe(false);
 expect(await journal.current(boundary.subject, target.serverId)).toEqual(record);
 expect((await journal.listRetired(boundary.subject, target.serverId)).items).toEqual([]);
 expect(commands.getView(record, boundary).fenced).toBe(true);
 expect(await commands.stopWaiting(record, boundary)).toMatchObject({ disposition: "unknown_fenced" });
 expect(await journal.current(boundary.subject, target.serverId)).toBeUndefined(); expect(commands.getSnapshot()).toEqual([]);
 expect(await commands.resumeAttempt(record, boundary)).toBe(false); expect(client.preparePrivateMcpServer).not.toHaveBeenCalled(); expect(confirmed).not.toHaveBeenCalled();
});
it("cross-tab retired K1 late error never poisons a K2 or the recovery gate", async () => {
 const { commands, journal, client, confirmed } = setup();
 let fail!: (error: unknown) => void;
 client.preparePrivateMcpServer.mockImplementationOnce(() => new Promise((_, reject) => { fail = reject; }));
 const pending = commands.prepare(target, boundary); await vi.waitFor(() => expect(client.preparePrivateMcpServer).toHaveBeenCalledOnce());
 const record = (await journal.current(boundary.subject, target.serverId))!;
 await journal.retireWaiting(record, { disposition: "unknown_fenced", policy_ref: { artifact_sha256: "a".repeat(64), profile: "qa", version: "1" } });
 const next = await journal.reserve(boundary.subject, { ...target, version: "9" }, "qa-k2");
 fail(new Error("late K1 transport failure")); expect(await pending).toBe(false);
 expect(await journal.current(boundary.subject, target.serverId)).toEqual(next.record);
 expect(commands.recoveryReady()).toBe(true); expect(commands.recoveryFailed()).toBe(false); expect(confirmed).not.toHaveBeenCalled();
});

const ack = () => {
 const value = prepareReceiptFixture().data.completed;
 return { ...value, server: { ...value.server, server_id: target.serverId, state_version: "8" }, connector: { ...value.connector, server_id: target.serverId, connector_id: target.connectorId, provider_key: "qa-provider", state_version: "8" } };
};
afterEach(cleanup);
it("late K1 strict success after durable archive cannot confirm, resurrect locator or clear K2", async () => {
 const { commands, journal, client, confirmed } = setup(); let resolve!: (value: ReturnType<typeof ack>) => void;
 client.preparePrivateMcpServer.mockImplementationOnce(() => new Promise(accept => { resolve = accept; }));
 const pending = commands.prepare(target, boundary); await vi.waitFor(() => expect(client.preparePrivateMcpServer).toHaveBeenCalledOnce());
 const record = (await journal.current(boundary.subject, target.serverId))!;
 await journal.retireWaiting(record, { disposition: "unknown_fenced", policy_ref: { artifact_sha256: "a".repeat(64), profile: "qa", version: "1" } });
 const next = await journal.reserve(boundary.subject, { ...target, version: "9" }, "qa-k2");
 resolve(ack()); expect(await pending).toBe(false); expect(confirmed).not.toHaveBeenCalled();
 expect(commands.getCompletion(target.serverId, target.connectorId, boundary)).toBeNull();
 expect(await journal.current(boundary.subject, target.serverId)).toEqual(next.record);
 expect(commands.recoveryFailed()).toBe(false);
});
it.each(["archive_failure", "abort"])("%s never retires or confirms an unknown fenced attempt", async failure => {
 const { commands, journal, client, confirmed } = setup(); const { record } = await journal.reserve(boundary.subject, target, "qa-original"); await commands.restore(boundary);
 client.getMcpPrepareReceipt.mockRejectedValueOnce(fenced()); await commands.resumeAttempt(record, boundary);
 const controller = new AbortController();
 if (failure === "abort") controller.abort(); else vi.spyOn(journal, "retireWaiting").mockRejectedValueOnce(new Error("transaction failed"));
 expect(await commands.stopWaiting(record, boundary, controller.signal)).toBeNull();
 expect(await journal.current(boundary.subject, target.serverId)).toEqual(record); expect(commands.getSnapshot()[0]?.kind).toBe("unknown"); expect(confirmed).not.toHaveBeenCalled();
});
it("historical completed GET uses original tuple and never adopts or clears active K2", async () => {
 const { commands, journal, client, confirmed } = setup(); const { record } = await journal.reserve(boundary.subject, target, "qa-original");
 const retired = await journal.retireWaiting(record, { disposition: "unknown_fenced", policy_ref: { artifact_sha256: "a".repeat(64), profile: "qa", version: "1" } });
 const next = await journal.reserve(boundary.subject, { ...target, version: "9" }, "qa-k2"); await commands.restore(boundary);
 client.getMcpPrepareReceipt.mockResolvedValueOnce(ack()); const clear = vi.spyOn(journal, "complete"), read = vi.spyOn(journal, "getRetired");
 expect(await commands.inspectRetired(retired, boundary)).toBe("completed");
 expect(read).toHaveBeenCalledWith({ subject: record.subject, target: record.target, key: record.key });
 expect(client.getMcpPrepareReceipt.mock.calls[0]?.slice(0,3)).toEqual([target.serverId,"7","qa-original"]);
 expect(await journal.current(boundary.subject, target.serverId)).toEqual(next.record); expect(await journal.getRetired(record)).toEqual(retired);
 expect(clear).not.toHaveBeenCalled(); expect(confirmed).not.toHaveBeenCalled(); expect(commands.getCompletion(target.serverId,target.connectorId,boundary)).toBeNull();
});
it.each(["provider", "read_failure", "management", "existing_k2"])("new explicit connect rejects %s without adopting or executing an old attempt", async risk => {
 let mayWrite = true;
 const journal = createTestPreparationJournal(rules), confirmed = vi.fn();
 const client = { preparePrivateMcpServer: vi.fn(), getMcpPrepareReceipt: vi.fn(), getPrivateMcpServer: vi.fn().mockResolvedValue({ ...ack().server, prepare_status: "prepare_failed", state_version: "9" }), getMcpConnector: vi.fn().mockResolvedValue(ack().connector) };
 const commands = createMcpPreparationCommands({ client, recovery: journal, boundary, onConfirmed: confirmed, canPrepare: () => mayWrite }); await commands.restore(boundary);
 if (risk === "provider") client.getMcpConnector.mockResolvedValueOnce({ ...ack().connector, provider_key: "foreign" });
 if (risk === "read_failure") client.getPrivateMcpServer.mockRejectedValueOnce(new Error("fresh read failed"));
 if (risk === "management") mayWrite = false;
 if (risk === "existing_k2") await journal.reserve(boundary.subject, { ...target, version: "9" }, "qa-k2");
 await commands.connectFresh(target.serverId, target.connectorId,"qa-provider",boundary).catch(() => false);
 expect(client.preparePrivateMcpServer).not.toHaveBeenCalled(); expect(client.getMcpPrepareReceipt).not.toHaveBeenCalled(); expect(confirmed).not.toHaveBeenCalled();
 if (risk === "existing_k2") expect((await journal.current(boundary.subject,target.serverId))?.key).toBe("qa-k2");
});
it("history row late GET is discarded after a window change and never confirms", async () => {
 const { commands, journal, client, confirmed } = setup(); const { record } = await journal.reserve(boundary.subject,target,"qa-original");
 const retired = await journal.retireWaiting(record,{ disposition:"unknown_fenced",policy_ref:{artifact_sha256:"a".repeat(64),profile:"qa",version:"1"} });
 let resolve!: (value: ReturnType<typeof ack>) => void; client.getMcpPrepareReceipt.mockImplementationOnce(() => new Promise(accept => { resolve=accept; }));
 const window1 = {}, window2 = {};
 const view = renderHook(({ window }) => useMcpPreparationHistory(commands,boundary,target.serverId,window),{ initialProps:{window:window1} });
 await waitFor(() => expect(view.result.current.items).toHaveLength(1));
 let pending!: Promise<void>; act(() => { pending=view.result.current.inspect(retired); });
 await waitFor(() => expect(client.getMcpPrepareReceipt).toHaveBeenCalledOnce()); view.rerender({window:window2});
 await act(async () => { resolve(ack()); await pending; }); expect(view.result.current.results).toEqual({}); expect(confirmed).not.toHaveBeenCalled();
});
it("compact presentation exposes explicit check/stop/reconnect and immutable dated history, not a success action", () => {
 localStorage.setItem("kokoro.locale","zh"); const check=vi.fn(), stop=vi.fn(), reconnect=vi.fn();
 const attempt={subject:boundary.subject,target,key:"qa-original"};
 const view=render(<LocaleProvider><McpPreparationStatus view={{attempt,kind:"unknown",fenced:true,retired:null}} onCheck={check} onStop={stop} /></LocaleProvider>);
 fireEvent.click(screen.getByRole("button",{name:"查看连接结果"})); fireEvent.click(screen.getByRole("button",{name:"结束等待"})); expect(check).toHaveBeenCalledOnce();expect(stop).toHaveBeenCalledOnce();
 view.rerender(<LocaleProvider><McpPreparationStatus view={{attempt,kind:null,fenced:false,retired:{...attempt,schema_version:2,disposition:"unknown_fenced",policy_ref:{artifact_sha256:"a".repeat(64),profile:"qa",version:"1"},retired_at:"2026-10-27T00:00:00.000Z"}}} onReconnect={reconnect}/></LocaleProvider>);
 fireEvent.click(screen.getByRole("button",{name:"重新连接"}));expect(reconnect).toHaveBeenCalledOnce();expect(screen.queryByRole("button",{name:"完成"})).toBeNull();expect(screen.queryByRole("button",{name:"结束等待"})).toBeNull();
});


it.each(["form4","url4","form5","url5"])("%s actual creation result retires without Done and preserves saved resource and readonly history", async scenario => {
 localStorage.setItem("kokoro.locale","zh");const f=setup(), done=vi.fn(), cancelled=vi.fn();
 const pendingServer={...ack().server,prepare_status:"pending_prepare" as const,state_version:"7"}, pendingConnector={...ack().connector,status:"pending" as const,enabled:false};
 const client={...f.client,beginMcpConnectorAuthorization:vi.fn(),registerPrivateMcpServer:vi.fn().mockResolvedValue({server:pendingServer,connector:pendingConnector,replayed:false})};
 client.getPrivateMcpServer.mockResolvedValue(pendingServer);client.getMcpConnector.mockResolvedValue(pendingConnector);client.preparePrivateMcpServer.mockRejectedValueOnce(new Error("lost POST"));
 const flow=createMcpServerCreationFlow({client,preparation:f.commands,boundary,onChanged:vi.fn()}),release=flow.retain(boundary),scope={boundary,window:{}};
 flow.attach(scope.window);await flow.submit({display_name:"QA original resource",server_url:"https://qa.example.test/mcp"},scope,"connect");
 client.getMcpPrepareReceipt.mockRejectedValueOnce(scenario.endsWith("4")?rejected():fenced());
 const props={flow,boundary,onDone:done,onCancel:cancelled};
 const view=render(<LocaleProvider><Dialog open><DialogContent>{scenario.startsWith("form")?<CustomMcpForm {...props}/>:<UrlMcpForm {...props}/>}</DialogContent></Dialog></LocaleProvider>);
 try {
  fireEvent.click(await screen.findByRole("button",{name:"查看连接结果"}));
  if(scenario.endsWith("5")){
   const stop=await screen.findByRole("button",{name:"结束等待"});expect((await f.journal.listRetired(boundary.subject,target.serverId)).items).toEqual([]);fireEvent.click(stop);
  }
  await screen.findByRole("button",{name:"重新连接"});expect(done).not.toHaveBeenCalled();expect(f.confirmed).not.toHaveBeenCalled();expect(flow.getSnapshot().registered).toBe(true);expect(flow.getSnapshot().unknown).toBeNull();
  expect(screen.queryByRole("button",{name:"完成"})).toBeNull();expect(client.preparePrivateMcpServer).toHaveBeenCalledOnce();
  const history=await screen.findByRole("button",{name:"已结束的连接尝试"});fireEvent.click(history);expect(screen.getByText(/记录时间/u)).toBeVisible();
  const checks=screen.getAllByRole("button",{name:"查看连接结果"});expect(checks).toHaveLength(1);expect(within(screen.getByRole("dialog")).queryByText(/qa-original/u)).toBeNull();
 } finally {view.unmount();release();}
});
it("history remains readable after React StrictMode effect replay", async()=>{
 const f=setup();const{record}=await f.journal.reserve(boundary.subject,target,"qa-original");await f.journal.retireWaiting(record,{disposition:"definite_rejected",policy_ref:{artifact_sha256:"a".repeat(64),profile:"qa",version:"1"}});
 const window={};const hook=renderHook(()=>useMcpPreparationHistory(f.commands,boundary,target.serverId,window),{wrapper:({children})=><StrictMode>{children}</StrictMode>});
 await waitFor(()=>expect(hook.result.current.items).toHaveLength(1));hook.unmount();
});

it("fresh ready Current replaces a stale disconnected affordance with zero reserve/POST or ACK success", async () => {
 const f=setup(); await f.commands.restore(boundary);
 f.client.getPrivateMcpServer.mockResolvedValue(ack().server);f.client.getMcpConnector.mockResolvedValue(ack().connector);
 f.client.preparePrivateMcpServer.mockResolvedValue(ack());const reserve=vi.spyOn(f.journal,"reserve");
 const result=await f.commands.connectFresh(target.serverId,target.connectorId,"qa-provider",boundary);
 expect(f.client.preparePrivateMcpServer).not.toHaveBeenCalled();expect(reserve).not.toHaveBeenCalled();expect(f.confirmed).not.toHaveBeenCalled();
 expect(result).toMatchObject({confirmed:false,current:{server:{prepare_status:"ready"},connector:{status:"active",enabled:true}}});
 expect(f.commands.getCompletion(target.serverId,target.connectorId,boundary)).toBeNull();expect(f.commands.getSnapshot()).toEqual([]);
});


it.each(["form","url"])("%s retains explicit initial400 rejection feedback and a distinct corrected retry",async mode=>{
 localStorage.setItem("kokoro.locale","zh");const f=setup(),done=vi.fn();
 const pendingServer={...ack().server,prepare_status:"pending_prepare" as const,state_version:"7"},pendingConnector={...ack().connector,status:"pending" as const,enabled:false};
 const client={...f.client,beginMcpConnectorAuthorization:vi.fn(),registerPrivateMcpServer:vi.fn().mockResolvedValue({server:pendingServer,connector:pendingConnector,replayed:false})};
 client.getPrivateMcpServer.mockResolvedValue(pendingServer);client.getMcpConnector.mockResolvedValue(pendingConnector);
 client.preparePrivateMcpServer.mockRejectedValueOnce(new HubClientError("http","QA definite invalid input","invalid_mcp_personal_request",400,false));
 const flow=createMcpServerCreationFlow({client,preparation:f.commands,boundary,onChanged:vi.fn()}),release=flow.retain(boundary),scope={boundary,window:{}};
 flow.attach(scope.window);await flow.submit({display_name:"QA original resource",server_url:"https://qa.example.test/mcp"},scope,"connect");
 const props={flow,boundary,onDone:done,onCancel:vi.fn()};const view=render(<LocaleProvider><Dialog open><DialogContent>{mode==="form"?<CustomMcpForm {...props}/>:<UrlMcpForm {...props}/>}</DialogContent></Dialog></LocaleProvider>);
 try{
  expect(await screen.findByRole("alert")).toBeVisible();const retry=await screen.findByRole("button",{name:mode==="url"?"保存":"重试"});expect(retry).toBeEnabled();
  expect((await f.journal.listRetired(boundary.subject,target.serverId)).items).toEqual([]);client.preparePrivateMcpServer.mockResolvedValueOnce(ack());
  fireEvent.click(retry);await waitFor(()=>expect(client.preparePrivateMcpServer).toHaveBeenCalledTimes(2));
  expect(client.preparePrivateMcpServer.mock.calls[0]?.[2]).not.toBe(client.preparePrivateMcpServer.mock.calls[1]?.[2]);
  await waitFor(()=>expect(done).toHaveBeenCalledOnce());
 }finally{view.unmount();release();}
});

it("detail fresh connect after an initial definite400 may create a distinct key, never an unknown-key replay",async()=>{
 const f=setup();f.client.preparePrivateMcpServer.mockRejectedValueOnce(new HubClientError("http","QA definite rejection","invalid_mcp_personal_request",400,false));
 expect(await f.commands.prepare(target,boundary)).toBe(false);expect(f.commands.getSnapshot()[0]?.kind).toBe("rejected");
 f.client.getPrivateMcpServer.mockResolvedValue({...ack().server,prepare_status:"pending_prepare",state_version:"7"});f.client.getMcpConnector.mockResolvedValue(ack().connector);f.client.preparePrivateMcpServer.mockResolvedValueOnce(ack());
 const result=await f.commands.connectFresh(target.serverId,target.connectorId,"qa-provider",boundary);
 expect(f.client.preparePrivateMcpServer).toHaveBeenCalledTimes(2);expect(result.confirmed).toBe(true);
 expect(f.client.preparePrivateMcpServer.mock.calls[0]?.[2]).not.toBe(f.client.preparePrivateMcpServer.mock.calls[1]?.[2]);
 expect((await f.journal.listRetired(boundary.subject,target.serverId)).items).toEqual([]);
});

it("a captured detail K1 handler cannot inspect, finish or navigate a newer K2 under the same resource",async()=>{
 const detail=await import("@/ui/mcp/custom-mcp-detail-dialog"),{McpContent}=await import("@/ui/mcp/mcp-content"),{ConnectorCommandProvider,useMcpPreparationCommands}=await import("@/ui/mcp/connector-command-context");
 const {createHubClient}=await import("@/hub/client");const Actual=detail.CustomMcpDetailDialog;const handlers:Array<()=>void>=[];
 const journal=createTestPreparationJournal(rules),factory=vi.spyOn(rules,"createBrowserMcpPreparationRecovery").mockReturnValue(journal);
 const presenter=vi.spyOn(detail,"CustomMcpDetailDialog").mockImplementation(props=>{handlers.push(props.onPrepare);return <Actual {...props}/>;});
 const pendingServer={...ack().server,prepare_status:"pending_prepare" as const,state_version:"7"},pendingConnector={...ack().connector,display_name:pendingServer.display_name,status:"pending" as const,enabled:false};
 const lookup=vi.fn<NonNullable<HubClient["getMcpPrepareReceipt"]>>().mockResolvedValue(ack()),post=vi.fn().mockRejectedValue(new Error("QA lost ACK"));
 const client={...createHubClient(),getMcpPrepareReceipt:lookup,preparePrivateMcpServer:post,getPrivateMcpServer:vi.fn().mockResolvedValue(pendingServer),getMcpConnector:vi.fn().mockResolvedValue(pendingConnector),listMcpConnectors:vi.fn().mockResolvedValue({items:[pendingConnector],next_cursor:null}),listMcpConnectorProviders:vi.fn().mockResolvedValue({items:[],next_cursor:null}),listCustomApis:vi.fn().mockResolvedValue({items:[],page:{next_cursor:null}})};
 let commands!:ReturnType<typeof createMcpPreparationCommands>;
 function Probe(){commands=useMcpPreparationCommands(client,boundary.subject);return null;}
 localStorage.setItem("kokoro.locale","zh");const view=render(<LocaleProvider><ConnectorCommandProvider client={client} boundary={boundary}><Probe/><McpContent client={client} initialView="connections" readBoundary={boundary}/></ConnectorCommandProvider></LocaleProvider>);
 try{
  await waitFor(()=>expect(commands.recoveryReady()).toBe(true));await act(async()=>{await commands.prepare(target,boundary);});
  const original=commands.getAttempt(target.serverId,target.connectorId,boundary)!;
  fireEvent.click(await screen.findByRole("button",{name:pendingServer.display_name}));await screen.findByRole("dialog",{name:pendingServer.display_name});await screen.findByRole("button",{name:"查看连接结果"});const oldHandler=handlers.at(-1)!;
  await act(async()=>{await commands.resumeAttempt(original,boundary);commands.finish(target.serverId,boundary,original);await commands.prepare({...target,version:"9"},boundary);});
  const next=commands.getAttempt(target.serverId,target.connectorId,boundary)!,before=lookup.mock.calls.length;
  expect(next.key).not.toBe(original.key);await act(async()=>{oldHandler();await Promise.resolve();});
  expect(lookup).toHaveBeenCalledTimes(before);expect(post).toHaveBeenCalledTimes(2);expect((await journal.current(boundary.subject,target.serverId))?.key).toBe(next.key);expect(commands.getSnapshot()[0]?.kind).toBe("unknown");
 }finally{view.unmount();presenter.mockRestore();factory.mockRestore();}
});

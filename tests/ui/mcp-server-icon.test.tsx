import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { McpConnectionList } from "@/ui/mcp/mcp-connection-list";
import { LocaleProvider } from "@/i18n/context";
import type { McpConnector } from "@/hub/mcp-connector.schema";


// Browser IndexedDB mechanics have their own suite; retain actual command admission here.
vi.mock("@/ui/mcp/mcp-preparation-recovery", async importOriginal => {
  const actual = await importOriginal<typeof import("@/ui/mcp/mcp-preparation-recovery")>();
  const { createTestPreparationJournal } = await import("./fixtures/mcp-preparation-journal");
  return { ...actual, createBrowserMcpPreparationRecovery: () => createTestPreparationJournal(actual) };
});

const connector: McpConnector = { connector_id: "saved-connector", server_id: "saved-server", provider_key: "private-mcp", connector_type: "mcp", display_name: "Saved MCP", status: "active", enabled: true, availability: "available", approved_scopes: [], state_version: "1" };
const noop = () => undefined;
const fetchMedia = vi.fn();
const createUrl = vi.fn(), revokeUrl = vi.fn();
function response(headers: Record<string, string> = {}, bytes = new Uint8Array([1, 2, 3])) {
  return new Response(bytes, { headers: { "content-type": "image/png", "content-length": String(bytes.length), ...headers } });
}
function list(value: McpConnector, revision = 0) {
  return <LocaleProvider><McpConnectionList connectors={[value]} serverMediaRevisions={new Map(value.server_id ? [[value.server_id, revision]] : [])} customApis={[]} providers={[]} query="" brandName="Kokoro" onBrowse={noop} onEdit={noop} onSelectCustomApi={noop} previousEnabled={false} nextEnabled={false} onPrevious={noop} onNext={noop} /></LocaleProvider>;
}
function image(container: HTMLElement) { return container.querySelector("img"); }
async function loadedImage(container: HTMLElement) { await waitFor(() => expect(image(container)).not.toBeNull()); return image(container)!; }
beforeEach(() => {
  let sequence = 0;
  fetchMedia.mockReset().mockImplementation(async () => response());
  createUrl.mockReset().mockImplementation(() => `blob:private-media-${++sequence}`); revokeUrl.mockReset();
  const NativeUrl = URL;
  vi.stubGlobal("URL", class extends NativeUrl { static override createObjectURL = createUrl; static override revokeObjectURL = revokeUrl; });
  vi.stubGlobal("fetch", fetchMedia);
});
afterEach(() => { cleanup(); window.sessionStorage.clear(); vi.useRealTimers(); vi.unstubAllGlobals(); });

it("fetches only fixed same-origin media without caches/redirects, retaining the initial until decoded load succeeds", async () => {
  const view = render(list(connector));
  expect(screen.getByText("S", { exact: true })).toBeVisible();
  const img = await loadedImage(view.container);
  expect(fetchMedia).toHaveBeenCalledExactlyOnceWith("/api/hub/mcp/servers/saved-server/icon", expect.objectContaining({ cache: "no-store", credentials: "same-origin", redirect: "error", signal: expect.any(AbortSignal) }));
  expect(img).toHaveAttribute("src", "blob:private-media-1");
  expect(img).toHaveAttribute("loading", "lazy"); expect(img).toHaveAttribute("decoding", "async"); expect(img).toHaveAttribute("referrerpolicy", "no-referrer");
  expect(img).toHaveStyle({ opacity: "0" });
  fireEvent.load(img);
  expect(screen.queryByText("S", { exact: true })).not.toBeInTheDocument(); expect(img).toHaveStyle({ opacity: "1" });
  view.unmount(); expect(revokeUrl).toHaveBeenCalledWith("blob:private-media-1");
});
it("keeps failure on the initial without retry; fresh saved/replaced/cleared revisions retire URLs and reload", async () => {
  fetchMedia.mockResolvedValueOnce(new Response(null, { status: 404 }));
  const view = render(list(connector));
  await waitFor(() => expect(fetchMedia).toHaveBeenCalledOnce());
  expect(image(view.container)).toBeNull(); expect(screen.getByText("S", { exact: true })).toBeVisible();
  view.rerender(list({ ...connector })); expect(fetchMedia).toHaveBeenCalledOnce();
  view.rerender(list({ ...connector, state_version: "2" }, 1));
  const first = await loadedImage(view.container); fireEvent.load(first);
  view.rerender(list({ ...connector, state_version: "3" }, 2));
  const next = await loadedImage(view.container);
  expect(next).not.toBe(first); expect(next.getAttribute("src")).not.toBe(first.getAttribute("src"));
  expect(revokeUrl).toHaveBeenCalledWith(first.getAttribute("src"));
  fireEvent.load(first); expect(screen.getByText("S", { exact: true })).toBeVisible();
  fireEvent.load(next);
  fetchMedia.mockResolvedValueOnce(new Response(null, { status: 404 }));
  view.rerender(list({ ...connector, state_version: "4" }, 3));
  await waitFor(() => expect(fetchMedia).toHaveBeenCalledTimes(4));
  expect(image(view.container)).toBeNull(); expect(screen.getByText("S", { exact: true })).toBeVisible();
  expect(screen.getByText("Saved MCP")).toBeVisible();
});
it("does not read without a server ID and retires a removed/revoked server's URL", async () => {
  const view = render(list(connector));
  const img = await loadedImage(view.container); fireEvent.load(img);
  const { server_id: omitted, ...withoutServer } = connector; void omitted;
  view.rerender(list(withoutServer));
  expect(image(view.container)).toBeNull(); expect(revokeUrl).toHaveBeenCalledWith(img.getAttribute("src"));
  expect(fetchMedia).toHaveBeenCalledOnce(); expect(screen.getByText("S", { exact: true })).toBeVisible();
  view.rerender(list({ ...connector, server_id: "different-server" }));
  await loadedImage(view.container);
  expect(fetchMedia).toHaveBeenLastCalledWith("/api/hub/mcp/servers/different-server/icon", expect.any(Object));
  view.rerender(list({ ...connector, status: "revoked" }));
  expect(image(view.container)).toBeNull(); expect(revokeUrl).toHaveBeenCalledTimes(2);
});
it("same-server/same-Connector-CAS confirmed-write revision fetches new bytes without moving card focus", async () => {
  const view = render(list(connector));
  const original = await loadedImage(view.container); fireEvent.load(original);
  const card = screen.getByRole("button", { name: "Saved MCP" }); card.focus();
  view.rerender(list(connector, 1));
  const next = await loadedImage(view.container);
  expect(next).not.toBe(original); expect(next.getAttribute("src")).not.toBe(original.getAttribute("src"));
  expect(fetchMedia).toHaveBeenCalledTimes(2); expect(card).toHaveFocus(); expect(screen.getByText("S", { exact: true })).toBeVisible();
});
it.each([{ "content-type": "image/webp" }, { "content-length": "0" }, { "content-length": "1048577" }, { "content-length": "4" }])("keeps the fallback for invalid media MIME/size/EOF %j", async headers => {
  fetchMedia.mockResolvedValue(response(headers));
  const view = render(list(connector));
  await act(async () => undefined);
  expect(image(view.container)).toBeNull(); expect(createUrl).not.toHaveBeenCalled(); expect(screen.getByText("S", { exact: true })).toBeVisible();
});
it("bounds a stalled media fetch to ten seconds without a retry or new URL", async () => {
  vi.useFakeTimers(); fetchMedia.mockImplementation(() => new Promise(() => undefined));
  const view = render(list(connector));
  await act(async () => { await vi.advanceTimersByTimeAsync(10_000); });
  expect(fetchMedia).toHaveBeenCalledOnce(); expect(fetchMedia.mock.calls[0]![1].signal.aborted).toBe(true);
  expect(createUrl).not.toHaveBeenCalled(); expect(image(view.container)).toBeNull(); expect(screen.getByText("S", { exact: true })).toBeVisible();
});
it("aborts retired requests and ignores a late successful response without making an object URL", async () => {
  let resolve!: (value: Response) => void;
  fetchMedia.mockImplementationOnce(() => new Promise(done => { resolve = done; }));
  const view = render(list(connector)); const signal = fetchMedia.mock.calls[0]![1].signal;
  view.unmount(); expect(signal.aborted).toBe(true);
  await act(async () => resolve(response())); expect(createUrl).not.toHaveBeenCalled();
});
it("defers the independent fetch until its fixed icon frame intersects the viewport", async () => {
  let observe!: IntersectionObserverCallback; const disconnect = vi.fn();
  vi.stubGlobal("IntersectionObserver", class { constructor(callback: IntersectionObserverCallback) { observe = callback; } observe() {} disconnect = disconnect; });
  const view = render(list(connector)); expect(fetchMedia).not.toHaveBeenCalled();
  act(() => observe([{ isIntersecting: false }] as IntersectionObserverEntry[], {} as IntersectionObserver)); expect(fetchMedia).not.toHaveBeenCalled();
  act(() => observe([{ isIntersecting: true }] as IntersectionObserverEntry[], {} as IntersectionObserver));
  await loadedImage(view.container); expect(fetchMedia).toHaveBeenCalledOnce(); expect(disconnect).toHaveBeenCalled();
});
it("the admitted coordinator retires confirmed-clear media despite failed list refresh, then retires subject/generation", async () => {
  const { createHubClient } = await import("@/hub/client");
  const { ConnectorCommandProvider } = await import("@/ui/mcp/connector-command-context");
  const { McpProjectionRead } = await import("@/ui/mcp/mcp-projection-read");
  const { invalidateMcpConnectorProjection } = await import("@/ui/mcp/use-mcp-projection");
  const reads = vi.fn().mockResolvedValue({ items: [connector], next_cursor: null });
  const client = { ...createHubClient(), listMcpConnectors: reads,
    listMcpConnectorProviders: vi.fn().mockResolvedValue({ items: [], next_cursor: null }),
    listCustomApis: vi.fn().mockResolvedValue({ items: [], page: { next_cursor: null } }) };
  const coordinator = (subject = "media-subject-a", generation = 0, admitted = true) => <LocaleProvider><ConnectorCommandProvider client={client} boundary={{ subject, generation, admitted }}><McpProjectionRead client={client} identity={subject} readGeneration={generation} admitted={admitted} initialView="connections" /></ConnectorCommandProvider></LocaleProvider>;
  const view = render(coordinator());
  const first = await loadedImage(view.container); fireEvent.load(first);
  let reject!: (reason: Error) => void;
  reads.mockImplementationOnce(() => new Promise((_done, fail) => { reject = fail; }));
  fetchMedia.mockResolvedValueOnce(new Response(null, { status: 404 }));
  act(() => invalidateMcpConnectorProjection(client, "media-subject-a", connector.server_id));
  await waitFor(() => expect(reads).toHaveBeenCalledTimes(2));
  expect(image(view.container)).toBeNull(); expect(revokeUrl).toHaveBeenCalledWith(first.getAttribute("src"));
  await act(async () => reject(new Error("list refresh failed")));
  expect(image(view.container)).toBeNull(); expect(screen.getByText("S", { exact: true })).toBeVisible();
  view.rerender(coordinator("media-subject-a", 1));
  let original = await loadedImage(view.container); fireEvent.load(original);
  view.rerender(coordinator("media-subject-b", 1)); expect(view.container.contains(original)).toBe(false);
  original = await loadedImage(view.container); fireEvent.load(original);
  view.rerender(coordinator("media-subject-b", 1, false)); expect(image(view.container)).toBeNull();
  expect(revokeUrl).toHaveBeenCalledWith(original.getAttribute("src"));
});

it("keeps complete binary EOF inside the same ten-second budget, cancelling a stalled partial image", async () => {
  vi.useFakeTimers(); const cancel = vi.fn();
  fetchMedia.mockResolvedValue(new Response(new ReadableStream({ start(controller) { controller.enqueue(new Uint8Array([1])); }, cancel }), { headers: { "content-type": "image/png", "content-length": "3" } }));
  const view = render(list(connector));
  await act(async () => { await vi.advanceTimersByTimeAsync(10_000); });
  expect(cancel).toHaveBeenCalled(); expect(createUrl).not.toHaveBeenCalled(); expect(image(view.container)).toBeNull();
  expect(screen.getByText("S", { exact: true })).toBeVisible(); expect(fetchMedia).toHaveBeenCalledOnce();
});
it("accepts exactly 1 MiB JPEG bytes without introducing another URL or metadata source", async () => {
  fetchMedia.mockResolvedValue(response({ "content-type": "image/jpeg" }, new Uint8Array(1_048_576)));
  const view = render(list(connector)); await loadedImage(view.container);
  const blob = createUrl.mock.calls[0]![0] as Blob;
  expect(blob.size).toBe(1_048_576); expect(blob.type).toBe("image/jpeg"); expect(fetchMedia).toHaveBeenCalledOnce();
});

// Real shell command provider -> coordinator -> list; one server has bytes, one has no binding.
async function mediaEditJourney(initialView: "connections" | "catalog" = "connections") {
  const { createHubClient } = await import("@/hub/client");
  const { ConnectorCommandProvider, useMcpManagementCommands } = await import("@/ui/mcp/connector-command-context");
  const { McpProjectionRead } = await import("@/ui/mcp/mcp-projection-read");
  const other = { ...connector, connector_id: "absent-connector", server_id: "absent-server", display_name: "Absent MCP" };
  fetchMedia.mockImplementation(async (path: string) => path.includes("absent-server") ? new Response(null, { status: 404 }) : response());
  const reads = vi.fn().mockResolvedValue({ items: [{ ...connector, state_version: "2" }, other], next_cursor: null })
    .mockResolvedValueOnce({ items: [connector, other], next_cursor: null });
  const client = { ...createHubClient(), listMcpConnectors: reads,
    listMcpConnectorProviders: vi.fn().mockResolvedValue({ items: [], next_cursor: null }),
    listCustomApis: vi.fn().mockResolvedValue({ items: [], page: { next_cursor: null } }),
    getMcpConnector: vi.fn().mockResolvedValue(connector),
    getPrivateMcpServer: vi.fn().mockResolvedValue({ server_id: connector.server_id, display_name: connector.display_name,
      server_url: "https://mcp.example.test/mcp", status: "registered", availability: "unavailable", state_version: "1",
      headers: [], transport: "streamable_http", prepare_status: "pending_prepare", declarations: [], declarations_available: false }),
    updatePrivateMcpServer: vi.fn().mockResolvedValue({ connector, server: { server_id: connector.server_id }, replayed: false }),
  };
  const subject = "media-edit-actor", boundary = { subject, admitted: true, generation: 0 };
  let management!: ReturnType<typeof useMcpManagementCommands>;
  function Commands() { management = useMcpManagementCommands(client, subject); return null; }
  const view = render(<LocaleProvider><ConnectorCommandProvider client={client} boundary={boundary}><Commands /><McpProjectionRead client={client} identity={subject} readGeneration={0} initialView={initialView} embedded={initialView === "catalog"} /></ConnectorCommandProvider></LocaleProvider>);
  const original = await loadedImage(view.container); fireEvent.load(original);
  await waitFor(() => expect(fetchMedia).toHaveBeenCalledTimes(2));
  return { ...view, original, reads, client, management, boundary };
}

it.each(["name", "notes"] as const)("a confirmed ordinary server %s edit keeps unrelated loaded and absent media without another icon GET", async field => {
  const journey = await mediaEditJourney();
  await act(async () => {
    expect(await journey.management.submit({ operation: "update_server", connectorId: connector.connector_id, serverId: connector.server_id!, input: { expected_state_version: "1", ...(field === "name" ? { display_name: "Changed" } : { notes: "Changed note" }) } }, journey.boundary)).toBe(true);
  });
  expect(journey.client.updatePrivateMcpServer).toHaveBeenCalledOnce();
  await waitFor(() => expect(journey.reads).toHaveBeenCalledTimes(2));
  expect(fetchMedia).toHaveBeenCalledTimes(2);
  expect(image(journey.container)).toBe(journey.original);
  expect(screen.getByText("A", { exact: true })).toBeVisible();
});

it.each(["replace", "clear"] as const)("a confirmed icon %s reloads only the exact server, retaining the other server fallback and card focus", async operation => {
  const journey = await mediaEditJourney();
  const card = screen.getByRole("button", { name: "Saved MCP" }); card.focus();
  fetchMedia.mockResolvedValueOnce(operation === "clear" ? new Response(null, { status: 404 }) : response());
  await act(async () => {
    expect(await journey.management.submit({ operation: "update_server", connectorId: connector.connector_id, serverId: connector.server_id!, input: { expected_state_version: "1", ...(operation === "clear" ? { clear_icon: true as const } : { icon: { intent_id: "11111111-1111-4111-8111-111111111111", expected_state_version: "1" } }) } }, journey.boundary)).toBe(true);
  });
  await waitFor(() => expect(journey.reads).toHaveBeenCalledTimes(2));
  expect(fetchMedia).toHaveBeenCalledTimes(3);
  expect(fetchMedia).toHaveBeenLastCalledWith("/api/hub/mcp/servers/saved-server/icon", expect.any(Object));
  expect(revokeUrl).toHaveBeenCalledWith(journey.original.getAttribute("src"));
  expect(journey.container.contains(journey.original)).toBe(false);
  expect(screen.getByText("A", { exact: true })).toBeVisible(); expect(card).toHaveFocus();
  if (operation === "clear") expect(image(journey.container)).toBeNull();
  else expect(await loadedImage(journey.container)).not.toBe(journey.original);
});


it.each(["name", "notes"] as const)("the personal plaza retains both loaded and absent media across a confirmed ordinary %s edit", async field => {
  const journey = await mediaEditJourney("catalog");
  await act(async () => {
    expect(await journey.management.submit({ operation: "update_server", connectorId: connector.connector_id, serverId: connector.server_id!, input: { expected_state_version: "1", ...(field === "name" ? { display_name: "Changed" } : { notes: "Changed note" }) } }, journey.boundary)).toBe(true);
  });
  await waitFor(() => expect(journey.reads).toHaveBeenCalledTimes(2));
  expect(fetchMedia).toHaveBeenCalledTimes(2);
  expect(image(journey.container)).toBe(journey.original);
  expect(screen.getByText("A", { exact: true })).toBeVisible();
});


it("the personal plaza opens exact fresh configuration reads without re-probing any card media", async () => {
  const journey = await mediaEditJourney("catalog");
  fireEvent.click(screen.getByRole("button", { name: "Saved MCP" }));
  await waitFor(() => expect(journey.client.getMcpConnector).toHaveBeenCalledWith(connector.connector_id, expect.any(AbortSignal)));
  await waitFor(() => expect(journey.client.getPrivateMcpServer).toHaveBeenCalledWith(connector.server_id, expect.any(AbortSignal)));
  expect(await screen.findByRole("dialog")).toBeInTheDocument();
  expect(journey.reads).toHaveBeenCalledOnce();
  expect(fetchMedia).toHaveBeenCalledTimes(2);
  expect(image(journey.container)).toBe(journey.original);
});
it.each(["replace", "clear"] as const)("the personal plaza retires only the confirmed %s icon while retaining unrelated absent media", async operation => {
  const journey = await mediaEditJourney("catalog");
  fetchMedia.mockResolvedValueOnce(operation === "clear" ? new Response(null, { status: 404 }) : response());
  await act(async () => {
    expect(await journey.management.submit({ operation: "update_server", connectorId: connector.connector_id, serverId: connector.server_id!, input: { expected_state_version: "1", ...(operation === "clear" ? { clear_icon: true as const } : { icon: { intent_id: "11111111-1111-4111-8111-111111111111", expected_state_version: "1" } }) } }, journey.boundary)).toBe(true);
  });
  await waitFor(() => expect(journey.reads).toHaveBeenCalledTimes(2));
  expect(fetchMedia).toHaveBeenCalledTimes(3);
  expect(fetchMedia).toHaveBeenLastCalledWith("/api/hub/mcp/servers/saved-server/icon", expect.any(Object));
  expect(revokeUrl).toHaveBeenCalledWith(journey.original.getAttribute("src"));
  expect(journey.container.contains(journey.original)).toBe(false);
  expect(screen.getByText("A", { exact: true })).toBeVisible();
});

it("shares card logic across management and the plaza without sharing private blob lifetimes", async () => {
  const { McpPersonalServerGallery } = await import("@/ui/mcp/mcp-personal-server-gallery");
  const management = render(list(connector));
  const first = await loadedImage(management.container); fireEvent.load(first);
  expect(fetchMedia).toHaveBeenCalledOnce();
  management.unmount();
  expect(revokeUrl).toHaveBeenCalledWith(first.getAttribute("src"));
  const gallery = render(<LocaleProvider><McpPersonalServerGallery connectors={[connector]} providers={[]} admitted confirmed query="" category="all" onSelect={noop} /></LocaleProvider>);
  const second = await loadedImage(gallery.container);
  expect(fetchMedia).toHaveBeenCalledTimes(2);
  expect(fetchMedia).toHaveBeenLastCalledWith("/api/hub/mcp/servers/saved-server/icon", expect.any(Object));
  expect(second.getAttribute("src")).not.toBe(first.getAttribute("src"));
});

import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { HubClientError, type HubClient } from "@/hub/client";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { LocaleProvider } from "@/i18n/context";
import { createMcpJsonImportFlow } from "@/ui/mcp/mcp-json-import-flow";
import { JsonMcpImportForm } from "@/ui/mcp/mcp-json-import-form";

const documentValue = JSON.stringify({
  mcpServers: {
    "Acceptance MCP": {
      type: "streamableHttp",
      url: "https://mcp.example.test/acceptance",
    },
  },
});

function renderForm(
  client: Pick<HubClient, "importPrivateMcpJson">,
  onDone = vi.fn().mockResolvedValue(undefined),
) {
  const onRegistered = vi.fn();
  const boundary = { admitted: true, subject: "json-form-test", generation: 1 };
  const flow = createMcpJsonImportFlow({ client, boundary, onConfirmed: onRegistered });
  render(
    <Dialog open>
      <DialogContent>
        <JsonMcpImportForm
          flow={flow}
          boundary={boundary}
          onCancel={vi.fn()}
          onDone={onDone}
        />
      </DialogContent>
    </Dialog>,
    { wrapper: LocaleProvider },
  );
  return { onDone, onRegistered };
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("JsonMcpImportForm", () => {
  it("submits one untouched document through the Hub client, then refreshes its owner projection", async () => {
    const importPrivateMcpJson = vi.fn().mockResolvedValue(undefined);
    const { onDone, onRegistered } = renderForm({ importPrivateMcpJson });
    const editor = screen.getByRole("textbox") as HTMLTextAreaElement;
    expect(JSON.parse(editor.placeholder)).toEqual({
      mcpServers: {
        SERVER_NAME: { type: "streamableHttp", url: "https://HOST/mcp" },
        SSE_SERVER_NAME: { type: "sse", url: "https://HOST/sse" },
      },
    });
    expect(editor).toHaveValue("");
    expect(screen.getByRole("button", { name: /Import|导入/u })).toBeDisabled();
    expect(importPrivateMcpJson).not.toHaveBeenCalled();

    fireEvent.change(editor, {
      target: { value: documentValue },
    });
    fireEvent.click(screen.getByRole("button", { name: /Import|导入/u }));

    await waitFor(() =>
      expect(importPrivateMcpJson).toHaveBeenCalledWith(documentValue, expect.any(String), expect.any(AbortSignal)),
    );
    await waitFor(() => expect(onRegistered).toHaveBeenCalledOnce());
    await waitFor(() => expect(onDone).toHaveBeenCalledOnce());
  });

  it("keeps the submitted document visible when the owner rejects the import", async () => {
    const importPrivateMcpJson = vi
      .fn()
      .mockRejectedValue(new Error("owner rejected"));
    const { onDone, onRegistered } = renderForm({ importPrivateMcpJson });

    fireEvent.change(screen.getByRole("textbox"), {
      target: { value: documentValue },
    });
    fireEvent.click(screen.getByRole("button", { name: /Import|导入/u }));

    expect(await screen.findByRole("alert")).toBeVisible();
    expect(screen.getByRole("textbox")).toHaveValue(documentValue);
    expect(onRegistered).not.toHaveBeenCalled();
    expect(onDone).not.toHaveBeenCalled();
  });
});

it("an expired JSON receipt explains status inspection and disables its original retry without clearing the document", async () => {
  const { HubClientError } = await import("@/hub/client");
  const call = vi.fn().mockRejectedValue(new HubClientError("http", "private detail", "mcp_personal_command_replay_expired", 412, false));
  const { onDone } = renderForm({ importPrivateMcpJson: call });
  fireEvent.change(screen.getByRole("textbox"), { target: { value: documentValue } });
  fireEvent.click(screen.getByRole("button", { name: /Import|导入/u }));
  expect(await screen.findByRole("alert")).toHaveTextContent(/期限|expired/iu);
  expect(screen.getByRole("button", { name: /核验|Check status/iu })).toBeDisabled();
  expect(screen.getByRole("textbox")).toHaveValue(documentValue);
  expect(screen.getByRole("textbox")).toHaveAttribute("readonly");
  expect(call).toHaveBeenCalledOnce();
  expect(onDone).not.toHaveBeenCalled();
});


it.each(["api-cancel", "api-unmount", "json-cancel", "json-unmount"])("%s stops only its window wait and preserves the original command for explicit recovery", async scenario => {
  const { createCustomApiCreateFlow } = await import("@/ui/mcp/custom-api-create-flow");
  const { CustomApiForm } = await import("@/ui/mcp/custom-api-form");
  const isApi = scenario.startsWith("api");
  const boundary = { admitted: true, subject: "window-wait-actor", generation: 1 };
  const pending: Array<() => void> = [];
  const write = vi.fn().mockImplementation(() => new Promise<void>(resolve => pending.push(resolve)));
  const confirmed = vi.fn(), onCancel = vi.fn(), oldDone = vi.fn().mockResolvedValue(undefined), nextDone = vi.fn().mockResolvedValue(undefined);
  const flow = isApi ? createCustomApiCreateFlow({ client: { createCustomApi: write }, boundary, onConfirmed: confirmed })
    : createMcpJsonImportFlow({ client: { importPrivateMcpJson: write }, boundary, onConfirmed: confirmed });
  const release = flow.retain(boundary);
  const content = (done: typeof oldDone) => isApi
    ? <CustomApiForm flow={flow as ReturnType<typeof createCustomApiCreateFlow>} boundary={{ ...boundary }} onCancel={onCancel} onDone={done} />
    : <Dialog open><DialogContent><JsonMcpImportForm flow={flow as ReturnType<typeof createMcpJsonImportFlow>} boundary={{ ...boundary }} onCancel={onCancel} onDone={done} /></DialogContent></Dialog>;
  const oldWindow = render(content(oldDone), { wrapper: LocaleProvider });
  fireEvent.change(isApi ? screen.getByLabelText(/^(Name|名称)$/u) : screen.getByRole("textbox"), { target: { value: isApi ? "Original API" : documentValue } });
  if (isApi) {
    fireEvent.change(screen.getByLabelText(/^(Secret name|密钥名称)$/u), { target: { value: "QA_API_KEY" } });
    fireEvent.change(screen.getByLabelText(/^(Value|值)$/u), { target: { value: "qa-public-fixture-value" } });
  }
  fireEvent.click(screen.getByRole("button", { name: isApi ? /^(Save|保存)$/u : /^(Import|导入)$/u }));
  await waitFor(() => expect(write).toHaveBeenCalledOnce());
  const firstSignal = write.mock.calls[0]?.[2] as AbortSignal;
  oldWindow.rerender(content(oldDone));
  expect(firstSignal.aborted).toBe(false);
  if (scenario.endsWith("cancel")) {
    fireEvent.click(screen.getByRole("button", { name: /^(Cancel|取消)$/u }));
    expect(onCancel).toHaveBeenCalledOnce();
    expect(firstSignal.aborted).toBe(true);
  }
  oldWindow.unmount();
  expect(firstSignal.aborted).toBe(true);
  expect(flow.getSnapshot().kind).toBe("unknown");
  render(content(nextDone), { wrapper: LocaleProvider });
  expect(write).toHaveBeenCalledOnce();
  fireEvent.click(screen.getByRole("button", { name: /重试原请求|Retry original/u }));
  await waitFor(() => expect(write).toHaveBeenCalledTimes(2));
  expect(write.mock.calls[1]?.slice(0, 2)).toEqual(write.mock.calls[0]?.slice(0, 2));
  const secondSignal = write.mock.calls[1]?.[2] as AbortSignal;
  expect(secondSignal.aborted).toBe(false);
  await act(async () => { pending[0]!(); await Promise.resolve(); });
  expect(confirmed).toHaveBeenCalledOnce();
  expect(oldDone).not.toHaveBeenCalled();
  expect(nextDone).not.toHaveBeenCalled();
  expect(secondSignal.aborted).toBe(true);
  await act(async () => { pending[1]!(); await Promise.resolve(); });
  expect(nextDone).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: /^(Done|完成)$/u }));
  await waitFor(() => expect(nextDone).toHaveBeenCalledOnce());
  release();
});

it("a definite URL conflict keeps the JSON editable with a specific explanation, then submits only the corrected full document", async () => {
  localStorage.setItem("kokoro.locale", "zh");
  const boundary = { admitted: true, generation: 1, subject: "json-form-actor" }
  const create = vi.fn().mockRejectedValueOnce(new HubClientError("http", "duplicate", "mcp_personal_server_url_conflict", 409, false))
    .mockResolvedValue({ imports: [], replayed: false })
  const flow = createMcpJsonImportFlow({ client: { importPrivateMcpJson: create }, boundary, onConfirmed: vi.fn() })
  const onDone = vi.fn(async () => {})
  const view = render(<LocaleProvider><Dialog open><DialogContent aria-describedby={undefined}>
    <JsonMcpImportForm flow={flow} boundary={boundary} onCancel={vi.fn()} onDone={onDone} />
  </DialogContent></Dialog></LocaleProvider>)
  const document = '{"mcpServers":{"One":{"type":"streamableHttp","url":"https://mcp.example.test/one"},"Two":{"type":"streamableHttp","url":"https://mcp.example.test/two"}}}'
  const input = screen.getByRole("textbox", { name: "请粘贴您的配置 JSON" })
  fireEvent.change(input, { target: { value: document } })
  fireEvent.click(screen.getByRole("button", { name: "导入" }))
  expect(await screen.findByRole("alert")).toHaveTextContent("此服务器 URL 已添加")
  expect(input).not.toHaveAttribute("readonly")
  expect(input).toHaveValue(document)
  expect(onDone).not.toHaveBeenCalled()
  const corrected = document.replace("/one", "/corrected")
  fireEvent.change(input, { target: { value: corrected } })
  fireEvent.click(screen.getByRole("button", { name: "导入" }))
  await waitFor(() => expect(onDone).toHaveBeenCalledOnce())
  expect(create.mock.calls.map(call => call[0])).toEqual([document, corrected])
  expect(create.mock.calls[1]?.[1]).not.toBe(create.mock.calls[0]?.[1])
  view.unmount()
})

it("preserves a mixed HTTP/SSE whole document and original key across an unknown reply", async () => {
 const send = vi.fn().mockRejectedValueOnce(new Error("unknown original import")).mockResolvedValue(undefined);
 renderForm({ importPrivateMcpJson: send });
 const original = ' {"mcpServers":{"HTTP":{"type":"streamableHttp","url":"https://HOST/mcp"},"SSE":{"type":"sse","url":"https://HOST/sse"}}} ';
 fireEvent.change(screen.getByRole("textbox"), { target: { value: original } }); fireEvent.click(screen.getByRole("button", { name: /Import|导入/u }));
 await screen.findByRole("alert"); expect(screen.getByRole("textbox")).toHaveValue(original); expect(screen.getByRole("textbox")).toHaveAttribute("readonly");
 fireEvent.click(screen.getByRole("button", { name: /Retry original|重试原请求/u })); await waitFor(() => expect(send).toHaveBeenCalledTimes(2));
 expect(send.mock.calls[0]?.slice(0, 2)).toEqual(send.mock.calls[1]?.slice(0, 2)); expect(send.mock.calls[1]?.[0]).toBe(original);
});

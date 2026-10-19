import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { HubClient } from "@/hub/client";
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

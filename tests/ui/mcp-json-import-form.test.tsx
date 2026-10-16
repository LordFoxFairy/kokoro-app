import {
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

    fireEvent.change(screen.getByRole("textbox"), {
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

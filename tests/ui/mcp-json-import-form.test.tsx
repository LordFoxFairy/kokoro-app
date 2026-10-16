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
  render(
    <Dialog open>
      <DialogContent>
        <JsonMcpImportForm
          client={client as HubClient}
          onCancel={vi.fn()}
          onDone={onDone}
          onRegistered={onRegistered}
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
      expect(importPrivateMcpJson).toHaveBeenCalledWith(documentValue),
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

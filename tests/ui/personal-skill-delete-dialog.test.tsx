import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { LocaleProvider } from "@/i18n/context";
import { HubClientError } from "@/hub/client";
import { PersonalSkillDeleteDialog } from "@/ui/skills/personal-skill-delete-dialog";
const skill = {
  skill_id: "mine",
  source_ref: "skill:mine",
  series_id: "series",
  revision: "1",
  name: "Mine",
  summary: "",
  tags: [],
  status: "active" as const,
  skill_updated_at: "2026-10-21T00:00:00Z",
  example_prompts: [],
  category_keys: [],
  product: {
    source_kind: "personal" as const,
    publication_audience: "owner" as const,
    state_version: "4",
  },
};
afterEach(cleanup);
const ack = {
  series_id: "series",
  skill_id: "mine",
  state_version: "5",
  status: "deleted" as const,
  event_id: `evt:${"a".repeat(64)}`,
  replayed: true,
};
function fixture() {
  window.localStorage.setItem("kokoro.locale", "zh");
  const client = {
    listHistory: vi
      .fn()
      .mockResolvedValue({
        series_id: "series",
        publication: null,
        versions: [],
        next_cursor: null,
      }),
    deleteSeries: vi.fn().mockResolvedValue(ack),
  };
  const onConfirmed = vi.fn(),
    onOpenChange = vi.fn(),
    onIntentStarted = vi.fn();
  const props = {
    skill,
    client,
    open: true,
    admitted: true,
    generation: 1,
    onConfirmed,
    onOpenChange,
    onIntentStarted,
    returnFocusRef: { current: null },
  };
  return { client, props, onConfirmed, onOpenChange };
}
it("quietly waits for a confirmed publication read and never enables deletion from unknown history", async () => {
  const { client, props } = fixture();
  let complete!: () => void;
  client.listHistory.mockImplementation(() => new Promise(resolve => {
    complete = () => resolve({ series_id: "series", publication: null, versions: [], next_cursor: null });
  }));
  render(<LocaleProvider><PersonalSkillDeleteDialog {...props} /></LocaleProvider>);
  const confirm = screen.getByRole("button", { name: "删除" });
  expect(screen.getByRole("dialog")).toHaveTextContent("Mine");
  expect(screen.queryByRole("status")).not.toBeInTheDocument();
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "重试" })).not.toBeInTheDocument();
  expect(confirm).toBeDisabled();
  fireEvent.click(confirm);
  expect(client.deleteSeries).not.toHaveBeenCalled();
  await act(async () => { complete(); });
  await waitFor(() => expect(confirm).toBeEnabled());
  expect(client.deleteSeries).not.toHaveBeenCalled();
});

it("treats an explicit null publication as a confirmed empty snapshot, not an installation guess", async () => {
  const { client, props, onConfirmed } = fixture();
  render(
    <LocaleProvider>
      <PersonalSkillDeleteDialog {...props} />
    </LocaleProvider>,
  );
  const button = await screen.findByRole("button", { name: "删除" });
  await waitFor(() => expect(button).toBeEnabled());
  expect(client.deleteSeries).not.toHaveBeenCalled();
  fireEvent.click(button);
  await waitFor(() => expect(onConfirmed).toHaveBeenCalledOnce());
  expect(client.deleteSeries.mock.calls[0]?.[1]).toEqual({
    expected_state_version: "4",
    expected_publication: null,
  });
  expect(Object.isFrozen(client.deleteSeries.mock.calls[0]?.[1])).toBe(true);
});
it.each([403, 404, 412])(
  "never turns a failed publication read %s into null or a deletion",
  async (status) => {
    const { client, props } = fixture();
    client.listHistory.mockRejectedValue(
      new HubClientError("http", "not readable", "skill_not_found", status),
    );
    render(
      <LocaleProvider>
        <PersonalSkillDeleteDialog {...props} />
      </LocaleProvider>,
    );
    await act(async () => {});
    expect(client.listHistory).toHaveBeenCalledOnce();
    expect(screen.getByRole("dialog")).toHaveTextContent("Mine");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "重试" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "删除" })).toBeDisabled();
    expect(client.deleteSeries).not.toHaveBeenCalled();
  },
);
it("rechecks passive history on a normal close and reopen without retrying or starting a delete", async () => {
  const { client, props } = fixture();
  client.listHistory.mockRejectedValueOnce(new Error("temporary read failure"));
  const content = (open: boolean) => <LocaleProvider><PersonalSkillDeleteDialog {...props} open={open} /></LocaleProvider>;
  const view = render(content(true));
  await act(async () => {});
  expect(screen.getByRole("button", { name: "删除" })).toBeDisabled();
  fireEvent.click(screen.getByRole("button", { name: "取消" }));
  expect(props.onOpenChange).toHaveBeenLastCalledWith(false, false);
  view.rerender(content(false));
  view.rerender(content(true));
  await waitFor(() => expect(screen.getByRole("button", { name: "删除" })).toBeEnabled());
  expect(client.listHistory).toHaveBeenCalledTimes(2);
  expect(client.deleteSeries).not.toHaveBeenCalled();
  expect(props.onIntentStarted).not.toHaveBeenCalled();
});

it("retains real deletion busy and rejected feedback rather than silencing command outcomes", async () => {
  const { client, props, onConfirmed } = fixture();
  let reject!: (error: unknown) => void;
  client.deleteSeries.mockImplementation(() => new Promise((_resolve, fail) => { reject = fail; }));
  render(<LocaleProvider><PersonalSkillDeleteDialog {...props} /></LocaleProvider>);
  const confirm = screen.getByRole("button", { name: "删除" });
  await waitFor(() => expect(confirm).toBeEnabled());
  fireEvent.click(confirm);
  expect(screen.getByRole("status")).not.toBeEmptyDOMElement();
  expect(confirm).toBeDisabled();
  await act(async () => { reject(new HubClientError("http", "rejected", "skill_not_found", 400)); });
  expect(screen.getByRole("alert")).not.toBeEmptyDOMElement();
  expect(confirm).toBeDisabled();
  expect(screen.queryByRole("button", { name: "重试" })).not.toBeInTheDocument();
  expect(onConfirmed).not.toHaveBeenCalled();
  expect(client.deleteSeries).toHaveBeenCalledOnce();
});

it("keeps a lost deletion unknown when replay returns 404 and suppresses late ACKs after admission retirement", async () => {
  const { client, props, onConfirmed, onOpenChange } = fixture();
  let late: ((value: typeof ack) => void) | undefined;
  client.deleteSeries
    .mockRejectedValueOnce(new Error("lost ACK"))
    .mockRejectedValueOnce(
      new HubClientError("http", "not found", "skill_not_found", 404),
    )
    .mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          late = resolve;
        }),
    );
  const view = render(
    <LocaleProvider>
      <PersonalSkillDeleteDialog {...props} />
    </LocaleProvider>,
  );
  const confirm = screen.getByRole("button", { name: "删除" });
  await waitFor(() => expect(confirm).toBeEnabled());
  fireEvent.click(confirm);
  fireEvent.click(await screen.findByRole("button", { name: "重试" }));
  await waitFor(() => expect(client.deleteSeries).toHaveBeenCalledTimes(2));
  fireEvent.click(screen.getByRole("button", { name: "取消" }));
  expect(onOpenChange).toHaveBeenLastCalledWith(false, true);
  expect(onConfirmed).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "重试" }));
  await waitFor(() => expect(late).toBeTypeOf("function"));
  view.rerender(
    <LocaleProvider>
      <PersonalSkillDeleteDialog {...props} admitted={false} generation={2} />
    </LocaleProvider>,
  );
  late!(ack);
  await Promise.resolve();
  expect(onConfirmed).not.toHaveBeenCalled();
  expect(
    client.deleteSeries.mock.calls.every(
      (call) =>
        JSON.stringify(call.slice(0, 3)) ===
        JSON.stringify(client.deleteSeries.mock.calls[0]?.slice(0, 3)),
    ),
  ).toBe(true);
});

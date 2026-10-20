import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LocaleProvider } from "@/i18n/context";
import { PersonalKnowledgeProvider } from "@/ui/settings/knowledge/session-context";
import { PersonalizationCard } from "@/ui/settings/sections/personalization-card";
import { KnowledgePanel } from "@/ui/settings/knowledge/knowledge-panel";
const boundary = {
  subject: "knowledge-ui-actor",
  admitted: true,
  generation: 1,
};
const id = "a1234567-1234-4123-8123-123456789012";
const row = {
  knowledge_id: id,
  name: "写作规范",
  when_to_use: "写作时",
  content: "保留原始正文",
  revision: 1,
  created_at: "2026-10-18T12:00:00.000Z",
  updated_at: "2026-10-18T12:00:00.000Z",
};
const reply = (data: unknown, status = 200) =>
  new Response(JSON.stringify({ data }), { status });
let items: (typeof row)[], usage: { enabled: boolean; revision: number };
let fetcher: ReturnType<typeof vi.fn>;
function view(open = true, b = boundary) {
  return (
    <LocaleProvider>
      <PersonalKnowledgeProvider boundary={b}>
        {open ? (
          <KnowledgePanel admitted={b.admitted} generation={b.generation} />
        ) : null}
      </PersonalKnowledgeProvider>
    </LocaleProvider>
  );
}
beforeEach(() => {
  window.localStorage.setItem("kokoro.locale", "zh");
  items = [];
  usage = { enabled: false, revision: 0 };
  fetcher = vi.fn(async (url: string, init?: RequestInit) => {
    if (url.endsWith("personalization"))
      return reply({ personalization: null, revision: 0 });
    if (url.endsWith("knowledge-usage")) {
      if (init?.method === "PUT")
        usage = {
          enabled: JSON.parse(init.body as string).enabled,
          revision: usage.revision + 1,
        };
      return reply(usage);
    }
    if (url.endsWith("knowledge")) return reply({ items, max_items: 100 });
    const itemId = url.split("/").at(-1)!;
    if (init?.method === "PUT") {
      const body = JSON.parse(init.body as string);
      const next = {
        ...row,
        ...body,
        knowledge_id: itemId,
        revision: body.expected_revision + 1,
      };
      delete next.expected_revision;
      items = [next];
      return reply(next, body.expected_revision === 0 ? 201 : 200);
    }
    if (init?.method === "DELETE") {
      items = [];
      return new Response(null, { status: 204 });
    }
    const found = items.find((item) => item.knowledge_id === itemId);
    return found
      ? reply(found)
      : new Response(
          JSON.stringify({
            error: {
              code: "knowledge_not_found",
              message: "gone",
              retryable: false,
            },
          }),
          { status: 404 },
        );
  });
  vi.stubGlobal("fetch", fetcher);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
const fill = () => {
  fireEvent.change(screen.getByLabelText("名称"), {
    target: { value: row.name },
  });
  fireEvent.change(screen.getByLabelText("使用时机"), {
    target: { value: row.when_to_use },
  });
  fireEvent.change(screen.getByLabelText("内容"), {
    target: { value: row.content },
  });
};
describe("knowledge settings journey", () => {
  it("keeps toolbar stable, reads real empty facts and does not imply Agent application", async () => {
    render(view());
    await screen.findByText("尚无知识");
    expect(screen.getByRole("switch", { name: "使用知识" })).not.toBeChecked();
    expect(screen.getByRole("button", { name: "新增" })).toBeEnabled();
    expect(screen.getByText(/任务中的知识应用仍待接通/)).toBeInTheDocument();
    expect(
      fetcher.mock.calls.filter((c) => c[1]?.method === "PUT"),
    ).toHaveLength(0);
  });
  it("requires all fields, saves exact text, then reads back before closing", async () => {
    render(view());
    await screen.findByText("尚无知识");
    fireEvent.click(screen.getByRole("button", { name: "新增" }));
    expect(screen.getByRole("button", { name: "保存" })).toBeDisabled();
    fill();
    fireEvent.click(screen.getByRole("button", { name: "保存" }));
    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
    );
    expect(await screen.findByText(row.name)).toBeInTheDocument();
    const put = fetcher.mock.calls.find((c) => c[1]?.method === "PUT")!;
    expect(JSON.parse(put[1].body)).toMatchObject({
      expected_revision: 0,
      name: row.name,
      when_to_use: row.when_to_use,
      content: row.content,
    });
  });
  it("searches the complete bounded collection and edits/deletes with explicit confirmation", async () => {
    items = [row];
    render(view());
    await screen.findByText(row.name);
    fireEvent.change(screen.getByPlaceholderText("搜索知识"), {
      target: { value: "nomatch" },
    });
    expect(screen.queryByText(row.name)).not.toBeInTheDocument();
    fireEvent.change(screen.getByPlaceholderText("搜索知识"), {
      target: { value: "正文" },
    });
    fireEvent.click(screen.getByRole("button", { name: `编辑 ${row.name}` }));
    expect(screen.getByLabelText("内容")).toHaveValue(row.content);
    fireEvent.click(screen.getByRole("button", { name: "取消" }));
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: `编辑 ${row.name}` }),
      ).toHaveFocus(),
    );
    fireEvent.click(screen.getByRole("button", { name: `删除 ${row.name}` }));
    expect(
      fetcher.mock.calls.filter((c) => c[1]?.method === "DELETE"),
    ).toHaveLength(0);
    fireEvent.click(screen.getByRole("button", { name: "确认删除" }));
    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
    );
    expect(
      fetcher.mock.calls.filter((c) => c[1]?.method === "DELETE"),
    ).toHaveLength(1);
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "新增" })).toHaveFocus(),
    );
  });
  it("preserves an unknown original intent across settings close/reopen and never resubmits", async () => {
    const { rerender } = render(view());
    await screen.findByText("尚无知识");
    fireEvent.click(screen.getByRole("button", { name: "新增" }));
    fill();
    fetcher.mockImplementationOnce(async () => {
      throw new TypeError("lost ACK");
    });
    fireEvent.click(screen.getByRole("button", { name: "保存" }));
    await screen.findByText(/原请求不会自动重发/);
    rerender(view(false));
    rerender(view());
    await screen.findByText(/原请求不会自动重发/);
    expect(screen.getByRole("button", { name: "新增" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "核实当前值" }));
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "核实当前值" })).toBeEnabled(),
    );
    expect(
      fetcher.mock.calls.filter((c) => c[1]?.method === "PUT"),
    ).toHaveLength(1);
  });
  it("keeps the existing profile mounted while keyboard tabs open knowledge lazily", async () => {
    render(
      <LocaleProvider>
        <PersonalKnowledgeProvider boundary={boundary}>
          <PersonalizationCard readBoundary={boundary} />
        </PersonalKnowledgeProvider>
      </LocaleProvider>,
    );
    await waitFor(() =>
      expect(screen.getByRole("textbox", { name: "昵称" })).toBeEnabled(),
    );
    fireEvent.change(screen.getByRole("textbox", { name: "昵称" }), {
      target: { value: "local draft" },
    });
    expect(fetcher.mock.calls.some((c) => c[0].endsWith("knowledge"))).toBe(
      false,
    );
    fireEvent.keyDown(screen.getByRole("tab", { name: "个人资料" }), {
      key: "ArrowRight",
    });
    await screen.findByText("尚无知识");
    fireEvent.keyDown(screen.getByRole("tab", { name: "知识" }), {
      key: "ArrowLeft",
    });
    expect(await screen.findByRole("textbox", { name: "昵称" })).toHaveValue(
      "local draft",
    );
  });
  it("retains an unsent knowledge draft through same-actor admission rechecks in the real card", async () => {
    const card = (b: typeof boundary) => <LocaleProvider>
      <PersonalKnowledgeProvider boundary={b}>
        <PersonalizationCard readBoundary={b} />
      </PersonalKnowledgeProvider>
    </LocaleProvider>;
    const { rerender } = render(card(boundary));
    await waitFor(() => expect(screen.getByRole("textbox", { name: "昵称" })).toBeEnabled());
    fireEvent.keyDown(screen.getByRole("tab", { name: "个人资料" }), { key: "ArrowRight" });
    await screen.findByText("尚无知识");
    fireEvent.click(screen.getByRole("button", { name: "新增" }));
    fill();
    rerender(card({ ...boundary, admitted: false, generation: 2 } as typeof boundary));
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByLabelText("内容")).toHaveValue(row.content);
    expect(screen.getByRole("button", { name: "保存" })).toBeDisabled();
    rerender(card({ ...boundary, generation: 3 }));
    await waitFor(() => expect(screen.getByRole("button", { name: "保存" })).toBeEnabled());
    expect(screen.getByLabelText("内容")).toHaveValue(row.content);
    expect(fetcher.mock.calls.filter((c) => c[1]?.method === "PUT")).toHaveLength(0);
  });
  it("updates usage separately and never deletes saved knowledge when disabled", async () => {
    items = [row];
    render(view());
    await screen.findByText(row.name);
    fireEvent.click(screen.getByRole("switch", { name: "使用知识" }));
    await waitFor(() =>
      expect(screen.getByRole("switch", { name: "使用知识" })).toBeChecked(),
    );
    fireEvent.click(screen.getByRole("switch", { name: "使用知识" }));
    await waitFor(() =>
      expect(
        screen.getByRole("switch", { name: "使用知识" }),
      ).not.toBeChecked(),
    );
    expect(screen.getByText(row.name)).toBeInTheDocument();
    expect(
      fetcher.mock.calls.filter((c) => c[1]?.method === "DELETE"),
    ).toHaveLength(0);
  });
  it("does not show a false empty state on read errors, freezes rechecks and clears replacement actors", async () => {
    fetcher.mockRejectedValue(new TypeError("offline"));
    const { rerender } = render(view());
    await screen.findByText(/知识暂时未能加载/);
    expect(screen.queryByText("尚无知识")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "新增" })).toBeDisabled();
    rerender(view(true, { ...boundary, admitted: false, generation: 2 }));
    expect(screen.getByRole("switch", { name: "使用知识" })).toBeDisabled();
    expect(screen.queryByText(row.name)).not.toBeInTheDocument();
  });
});

import {
  render,
  screen,
  fireEvent,
  waitFor,
  cleanup,
} from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ read: vi.fn(), revoke: vi.fn() }));
vi.mock("@/ui/settings/shared-tasks-client", () => ({
  readSharedTasks: mocks.read,
}));
vi.mock("@/engine/client", () => ({
  createSessionClient: () => ({ revokeShare: mocks.revoke }),
}));
import { DataManagementSection } from "@/ui/settings/sections/data-management-section";
import { LocaleProvider } from "@/i18n/context";
const item = {
  session_id: "session",
  title: "真实任务",
  shared_at: "2026-10-15T00:00:00.000Z",
  expires_at: null,
};
beforeEach(() => {
  window.localStorage.setItem("kokoro.locale", "zh");
  vi.resetAllMocks();
  mocks.read.mockResolvedValue({ data: { items: [item], next_cursor: null } });
  mocks.revoke.mockResolvedValue({ share_id: "share" });
});
afterEach(cleanup);
it("preview displays unavailable regions rather than fabricated empty facts with zero API", () => {
  render(
    <LocaleProvider>
      <DataManagementSection preview />
    </LocaleProvider>,
  );
  expect(
    screen.getByRole("heading", { name: "已分享任务" }),
  ).toBeInTheDocument();
  expect(screen.getAllByRole("button", { name: "管理" })).toHaveLength(3);
  screen
    .getAllByRole("button", { name: "管理" })
    .forEach((b) => expect(b).toBeDisabled());
  expect(screen.queryByText("暂无已分享任务。")).toBeNull();
  expect(mocks.read).not.toHaveBeenCalled();
});
it("requires confirmation and clears the confirmation when identity retires", async () => {
  const view = render(
    <LocaleProvider>
      <DataManagementSection
        preview={false}
        readBoundary={{ admitted: true, subject: "alice", generation: 1 }}
      />
    </LocaleProvider>,
  );
  await screen.findByText("真实任务");
  fireEvent.click(screen.getByRole("button", { name: "停止分享" }));
  expect(screen.getByRole("group")).toBeInTheDocument();
  expect(mocks.revoke).not.toHaveBeenCalled();
  view.rerender(
    <LocaleProvider>
      <DataManagementSection
        preview={false}
        readBoundary={{ admitted: false, subject: null, generation: 2 }}
      />
    </LocaleProvider>,
  );
  expect(screen.queryByRole("group")).toBeNull();
  expect(screen.queryByText("真实任务")).toBeNull();
  await waitFor(() => expect(mocks.revoke).not.toHaveBeenCalled());
});

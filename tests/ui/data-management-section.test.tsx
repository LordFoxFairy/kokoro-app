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

// SET47-BEGIN: archived tasks are a separate live section, never a preview fact.
const archiveMocks=vi.hoisted(()=>({readArchivedTasks:vi.fn(),readArchiveState:vi.fn(),writeArchiveState:vi.fn()}));
vi.mock("@/ui/settings/archived-tasks-client",()=>archiveMocks);
beforeEach(()=>{archiveMocks.readArchivedTasks.mockResolvedValue({data:{items:[],next_cursor:null}});});
it("SET47 reads the real archived section and restores through the caller callback",async()=>{
 const archived={session_id:"archived",title:"归档任务标题",archived_at:"2026-10-15T00:00:00.000Z",project_ref:null};
 archiveMocks.readArchivedTasks.mockResolvedValueOnce({data:{items:[archived],next_cursor:null}}).mockResolvedValue({data:{items:[],next_cursor:null}});
 archiveMocks.writeArchiveState.mockResolvedValue({session_id:"archived",archived_at:null});archiveMocks.readArchiveState.mockResolvedValue({session_id:"archived",archived_at:null});const changed=vi.fn();
 render(<LocaleProvider><DataManagementSection preview={false} readBoundary={{admitted:true,subject:"alice",generation:1}} onArchiveChanged={changed}/></LocaleProvider>);
 await screen.findByText("归档任务标题");fireEvent.click(screen.getByRole("button",{name:"恢复任务"}));await waitFor(()=>expect(changed).toHaveBeenCalledWith({session_id:"archived",archived_at:null}));await screen.findByText("暂无已归档任务。");expect(screen.getByRole("heading",{name:"已分享任务"})).toBeInTheDocument();
});
it("SET47 preview cannot read or write archive facts and keeps unsupported regions disabled",()=>{
 render(<LocaleProvider><DataManagementSection preview/></LocaleProvider>);expect(screen.getByRole("heading",{name:"已归档任务"})).toBeInTheDocument();expect(screen.queryByRole("button",{name:"恢复任务"})).toBeNull();expect(archiveMocks.readArchivedTasks).not.toHaveBeenCalled();expect(archiveMocks.writeArchiveState).not.toHaveBeenCalled();
});
it("SET47 dot-only historical IDs show a visible reason and cannot dispatch restore",async()=>{
 archiveMocks.readArchivedTasks.mockResolvedValue({data:{items:[{session_id:".",title:"历史任务",archived_at:"2026-10-15T00:00:00.000Z",project_ref:null}],next_cursor:null}});
 render(<LocaleProvider><DataManagementSection preview={false} readBoundary={{admitted:true,subject:"alice",generation:1}}/></LocaleProvider>);
 await screen.findByText("历史任务");expect(screen.getByRole("button",{name:"恢复任务"})).toBeDisabled();
 expect(screen.getByText("此历史任务标识无法通过浏览器安全访问，暂不可操作。")).toBeVisible();
 fireEvent.click(screen.getByRole("button",{name:"恢复任务"}));expect(archiveMocks.writeArchiveState).not.toHaveBeenCalled();
});
// SET47-END

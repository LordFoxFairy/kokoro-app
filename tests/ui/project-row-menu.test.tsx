import { useProjectPins } from "@/features/app/use-project-pins"
import { useEffect, useState, type ReactNode } from "react"
import { flushSync } from "react-dom"
import { WorkspaceRailProjectMenu } from "@/components/blocks/workspace-rail/workspace-rail-project-menu"
import { act, cleanup, fireEvent, render, renderHook, screen, waitFor, within } from "@testing-library/react"
import { afterEach, beforeEach, expect, it, vi } from "vitest"
import { WorkspaceRail } from "@/components/blocks/workspace-rail/workspace-rail"
import { useAppFrameProject, type AppFrameProjectOptions } from "@/components/blocks/app-frame/use-app-frame-project"
import { LocaleProvider } from "@/i18n/context"
import { ThemeProvider } from "@/ui/theme/theme-context"

const a = {
  id: "project_11111111-1111-1111-1111-111111111111",
  name: "项目甲",
  slug: "a",
  description: "",
  created_at: "2026-10-01T00:00:00Z",
  updated_at: "2026-10-01T00:00:00Z",
}
const b = { ...a, id: "project_22222222-2222-2222-2222-222222222222", name: "项目乙", slug: "b" }
beforeEach(() => {
  window.localStorage.setItem("kokoro.locale", "zh")
  window.history.replaceState(null, "", `/app/project/${a.id}`)
})
afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  window.history.replaceState(null, "", "/app")
})
function rail(overrides: Partial<Parameters<typeof WorkspaceRail>[0]> = {}) {
  const rename = vi.fn(),
    remove = vi.fn(),
    create = vi.fn()
  render(
    <ThemeProvider>
      <LocaleProvider>
        <WorkspaceRail
          collapsed={false}
          onToggleCollapse={() => {}}
          onNewChat={create}
          chatHref="/app"
          projects={[a, b].map((p) => ({ id: p.id, name: p.name, href: `/app/project/${p.id}` }))}
          projectListStatus="ready"
          onRequestProjectRename={rename}
          onRequestProjectDelete={remove}
          conversations={[]}
          activeId={null}
          awaitingIds={new Set()}
          onSelectConversation={() => {}}
          onDeleteConversation={async () => true}
          onRenameConversation={() => {}}
          onOpenSettings={() => {}}
          onOpenNotifications={() => {}}
          listLoading={false}
          listError={false}
          hasMore={false}
          onLoadMore={() => {}}
          {...overrides}
        />
      </LocaleProvider>
    </ThemeProvider>,
  )
  const rowButton = screen.getByRole("button", { name: b.name }),
    row = rowButton.closest("[data-project-id]") as HTMLElement
  return { rename, remove, create, row, rowButton }
}
it("真实右键和Shift+F10与ellipsis给出同一四项targeted菜单，不伪造pin或指令第六项", async () => {
  const c = rail()
  fireEvent.contextMenu(c.rowButton, { clientX: 80, clientY: 90 })
  let menu = await screen.findByRole("menu")
  const labels = () =>
    within(menu)
      .getAllByRole("menuitem")
      .map((item) => item.textContent)
  expect(labels()).toEqual(["编辑项目", "查看项目", "显示更少", "删除"])
  fireEvent.click(within(menu).getByRole("menuitem", { name: "删除" }))
  expect(c.remove).toHaveBeenCalledWith(b.id, expect.any(HTMLButtonElement))
  expect(c.rename).not.toHaveBeenCalled()
  c.rowButton.focus()
  fireEvent.keyDown(c.rowButton, { key: "F10", shiftKey: true })
  menu = await screen.findByRole("menu")
  expect(labels()).toEqual(["编辑项目", "查看项目", "显示更少", "删除"])
  fireEvent.keyDown(menu, { key: "Escape" })
  await waitFor(() => expect(c.rowButton).toHaveFocus())
  const trigger = within(c.row).getByRole("button", { name: "项目选项" })
  fireEvent.keyDown(trigger, { key: "ArrowDown" })
  menu = await screen.findByRole("menu")
  expect(labels()).toEqual(["编辑项目", "查看项目", "显示更少", "删除"])
  fireEvent.click(within(menu).getByRole("menuitem", { name: "编辑项目" }))
  expect(c.rename).toHaveBeenCalledWith(b.id, trigger)
})
it("显示更少只收起精确项目，查看只去原overview不创建任务", async () => {
  const c = rail()
  fireEvent.click(c.rowButton)
  expect(c.rowButton).toHaveAttribute("aria-expanded", "true")
  fireEvent.contextMenu(c.rowButton)
  fireEvent.click(within(await screen.findByRole("menu")).getByRole("menuitem", { name: "显示更少" }))
  expect(c.rowButton).toHaveAttribute("aria-expanded", "false")
  fireEvent.contextMenu(c.rowButton)
  fireEvent.click(within(await screen.findByRole("menu")).getByRole("menuitem", { name: "查看项目" }))
  expect(window.location.pathname).toBe(`/app/project/${b.id}`)
  expect(c.create).not.toHaveBeenCalled()
  expect(c.remove).not.toHaveBeenCalled()
})
function options(): AppFrameProjectOptions {
  return {
    projectRef: a.id,
    projectWorkspace: true,
    preview: false,
    mounted: true,
    draft: "original draft",
    updateDraft: vi.fn(),
    clearDraft: vi.fn(),
    projectDetail: { status: "ready", data: a },
    instructionHistory: { status: "ready", data: [] },
    instructionContext: {},
    refreshProject: vi.fn(),
    refreshRenamedProject: vi.fn(),
    renameBoundary: { admitted: true, subject: "reader-A", generation: 1 },
  }
}
const wrapper = ({ children }: { children: ReactNode }) => <LocaleProvider>{children}</LocaleProvider>
it("跨行删除只在B当前owner ready后开B确认，取消零写并返回原稳定行trigger", () => {
  const fetch = vi.spyOn(globalThis, "fetch")
  const opener = document.createElement("button")
  document.body.append(opener)
  const initial = options(),
    view = renderHook((p: AppFrameProjectOptions) => useAppFrameProject(p), { initialProps: initial, wrapper })
  const staleReturn = view.result.current.projectDelete.returnFocus
  act(() => view.result.current.requestProjectDeletion(b.id, opener))
  expect(window.location.pathname).toBe(`/app/project/${b.id}`)
  expect(view.result.current.projectDelete.open).toBe(false)
  view.rerender({ ...initial, projectRef: b.id, projectDetail: { status: "loading" } })
  expect(view.result.current.projectDelete.open).toBe(false)
  view.rerender({ ...initial, projectRef: b.id, projectDetail: { status: "ready", data: b } })
  expect(view.result.current.projectDelete.open).toBe(true)
  expect(view.result.current.projectDelete.targetName).toBe(b.name)
  expect(staleReturn?.()).toBe(false)
  act(() => view.result.current.projectDelete.onClose())
  expect(view.result.current.projectDelete.open).toBe(false)
  expect(view.result.current.projectDelete.returnFocus?.()).toBe(true)
  expect(opener).toHaveFocus()
  expect(fetch).not.toHaveBeenCalled()
  opener.remove()
})
it("target handoff在其它导航/换主体退休，迟到B和旧A handler不开当前项目确认", () => {
  const initial = options(),
    view = renderHook((p: AppFrameProjectOptions) => useAppFrameProject(p), { initialProps: initial, wrapper })
  const stale = view.result.current.requestProjectDeletion
  act(() => view.result.current.requestProjectDeletion(b.id, null))
  act(() => {
    window.history.pushState(null, "", "/app")
    window.dispatchEvent(new Event("kokoro:surface-navigation"))
  })
  view.rerender({
    ...initial,
    projectRef: b.id,
    projectDetail: { status: "ready", data: b },
    renameBoundary: { admitted: true, subject: "reader-B", generation: 2 },
  })
  expect(view.result.current.projectDelete.open).toBe(false)
  act(() => stale(b.id, null))
  expect(window.location.pathname).toBe("/app")
  expect(view.result.current.projectDelete.open).toBe(false)
})

it("跨行B确认只发B的原空DELETE；unknown重试保同key/body，202只退休B", async () => {
  const initial = options(),
    retire = vi.fn()
  const fetch = vi
    .spyOn(globalThis, "fetch")
    .mockRejectedValueOnce(new TypeError("ACK lost"))
    .mockResolvedValueOnce(
      Response.json(
        { data: { project_id: b.id, logical_release_state: "pending", physical_cleanup_state: "pending" } },
        { status: 202, headers: { "cache-control": "private, no-store, max-age=0" } },
      ),
    )
  const view = renderHook((p: AppFrameProjectOptions) => useAppFrameProject(p), { initialProps: { ...initial, retireProject: retire }, wrapper })
  act(() => view.result.current.requestProjectDeletion(b.id, null))
  view.rerender({ ...initial, retireProject: retire, projectRef: b.id, projectDetail: { status: "ready", data: b } })
  await act(async () => view.result.current.projectDelete.onConfirm())
  expect(view.result.current.projectDelete.problem).toBe("unknown")
  const first = fetch.mock.calls[0]
  expect(first?.[0]).toBe(`/api/hub/projects/${b.id}`)
  expect(first?.[1]?.method).toBe("DELETE")
  expect(Object.hasOwn(first?.[1] ?? {}, "body")).toBe(false)
  const key = new Headers(first?.[1]?.headers).get("idempotency-key")
  act(() => {
    view.result.current.projectDelete.onClose()
    view.result.current.projectDelete.onOpen()
  })
  expect(fetch).toHaveBeenCalledTimes(1)
  await act(async () => view.result.current.projectDelete.onRetry())
  expect(fetch.mock.calls[1]?.[0]).toBe(first?.[0])
  expect(new Headers(fetch.mock.calls[1]?.[1]?.headers).get("idempotency-key")).toBe(key)
  expect(retire).toHaveBeenCalledWith(b.id)
  expect(window.location.pathname).toBe("/app")
})


it("a ready owner pin is a fifth real menu action, not a row-local toggle",async()=>{
 const set=vi.fn().mockResolvedValue(undefined),ensure=vi.fn()
 const projectPins={context:{},available:true,targets:{[b.id]:{status:"known" as const,value:{project_id:b.id,is_pinned:false,pinned_at:null}}},pinned:[],loading:false,failed:false,loaded:true,nextCursor:null,ensure,check:vi.fn().mockResolvedValue(undefined),set,loadMore:vi.fn(),refresh:vi.fn()}
 const c=rail({projectPins} as Partial<Parameters<typeof WorkspaceRail>[0]>)
 fireEvent.contextMenu(c.rowButton)
 const menu=await screen.findByRole("menu")
 fireEvent.click(within(menu).getByRole("menuitem",{name:"固定"}))
 expect(set).toHaveBeenCalledExactlyOnceWith(b.id,true)
 expect(c.remove).not.toHaveBeenCalled();expect(c.rename).not.toHaveBeenCalled()
})

it("View closes navigation before a synchronous surface event can unmount its portal",async()=>{
 const order:string[]=[]
 function Fixture(){
  const [shown,setShown]=useState(true)
  useEffect(()=>{const close=()=>{order.push("surface");flushSync(()=>setShown(false))};window.addEventListener("kokoro:surface-navigation",close,{once:true});return()=>window.removeEventListener("kokoro:surface-navigation",close)},[])
  return shown?<WorkspaceRailProjectMenu project={{id:b.id,name:b.name,href:`/app/project/${b.id}`}} identity="actor" admitted triggerClassName="" onShowLess={()=>{}} onNavigate={()=>order.push("close")}>
   {trigger=><div><button>{b.name}</button>{trigger}</div>}
  </WorkspaceRailProjectMenu>:null
 }
 render(<LocaleProvider><Fixture/></LocaleProvider>)
 fireEvent.keyDown(screen.getByRole("button",{name:"项目选项"}),{key:"ArrowDown"})
 fireEvent.click(await screen.findByRole("menuitem",{name:"查看项目"}))
 expect(order).toEqual(["close","surface"])
 expect(window.location.pathname).toBe(`/app/project/${b.id}`)
})

function pinModel(status:"known"|"pending"|"unknown"="known"){
 const value={project_id:b.id,is_pinned:true,pinned_at:"2026-10-27T00:00:00.000Z"}
 return {context:{},available:true,targets:{[b.id]:status==="known"?{status,value}:{status,previous:value}},pinned:[{project_id:b.id,pinned_at:value.pinned_at}],loading:false,failed:false,loaded:true,nextCursor:"next" as string|null,ensure:vi.fn(),check:vi.fn().mockResolvedValue(undefined),set:vi.fn().mockResolvedValue(undefined),loadMore:vi.fn(),refresh:vi.fn()}
}
it("Pinned is a real unique owner-ordered section and its row uses the same Unpin menu",async()=>{
 const projectPins=pinModel(),c=rail({projectPins} as Partial<Parameters<typeof WorkspaceRail>[0]>)
 const pinned=screen.getByRole("list",{name:"已固定"}),ordinary=screen.getByRole("list",{name:"项目"})
 expect(within(pinned).getByRole("button",{name:b.name})).toBeVisible();expect(within(ordinary).queryByRole("button",{name:b.name})).toBeNull()
 expect(screen.getAllByRole("button",{name:b.name})).toHaveLength(1)
 fireEvent.click(within(pinned).getByRole("button",{name:"显示更多固定项目"}));expect(projectPins.loadMore).toHaveBeenCalledOnce()
 fireEvent.keyDown(within(c.row).getByRole("button",{name:"项目选项"}),{key:"ArrowDown"})
 const menu=await screen.findByRole("menu");expect(within(menu).getAllByRole("menuitem")).toHaveLength(5)
 fireEvent.click(within(menu).getByRole("menuitem",{name:"取消固定"}));expect(projectPins.set).toHaveBeenCalledExactlyOnceWith(b.id,false)
})
it.each(["pending","unknown"] as const)("%s pin keeps its prior Pinned row without exposing another write",async status=>{
 const projectPins=pinModel(status),c=rail({projectPins} as Partial<Parameters<typeof WorkspaceRail>[0]>)
 expect(within(screen.getByRole("list",{name:"已固定"})).getByRole("button",{name:b.name})).toBeVisible()
 fireEvent.contextMenu(c.rowButton);const menu=await screen.findByRole("menu")
 expect(within(menu).queryByRole("menuitem",{name:"固定"})).toBeNull();expect(within(menu).queryByRole("menuitem",{name:"取消固定"})).toBeNull()
 if(status==="pending")expect(within(menu).getByRole("menuitem",{name:"固定状态"})).toHaveAttribute("data-disabled")
 else {fireEvent.click(within(menu).getByRole("menuitem",{name:"核验固定状态"}));expect(projectPins.check).toHaveBeenCalledExactlyOnceWith(b.id)}
 expect(projectPins.set).not.toHaveBeenCalled()
})

it.each([false,true])("pin and unpin move a row between real sections without losing keyboard focus (Projects collapsed=%s)",async collapsed=>{
 const client={list:vi.fn().mockResolvedValue({items:[],next_cursor:null}),set:vi.fn(async(id:string,is_pinned:boolean)=>({project_id:id,is_pinned,pinned_at:is_pinned?"2026-10-27T00:00:00.000Z":null}))}
 function Host(){const projectPins=useProjectPins({preview:false,boundary:{admitted:true,subject:"actor",generation:1},visibleIds:[b.id],client});return <WorkspaceRail collapsed={false} onToggleCollapse={()=>{}} onNewChat={()=>{}} chatHref="/app" projects={[{id:b.id,name:b.name,href:`/app/project/${b.id}`}]} projectListStatus="ready" projectPins={projectPins} conversations={[]} activeId={null} awaitingIds={new Set()} onSelectConversation={()=>{}} onDeleteConversation={async()=>true} onRenameConversation={()=>{}} onOpenSettings={()=>{}} listLoading={false} listError={false} hasMore={false} onLoadMore={()=>{}}/>}
 render(<ThemeProvider><LocaleProvider><Host/></LocaleProvider></ThemeProvider>)
 for(const label of ["固定","取消固定"]){
 if(collapsed&&label==="取消固定")fireEvent.click(screen.getByRole("button",{name:"收起项目"}))
 const trigger=within(screen.getByRole("button",{name:b.name}).closest("[data-project-id]") as HTMLElement).getByRole("button",{name:"项目选项"})
 trigger.focus();fireEvent.keyDown(trigger,{key:"ArrowDown"})
 const action=await screen.findByRole("menuitem",{name:label});action.focus();fireEvent.keyDown(action,{key:"Enter",code:"Enter"})
 await waitFor(()=>expect(screen.queryByRole("menu")).toBeNull())
 if(collapsed&&label==="取消固定")await waitFor(()=>expect(screen.getByRole("button",{name:"展开项目"})).toHaveFocus())
 else await waitFor(()=>expect(within(screen.getByRole("button",{name:b.name}).closest("[data-project-id]") as HTMLElement).getByRole("button",{name:"项目选项"})).toHaveFocus())
 }
 expect(client.set.mock.calls).toEqual([[b.id,true,expect.any(AbortSignal)],[b.id,false,expect.any(AbortSignal)]])
})


it("an initial pin collection failure adds no empty Pinned error panel or retry surface",()=>{
 const projectPins={...pinModel(),targets:{},pinned:[],nextCursor:null,loaded:false,failed:true}
 rail({projectPins} as Partial<Parameters<typeof WorkspaceRail>[0]>)
 expect(screen.queryByRole("list",{name:"已固定"})).toBeNull()
 expect(screen.queryByText("重新读取固定项目")).toBeNull()
 expect(screen.queryByRole("alert")).toBeNull()
})


it("returning to the same route does not revive an earlier pin focus request",async()=>{
 let finish!:(value:{project_id:string,is_pinned:boolean,pinned_at:string})=>void
 const client={list:vi.fn().mockResolvedValue({items:[],next_cursor:null}),set:vi.fn(()=>new Promise<{project_id:string,is_pinned:boolean,pinned_at:string}>(resolve=>{finish=resolve}))}
 function Host(){const projectPins=useProjectPins({preview:false,boundary:{admitted:true,subject:"actor",generation:1},visibleIds:[b.id],client});return <WorkspaceRail collapsed={false} onToggleCollapse={()=>{}} onNewChat={()=>{}} chatHref="/app" projects={[{id:b.id,name:b.name,href:`/app/project/${b.id}`}]} projectListStatus="ready" projectPins={projectPins} conversations={[]} activeId={null} awaitingIds={new Set()} onSelectConversation={()=>{}} onDeleteConversation={async()=>true} onRenameConversation={()=>{}} onOpenSettings={()=>{}} listLoading={false} listError={false} hasMore={false} onLoadMore={()=>{}}/>}
 render(<ThemeProvider><LocaleProvider><Host/></LocaleProvider></ThemeProvider>)
 const trigger=within(screen.getByRole("button",{name:b.name}).closest("[data-project-id]") as HTMLElement).getByRole("button",{name:"项目选项"})
 trigger.focus();fireEvent.keyDown(trigger,{key:"ArrowDown"})
 const action=await screen.findByRole("menuitem",{name:"固定"});action.focus();fireEvent.keyDown(action,{key:"Enter",code:"Enter"})
 expect(client.set).toHaveBeenCalledOnce()
 const source=window.location.pathname
 act(()=>{window.history.pushState(null,"","/app/library");window.dispatchEvent(new Event("kokoro:surface-navigation"));window.history.pushState(null,"",source);window.dispatchEvent(new Event("kokoro:surface-navigation"))})
 act(()=>{(document.activeElement as HTMLElement).blur()})
 await act(async()=>{finish({project_id:b.id,is_pinned:true,pinned_at:"2026-10-27T00:00:00.000Z"});await Promise.resolve()})
 await waitFor(()=>expect(screen.getByRole("list",{name:"已固定"})).toBeVisible())
 await act(async()=>{await new Promise(resolve=>window.requestAnimationFrame(resolve))})
 expect(document.body).toHaveFocus()
})

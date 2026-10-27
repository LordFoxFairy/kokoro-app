import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterEach, beforeEach, expect, it, vi } from "vitest"
import { LocaleProvider } from "@/i18n/context"
import { ProjectMcpRecommendationsSection } from "@/features/app/project-mcp-recommendations-section"
import type { ProjectMcpRecommendationsModel } from "@/features/app/use-project-mcp-recommendations"
import { useProjectMcpRecommendations } from "@/features/app/use-project-mcp-recommendations"
import { createHubClient } from "@/hub/client"
import type { ProjectMcpRecommendationsClient } from "@/hub/project-mcp-recommendations-client"

beforeEach(() => window.localStorage.setItem("kokoro.locale", "zh"))
afterEach(() => { cleanup(); vi.restoreAllMocks(); window.localStorage.clear(); window.history.replaceState({}, "", "/app") })
function model(): ProjectMcpRecommendationsModel {
  const ref = { kind: "custom_api" as const, profile_id: "profile-a" }
  return { context: {}, allowed: true, configReady: true, directoryReady: true, busy: false,
    facts: { project_id: "project-a", state_version: "1", recommendations: [{ kind: "provider", provider_key: "unlisted" }] },
    options: [{ id: JSON.stringify([ref.kind, ref.profile_id]), ref, label: "真实 API 配置", search: "真实 api 配置", source: { kind: "custom_api", value: { profile_id: "profile-a", name: "真实 API 配置", state_version: "1", created_at: "2026-10-27T00:00:00Z", updated_at: "2026-10-27T00:00:00Z", environment: [] } } }],
    isCurrent: () => true, refresh: vi.fn(), save: vi.fn().mockResolvedValue("current") }
}
it("opens the project recommendation picker, retains invisible saved refs, and cancel writes nothing", async () => {
  const value = model()
  render(<LocaleProvider><ProjectMcpRecommendationsSection model={value} /></LocaleProvider>)
  fireEvent.click(screen.getByRole("button", { name: "新增" }))
  expect(await screen.findByRole("dialog", { name: "推荐连接器" })).toBeVisible()
  expect(screen.getByRole("checkbox", { name: /unlisted/ })).toBeChecked()
  fireEvent.click(screen.getByRole("checkbox", { name: "真实 API 配置" }))
  fireEvent.click(screen.getByRole("button", { name: "取消" }))
  expect(value.save).not.toHaveBeenCalled()
})
it("saves only explicit selection and preserves its draft with bounded inline conflict feedback", async () => {
  const value = model(); vi.mocked(value.save).mockResolvedValue("conflict")
  render(<LocaleProvider><ProjectMcpRecommendationsSection model={value} /></LocaleProvider>)
  fireEvent.click(screen.getByRole("button", { name: "新增" }))
  fireEvent.click(screen.getByRole("checkbox", { name: /unlisted/ }))
  fireEvent.click(screen.getByRole("checkbox", { name: "真实 API 配置" }))
  fireEvent.click(screen.getByRole("button", { name: "保存" }))
  await waitFor(() => expect(value.save).toHaveBeenCalledWith([{ kind: "custom_api", profile_id: "profile-a" }]))
  expect(await screen.findByRole("alert")).toHaveTextContent("其他修改")
  expect(screen.getByRole("checkbox", { name: "真实 API 配置" })).toBeChecked()
  expect(screen.getByRole("dialog")).toBeVisible()
})
it("read failure is quiet and not a confirmed empty directory; saved rows remain visible", () => {
  const value = { ...model(), directoryReady: false, configReady: false }
  render(<LocaleProvider><ProjectMcpRecommendationsSection model={value} /></LocaleProvider>)
  fireEvent.click(screen.getByRole("button", { name: "新增" }))
  expect(screen.getByRole("checkbox", { name: /unlisted/ })).toBeChecked()
  expect(screen.getByRole("button", { name: "保存" })).toBeDisabled()
  expect(screen.queryByText("没有匹配的连接器")).toBeNull()
  expect(value.refresh).toHaveBeenCalledOnce()
  expect(value.save).not.toHaveBeenCalled()
})

it("opening before the first configuration read checks actual saved refs when it arrives, not an implicit empty draft", () => {
  const value = model()
  const view = render(<LocaleProvider><ProjectMcpRecommendationsSection model={{ ...value, configReady: false, facts: null }} /></LocaleProvider>)
  fireEvent.click(screen.getByRole("button", { name: "新增" }))
  expect(screen.getByRole("button", { name: "保存" })).toBeDisabled()
  view.rerender(<LocaleProvider><ProjectMcpRecommendationsSection model={value} /></LocaleProvider>)
  expect(screen.getByRole("checkbox", { name: /unlisted/ })).toBeChecked()
  expect(value.save).not.toHaveBeenCalled()
})

it("closing a pending save never reopens the window or publishes its late failure into the next editor", async () => {
  const value = model()
  let finish!: (value: "conflict") => void
  vi.mocked(value.save).mockImplementation(() => new Promise(resolve => { finish = resolve }))
  render(<LocaleProvider><ProjectMcpRecommendationsSection model={value} /></LocaleProvider>)
  fireEvent.click(screen.getByRole("button", { name: "新增" }))
  fireEvent.click(screen.getByRole("button", { name: "保存" }))
  fireEvent.click(screen.getByRole("button", { name: "取消" }))
  fireEvent.click(screen.getByRole("button", { name: "新增" }))
  finish("conflict")
  await waitFor(() => expect(value.save).toHaveBeenCalledOnce())
  expect(screen.getByRole("dialog")).toBeVisible()
  expect(screen.queryByRole("alert")).toBeNull()
})

it("cancel during a real configuration hook's pending PUT returns focus to the current section without reopening or late focus theft", async () => {
  window.localStorage.setItem("kokoro.web.auth-index-subject", "pending-reader")
  window.history.replaceState({}, "", "/app/project/project-a")
  const facts = { project_id: "project-a", state_version: "1", recommendations: [] }
  let finish!: (value: typeof facts) => void
  const client: ProjectMcpRecommendationsClient = { get: vi.fn().mockResolvedValue(facts),
    replace: vi.fn<ProjectMcpRecommendationsClient["replace"]>().mockImplementation(() => new Promise(resolve => { finish = resolve })) }
  const hub = { ...createHubClient(), listMcpConnectorProviders: vi.fn().mockResolvedValue({ items: [], next_cursor: null }),
    listMcpConnectors: vi.fn().mockResolvedValue({ items: [], next_cursor: null }), listCustomApis: vi.fn().mockResolvedValue({ items: [], page: { next_cursor: null } }) }
  const boundary = { subject: "pending-reader", admitted: true, generation: 1 }
  function Harness() {
    const value = useProjectMcpRecommendations({ projectId: "project-a", boundary, enabled: true, hub, client })
    return <ProjectMcpRecommendationsSection model={value} />
  }
  render(<LocaleProvider><Harness /></LocaleProvider>)
  const opener = screen.getByRole("button", { name: "新增" })
  fireEvent.click(opener)
  await waitFor(() => expect(screen.getByRole("button", { name: "保存" })).toBeEnabled())
  fireEvent.click(screen.getByRole("button", { name: "保存" }))
  await waitFor(() => expect(opener).toBeDisabled())
  fireEvent.click(screen.getByRole("button", { name: "取消" }))
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull())
  const section = screen.getByRole("region", { name: "连接器" })
  await waitFor(() => expect(section).toHaveFocus())
  fireEvent.click(opener)
  expect(screen.queryByRole("dialog")).toBeNull()
  await act(async () => { finish(facts) })
  await waitFor(() => expect(opener).toBeEnabled())
  expect(section).toHaveFocus()
  expect(client.replace).toHaveBeenCalledOnce()
})

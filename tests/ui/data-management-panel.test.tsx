import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import type { DataManagementClient } from "@/data-management/client"
import { LocaleProvider } from "@/i18n/context"
import { DataManagementContent } from "@/ui/data-management/data-management-panel"

function client(overrides: Partial<DataManagementClient> = {}): DataManagementClient {
  return {
    summary: vi.fn().mockResolvedValue({
      sharedTasks: [],
      sharedFiles: [],
      archivedTasks: [],
      authorizedApps: [],
      cloudBrowser: { persistSignIn: false, sites: [] },
    }),
    setCloudBrowserPersistence: vi.fn().mockResolvedValue({ persistSignIn: true }),
    revokeAuthorizedApp: vi.fn().mockResolvedValue(undefined),
    removeCloudBrowserSite: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  }
}

function renderPanel(dataClient: DataManagementClient = client()) {
  window.localStorage.setItem("kokoro.locale", "zh")
  return render(
    <LocaleProvider>
      <DataManagementContent client={dataClient} />
    </LocaleProvider>,
  )
}

beforeEach(() => {
  window.history.replaceState(null, "", "/")
  window.localStorage.setItem("kokoro.locale", "zh")
})
afterEach(() => {
  cleanup()
  window.history.replaceState(null, "", "/")
  window.localStorage.clear()
})

describe("DataManagementContent", () => {
  it("renders the five Manus data-management sections instead of the artifact library", async () => {
    renderPanel()

    expect(await screen.findByRole("heading", { name: "共享的任务" })).toBeInTheDocument()
    expect(screen.getByText("尚无分享的任务。")).toBeInTheDocument()
    expect(screen.getByRole("heading", { name: "共享的文件" })).toBeInTheDocument()
    expect(screen.getByText("尚无共享文件。")).toBeInTheDocument()
    expect(screen.getByRole("heading", { name: "已封存任务" })).toBeInTheDocument()
    expect(screen.getByText("尚无已封存的任务。")).toBeInTheDocument()
    expect(screen.getByText("授权应用")).toBeInTheDocument()
    expect(screen.getByText("云端浏览器数据")).toBeInTheDocument()
    expect(screen.queryByText("作品库")).not.toBeInTheDocument()
  })

  it("opens authorized apps as an in-panel route without adding a second dialog header", async () => {
    renderPanel()
    const manageButtons = await screen.findAllByRole("button", { name: "管理" })

    fireEvent.click(manageButtons[0]!)
    expect(screen.getByText("无已授权的应用程序")).toBeInTheDocument()
    expect(screen.getByText("您授权访问账户的应用程序和服务将显示在此处。")).toBeInTheDocument()
    expect(screen.queryByRole("heading", { name: "共享的任务" })).not.toBeInTheDocument()

    expect(window.location.hash).toBe("#/account/settings/library/authorized-apps")
    expect(screen.queryByRole("button", { name: "数据管理" })).not.toBeInTheDocument()
  })

  it("opens cloud-browser data and persists the sign-in switch through the client", async () => {
    const setCloudBrowserPersistence = vi.fn().mockResolvedValue({ persistSignIn: true })
    renderPanel(client({ setCloudBrowserPersistence }))
    const manageButtons = await screen.findAllByRole("button", { name: "管理" })

    fireEvent.click(manageButtons[1]!)
    const toggle = screen.getByRole("switch", { name: "在任务间保持登录状态" })
    expect(toggle).not.toBeChecked()
    expect(screen.getByRole("heading", { name: "Cookies 和其他网站数据" })).toBeInTheDocument()
    const emptyDescription = screen.getByText("您访问过的网站的 Cookie 和其他网站数据将显示在这里")
    expect(emptyDescription).toBeInTheDocument()
    expect(emptyDescription.parentElement?.querySelector("strong")).toBeNull()

    fireEvent.click(toggle)
    await waitFor(() => expect(setCloudBrowserPersistence).toHaveBeenCalledWith(true))
    await waitFor(() => expect(toggle).toBeChecked())
  })

  it("rolls the cloud-browser switch back when persistence fails", async () => {
    const setCloudBrowserPersistence = vi.fn().mockRejectedValue(new Error("save failed"))
    renderPanel(client({ setCloudBrowserPersistence }))
    const manageButtons = await screen.findAllByRole("button", { name: "管理" })

    fireEvent.click(manageButtons[1]!)
    const toggle = screen.getByRole("switch", { name: "在任务间保持登录状态" })
    fireEvent.click(toggle)

    await waitFor(() => expect(setCloudBrowserPersistence).toHaveBeenCalledWith(true))
    await waitFor(() => expect(toggle).not.toBeChecked())
    expect(toggle).toBeEnabled()
  })
})

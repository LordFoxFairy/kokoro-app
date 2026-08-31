import { afterEach, describe, expect, it, vi } from "vitest"

import { createDataManagementClient } from "@/data-management/client"

afterEach(() => vi.unstubAllGlobals())

describe("DataManagementClient", () => {
  it("parses the BFF projection while allowing envelope request metadata", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({
      request_id: "req_fixture",
      data: {
        shared_tasks: [],
        shared_files: [],
        archived_tasks: [],
        authorized_apps: [],
        cloud_browser: { persist_sign_in: false, sites: [] },
      },
    }), { status: 200, headers: { "content-type": "application/json" } })))

    await expect(createDataManagementClient().summary()).resolves.toEqual({
      sharedTasks: [],
      sharedFiles: [],
      archivedTasks: [],
      authorizedApps: [],
      cloudBrowser: { persistSignIn: false, sites: [] },
    })
  })

  it("persists cloud-browser sign-in state through the typed PATCH endpoint", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      data: { persist_sign_in: true },
    }), { status: 200, headers: { "content-type": "application/json" } }))
    vi.stubGlobal("fetch", fetchMock)

    await expect(createDataManagementClient().setCloudBrowserPersistence(true)).resolves.toEqual({ persistSignIn: true })
    expect(fetchMock).toHaveBeenCalledWith("/api/settings/data-management/cloud-browser", expect.objectContaining({
      method: "PATCH",
      body: JSON.stringify({ persist_sign_in: true }),
    }))
  })
})

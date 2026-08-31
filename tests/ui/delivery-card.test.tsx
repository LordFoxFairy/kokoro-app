import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterEach, expect, it, vi } from "vitest"

import { LocaleProvider } from "@/i18n/context"
import { DeliverySection } from "@/ui/thread/delivery-card"

const delivery = {
  contentHash: "hash_report",
  path: "out/report.pdf",
  title: "调研报告",
  mime: "application/pdf",
  size: 2048,
  runId: "run_1",
  createdAt: "2026-07-02T00:00:01.000Z",
}

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

it("通过鉴权 Blob 下载成果，并延迟释放 object URL", async () => {
  const fetchMock = vi.fn().mockResolvedValue({
    ok: true,
    blob: async () => new Blob(["pdf"], { type: "application/pdf" }),
  })
  vi.stubGlobal("fetch", fetchMock)
  vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:delivery")
  const revoke = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {})

  render(
    <LocaleProvider>
      <DeliverySection sessionId="session_1" deliveries={[delivery]} onOpen={vi.fn()} />
    </LocaleProvider>,
  )

  fireEvent.click(screen.getByRole("button", { name: "Download" }))
  await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(
    "/api/session/sessions/session_1/deliveries/hash_report",
    { cache: "no-store" },
  ))
  expect(revoke).not.toHaveBeenCalled()
  await waitFor(() => expect(revoke).toHaveBeenCalledWith("blob:delivery"))
})

it("下载进行中锁定当前成果动作并显示进行中文案", async () => {
  let resolveFetch: ((value: { ok: boolean; blob: () => Promise<Blob> }) => void) | undefined
  const fetchMock = vi.fn().mockReturnValue(new Promise((resolve) => { resolveFetch = resolve }))
  vi.stubGlobal("fetch", fetchMock)

  render(
    <LocaleProvider>
      <DeliverySection sessionId="session_1" deliveries={[delivery]} onOpen={vi.fn()} />
    </LocaleProvider>,
  )

  const button = screen.getByRole("button", { name: "Download" })
  fireEvent.click(button)
  expect(button).toBeDisabled()
  expect(button).toHaveAttribute("aria-busy", "true")
  expect(button).toHaveTextContent("Downloading")

  resolveFetch?.({ ok: true, blob: async () => new Blob(["pdf"]) })
  await waitFor(() => expect(button).not.toBeDisabled())
})

it("状态提交前的双击也只发起一次下载", async () => {
  let resolveFetch: ((value: { ok: boolean; blob: () => Promise<Blob> }) => void) | undefined
  const fetchMock = vi.fn().mockReturnValue(new Promise((resolve) => { resolveFetch = resolve }))
  vi.stubGlobal("fetch", fetchMock)

  render(
    <LocaleProvider>
      <DeliverySection sessionId="session_1" deliveries={[delivery]} onOpen={vi.fn()} />
    </LocaleProvider>,
  )

  const button = screen.getByRole("button", { name: "Download" })
  fireEvent.click(button)
  fireEvent.click(button)
  expect(fetchMock).toHaveBeenCalledTimes(1)

  resolveFetch?.({ ok: true, blob: async () => new Blob(["pdf"]) })
  await waitFor(() => expect(button).not.toBeDisabled())
})

it("成果下载失败后把当前动作变成可重试按钮", async () => {
  const fetchMock = vi.fn().mockRejectedValue(new Error("network down"))
  vi.stubGlobal("fetch", fetchMock)

  render(
    <LocaleProvider>
      <DeliverySection sessionId="session_1" deliveries={[delivery]} onOpen={vi.fn()} />
    </LocaleProvider>,
  )

  const button = screen.getByRole("button", { name: "Download" })
  fireEvent.click(button)

  await waitFor(() => {
    expect(screen.getByRole("alert")).toHaveTextContent("Download failed")
    expect(screen.getByRole("button", { name: "Retry download" })).toBeInTheDocument()
  })
  expect(fetchMock).toHaveBeenCalledTimes(1)

  fireEvent.click(screen.getByRole("button", { name: "Retry download" }))
  await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2))
})

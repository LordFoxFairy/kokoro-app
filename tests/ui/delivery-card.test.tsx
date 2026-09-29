import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterEach, expect, it, vi } from "vitest"

vi.mock("@/features/app/kokoro-library-artifact-client", () => ({
  beginLibraryArtifactDownload: vi.fn(),
}))

import { beginLibraryArtifactDownload } from "@/features/app/kokoro-library-artifact-client"
import { LocaleProvider } from "@/i18n/context"
import { DeliverySection } from "@/ui/thread/delivery-card"

const delivery = {
  conversationId: "session_1", artifactId: "artifact_1", assetId: "asset_1", artifactKind: "document" as const,
  title: "Report", mime: "application/pdf", size: 2048, runId: "run_1", createdAt: "2026-07-02T00:00:01.000Z",
}
const download = vi.mocked(beginLibraryArtifactDownload)

afterEach(() => { cleanup(); vi.clearAllMocks(); vi.unstubAllGlobals() })

it("uses the owner binary selector and native download helper, never the old hash Blob path", async () => {
  download.mockResolvedValue()
  const fetchMock = vi.fn()
  vi.stubGlobal("fetch", fetchMock)
  render(<LocaleProvider><DeliverySection sessionId="session_1" deliveries={[delivery]} onOpen={vi.fn()} /></LocaleProvider>)
  fireEvent.click(screen.getByRole("button", { name: "Download" }))
  await waitFor(() => expect(download).toHaveBeenCalledWith(delivery, expect.any(AbortSignal)))
  expect(fetchMock).not.toHaveBeenCalled()
})

it("shows retry after owner detail preflight failure", async () => {
  let reject: ((error: Error) => void) | undefined
  download.mockReturnValueOnce(new Promise((_resolve, rejectPromise) => { reject = rejectPromise }))
  render(<LocaleProvider><DeliverySection sessionId="session_1" deliveries={[delivery]} onOpen={vi.fn()} /></LocaleProvider>)
  const button = screen.getByRole("button", { name: "Download" })
  fireEvent.click(button)
  expect(download).toHaveBeenCalledTimes(1)
  reject?.(new Error("not found"))
  await waitFor(() => expect(screen.getByRole("button", { name: "Retry download" })).toBeInTheDocument())
  expect(screen.getByRole("alert")).toHaveTextContent("Download failed")
})

it("shows the Library creations deep link when snapshot has older deliveries", () => {
  render(<LocaleProvider><DeliverySection sessionId="session_1" deliveries={[delivery]} hasMore onOpen={vi.fn()} /></LocaleProvider>)
  expect(screen.getByRole("link", { name: "View all creations" })).toHaveAttribute("href", "/app/library?tab=artifacts")
})

it("cancels an in-flight owner detail preflight without showing a download failure", async () => {
  download.mockImplementationOnce((_selector, signal) => new Promise((_resolve, reject) => {
    signal.addEventListener("abort", () => reject(new DOMException("Cancelled", "AbortError")), { once: true })
  }))
  render(<LocaleProvider><DeliverySection sessionId="session_1" deliveries={[delivery]} onOpen={vi.fn()} /></LocaleProvider>)
  fireEvent.click(screen.getByRole("button", { name: "Download" }))
  const signal = download.mock.calls[0]?.[1]
  expect(signal?.aborted).toBe(false)
  fireEvent.click(screen.getByRole("button", { name: "Cancel download" }))
  expect(signal?.aborted).toBe(true)
  await waitFor(() => expect(screen.getByRole("button", { name: "Download" })).toBeInTheDocument())
  expect(screen.queryByRole("alert")).not.toBeInTheDocument()
})

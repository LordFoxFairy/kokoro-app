import { createHash, webcrypto } from "node:crypto"
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react"
import { afterEach, expect, it, vi } from "vitest"
import { LibraryArtifactDetail } from "@/features/app/kokoro-library-artifact-detail"
import { LocaleProvider } from "@/i18n/context"

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  window.localStorage.removeItem("kokoro.web.auth-index-subject")
  window.localStorage.removeItem("kokoro.locale")
})

it("opens verified content only on Preview, reuses the exact detail, and keeps source/download", async () => {
  window.localStorage.setItem("kokoro.locale", "en")
  window.localStorage.setItem("kokoro.web.auth-index-subject", "preview-reader")
  vi.stubGlobal("crypto", webcrypto)
  const bytes = new TextEncoder().encode("# Verified artifact body")
  const detail = {
    conversationId: "session_1", artifactId: "artifact_text", assetId: "asset_text", projectRef: null,
    artifactKind: "document" as const, title: "Delivered report", filename: "report.md", mimeType: "text/markdown",
    sizeBytes: String(bytes.length), deliveredAt: "2026-10-25T00:00:00Z", sourceRunId: "run_1", favorited: false,
    contentSha256: createHash("sha256").update(bytes).digest("hex"),
  }
  const read = vi.fn().mockResolvedValue(detail)
  const fetchContent = vi.fn().mockResolvedValue(new Response(bytes, {
    headers: { "content-type": "text/markdown", "content-length": detail.sizeBytes },
  }))
  vi.stubGlobal("fetch", fetchContent)
  render(<LocaleProvider><LibraryArtifactDetail artifact={detail} read={read} admitted generation={1}
    boundary={{ admitted: true, subject: "preview-reader", generation: 1 }}
    onClose={vi.fn()} onReturnFocus={vi.fn()} onDownload={vi.fn()} downloadState={undefined} onOpenSource={vi.fn()} /></LocaleProvider>)
  const dialog = within(screen.getByRole("dialog"))
  expect(await dialog.findByRole("heading", { name: detail.title })).toBeVisible()
  expect(fetchContent).not.toHaveBeenCalled()
  fireEvent.click(dialog.getByRole("button", { name: "Preview" }))
  expect(await dialog.findByRole("heading", { name: "Verified artifact body" })).toBeVisible()
  expect(read).toHaveBeenCalledOnce()
  expect(fetchContent.mock.calls.map(([path]) => path)).toEqual(["/api/hub/library/artifacts/session_1/artifact_text/content"])
  expect(dialog.getByRole("button", { name: "Download" })).toBeEnabled()
  expect(dialog.getByRole("button", { name: "Open source session" })).toBeEnabled()
})

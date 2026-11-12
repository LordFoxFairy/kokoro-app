import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, expect, it } from "vitest"
import { LocaleProvider } from "@/i18n/context"
import { TextPreviewBody } from "@/ui/thread/artifact-card"

afterEach(() => {
  cleanup()
  window.localStorage.removeItem("kokoro.locale")
})

it("CSV 预览保留引号内逗号、转义引号和 CRLF", () => {
  const csv = 'name,location\r\n"Acme, Inc.","New York, NY"\r\n"She said ""hi""",Paris\r\n'
  render(<TextPreviewBody text={csv} mime="text/csv" />, { wrapper: LocaleProvider })
  expect(screen.getByText("New York, NY")).toBeInTheDocument()
  expect(screen.getByText("Acme, Inc.")).toBeInTheDocument()
  expect(screen.getByText('She said "hi"')).toBeInTheDocument()
})

it("CSV 超出表格复杂度时提示下载，不渲染前 200 行作为完整结果", () => {
  window.localStorage.setItem("kokoro.locale", "zh")
  const csv = Array.from({ length: 201 }, (_, i) => `row-${i},value`).join("\n")
  render(<TextPreviewBody text={csv} mime="text/csv" />, { wrapper: LocaleProvider })
  expect(screen.getByText("无法预览，请下载查看。")).toBeVisible()
  expect(screen.queryByRole("table")).not.toBeInTheDocument()
  expect(screen.queryByText("row-0")).not.toBeInTheDocument()
})

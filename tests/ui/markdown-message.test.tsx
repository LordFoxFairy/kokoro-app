import { cleanup, render, screen, within } from "@testing-library/react"
import { afterEach, expect, it } from "vitest"

import { MarkdownMessage } from "@/ui/thread/markdown-message"

afterEach(cleanup)

it("renders tool-result resources as text without link navigation, image loads or image preloads", () => {
  const { container } = render(<MarkdownMessage resourcePolicy="text-only" content={[
    "[External](https://example.test/private) [Relative](/account/delete) [Email](mailto:reader@example.test)",
    "",
    "![Remote](https://example.test/pixel) ![Local](file:///private/image.png)",
    "",
    "`[code link](https://example.test)`",
  ].join("\n")} />)
  expect(container).toHaveTextContent("External Relative Email")
  expect(container).toHaveTextContent("Remote Local")
  expect(container.querySelector("a,img,link")).toBeNull()
  expect(document.head.querySelector('link[rel="preload"][as="image"]')).toBeNull()
  expect(container.querySelector("code")).toHaveTextContent("[code link](https://example.test)")
})

it.each([
  ["unsupported sandbox scheme", "sandbox:/mnt/data/report.md"],
  ["private file scheme", "file:///private/report.md"],
  ["script scheme", "javascript:alert%281%29"],
  ["data scheme", "data:text/html,not-public"],
  ["empty destination", ""],
  ["whitespace-only destination", "   "],
])("keeps %s as inline content, not a false download link", (_case, destination) => {
  const { container } = render(<MarkdownMessage content={`Before [**Download** report](${destination}) after.`} />)

  expect(screen.getByText("Download", { selector: "strong" })).toBeInTheDocument()
  expect(container).toHaveTextContent("Before Download report after.")
  expect(screen.queryByRole("link")).not.toBeInTheDocument()
  expect(container.querySelector("a")).toBeNull()
})

it.each([
  "http://example.test/report",
  "https://example.test/report?q=1",
  "mailto:reader@example.test",
  "/docs/report",
  "./report.md",
  "../report.md",
  "#report",
])("preserves the existing safe link behavior for %s", (destination) => {
  render(<MarkdownMessage content={`[Open report](${destination})`} />)

  const link = screen.getByRole("link", { name: "Open report" })
  expect(link).toHaveAttribute("href", destination)
  expect(link).toHaveAttribute("target", "_blank")
  expect(link).toHaveAttribute("rel", "noopener noreferrer nofollow")
})

it("keeps raw HTML inert and GFM, emphasis, and fenced code intact", () => {
  const { container } = render(<MarkdownMessage content={[
    '<script>alert("fixture")</script>',
    '<a href="javascript:alert(1)">raw link</a>',
    "",
    "| Result | State |",
    "| --- | --- |",
    "| **report** | ~~old~~ |",
    "",
    "```text",
    "[code only](sandbox:/report.md)",
    "```",
  ].join("\n")} />)

  expect(container.querySelector("script, a")).toBeNull()
  expect(container).toHaveTextContent('<script>alert("fixture")</script>')
  const table = screen.getByRole("table")
  expect(within(table).getByText("report", { selector: "strong" })).toBeInTheDocument()
  expect(within(table).getByText("old", { selector: "del" })).toBeInTheDocument()
  expect(container.querySelector("pre code")).toHaveTextContent("[code only](sandbox:/report.md)")
})

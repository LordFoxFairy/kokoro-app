import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, expect, it } from "vitest"

import { BrandFallback, BrandMark } from "@/components/blocks/brand-mark/brand-mark"

afterEach(() => cleanup())

it("运行时 Logo 加载失败时回退到站点文字标记", () => {
  render(<BrandMark logoUrl="https://assets.example/logo.svg" imageClassName="logo" fallback="心" />)

  const image = screen.getByRole("presentation")
  fireEvent.error(image)

  expect(screen.queryByRole("img", { hidden: true })).not.toBeInTheDocument()
  expect(screen.getByText("心")).toBeInTheDocument()
})

it("站点切换到新的 Logo URL 后重新尝试加载资源", () => {
  const { rerender } = render(<BrandMark logoUrl="https://assets.example/old.svg" imageClassName="logo" fallback="旧" />)
  fireEvent.error(screen.getByRole("presentation"))
  expect(screen.getByText("旧")).toBeInTheDocument()

  rerender(<BrandMark logoUrl="https://assets.example/new.svg" imageClassName="logo" fallback="新" />)
  expect(screen.getByRole("presentation")).toHaveAttribute("src", "https://assets.example/new.svg")
})

it("旧默认心字符统一映射为中性产品标记，自定义租户标记保持原值", () => {
  const { container, rerender } = render(<BrandFallback mark="心" />)
  expect(container.querySelector(".lucide-audio-waveform")).toBeInTheDocument()
  expect(screen.queryByText("心")).toBeNull()

  rerender(<BrandFallback mark="AC" />)
  expect(screen.getByText("AC")).toBeInTheDocument()
  expect(container.querySelector(".lucide-audio-waveform")).toBeNull()
})

import { render, screen } from "@testing-library/react"
import { expect, it } from "vitest"

import { RuntimeLoading } from "@/ui/auth/runtime-loading"

it("在运行时闸门等待期间显示可感知的 shadcn loading 状态", () => {
  render(<RuntimeLoading label="正在加载工作区" />)

  expect(screen.getByRole("main", { name: "正在加载工作区" })).toBeInTheDocument()
  expect(screen.getByText("正在加载工作区")).toBeInTheDocument()
  expect(screen.getByTestId("runtime-loading")).toBeInTheDocument()
})

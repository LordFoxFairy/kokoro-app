import { render, screen } from "@testing-library/react"
import { expect, it } from "vitest"

import SignOutPage from "@/app/auth/sign-out/page"

it("renders a single terminal action for a failed sign-out", async () => {
  render(await SignOutPage({ searchParams: Promise.resolve({ failed: "1" }) }))

  expect(screen.getByRole("heading", { level: 1, name: "退出失败" })).toBeInTheDocument()
  expect(screen.getByText("这次退出没有完成，请重新登录后再试。")).toBeInTheDocument()
  expect(screen.getByRole("link", { name: "登录" })).toHaveAttribute("href", "/login")
  expect(screen.getByRole("link", { name: "返回首页" })).toHaveAttribute("href", "/")
  expect(screen.queryByRole("button", { name: "退出登录" })).toBeNull()
  expect(screen.queryByRole("form")).toBeNull()
})

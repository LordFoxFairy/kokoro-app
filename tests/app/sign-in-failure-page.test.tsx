import { render, screen } from "@testing-library/react"
import { expect, it } from "vitest"

import SignInFailurePage from "@/app/auth/sign-in/failed/page"

it("offers explicit product navigation without an automatic login form or replay", () => {
  const { container } = render(<SignInFailurePage />)
  expect(screen.getByRole("heading", { level: 1, name: "登录暂未完成" })).toBeInTheDocument()
  expect(screen.getByRole("link", { name: "返回登录" })).toHaveAttribute("href", "/login")
  expect(screen.getByRole("link", { name: "返回首页" })).toHaveAttribute("href", "/")
  expect(container.querySelector("form")).toBeNull()
  expect(container.querySelector("script")).toBeNull()
  expect(container.querySelector("input")).toBeNull()
})

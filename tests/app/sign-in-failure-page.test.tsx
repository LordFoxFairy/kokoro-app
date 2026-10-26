import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, beforeEach, expect, it, vi } from "vitest"

const proof = vi.hoisted(() => ({
  config: true,
  host: "web.example.test",
  state: "absent",
  accessExpiresAt: 0,
  unavailable: false,
  inspect: vi.fn(),
  redirect: vi.fn(),
}))
vi.mock("next/headers", () => ({ headers: async () => new Headers({ host: proof.host, cookie: "synthetic-product-cookie" }) }))
vi.mock("next/navigation", () => ({ redirect: (target: string) => { proof.redirect(target); throw new Error(`redirect:${target}`) } }))
vi.mock("@/lib/server/oidc-provider", () => ({ oidcRpConfig: () => proof.config ? {
  redisUrl: "redis://fixture.invalid", authSecret: "synthetic-only", relay: { webOrigin: "https://web.example.test" },
} : null }))
vi.mock("@/lib/server/product-session", () => ({ activeProductSession: (...args: unknown[]) => {
  proof.inspect(...args)
  if (proof.unavailable) throw new Error("controlled store failure")
  return Promise.resolve(proof.state === "active" && proof.accessExpiresAt > Date.now() ? { accessExpiresAt: proof.accessExpiresAt } : null)
} }))
vi.mock("@/ui/auth/sign-in-recovery", () => ({ SignInRecovery: () => <section><h1>恢复工作区</h1><button>检查并继续</button><a href="/login">重新登录</a></section> }))
import SignInFailurePage from "@/app/auth/sign-in/failed/page"

beforeEach(() => { Object.assign(proof, { config: true, host: "web.example.test", state: "absent", accessExpiresAt: 0, unavailable: false }); vi.clearAllMocks() })
afterEach(cleanup)

it("returns a current active Session from the old failure URL to fixed /app without catching the redirect", async () => {
  proof.state = "active"; proof.accessExpiresAt = Date.now() + 60_000
  await expect(Promise.resolve().then(() => SignInFailurePage())).rejects.toThrow("redirect:/app")
  expect(proof.inspect).toHaveBeenCalledOnce()
  expect(proof.redirect).toHaveBeenCalledExactlyOnceWith("/app")
})

it.each(["absent", "refreshing", "stale", "unconfirmed", "expired", "exception", "host", "configuration"])("keeps explicit GET-only recovery for %s, without an automatic login form or native replay", async kind => {
  proof.state = kind === "expired" ? "active" : kind
  proof.accessExpiresAt = kind === "expired" ? Date.now() - 1 : Date.now() + 60_000
  if (kind === "exception") proof.unavailable = true
  if (kind === "host") proof.host = "wrong.example.test"
  if (kind === "configuration") proof.config = false
  const { container } = render(await SignInFailurePage())
  expect(screen.getByRole("heading", { level: 1, name: "恢复工作区" })).toBeInTheDocument()
  expect(screen.getByRole("link", { name: "重新登录" })).toHaveAttribute("href", "/login")
  expect(screen.queryByRole("link", { name: "返回首页" })).not.toBeInTheDocument()
  expect(container.querySelector("form")).toBeNull()
  expect(container.querySelector("script")).toBeNull()
  expect(container.querySelector("input")).toBeNull()
  expect(proof.redirect).not.toHaveBeenCalled()
  expect(proof.inspect).toHaveBeenCalledTimes(kind === "host" || kind === "configuration" ? 0 : 1)
})

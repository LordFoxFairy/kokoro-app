import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, beforeEach, expect, it, vi } from "vitest"

const proof = vi.hoisted(() => ({
  config: true,
  host: "web.example.test",
  native: false,
  nativeAdmitted: false,
  unavailable: false,
  inspect: vi.fn(),
  redirect: vi.fn(),
}))
vi.mock("next/headers", () => ({ headers: async () => new Headers({ host: proof.host, cookie: "kokoro-issuer.session_token=native" }) }))
vi.mock("next/navigation", () => ({ redirect: (target: string) => { proof.redirect(target); throw new Error(`redirect:${target}`) } }))
vi.mock("@/lib/server/product-bff", () => ({
  nativeProductBffConfig: () => proof.config ? { bffBaseUrl: "http://bff.test", domain: "product.test", internalSecret: null, session: { webOrigin: "https://web.example.test" } } : null,
  nativeSessionBffHeaders: () => proof.native ? { state: "valid", headers: new Headers({ cookie: "kokoro-issuer.session_token=native" }) } : { state: "missing" },

}))
vi.mock("@/lib/server/browser-auth-session", () => ({ readBrowserAuthSession: () => {
  proof.inspect()
  if (proof.unavailable) throw new Error("controlled native failure")
  return Promise.resolve(proof.nativeAdmitted ? { authenticated: true, subject: "native-user", tenant_id: "tenant", expires_at: "2030-01-01T00:00:00Z" } : { authenticated: false })
} }))
vi.mock("@/ui/auth/sign-in-recovery", () => ({ SignInRecovery: () => <section><h1>恢复工作区</h1><button>检查并继续</button><a href="/login">重新登录</a></section> }))
import SignInFailurePage from "@/app/auth/sign-in/failed/page"

beforeEach(() => { Object.assign(proof, { config: true, host: "web.example.test", native: false, nativeAdmitted: false, unavailable: false }); vi.clearAllMocks() })
afterEach(cleanup)

it("redirects a native IAM-admitted session from the failure URL to fixed /app", async () => {
  proof.native = true
  proof.nativeAdmitted = true
  await expect(Promise.resolve().then(() => SignInFailurePage())).rejects.toThrow("redirect:/app")
  expect(proof.redirect).toHaveBeenCalledExactlyOnceWith("/app")
  expect(proof.inspect).toHaveBeenCalledOnce()
})

it.each(["missing-cookie", "invalid-or-unadmitted", "exception", "host", "configuration"])("keeps explicit GET-only recovery for %s", async kind => {
  proof.native = kind === "invalid-or-unadmitted" || kind === "exception"
  proof.nativeAdmitted = false
  if (kind === "exception") proof.unavailable = true
  if (kind === "host") proof.host = "wrong.example.test"
  if (kind === "configuration") proof.config = false
  const { container } = render(await SignInFailurePage())
  expect(screen.getByRole("heading", { level: 1, name: "恢复工作区" })).toBeInTheDocument()
  expect(screen.getByRole("link", { name: "重新登录" })).toHaveAttribute("href", "/login")
  expect(container.querySelector("form")).toBeNull()
  expect(container.querySelector("script")).toBeNull()
  expect(container.querySelector("input")).toBeNull()
  expect(proof.redirect).not.toHaveBeenCalled()
  expect(proof.inspect).toHaveBeenCalledTimes(kind === "host" || kind === "configuration" || kind === "missing-cookie" ? 0 : 1)
})

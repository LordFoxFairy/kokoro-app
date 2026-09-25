import { chromium, expect as browserExpect } from "@playwright/test"
import { describe, expect, it } from "vitest"

import { invitationPreviewPage, invitationSignInPage } from "@/lib/server/iam-invitation-page"

const LOGIN_HTML = invitationSignInPage({ action: "/iam/interactions/invitation?id=01234567-89ab-4cde-8f01-23456789abcd",
  signInToken: "sign-in-proof", signUpToken: "sign-up-proof" })

describe("invitation interaction visual layout", () => {
  it.each([
    ["desktop", 1280, 800],
    ["mobile", 390, 844],
  ] as const)("keeps the %s login compact and usable", async (name, width, height) => {
    const browser = await chromium.launch({ headless: true })
    try {
      const page = await browser.newPage({ viewport: { width, height } })
      await page.setContent(LOGIN_HTML)
      const heading = page.getByRole("heading", { name: "加入 Kokoro" })
      const firstField = page.getByLabel("邮箱", { exact: true }).first()
      const submit = page.getByRole("button", { name: "登录并查看邀请" })
      await browserExpect(heading).toBeVisible()
      await browserExpect(firstField).toBeVisible()
      await browserExpect(submit).toBeVisible()
      const card = await page.locator(".content").boundingBox()
      expect(card).not.toBeNull()
      if (card === null) throw new Error("invitation content missing")
      expect(card.width).toBeLessThanOrEqual(450)
      expect(card.y).toBeLessThan(height * 0.38)
      expect(card.x).toBeGreaterThanOrEqual(0)
      expect(card.x + card.width).toBeLessThanOrEqual(width)
      const screenshot = process.env.KOKORO_CAPTURE_INVITATION
      if (screenshot) await page.screenshot({ path: `${screenshot}-${name}.png`, fullPage: true })
      await page.getByText("没有账号？创建 Kokoro 账号").click()
      await browserExpect(page.getByRole("button", { name: "创建账号" })).toBeVisible()
      await page.close()
    } finally { await browser.close() }
  })

  it("escapes owner-provided preview fields before they reach DOM", async () => {
    const html = invitationPreviewPage({ action: "/iam/interactions/invitation?id=01234567-89ab-4cde-8f01-23456789abcd",
      acceptToken: "accept-proof", rejectToken: "reject-proof", tenantName: "<script>alert(1)</script>", roles: ["member"],
      expiresAt: "2026-10-01T12:00:00Z" })
    expect(html).not.toContain("<script>alert(1)</script>")
    expect(html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;")
  })

  it("opens the registration panel at its own error and does not restore a password", async () => {
    const browser = await chromium.launch({ headless: true })
    try {
      const page = await browser.newPage({ viewport: { width: 390, height: 844 } })
      await page.setContent(invitationSignInPage({ action: "/iam/interactions/invitation?id=01234567-89ab-4cde-8f01-23456789abcd",
        signInToken: "sign-in-proof", signUpToken: "sign-up-proof", failedAction: "sign-up",
        name: "New Member", email: "new@example.test", message: "未能创建账号，请检查填写的信息。" }))
      const registration = page.locator("details.invitation-register")
      await browserExpect(registration).toHaveAttribute("open", "")
      await browserExpect(registration.getByRole("alert")).toBeVisible()
      await browserExpect(registration.getByLabel("姓名")).toHaveValue("New Member")
      await browserExpect(registration.getByLabel("邮箱")).toHaveValue("new@example.test")
      await browserExpect(registration.getByLabel("密码")).toHaveValue("")
      await page.close()
    } finally { await browser.close() }
  })
})

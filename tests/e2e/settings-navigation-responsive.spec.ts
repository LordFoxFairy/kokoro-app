import { expect, test, type Locator } from "@playwright/test";

// A CSS-hidden destination still exists in jsdom. Check its rendered bounds
// through the user's More-menu, keyboard and resize journey instead.
test("settings keeps Skills and later destinations visible through compact navigation and resize", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.addInitScript(() => localStorage.setItem("kokoro.locale", "zh"));
  await page.goto("/app#/account/settings/skills");
  const modal = page.getByTestId("settings-modal");
  const expectRevealed = async (tab: Locator) => {
    await expect(tab).toHaveAttribute("aria-selected", "true");
    await expect(tab).toBeVisible();
    await expect.poll(() => tab.evaluate((element) => {
      const rail = element.closest('[role="tablist"]')!;
      const item = element.getBoundingClientRect();
      const viewport = rail.getBoundingClientRect();
      return item.width > 0 && item.left >= viewport.left - 1
        && item.right <= viewport.right + 1
        && item.top >= viewport.top - 1 && item.bottom <= viewport.bottom + 1;
    })).toBe(true);
  };
  await expectRevealed(modal.getByRole("tab", { name: "技能", exact: true }));
  const more = modal.getByRole("button", { name: "更多设置分区" });
  await more.click();
  await expect(modal.getByRole("menuitem", { name: "账户", exact: true })).toBeVisible();
  await expect(modal.getByRole("menuitem", { name: "技能", exact: true })).toHaveCount(0);
  await modal.getByRole("menuitem", { name: "集成", exact: true }).click();
  const integration = modal.getByRole("tab", { name: "集成", exact: true });
  await expectRevealed(integration);
  for (const width of [320, 768, 767, 390]) {
    await page.setViewportSize({ width, height: 844 });
    await expectRevealed(integration);
    await expect.poll(() => modal.evaluate(el => el.scrollWidth <= el.clientWidth + 1)).toBe(true);
  }
  await integration.focus();
  await page.keyboard.press("ArrowRight");
  const developer = modal.getByRole("tab", { name: "开发者", exact: true });
  await expect(developer).toBeFocused();
  await expectRevealed(developer);
  await page.screenshot({ path: testInfo.outputPath("settings-compact-navigation.png") });
});

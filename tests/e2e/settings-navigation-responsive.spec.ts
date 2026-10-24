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
    // Leave More open while entering the desktop layout: its portalled list
    // must retire with the compact trigger, not lose its CSS over the panel.
    if (width === 768) {
      await more.press("ArrowDown");
      await expect(modal.getByRole("menuitem", { name: "账户", exact: true })).toBeFocused();
    }
    await page.setViewportSize({ width, height: 844 });
    await expectRevealed(integration);
    await expect.poll(() => modal.evaluate(el => el.scrollWidth <= el.clientWidth + 1)).toBe(true);
    if (width === 768) {
      await expect(modal.getByRole("menu")).toHaveCount(0);
      await expect(integration).toBeFocused();
    }
  }
  await integration.focus();
  await page.keyboard.press("ArrowRight");
  const developer = modal.getByRole("tab", { name: "开发者", exact: true });
  await expect(developer).toBeFocused();
  await expectRevealed(developer);
  await page.screenshot({ path: testInfo.outputPath("settings-compact-navigation.png") });
  await modal.getByRole("button", { name: "关闭设置", exact: true }).click();
  await page.setViewportSize({ width: 1280, height: 720 });
  const shell = page.locator('[data-slot="sidebar-wrapper"]');
  await expect(shell).not.toHaveAttribute("data-narrow-web", "true");
  const expand = page.getByRole("button", { name: "展开侧栏", exact: true });
  if (await expand.isVisible()) await expand.click();
  await expect(shell).toHaveAttribute("data-rail-collapsed", "false");
  const separator = page.getByRole("separator", { name: "调整侧栏宽度" });
  await separator.hover();
  // Expanded state commits before the width transition ends. Hover can return
  // during that transition; stale coordinates can hit a navigation row instead.
  await expect.poll(() => separator.evaluate(element => {
    const handle = element.getBoundingClientRect();
    const shell = element.closest('[data-slot="sidebar-wrapper"]')!.getBoundingClientRect();
    return Math.abs(handle.x + handle.width / 2 - shell.x - Number(element.getAttribute("aria-valuenow"))) < 1;
  })).toBe(true);
  const handle = await separator.boundingBox();
  if (!handle) throw new Error("Rail resize handle is missing");
  await page.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2);
  await page.mouse.down();
  await expect(page.locator('[data-slot="sidebar-wrapper"]')).toHaveAttribute("data-rail-resizing", "true");
  await page.mouse.move(440, handle.y + handle.height / 2);
  await page.mouse.up();
  await expect(separator).toHaveAttribute("aria-valuenow", "440");
  for (const width of [800, 768]) {
    await page.setViewportSize({ width, height: 600 });
    await expect(separator).toHaveAttribute("aria-valuenow", String(width - 420));
    await expect.poll(() => page.locator('[data-slot="sidebar-inset"]').evaluate(el => el.getBoundingClientRect().width)).toBeGreaterThanOrEqual(419);
  }
  await page.setViewportSize({ width: 600, height: 600 });
  await expect(shell).toHaveAttribute("data-narrow-web", "true");
  await expand.focus();
  await expect(expand).toBeFocused();
  await page.setViewportSize({ width: 1280, height: 720 });
  await expect(shell).not.toHaveAttribute("data-narrow-web", "true");
  await expect(page.getByRole("button", { name: "收起侧栏", exact: true })).toBeFocused();
  await expect(separator).toHaveAttribute("aria-valuenow", "440");
  await page.screenshot({ path: testInfo.outputPath("sidebar-restored-preference.png") });
});

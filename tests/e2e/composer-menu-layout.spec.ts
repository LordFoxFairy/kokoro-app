import { expect, test } from "@playwright/test";

for (const locale of ["en", "zh"]) {
  for (const width of [1000, 320]) {
    test(`model menu preserves long ${locale} labels and keyboard choice at ${width}px`, async ({ page }, testInfo) => {
      await page.setViewportSize({ width, height: 772 });
      await page.addInitScript(locale => localStorage.setItem("kokoro.locale", locale), locale);
      await page.goto("/app", { waitUntil: "domcontentloaded" });
      const trigger = page.locator('[data-composer-control="model"]');
      await expect(trigger).toBeVisible();
      await trigger.click();
      const menu = page.getByRole("menu");
      const choices = menu.getByRole("menuitemradio");
      await expect(choices).toHaveCount(2);
      const targetLabel = (await choices.nth(1).innerText()).trim();
      const coarse = await page.evaluate(() => matchMedia("(pointer: coarse)").matches);
      for (const choice of await choices.all()) {
        expect((await choice.boundingBox())!.height).toBeGreaterThanOrEqual(coarse ? 44 : 36);
      }
      await expect(menu.locator('[role="menuitemradio"][aria-checked="true"]')).toHaveCount(1);
      const emphasis = await choices.evaluateAll(nodes => nodes.map(node => ({
        checked: node.getAttribute("aria-checked") === "true", weight: Number.parseFloat(getComputedStyle(node).fontWeight),
      })));
      expect(emphasis.find(item => item.checked)!.weight).toBeGreaterThan(emphasis.find(item => !item.checked)!.weight);

      // Display-only CSS fixture on the existing preview UI: no candidate,
      // raw selection key, engine state or owner response is changed.
      const prefix = (locale === "zh" ? "模型".repeat(128) : "Common catalogue model ".repeat(16)).slice(0, 254);
      const labels = [prefix + "A", prefix + "B"];
      await menu.locator('[data-slot="composer-option-label"]').evaluateAll((nodes, labels) => {
        nodes.forEach((node, index) => { node.textContent = labels[index]!; });
      }, labels);
      for (let index = 0; index < labels.length; index++) {
        const choice = choices.nth(index);
        await expect(choice).toHaveAccessibleName(labels[index]!);
        await choice.scrollIntoViewIfNeeded();
        const text = await choice.locator('[data-slot="composer-option-label"]').evaluate(element => {
          const range = document.createRange();
          range.selectNodeContents(element);
          const label = element.getBoundingClientRect();
          const content = range.getBoundingClientRect();
          return { lines: range.getClientRects().length, clipped: element.scrollWidth > element.clientWidth + 1,
            contained: content.left >= label.left - 1 && content.right <= label.right + 1 &&
              content.top >= label.top - 1 && content.bottom <= label.bottom + 1 };
        });
        expect(text.lines).toBeGreaterThan(1);
        expect(text.clipped).toBe(false);
        expect(text.contained).toBe(true);
      }
      const bounds = (await menu.boundingBox())!;
      expect(bounds.x).toBeGreaterThanOrEqual(11);
      expect(bounds.x + bounds.width).toBeLessThanOrEqual(width - 11);
      expect(bounds.y).toBeGreaterThanOrEqual(11);
      expect(bounds.y + bounds.height).toBeLessThanOrEqual(761);
      await page.screenshot({ path: testInfo.outputPath(`model-menu-${locale}-${width}.png`), fullPage: true });
      await choices.first().press("Home");
      await expect(choices.first()).toBeFocused();
      await page.keyboard.press("ArrowDown");
      await expect(choices.nth(1)).toBeFocused();
      await page.keyboard.press("Enter");
      await expect(menu).toHaveCount(0);
      await expect(trigger).toBeFocused();
      await expect(trigger).toContainText(targetLabel);
      await trigger.press("ArrowDown");
      await expect(page.getByRole("menu").getByRole("menuitemradio", { name: targetLabel, exact: true })).toHaveAttribute("aria-checked", "true");
      await page.keyboard.press("Escape");
      await expect(trigger).toBeFocused();
    });
  }
}

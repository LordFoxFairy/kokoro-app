import { expect, test } from "@playwright/test";

// Content width, not a translated label's character count, owns the layout.
for (const language of [
  { locale: "zh", browse: "浏览连接器" },
  { locale: "en", browse: "Browse connectors" },
  { locale: "de", browse: "Konnektoren durchsuchen" },
]) {
  for (const width of [1000, 320]) {
    test(`connector actions contain ${language.locale} text at ${width}px`, async ({ page }, testInfo) => {
      await page.setViewportSize({ width, height: 772 });
      await page.addInitScript(locale => localStorage.setItem("kokoro.locale", locale), language.locale);
      await page.goto("/app#settings/mcp", { waitUntil: "domcontentloaded" });
      const surface = page.getByTestId("mcp-projection-read");
      const browse = surface.locator('[data-settings-control="browse"]');
      const create = surface.locator('[data-settings-control="create"]');
      await expect(browse).toHaveText(language.browse);
      await expect(create).toBeVisible();
      const layout = await surface.evaluate(element => {
        const controls = Array.from(element.querySelectorAll<HTMLButtonElement>("[data-settings-control]"));
        const bounds = controls.map(button => {
          const box = button.getBoundingClientRect();
          const text = document.createRange();
          text.selectNodeContents(button);
          const content = text.getBoundingClientRect();
          return { left: box.left, right: box.right, top: box.top, bottom: box.bottom,
            contained: content.left >= box.left - 1 && content.right <= box.right + 1 &&
              content.top >= box.top - 1 && content.bottom <= box.bottom + 1 };
        });
        const [first, second] = bounds;
        const search = element.querySelector('input[type="search"]')!.getBoundingClientRect();
        return { contained: bounds.every(box => box.contained),
          disjoint: !!first && !!second && (first.right <= second.left || second.right <= first.left ||
            first.bottom <= second.top || second.bottom <= first.top),
          searchWidth: search.width, overflow: element.scrollWidth > element.clientWidth };
      });
      expect(layout.contained).toBe(true);
      expect(layout.disjoint).toBe(true);
      expect(layout.searchWidth).toBeGreaterThanOrEqual(160);
      expect(layout.overflow).toBe(false);
      await surface.getByRole("searchbox").fill("layout probe");
      await expect(surface.getByRole("searchbox")).toHaveValue("layout probe");
      await create.press("ArrowDown");
      await expect(page.getByRole("menu")).toBeVisible();
      await page.keyboard.press("Escape");
      await expect(create).toBeFocused();
      await page.screenshot({ path: testInfo.outputPath(`connector-${language.locale}-${width}.png`), fullPage: true });
    });
  }
}

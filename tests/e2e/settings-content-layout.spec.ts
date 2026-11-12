import { expect, test, type Locator } from "@playwright/test";

// Both features share the same content-containment risk, not a pixel width.
async function controlBounds(control: Locator) {
  return control.evaluate(button => {
    const box = button.getBoundingClientRect();
    const range = document.createRange();
    range.selectNodeContents(button);
    const content = range.getBoundingClientRect();
    return { left: box.left, right: box.right, top: box.top, bottom: box.bottom,
      contained: content.left >= box.left - 1 && content.right <= box.right + 1 &&
        content.top >= box.top - 1 && content.bottom <= box.bottom + 1 };
  });
}

for (const feature of [
  { name: "connector", tab: "mcp", languages: [
    { locale: "zh", browse: "浏览连接器", create: "创建" },
    { locale: "en", browse: "Browse connectors", create: "Create" },
    { locale: "de", browse: "Konnektoren durchsuchen", create: "Create" },
  ] },
  { name: "skills", tab: "skills", languages: [
    { locale: "zh", browse: "探索技能", create: "添加" },
    { locale: "en", browse: "Browse skills", create: "Create" },
    { locale: "fr", browse: "Parcourir les compétences", create: "Créer" },
  ] },
]) {
  for (const language of feature.languages) {
    for (const width of [1000, 320]) {
      test(`${feature.name} actions contain ${language.locale} text at ${width}px`, async ({ page }, testInfo) => {
        await page.setViewportSize({ width, height: 772 });
        await page.addInitScript(locale => localStorage.setItem("kokoro.locale", locale), language.locale);
        await page.goto(`/app#settings/${feature.tab}`, { waitUntil: "domcontentloaded" });
        const surface = page.getByTestId("settings-modal");
        const browse = surface.getByRole("button", { name: language.browse, exact: true });
        const create = surface.getByRole("button", { name: language.create, exact: true });
        await expect(browse).toBeVisible();
        await expect(create).toBeVisible();
        const [first, second] = await Promise.all([controlBounds(browse), controlBounds(create)]);
        expect(first.contained && second.contained).toBe(true);
        expect(first.right <= second.left || second.right <= first.left ||
          first.bottom <= second.top || second.bottom <= first.top).toBe(true);
        const search = surface.getByRole("searchbox");
        const searchBounds = await search.boundingBox();
        expect(searchBounds!.width).toBeGreaterThanOrEqual(160);
        const searchContainerHeight = await search.evaluate(element => element.closest("label")!.getBoundingClientRect().height);
        expect(searchContainerHeight).toBeLessThanOrEqual(searchBounds!.height + 4);
        expect(await surface.evaluate(element => element.scrollWidth > element.clientWidth)).toBe(false);
        if (feature.name === "skills") {
          const filters = await surface.locator('[data-slot="toggle-group"]').boundingBox();
          expect(filters!.y).toBeGreaterThanOrEqual(Math.max(first.bottom, second.bottom, searchBounds!.y + searchBounds!.height) - 1);
          if (language.locale === "fr") {
            // Do not split a word merely to force equal-width filter buttons.
            const word = await surface.locator('[data-slot="toggle-group"]').getByText("Personnel", { exact: true }).evaluate(element => {
              const range = document.createRange();
              range.selectNodeContents(element);
              return { height: range.getBoundingClientRect().height, line: Number.parseFloat(getComputedStyle(element).lineHeight) };
            });
            expect(word.height).toBeLessThanOrEqual(word.line + 2);
          }
        }
        await search.fill("layout probe");
        await expect(search).toHaveValue("layout probe");
        await create.press("ArrowDown");
        await expect(page.getByRole("menu")).toBeVisible();
        await page.keyboard.press("Escape");
        await expect(create).toBeFocused();
        await page.screenshot({ path: testInfo.outputPath(`${feature.name}-${language.locale}-${width}.png`), fullPage: true });
      });
    }
  }
}

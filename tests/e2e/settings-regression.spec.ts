import { expect, test } from "@playwright/test";

// SET36-BEGIN: copy-task-link-real-browser
test("SET36 copy task link settings persist and actual current task copies a canonical URL", async ({ page, context }, testInfo) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.addInitScript(() => window.localStorage.setItem("kokoro.locale", "en"));
  await page.goto("/app#settings/shortcuts", { waitUntil: "domcontentloaded" });
  const edit = page.getByRole("button", { name: "Edit Copy task link shortcut" });
  await expect(edit).toBeVisible();
  await edit.click();
  await page.keyboard.press("ControlOrMeta+Shift+J");
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem("kokoro.web.keyboard-shortcuts") ?? "{}").copyTaskLink?.key)).toBe("j");
  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(edit).toContainText("J");
  await page.screenshot({ path: testInfo.outputPath("set36-copy-task-link-settings.png"), fullPage: true });
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("settings-modal")).toHaveCount(0);
  const input = page.getByRole("textbox", { name: "Chat input" });
  await expect(input).toBeEditable();
  await input.fill("SET36 persisted preview task");
  await page.getByRole("button", { name: "Send message" }).click();
  await expect(page.getByText("预览模式：已收到「SET36 persisted preview task」。", { exact: true })).toBeVisible();
  await expect.poll(() => new URL(page.url()).searchParams.getAll("conversation").length).toBe(1);
  const current = new URL(page.url());
  const expected = `${current.origin}${current.pathname}?conversation=${encodeURIComponent(current.searchParams.get("conversation")!)}`;
  await input.blur();
  await page.keyboard.press("ControlOrMeta+Shift+J");
  await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toBe(expected);
  await expect(page.getByRole("status").filter({ hasText: "Task link copied" })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("set36-copy-task-link-feedback.png"), fullPage: true });
});
// SET36-END: copy-task-link-real-browser

// SET40-BEGIN: settings-search-real-layout
for (const viewport of [{ width: 1280, height: 800 }, { width: 390, height: 844 }]) {
  test(`SET40 settings item search keyboard and bounded results at ${viewport.width}px`, async ({ page }, testInfo) => {
    await page.setViewportSize(viewport);
    await page.addInitScript(() => window.localStorage.setItem("kokoro.locale", "en"));
    await page.goto("/app#settings/account", { waitUntil: "domcontentloaded" });
    const modal = page.getByTestId("settings-modal");
    const search = modal.getByRole("textbox", { name: "Search", exact: true });
    await expect(search).toHaveCount(1);
    await expect(search).toBeVisible();
    await search.fill("Nickname");
    await expect(modal.getByRole("button", { name: "Personalization", exact: true })).toBeVisible();
    const nickname = modal.getByRole("button", { name: "Nickname", exact: true });
    await nickname.focus();
    await page.keyboard.press("Enter");
    await expect(modal.getByRole("heading", { name: "Personalization", level: 1 })).toBeVisible();
    await expect(search).toHaveValue("Nickname");
    await expect(nickname).toBeFocused();
    await modal.getByRole("button", { name: "Clear search", exact: true }).click();
    await expect(search).toHaveValue("");
    await expect(search).toBeFocused();
    await search.fill("Browser notifications");
    const notification = modal.getByRole("button", { name: "Browser notifications", exact: true });
    await notification.focus();
    await page.keyboard.press("Space");
    await expect(modal.getByRole("heading", { name: "General", level: 1 })).toBeVisible();
    await expect(notification).toBeFocused();
    await expect(search).toHaveValue("Browser notifications");
    await search.fill("a");
    const firstResult = modal.getByRole("button", { name: "Account", exact: true });
    await expect(firstResult).toBeVisible();
    const scroll = await firstResult.evaluate((element) => {
      let ancestor = element.parentElement;
      while (ancestor) {
        const style = getComputedStyle(ancestor);
        if (/(auto|scroll)/u.test(style.overflowY) && ancestor.scrollHeight > ancestor.clientHeight) {
          ancestor.scrollTop = ancestor.scrollHeight;
          return { height: ancestor.clientHeight, scrollTop: ancestor.scrollTop };
        }
        ancestor = ancestor.parentElement;
      }
      return null;
    });
    expect(scroll).not.toBeNull();
    expect(scroll!.scrollTop).toBeGreaterThan(0);
    if (viewport.width === 390) expect(scroll!.height).toBeLessThanOrEqual(193);
    await expect(modal.getByTestId("settings-tab-account")).toBeVisible({ visible: viewport.width === 390 });
    const dimensions = await modal.evaluate((element) => ({ scroll: element.scrollWidth, client: element.clientWidth }));
    expect(dimensions.scroll).toBeLessThanOrEqual(dimensions.client);
    const close = page.getByTestId("settings-close");
    await expect(close).toBeVisible();
    const closeBox = await close.boundingBox();
    const searchBox = await search.boundingBox();
    expect(closeBox).not.toBeNull();
    expect(searchBox).not.toBeNull();
    const modalBox = await modal.boundingBox();
    expect(modalBox).not.toBeNull();
    expect(searchBox!.x).toBeGreaterThanOrEqual(modalBox!.x);
    expect(searchBox!.x + searchBox!.width).toBeLessThanOrEqual(modalBox!.x + modalBox!.width);
    const disjoint = searchBox!.x + searchBox!.width <= closeBox!.x
      || closeBox!.x + closeBox!.width <= searchBox!.x
      || searchBox!.y + searchBox!.height <= closeBox!.y
      || closeBox!.y + closeBox!.height <= searchBox!.y;
    expect(disjoint).toBe(true);
    await page.screenshot({ path: testInfo.outputPath(`set40-search-${viewport.width}.png`), fullPage: true });
    await close.click();
    await expect(modal).toHaveCount(0);
  });
}
// SET40-END: settings-search-real-layout

// SET41-BEGIN: theme-options-within-content
for (const width of [1280, 390, 320]) {
  test(`SET41 all theme options remain reachable at ${width}px`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 844 });
    await page.addInitScript(() => window.localStorage.setItem("kokoro.locale", "en"));
    await page.goto("/app#/account/settings/general", { waitUntil: "domcontentloaded" });
    const modal = page.getByTestId("settings-modal");
    const appearance = modal.getByTestId("settings-appearance");
    const contentViewport = modal.getByRole("tabpanel").locator('[data-slot="scroll-area-viewport"]');
    const light = appearance.getByRole("radio", { name: "Light", exact: true });
    const dark = appearance.getByRole("radio", { name: "Dark", exact: true });
    const auto = appearance.getByRole("radio", { name: "Auto", exact: true });
    await appearance.scrollIntoViewIfNeeded();
    for (const label of ["Light", "Dark", "Auto"]) {
      const option = appearance.getByRole("radio", { name: label, exact: true });
      await expect(option).toBeVisible();
      const clip = await contentViewport.boundingBox();
      const button = await option.boundingBox();
      const text = await option.getByText(label, { exact: true }).boundingBox();
      expect(clip).not.toBeNull();
      for (const box of [button, text]) {
        expect(box).not.toBeNull();
        expect(box!.x).toBeGreaterThanOrEqual(clip!.x - 1);
        expect(box!.x + box!.width).toBeLessThanOrEqual(clip!.x + clip!.width + 1);
      }
    }
    await light.click();
    await expect(light).toBeChecked();
    await auto.click();
    await expect(auto).toBeChecked();
    await auto.press("ArrowLeft");
    await expect(dark).toBeFocused();
    await dark.press("Space");
    await expect(dark).toBeChecked();
    await dark.press("ArrowRight");
    await expect(auto).toBeFocused();
    await auto.press("Space");
    await expect(auto).toBeChecked();
    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(auto).toBeChecked();
    await page.screenshot({ path: testInfo.outputPath(`set41-theme-${width}.png`), fullPage: true });
  });
}
// SET41-END: theme-options-within-content

// SET42-BEGIN: task-delivery-narrow-layout
for (const width of [1280, 390, 320]) {
  test(`SET42 task delivery label and control stay separate at ${width}px`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 844 });
    await page.addInitScript(() => window.localStorage.setItem("kokoro.locale", "en"));
    await page.goto("/app#/account/settings/general", { waitUntil: "domcontentloaded" });
    const modal = page.getByTestId("settings-modal");
    const section = modal.getByRole("region", { name: "Chat preferences", exact: true });
    await section.scrollIntoViewIfNeeded();
    const label = section.getByText("Default behavior while a task is running", { exact: true });
    const control = section.getByRole("combobox", { name: "Default behavior while a task is running", exact: true });
    await expect(control).toBeDisabled();
    await expect(control).toHaveText("Add to queue");
    const labelBox = await label.boundingBox();
    const controlBox = await control.boundingBox();
    const viewportBox = await modal.getByRole("tabpanel").locator('[data-slot="scroll-area-viewport"]').boundingBox();
    expect(labelBox).not.toBeNull();
    expect(controlBox).not.toBeNull();
    expect(viewportBox).not.toBeNull();
    const separate = labelBox!.x + labelBox!.width <= controlBox!.x + 1 ||
      labelBox!.y + labelBox!.height <= controlBox!.y + 1;
    expect(separate).toBe(true);
    for (const box of [labelBox!, controlBox!]) {
      expect(box.x).toBeGreaterThanOrEqual(viewportBox!.x - 1);
      expect(box.x + box.width).toBeLessThanOrEqual(viewportBox!.x + viewportBox!.width + 1);
    }
    await page.screenshot({ path: testInfo.outputPath(`set42-task-row-${width}.png`), fullPage: true });
  });
}
// SET42-END: task-delivery-narrow-layout

// SET47-BEGIN: preview archive boundary, not authenticated mutation evidence.
for(const width of [1280,390]) {
 test(`SET47 preview Data archive boundary is readable and has zero archive IO at ${width}px`,async({page})=>{
  await page.setViewportSize({width,height:844});
  await page.addInitScript(()=>window.localStorage.setItem("kokoro.locale","en"));
  let archiveCalls=0;page.on("request",request=>{if(/\/api\/(?:account\/archived-tasks|session\/sessions\/[^/]+\/(?:archive|restore))(?:[?]|$)/u.test(request.url()))archiveCalls++;});
  await page.goto("/app#/account/settings/data-management",{waitUntil:"domcontentloaded"});
  const modal=page.getByTestId("settings-modal");const data=modal.getByTestId("settings-data-management");
  await expect(data.getByRole("heading",{name:"Archived tasks",exact:true})).toBeVisible();
  await expect(data.getByRole("button",{name:"Restore task",exact:true})).toHaveCount(0);
  await expect(data.getByRole("button",{name:"Manage",exact:true})).toHaveCount(3);
  for(const button of await data.getByRole("button",{name:"Manage",exact:true}).all())await expect(button).toBeDisabled();
  await expect(data.getByText("No archived tasks.",{exact:true})).toHaveCount(0);
  await expect(modal).toBeVisible();expect(archiveCalls).toBe(0);
  const bounds=await data.evaluate(node=>({width:node.clientWidth,scroll:node.scrollWidth}));expect(bounds.scroll).toBeLessThanOrEqual(bounds.width+1);
  const close=page.getByTestId("settings-close");await close.focus();await expect(close).toBeFocused();
  await page.keyboard.press("Tab");
  const focused=await modal.evaluate(node=>node.contains(document.activeElement));expect(focused).toBe(true);
  await page.keyboard.press("Escape");await expect(modal).toHaveCount(0);expect(archiveCalls).toBe(0);
 });
}
// SET47-END

// SET53-BEGIN: service-settings-navigation
for (const width of [320, 1600]) {
  test(`SET53 six service pages retain keyboard navigation and honest unavailable actions at ${width}px`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 900 });
    await page.addInitScript(() => window.localStorage.setItem("kokoro.locale", "en"));
    await page.goto("/app#/account/settings/mail", { waitUntil: "domcontentloaded" });
    const modal = page.getByTestId("settings-modal");
    await expect(modal.getByRole("heading", { name: "Mail Kokoro", level: 1 })).toBeVisible();
    const serviceRequests: string[] = [];
    page.on("request", (request) => {
      const path = new URL(request.url()).pathname;
      if (path.startsWith("/api/")) serviceRequests.push(`${request.method()} ${path}`);
    });

    for (const [tab, title] of [
      ["mail", "Mail Kokoro"], ["email", "Email"], ["phone", "Phone"],
      ["wallet", "Wallet"], ["integration", "Integrations"], ["developer", "Developer"],
    ] as const) {
      if (width === 320) {
        await modal.getByTestId("settings-more").click();
        const item = page.getByTestId(`settings-more-${tab}`);
        await expect(item).toBeEnabled();
        await item.focus();
        await page.keyboard.press("Enter");
        await expect(page.locator("[data-settings-compact-more-menu]")).toHaveCount(0);
      } else {
        await modal.getByTestId(`settings-tab-${tab}`).focus();
        await page.keyboard.press("Enter");
      }
      await expect(modal.getByRole("heading", { name: title, level: 1 })).toBeVisible();
      await expect.poll(() => new URL(page.url()).hash).toBe(`#/account/settings/${tab}`);
      const content = modal.getByTestId(`settings-service-${tab}`);
      await expect(content).toBeVisible();
      const actions = content.getByRole("button");
      expect(await actions.count()).toBeGreaterThan(0);
      for (const action of await actions.all()) {
        await expect(action).toBeDisabled();
        expect(await action.evaluate((element) => {
          const reason = document.getElementById(element.getAttribute("aria-describedby") ?? "");
          return Boolean(reason?.textContent?.trim() && reason.getBoundingClientRect().height > 0);
        })).toBe(true);
      }
      expect(await content.locator("a, input, textarea").count()).toBe(0);
      expect(await content.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
      const bounds = await content.boundingBox();
      const modalBounds = await modal.boundingBox();
      expect(bounds).not.toBeNull();
      expect(modalBounds).not.toBeNull();
      expect(bounds!.x).toBeGreaterThanOrEqual(modalBounds!.x);
      expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(modalBounds!.x + modalBounds!.width);
    }

    const webhooks = modal.getByRole("tab", { name: "Webhooks", exact: true });
    await modal.getByRole("tab", { name: "API keys", exact: true }).focus();
    await page.keyboard.press("ArrowRight");
    await expect(webhooks).toBeFocused();
    await expect(webhooks).toHaveAttribute("aria-selected", "true");
    await expect(modal.getByRole("button", { name: "Create webhook", exact: true })).toBeDisabled();
    const search = modal.getByRole("textbox", { name: "Search", exact: true });
    await search.fill("Inbox");
    const result = modal.getByRole("navigation").getByRole("button", { name: "Inbox", exact: true });
    await result.focus();
    await page.keyboard.press("Enter");
    await expect(modal.getByRole("heading", { name: "Mail Kokoro", level: 1 })).toBeVisible();
    await modal.getByRole("tab", { name: "Settings", exact: true }).focus();
    await page.keyboard.press("ArrowRight");
    await expect(modal.getByRole("tab", { name: "Inbox", exact: true })).toHaveAttribute("aria-selected", "true");
    for (const name of ["Sender", "Content", "Date"]) await expect(modal.getByRole("columnheader", { name, exact: true })).toBeVisible();
    await expect(modal.getByRole("button", { name: "Refresh inbox", exact: true })).toBeDisabled();
    await modal.getByRole("button", { name: "Clear search", exact: true }).click();
    await expect(modal.getByTestId("settings-placeholder-computer")).toHaveAttribute("aria-disabled", "true");
    expect(serviceRequests).toEqual([]);
    expect(await modal.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
    await page.screenshot({ path: testInfo.outputPath(`set53-services-${width}.png`), fullPage: true });
    await modal.getByTestId("settings-close").click();
    await expect(modal).toHaveCount(0);
  });
}
// SET53-END: service-settings-navigation

// SET53-BEGIN: service-text-layout
test("SET53 service tabs keep complete words and documentation shares a roomy information row", async ({ page }) => {
  await page.addInitScript(() => window.localStorage.setItem("kokoro.locale", "en"));
  let checkedRoomyRow = false;
  for (const width of [320, 856, 1600]) {
    await page.setViewportSize({ width, height: 900 });
    for (const [tab, labels] of [
      ["mail", ["Settings", "Inbox"]],
      ["developer", ["API keys", "Webhooks"]],
    ] as const) {
      await page.goto(`/app#/account/settings/${tab}`, { waitUntil: "domcontentloaded" });
      const content = page.getByTestId(`settings-service-${tab}`);
      await expect(content).toBeVisible();
      for (const label of labels) {
        const trigger = content.getByRole("tab", { name: label, exact: true });
        await expect(trigger).toBeVisible();
        const text = await trigger.evaluate((element) => {
          const range = document.createRange();
          range.selectNodeContents(element);
          const lines = Array.from(range.getClientRects()).filter((rect) => rect.width > 0);
          const bounds = element.getBoundingClientRect();
          return {
            lineCount: new Set(lines.map((rect) => Math.round(rect.top))).size,
            fits: lines.every((rect) => rect.left >= bounds.left && rect.right <= bounds.right + 1),
          };
        });
        expect(text.lineCount, `${label} at ${width}px`).toBe(1);
        expect(text.fits, `${label} at ${width}px`).toBe(true);
      }
      const geometry = await content.evaluate((element) => {
        const modal = element.closest('[data-testid="settings-modal"]')!;
        return { width: element.clientWidth, scroll: element.scrollWidth, modalWidth: modal.clientWidth, modalScroll: modal.scrollWidth };
      });
      expect(geometry.scroll).toBeLessThanOrEqual(geometry.width);
      expect(geometry.modalScroll).toBeLessThanOrEqual(geometry.modalWidth);
      const tabList = await content.getByRole("tablist").evaluate((element) => ({
        scrollHeight: element.scrollHeight,
        clientHeight: element.clientHeight,
      }));
      expect(tabList.scrollHeight).toBeLessThanOrEqual(tabList.clientHeight);
      if (tab === "developer" && geometry.width >= 400) {
        checkedRoomyRow = true;
        const { description, documentation } = await content.evaluate((element) => {
          const description = Array.from(element.querySelectorAll("p")).find(
            (paragraph) => paragraph.textContent === "Manage keys for applications to access the Kokoro API.",
          );
          const documentation = Array.from(description?.parentElement?.querySelectorAll("button") ?? []).find(
            (button) => button.textContent === "Documentation",
          );
          // Both viewport coordinates must describe the same animation frame.
          const descriptionRect = description?.getBoundingClientRect();
          const documentationRect = documentation?.getBoundingClientRect();
          return {
            description: descriptionRect ? { x: descriptionRect.x, y: descriptionRect.y, width: descriptionRect.width } : null,
            documentation: documentationRect ? { x: documentationRect.x, y: documentationRect.y, width: documentationRect.width } : null,
          };
        });
        expect(description).not.toBeNull();
        expect(documentation).not.toBeNull();
        expect(Math.abs(description!.y - documentation!.y)).toBeLessThanOrEqual(1);
        expect(documentation!.x).toBeGreaterThan(description!.x + description!.width);
      }
    }
  }
  expect(checkedRoomyRow).toBe(true);
});
// SET53-END: service-text-layout

// SET54-BEGIN: compact-more-keyboard
test("SET54 compact More opens and navigates with native keyboard without dismissing Settings", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 900 });
  await page.addInitScript(() => window.localStorage.setItem("kokoro.locale", "en"));
  await page.goto("/app#/account/settings/mail", { waitUntil: "domcontentloaded" });
  const modal = page.getByTestId("settings-modal");
  const trigger = modal.getByTestId("settings-more");
  const first = page.getByTestId("settings-more-skills");
  const last = page.getByTestId("settings-more-help");
  const menu = modal.getByRole("menu");
  await expect(trigger).toHaveAttribute("aria-expanded", "false");
  await trigger.focus();
  await page.keyboard.press("Enter");
  await expect(trigger).toHaveAttribute("aria-expanded", "true");
  await expect(first).toBeFocused();
  await page.keyboard.press("End");
  await expect(last).toBeFocused();
  await page.keyboard.press("ArrowDown");
  await expect(first).toBeFocused();
  await page.keyboard.press("ArrowUp");
  await expect(last).toBeFocused();
  await page.keyboard.press("Home");
  await expect(first).toBeFocused();
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("ArrowDown");
  await expect(page.getByTestId("settings-more-mail")).toBeFocused();
  await expect(page.getByTestId("settings-more-computer")).toBeDisabled();
  await page.keyboard.press("ArrowDown");
  await expect(page.getByTestId("settings-more-email")).toBeFocused();
  await page.keyboard.press("ArrowUp");
  await expect(page.getByTestId("settings-more-mail")).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(menu).toHaveCount(0);
  await expect(modal).toBeVisible();
  await expect(trigger).toBeFocused();

  await page.keyboard.press("Space");
  await expect(first).toBeFocused();
  await trigger.focus();
  await page.keyboard.press("Space");
  await expect(menu).toHaveCount(0);
  await expect(trigger).toBeFocused();
  await page.keyboard.press("ArrowUp");
  await expect(last).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(trigger).toBeFocused();
  await page.keyboard.press("ArrowDown");
  await expect(first).toBeFocused();
  for (let step = 0; step < 3; step++) await page.keyboard.press("ArrowDown");
  await expect(page.getByTestId("settings-more-email")).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(modal.getByRole("heading", { name: "Email", level: 1 })).toBeVisible();
  await expect.poll(() => new URL(page.url()).hash).toBe("#/account/settings/email");
  await expect(menu).toHaveCount(0);
  await expect(trigger).toBeFocused();

  await trigger.click();
  await expect(menu).toBeVisible();
  await trigger.click();
  await expect(menu).toHaveCount(0);
  await trigger.press("Enter");
  await expect(first).toBeFocused();
  const search = modal.getByRole("textbox", { name: "Search", exact: true });
  await search.click();
  await expect(menu).toHaveCount(0);
  await expect(search).toBeFocused();
  await expect(modal).toBeVisible();
  await trigger.focus();
  await page.keyboard.press("Escape");
  await expect(modal).toHaveCount(0);
});
// SET54-END: compact-more-keyboard

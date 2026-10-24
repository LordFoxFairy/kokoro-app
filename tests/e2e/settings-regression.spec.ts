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
    await expect(control).toBeEnabled();
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

const serviceAvailability = {
  mail: "Email-to-task is not available yet. Mailboxes, workflows and authorized senders cannot be configured.",
  email: "The email asset service is not available yet. Mailboxes cannot be read or created.",
  phone: "The phone service is not available yet. Numbers cannot be read or created.",
  payment: "The payment method service is not available yet. Payment methods cannot be read or added.",
  invoices: "The invoice service is not available yet. Invoice records cannot be read.",
  integration: "App integrations are not available yet. Connections cannot be made or verified.",
  apiKeys: "The API key service is not available yet. Keys cannot be read or created.",
  webhooks: "The webhook service is not available yet. Webhooks cannot be read or created.",
  docs: "Kokoro documentation is not available yet.",
  management: "The service is not connected. Related management data cannot be read yet.",
} as const;

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
  await expect(data.getByRole("button", { name: /^Manage / })).toHaveCount(4);
  for (const title of ["Shared files", "Authorized apps", "Cloud browser data", "Purchased domains"]) {
    const button = data.getByRole("button", { name: `Manage ${title}`, exact: true });
    await expect(button).toBeEnabled();
    await button.click();
    if (title !== "Shared files") {
      const details = page.getByRole("region", { name: title, exact: true });
      await expect(page.getByRole("dialog", { name: title, exact: true })).toHaveCount(0);
      await expect(details.getByText(serviceAvailability.management, { exact: true })).toBeVisible();
      await expect(details.getByRole("heading", { name: title, level: 1, exact: true })).toBeFocused();
      await details.getByRole("button", { name: "Back to data management", exact: true }).click();
      await expect(data.getByRole("heading", { name: title, level: 1, exact: true })).toHaveCount(0);
      await expect(modal).toBeVisible();
      await expect(button).toBeFocused();
      continue;
    }
    const details = page.getByRole("dialog", { name: title, exact: true });
    await expect(details.getByText(serviceAvailability.management, { exact: true })).toBeVisible();
    if (title === "Shared files") {
      const contentId = await details.getAttribute("id");
      expect(contentId).not.toBeNull();
      // The earliest Escape may precede the child's Radix layer registration.
      // It must preserve Settings whether the child consumes it or closes.
      await page.keyboard.press("Escape");
      await expect(modal).toBeVisible();
      const childStillOpen = await page.evaluate((id) =>
        document.getElementById(id!)?.getAttribute("data-state") === "open",
      contentId);
      if (!childStillOpen) await button.click();
    }
    await expect(details).toHaveCSS("pointer-events", "auto");
    await expect(details.getByRole("button", { name: "Cancel", exact: true })).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(details).toHaveCount(0);
    await expect(modal).toBeVisible();
    await expect(button).toBeFocused();
  }
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

    for (const [tab, title, unavailable] of [
      ["mail", "Mail Kokoro", serviceAvailability.mail], ["email", "Email", serviceAvailability.email], ["phone", "Phone", serviceAvailability.phone],
      ["wallet", "Wallet", serviceAvailability.payment], ["integration", "Integrations", serviceAvailability.integration], ["developer", "Developer", serviceAvailability.apiKeys],
    ] as const) {
      if (width === 320) {
        await modal.getByTestId("settings-more").click();
        const item = page.getByTestId(`settings-more-${tab}`);
        if (await modal.getByTestId(`settings-tab-${tab}`).getAttribute("aria-selected") === "true") {
          await expect(item).toHaveCount(0);
          await page.keyboard.press("Escape");
        } else {
          await expect(item).toBeEnabled();
          await item.focus();
          await page.keyboard.press("Enter");
        }
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
        const actionLabel = await action.innerText();
        if (await action.isDisabled()) {
          const reason = actionLabel === "Documentation" ? serviceAvailability.docs : tab === "wallet" ? serviceAvailability.invoices : unavailable;
          await expect(action).toBeDisabled();
          await expect(action).toHaveAccessibleDescription(reason);
          await expect(content.getByText(reason, { exact: true })).toBeVisible();
          expect(await action.evaluate((element) => {
            const reason = document.getElementById(element.getAttribute("aria-describedby") ?? "");
            return Boolean(reason?.textContent?.trim() && reason.getBoundingClientRect().height > 0);
          })).toBe(true);
        } else {
          const inlineSender = await action.getAttribute("aria-label") === "Add authorized sender";
          const integrationPage = tab === "integration";
          const integrationLabel = integrationPage ? await action.getAttribute("aria-label") : null;
          if (inlineSender) await expect(action).toHaveAttribute("aria-expanded", "false");
          else if (!integrationPage) await expect(action).toHaveAttribute("aria-haspopup", "dialog");
          await action.click();
          const dialog = integrationPage ? content : inlineSender ? content.getByRole("form", { name: "Add authorized sender", exact: true }) : page.getByRole("dialog").last();
          await expect(dialog.getByText(unavailable, { exact: true })).toBeVisible();
          const final = integrationPage ? dialog.getByRole("button", { name: integrationLabel === "View Zapier details" ? "Try it" : "Connect", exact: true }).first() : dialog.getByRole("button", { disabled: true });
          await expect(final).toHaveCount(1);
          await expect(final).toBeDisabled();
          await expect(final).toHaveAccessibleDescription(unavailable);
          if (integrationPage) {
            await expect(dialog.getByRole("heading", { level: 1 })).toBeFocused();
            await dialog.getByRole("button", { name: "Back to integrations", exact: true }).click();
          } else await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
          await expect(action).toBeFocused();
          await expect(modal).toBeVisible();
        }
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
    await expect(modal.getByRole("button", { name: "Create webhook", exact: true })).toBeEnabled();
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
  const first = page.getByTestId("settings-more-account");
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
  await expect(page.getByTestId("settings-more-mail")).toHaveCount(0);
  await page.getByTestId("settings-more-subscription").focus();
  await expect(page.getByTestId("settings-more-computer")).toBeDisabled();
  await page.keyboard.press("ArrowDown");
  await expect(page.getByTestId("settings-more-email")).toBeFocused();
  await page.keyboard.press("ArrowUp");
  await expect(page.getByTestId("settings-more-subscription")).toBeFocused();
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
  await page.getByTestId("settings-more-subscription").focus();
  await page.keyboard.press("ArrowDown");
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

// SET59-BEGIN: local-personalization-interiors
// Both configured projects exercise the actual nested Dialog focus/scroll behavior.
test("SET59 knowledge and memory drafts keep Settings open and fit desktop or 320px", async ({ page, context }, testInfo) => {
  const mobile = testInfo.project.name.startsWith("mobile");
  await page.setViewportSize({ width: mobile ? 320 : 1280, height: 844 });
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.addInitScript(() => window.localStorage.setItem("kokoro.locale", "en"));
  await page.goto("/app#settings/personalization", { waitUntil: "domcontentloaded" });
  const settings = page.getByTestId("settings-modal");
  await expect(settings).toBeVisible();
  const businessRequests: string[] = [];
  page.on("request", (request) => {
    if (new URL(request.url()).pathname.startsWith("/api/session/")) businessRequests.push(request.method());
  });
  await settings.getByRole("tab", { name: "Knowledge", exact: true }).click();
  await expect(settings.getByRole("textbox", { name: "Search knowledge" })).toBeDisabled();
  await expect(settings.getByText("No knowledge yet", { exact: true })).toHaveCount(0);
  const add = settings.getByRole("button", { name: "Add", exact: true });
  await add.click();
  let knowledge = page.getByRole("dialog", { name: "Add knowledge", exact: true });
  await expect(knowledge).toBeVisible();
  await knowledge.getByRole("textbox", { name: "Name", exact: true }).fill("Temporary knowledge");
  await knowledge.getByRole("textbox", { name: "When to use" }).fill("Local preview only");
  await knowledge.getByRole("textbox", { name: "Content", exact: true }).fill("Temporary content ".repeat(20));
  await expect(knowledge.getByRole("button", { name: "Save", exact: true })).toBeDisabled();
  await expect(knowledge.getByRole("button", { name: "Save", exact: true })).toHaveAccessibleDescription(/not connected/);
  await expect.poll(() => knowledge.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    return rect.left >= 0 && rect.right <= innerWidth && rect.top >= 0 && rect.bottom <= innerHeight && element.scrollWidth <= element.clientWidth;
  })).toBe(true);
  const knowledgeCancel = knowledge.getByRole("button", { name: "Cancel", exact: true });
  await knowledgeCancel.scrollIntoViewIfNeeded();
  await expect(knowledgeCancel).toBeInViewport();
  await knowledgeCancel.click();
  await expect(add).toBeFocused();
  await add.click();
  knowledge = page.getByRole("dialog", { name: "Add knowledge", exact: true });
  await expect(knowledge.getByRole("textbox", { name: "Name", exact: true })).toHaveValue("");
  await expect(knowledge.getByRole("textbox", { name: "Content", exact: true })).toHaveValue("");
  await expect(knowledge.getByRole("textbox", { name: "Name", exact: true })).toBeFocused();
  await expect(knowledge).toHaveCSS("pointer-events", "auto");
  await page.keyboard.press("Escape");
  await expect(knowledge).toHaveCount(0);
  await expect(settings).toBeVisible();
  await expect(add).toBeFocused();
  await settings.getByRole("tab", { name: "Profile", exact: true }).click();
  const firstImport = settings.getByRole("button", { name: "Import", exact: true });
  await firstImport.click();
  let memory = page.getByRole("dialog", { name: "Import memory", exact: true });
  await expect(memory).toBeVisible();
  await memory.getByRole("textbox", { name: "Paste the response" }).fill("A private temporary response");
  const prompt = await memory.locator("pre").textContent();
  expect(prompt).toBeTruthy();
  await memory.getByRole("button", { name: "Copy this prompt", exact: true }).click();
  await expect(memory.getByRole("status")).toHaveText("Copied");
  await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toBe(prompt);
  const importAction = memory.getByRole("button", { name: "Import", exact: true });
  await expect(importAction).toBeDisabled();
  await expect(importAction).toHaveAccessibleDescription(/not connected/);
  await importAction.scrollIntoViewIfNeeded();
  await expect(importAction).toBeInViewport();
  await expect.poll(() => memory.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    return rect.left >= 0 && rect.right <= innerWidth && rect.top >= 0 && rect.bottom <= innerHeight && element.scrollWidth <= element.clientWidth;
  })).toBe(true);
  await page.screenshot({ path: testInfo.outputPath("set59-memory-dialog.png"), fullPage: true });
  await page.keyboard.press("Escape");
  await expect(memory).toHaveCount(0);
  await expect(settings).toBeVisible();
  await expect(firstImport).toBeFocused();
  await settings.getByRole("button", { name: "Import memory", exact: true }).click();
  memory = page.getByRole("dialog", { name: "Import memory", exact: true });
  await expect(memory.getByRole("textbox", { name: "Paste the response" })).toHaveValue("");
  await expect(memory.getByRole("status")).toHaveCount(0);
  await memory.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(settings).toBeVisible();
  expect(businessRequests).toEqual([]);
});
// SET59-END: local-personalization-interiors

// Local service setup previews never allocate assets or submit credentials.
test("service creation previews keep nested focus, discard drafts and fit 320px or desktop", async ({ page }, testInfo) => {
  const mobile = testInfo.project.name.startsWith("mobile");
  await page.setViewportSize({ width: mobile ? 320 : 1280, height: 844 });
  await page.addInitScript(() => window.localStorage.setItem("kokoro.locale", "en"));
  await page.goto("/app#settings/phone", { waitUntil: "domcontentloaded" });
  const settings = page.getByTestId("settings-modal");
  await expect(settings.getByRole("heading", { name: "Phone", level: 1 })).toBeVisible();
  const serviceRequests: string[] = [];
  page.on("request", (request) => {
    if (new URL(request.url()).pathname.startsWith("/api/session/")) serviceRequests.push(request.method());
  });
  const selectSection = async (tab: string) => {
    if (mobile) {
      await settings.getByTestId("settings-more").press("Enter");
      const item = page.getByTestId(`settings-more-${tab}`);
      if (await settings.getByTestId(`settings-tab-${tab}`).getAttribute("aria-selected") === "true") {
        await expect(item).toHaveCount(0);
        await page.keyboard.press("Escape");
      } else {
        await item.press("Enter");
      }
    } else {
      await settings.getByTestId(`settings-tab-${tab}`).press("Enter");
    }
  };
  const phoneTrigger = settings.getByRole("button", { name: "Create now", exact: true });
  await phoneTrigger.focus();
  await page.keyboard.press("Enter");
  let dialog = page.getByRole("dialog", { name: "Assign a virtual phone to your agent", exact: true });
  await expect(dialog.getByRole("button", { name: "Continue", exact: true })).toBeDisabled();
  await expect(dialog.getByRole("button", { name: "Continue", exact: true })).toHaveAccessibleDescription(serviceAvailability.phone);
  await expect(dialog.getByText(serviceAvailability.phone, { exact: true })).toBeVisible();
  await expect(dialog.getByRole("checkbox")).toHaveCount(0);
  await expect(dialog.getByRole("button", { name: "Cancel", exact: true })).toBeFocused();
  await expect(dialog).toHaveCSS("pointer-events", "auto");
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(settings).toBeVisible();
  await expect(phoneTrigger).toBeFocused();

  for (const [section, trigger, title, label, value, finalAction, unavailable] of [
    ["email", "Create new item", "Create email", "Address prefix", "private-prefix", "Save", serviceAvailability.email],
    ["developer", "Create API key", "Create API key", "Name your key", "private key name", "Create", serviceAvailability.apiKeys],
    ["mail", "Add workflow mailbox", "Add workflow mailbox", "Mailbox suffix", "private-workflow", "Create", serviceAvailability.mail],
    ["mail", "Add authorized sender", "Add authorized sender", "Sender email", "sender@example.test", "Save", serviceAvailability.mail],
  ] as const) {
    await selectSection(section);
    const entry = settings.getByRole("button", { name: trigger, exact: true });
    await entry.press("Enter");
    dialog = page.getByRole(trigger === "Add authorized sender" ? "form" : "dialog", { name: title, exact: true });
    const input = dialog.getByRole("textbox", { name: label, exact: true });
    await expect(input).toBeFocused();
    await input.fill(value);
    if (section === "developer") {
      const expiry = dialog.getByRole("combobox", { name: "Expires", exact: true });
      await expiry.press("ArrowDown");
      await page.getByRole("option", { name: "24 hours", exact: true }).click();
      await expect(expiry).toHaveText("24 hours");
    }
    if (trigger === "Add workflow mailbox") await dialog.getByRole("textbox", { name: "Processing instructions", exact: true }).fill("Private local instructions");
    const final = dialog.getByRole("button", { name: finalAction, exact: true });
    await expect(final).toBeDisabled();
    await expect(final).toHaveAccessibleDescription(unavailable);
    await expect(dialog.getByText(unavailable, { exact: true })).toBeVisible();
    await expect.poll(() => dialog.evaluate((element) => {
      const rect = element.getBoundingClientRect();
      return rect.left >= 0 && rect.right <= innerWidth && rect.top >= 0 && rect.bottom <= innerHeight && element.scrollWidth <= element.clientWidth;
    })).toBe(true);
    const cancel = dialog.getByRole("button", { name: "Cancel", exact: true });
    await cancel.scrollIntoViewIfNeeded();
    await expect(cancel).toBeInViewport();
    await cancel.click();
    await expect(entry).toBeFocused();
    await entry.press("Enter");
    dialog = page.getByRole(trigger === "Add authorized sender" ? "form" : "dialog", { name: title, exact: true });
    await expect(dialog.getByRole("textbox", { name: label, exact: true })).toHaveValue("");
    await expect(dialog.getByRole("textbox", { name: label, exact: true })).toBeFocused();
    await expect(dialog).toHaveCSS("pointer-events", "auto");
    if (section === "developer") await expect(dialog.getByRole("combobox")).toHaveText("Never");
    if (trigger === "Add workflow mailbox") await expect(dialog.getByRole("textbox", { name: "Processing instructions", exact: true })).toHaveValue("");
    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
    await expect(settings).toBeVisible();
    await expect(entry).toBeFocused();
  }
  await selectSection("developer");
  await settings.getByRole("tab", { name: "Webhooks", exact: true }).click();
  await settings.getByRole("button", { name: "Create webhook", exact: true }).press("Enter");
  dialog = page.getByRole("dialog", { name: "Create webhook", exact: true });
  const url = dialog.getByRole("textbox", { name: "URL", exact: true });
  await url.fill("not a URL");
  await url.press("Tab");
  await expect(url).toHaveAttribute("aria-invalid", "true");
  await expect(dialog.getByRole("alert")).toHaveText("Enter a valid URL.");
  await url.fill("https://example.test/events");
  await expect(dialog.getByRole("alert")).toHaveCount(0);
  await expect(dialog.getByRole("button", { name: "Save", exact: true })).toBeDisabled();
  await expect(dialog.getByRole("button", { name: "Save", exact: true })).toHaveAccessibleDescription(serviceAvailability.webhooks);
  await expect(dialog.getByText(serviceAvailability.webhooks, { exact: true })).toBeVisible();
  await page.keyboard.press("Escape");
  await selectSection("wallet");
  await settings.getByRole("button", { name: "Add", exact: true }).press("Enter");
  dialog = page.getByRole("dialog", { name: "Add payment method", exact: true });
  await expect(dialog.getByRole("button", { name: "Continue", exact: true })).toBeDisabled();
  await expect(dialog.getByRole("button", { name: "Continue", exact: true })).toHaveAccessibleDescription(serviceAvailability.payment);
  await expect(dialog.getByText(serviceAvailability.payment, { exact: true })).toBeVisible();
  await expect(dialog.getByRole("textbox")).toHaveCount(0);
  await expect(dialog.getByRole("button", { name: "Cancel", exact: true })).toBeFocused();
  await expect(dialog).toHaveCSS("pointer-events", "auto");
  await page.screenshot({ path: testInfo.outputPath("service-preflight-wallet.png"), fullPage: true });
  await page.keyboard.press("Escape");
  await expect(settings).toBeVisible();
  expect(serviceRequests).toEqual([]);
});

test("service detail previews and resource categories remain readable without fake data or writes", async ({ page }, testInfo) => {
  const mobile = testInfo.project.name.startsWith("mobile");
  await page.setViewportSize({ width: mobile ? 320 : 1280, height: 844 });
  await page.addInitScript(() => window.localStorage.setItem("kokoro.locale", "en"));
  await page.goto("/app#settings/integration", { waitUntil: "domcontentloaded" });
  const settings = page.getByTestId("settings-modal");
  await expect(settings).toBeVisible();
  const requests: string[] = [];
  page.on("request", (request) => {
    if (new URL(request.url()).pathname.startsWith("/api/session/")) requests.push(request.method());
  });
  for (const provider of ["Zapier", "Apple Messages", "Slack", "Telegram", "LINE"]) {
    const trigger = settings.getByRole("button", { name: `View ${provider} details`, exact: true });
    await trigger.press("Enter");
    const dialog = page.getByRole("region", { name: provider, exact: true });
    await expect(page.getByRole("dialog", { name: provider, exact: true })).toHaveCount(0);
    const primary = dialog.getByRole("button", { name: provider === "Zapier" ? "Try it" : "Connect", exact: true }).first();
    await expect(primary).toBeDisabled();
    await expect(primary).toHaveAccessibleDescription(serviceAvailability.integration);
    await expect(dialog.getByText(serviceAvailability.integration, { exact: true })).toBeVisible();
    await expect(dialog.getByRole("heading", { name: provider, level: 1 })).toBeFocused();
    await expect(dialog).toHaveCSS("pointer-events", "auto");
    await dialog.getByRole("button", { name: "Back to integrations", exact: true }).press("Enter");
    await expect(trigger).toBeFocused();
  }
  // Search selects the existing owner section on narrow and wide layouts alike.
  const search = settings.getByRole("textbox", { name: "Search", exact: true });
  await search.fill("Authorized apps");
  await settings.getByRole("navigation").getByRole("button", { name: "Authorized apps", exact: true }).press("Enter");
  await settings.getByRole("button", { name: "Clear search", exact: true }).click();
  for (const title of ["Shared files", "Authorized apps", "Cloud browser data", "Purchased domains"]) {
    const trigger = settings.getByRole("button", { name: `Manage ${title}`, exact: true });
    await trigger.press("Enter");
    const dialog = page.getByRole(title === "Shared files" ? "dialog" : "region", { name: title, exact: true });
    await expect(dialog.getByText(serviceAvailability.management, { exact: true })).toBeVisible();
    await expect.poll(() => dialog.evaluate((element) => element.scrollWidth <= element.clientWidth && element.getBoundingClientRect().right <= innerWidth)).toBe(true);
    if (title === "Cloud browser data") {
      const preference = dialog.getByRole("button", { name: "Sign-in preference cannot be read", exact: true });
      await expect(preference).toBeDisabled();
      await expect(preference).not.toHaveAttribute("aria-checked");
      await expect(preference).not.toHaveAttribute("aria-pressed");
      await expect(preference).toHaveAccessibleDescription(/cannot be read/);
    }
    if (title === "Purchased domains") await expect(dialog.getByRole("button", { name: "Buy domain", exact: true })).toBeDisabled();
    if (title === "Shared files") {
      await expect(dialog.getByRole("button", { name: "Cancel", exact: true })).toBeFocused();
      await expect(dialog).toHaveCSS("pointer-events", "auto");
      await page.keyboard.press("Escape");
    } else {
      await expect(dialog.getByRole("heading", { name: title, level: 1, exact: true })).toBeFocused();
      await dialog.getByRole("button", { name: "Back to data management", exact: true }).press("Enter");
      await expect(settings.getByRole("heading", { name: "Data management", level: 1, exact: true })).toBeVisible();
    }
    await expect(settings).toBeVisible();
    await expect(trigger).toBeFocused();
  }
  await settings.getByTestId("settings-tab-credits").press("Enter");
  const usageCategories = settings.getByRole("tablist", { name: "Usage categories", exact: true });
  await usageCategories.getByRole("tab", { name: "Websites & games", exact: true }).click();
  await expect(settings.getByRole("heading", { name: "Cloud services", exact: true })).toBeVisible();
  await expect(settings.getByRole("button", { name: "Auto top-up", exact: true })).toBeDisabled();
  await expect(settings.getByLabel("Start date", { exact: true })).toBeDisabled();
  await usageCategories.getByRole("tab", { name: "Computer", exact: true }).click();
  await expect(settings.getByRole("button", { name: "Create cloud computer", exact: true })).toBeDisabled();
  await usageCategories.getByRole("tab", { name: "Phone", exact: true }).click();
  await settings.getByRole("button", { name: "Create now", exact: true }).press("Enter");
  const phone = page.getByRole("dialog", { name: "Assign a virtual phone to your agent", exact: true });
  await expect(phone.getByRole("button", { name: "Continue", exact: true })).toBeDisabled();
  await expect(phone.getByRole("button", { name: "Continue", exact: true })).toHaveAccessibleDescription(serviceAvailability.phone);
  await expect(phone.getByText(serviceAvailability.phone, { exact: true })).toBeVisible();
  await expect(phone.getByRole("button", { name: "Cancel", exact: true })).toBeFocused();
  await expect(phone).toHaveCSS("pointer-events", "auto");
  await page.keyboard.press("Escape");
  await expect(settings).toBeVisible();
  await usageCategories.getByRole("tab", { name: "Websites & games", exact: true }).click();
  await expect(settings.getByLabel("Start date", { exact: true })).toHaveValue("");
  await settings.getByTestId("settings-tab-appearance").press("Enter");
  const delivery = settings.getByTestId("settings-task-delivery");
  await delivery.press("ArrowDown");
  const choices = page.getByRole("listbox");
  for (const name of ["Send without interrupting", "Interrupt and send"]) {
    await expect(choices.getByRole("option", { name, exact: true })).toBeDisabled();
  }
  await expect(choices).toContainText("require owner service support");
  await page.keyboard.press("Escape");
  await expect(choices).toHaveCount(0);
  await expect(settings).toBeVisible();
  await expect(delivery).toBeFocused();
  await expect(delivery).toHaveText("Add to queue");
  expect(requests).toEqual([]);
});

// Team preview exposes only the Member invitation role; admin wire changes are
// covered by Team unit tests and the authenticated runtime browser check.
for (const width of [320, 1280]) {
  test(`Team dark layout and keyboard menus remain usable at ${width}px`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 844 });
    await page.addInitScript(() => {
      window.localStorage.setItem("kokoro.locale", "en");
      window.localStorage.setItem("kokoro.theme", "dark");
    });
    const writes: string[] = [];
    page.on("request", (request) => {
      if (new URL(request.url()).pathname.startsWith("/api/") && !["GET", "HEAD", "OPTIONS"].includes(request.method())) writes.push(request.method());
    });
    await page.goto("/app#settings/team", { waitUntil: "domcontentloaded" });
    const settings = page.getByTestId("settings-modal");
    await expect(settings.getByRole("heading", { name: "Teams", level: 1, exact: true })).toBeVisible();
    await expect(page.locator("html")).toHaveClass(/\bdark\b/u);
    expect(await page.evaluate(() => innerWidth)).toBe(width);
    const member = settings.getByTestId("member-row-preview-member");
    await expect(member.getByText("Preview User", { exact: true })).toBeVisible();
    await expect(member.getByText("Owner", { exact: true })).toBeVisible();
    await expect(member.getByText("You", { exact: true })).toBeVisible();
    if (width === 1280) {
      const activeTab = settings.getByTestId("settings-tab-team");
      await expect(activeTab).toBeVisible();
      await expect(activeTab).toHaveAttribute("aria-selected", "true");
      const activeContrast = await activeTab.evaluate((element) => {
        const canvas = document.createElement("canvas");
        canvas.width = canvas.height = 1;
        const context = canvas.getContext("2d")!;
        const ancestors: Element[] = [];
        for (let parent = element.parentElement; parent; parent = parent.parentElement) ancestors.unshift(parent);
        const luminance = () => {
          const [red = 0, green = 0, blue = 0] = Array.from(context.getImageData(0, 0, 1, 1).data).slice(0, 3).map((value) => {
            const channel = value / 255;
            return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
          });
          return red * 0.2126 + green * 0.7152 + blue * 0.0722;
        };
        for (const ancestor of ancestors) {
          context.fillStyle = getComputedStyle(ancestor).backgroundColor;
          context.fillRect(0, 0, 1, 1);
        }
        const surrounding = luminance();
        context.fillStyle = getComputedStyle(element).backgroundColor;
        context.fillRect(0, 0, 1, 1);
        const selected = luminance();
        return (Math.max(surrounding, selected) + 0.05) / (Math.min(surrounding, selected) + 0.05);
      });
      expect(activeContrast).toBeGreaterThanOrEqual(1.2);
    }

    const email = settings.getByTestId("invite-email");
    const role = settings.getByRole("combobox", { name: "Invitee role", exact: true });
    const invite = settings.getByTestId("invite-submit");
    await email.fill("unsent@example.test");
    await expect(role).toHaveText("Member");
    await expect(invite).toBeEnabled();
    const form = email.locator("xpath=ancestor::form");
    console.log(`Team ${width}px invitation geometry`, JSON.stringify(await form.evaluate((element) => ({
      form: element.getBoundingClientRect().toJSON(),
      scrollWidth: element.scrollWidth,
      clientWidth: element.clientWidth,
      controls: Array.from(element.querySelectorAll('[data-testid="invite-email"], [data-slot="select-trigger"], [data-testid="invite-submit"]'), (control) => ({ name: control.getAttribute("data-testid") ?? control.getAttribute("aria-label"), rect: control.getBoundingClientRect().toJSON() })),
    }))));
    await expect.poll(() => form.evaluate((element) => {
      const bounds = element.getBoundingClientRect();
      const controls = Array.from(element.querySelectorAll('[data-testid="invite-email"], [data-slot="select-trigger"], [data-testid="invite-submit"]'), (control) => control.getBoundingClientRect());
      const contained = controls.length === 3 && controls.every((rect) => rect.width > 0 && rect.height > 0 && rect.left >= Math.max(0, bounds.left) - 1 && rect.right <= Math.min(innerWidth, bounds.right) + 1);
      const disjoint = controls.every((rect, index) => controls.slice(index + 1).every((other) => rect.right <= other.left + 1 || other.right <= rect.left + 1 || rect.bottom <= other.top + 1 || other.bottom <= rect.top + 1));
      return contained && disjoint && element.scrollWidth <= element.clientWidth;
    })).toBe(true);
    await expect.poll(() => settings.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
    await page.screenshot({ path: testInfo.outputPath(`team-dark-${width}.png`), fullPage: true });

    await role.press("ArrowDown");
    let choices = page.getByRole("listbox");
    await expect(choices.getByRole("option", { name: "Member", exact: true })).toBeFocused();
    await expect(choices).toHaveCSS("pointer-events", "auto");
    await page.keyboard.press("Escape");
    await expect(choices).toHaveCount(0);
    await expect(settings).toBeVisible();
    await expect(role).toBeFocused();
    await role.press("ArrowDown");
    choices = page.getByRole("listbox");
    await expect(choices.getByRole("option", { name: "Member", exact: true })).toBeFocused();
    await page.keyboard.press("End");
    await page.keyboard.press("Enter");
    await expect(choices).toHaveCount(0);
    await expect(role).toHaveText("Member");
    await expect(role).toBeFocused();
    await expect(settings).toBeVisible();

    await settings.getByTestId("team-leave").press("Enter");
    const confirmation = settings.getByRole("group", { name: "Leave this team?", exact: true });
    await expect(confirmation.getByTestId("team-leave-confirm")).toBeVisible();
    await confirmation.getByRole("button", { name: "Cancel", exact: true }).press("Enter");
    await expect(confirmation).toHaveCount(0);
    await expect(settings.getByTestId("team-leave")).toBeVisible();
    await expect(member).toBeVisible();

    const more = settings.getByTestId("settings-more");
    if (await more.isVisible()) {
      await more.press("Enter");
      await page.getByTestId("settings-more-developer").press("Enter");
    } else {
      await settings.getByTestId("settings-tab-developer").press("Enter");
    }
    const createKey = settings.getByRole("button", { name: "Create API key", exact: true });
    await createKey.press("Enter");
    const dialog = page.getByRole("dialog", { name: "Create API key", exact: true });
    const expiry = dialog.getByRole("combobox", { name: "Expires", exact: true });
    await expiry.press("ArrowDown");
    const day = page.getByRole("option", { name: "24 hours", exact: true });
    await expect(day).toBeVisible();
    await expect(page.getByRole("option", { name: "Never", exact: true })).toBeFocused();
    await expect(page.getByRole("listbox")).toHaveCSS("pointer-events", "auto");
    const contrast = await day.evaluate((element) => {
      const list = element.closest('[role="listbox"]')!;
      const canvas = document.createElement("canvas");
      canvas.width = canvas.height = 1;
      const context = canvas.getContext("2d")!;
      const luminance = (color: string) => {
        context.clearRect(0, 0, 1, 1);
        context.fillStyle = color;
        context.fillRect(0, 0, 1, 1);
        const [red = 0, green = 0, blue = 0] = Array.from(context.getImageData(0, 0, 1, 1).data).slice(0, 3).map((value) => {
          const channel = value / 255;
          return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
        });
        return red * 0.2126 + green * 0.7152 + blue * 0.0722;
      };
      const foreground = luminance(getComputedStyle(element).color);
      const background = luminance(getComputedStyle(list).backgroundColor);
      return (Math.max(foreground, background) + 0.05) / (Math.min(foreground, background) + 0.05);
    });
    expect(contrast).toBeGreaterThanOrEqual(4.5);
    await page.screenshot({ path: testInfo.outputPath(`developer-expiry-dark-${width}.png`), fullPage: true });
    await page.keyboard.press("End");
    await expect(page.getByRole("option", { name: "360 days", exact: true })).toBeFocused();
    await page.keyboard.press("Home");
    await expect(page.getByRole("option", { name: "Never", exact: true })).toBeFocused();
    await page.keyboard.press("ArrowDown");
    await expect(page.getByRole("option", { name: "1 hour", exact: true })).toBeFocused();
    await page.keyboard.press("ArrowDown");
    await expect(day).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(page.getByRole("listbox")).toHaveCount(0);
    await expect(expiry).toHaveText("24 hours");
    await expect(expiry).toBeFocused();
    await expect(dialog).toBeVisible();
    await expect(settings).toBeVisible();
    await expect(dialog.getByRole("button", { name: "Create", exact: true })).toBeDisabled();
    await expect(dialog.getByRole("button", { name: "Create", exact: true })).toHaveAccessibleDescription(serviceAvailability.apiKeys);
    await expect(dialog).toHaveCSS("pointer-events", "auto");
    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
    await expect(settings).toBeVisible();
    await expect(createKey).toBeFocused();
    expect(writes).toEqual([]);
  });
}

test("Personalization import card, unknown knowledge preference and distinct dialogs fit real viewports", async ({ page }, testInfo) => {
  const width = testInfo.project.name.startsWith("mobile") ? 320 : 1280;
  await page.setViewportSize({ width, height: 844 });
  await page.addInitScript(() => {
    localStorage.setItem("kokoro.locale", "en");
    localStorage.setItem("kokoro.theme", "dark");
  });
  const writes: string[] = [];
  page.on("request", (request) => {
    if (new URL(request.url()).pathname.startsWith("/api/") && !["GET", "HEAD", "OPTIONS"].includes(request.method())) writes.push(request.method());
  });
  await page.goto("/app#settings/personalization", { waitUntil: "domcontentloaded" });
  const settings = page.getByTestId("settings-modal");
  const entry = settings.getByRole("button", { name: "Import", exact: true });
  await expect(entry).toHaveAccessibleDescription("Knowledge and memory imports are not connected yet.");
  await expect(entry.getByText("Knowledge and memory imports are not connected yet.", { exact: true })).toBeVisible();
  expect(await page.evaluate(() => innerWidth)).toBe(width);
  await expect.poll(() => entry.evaluate((element) => {
    const card = element.getBoundingClientRect();
    const copy = element.querySelector("strong")!.parentElement!;
    const text = Array.from(copy.children, (child) => child.getBoundingClientRect());
    return text.length === 3 && text.every((rect) => rect.width > 0 && rect.height > 0 && rect.left >= card.left && rect.right <= card.right && rect.top >= card.top && rect.bottom <= card.bottom)
      && text.every((rect, index) => index === 0 || rect.top >= text[index - 1]!.bottom)
      && card.height >= text[text.length - 1]!.bottom - text[0]!.top + 24
      && card.left >= 0 && card.right <= innerWidth && element.scrollWidth <= element.clientWidth;
  })).toBe(true);
  for (const name of ["Nickname", "Occupation"]) {
    const input = settings.getByRole("textbox", { name, exact: true });
    const layout = await input.evaluate((element) => {
      const count = document.getElementById(element.getAttribute("aria-describedby")!.split(" ")[0]!)!;
      const field = element.getBoundingClientRect();
      const counter = count.getBoundingClientRect();
      const label = element.closest("label")!.getBoundingClientRect();
      return { beforeInput: counter.bottom <= field.top, insideLabel: counter.left >= label.left && counter.right <= label.right, visibleWidth: field.left >= 0 && field.right <= innerWidth };
    });
    expect(layout).toEqual({ beforeInput: true, insideLabel: true, visibleWidth: true });
  }
  await page.screenshot({ path: testInfo.outputPath(`personalization-profile-${width}.png`), fullPage: true });
  // Clicking the card's leading icon/padding opens the same accessible entry.
  await entry.click({ position: { x: 20, y: 20 } });
  const memory = page.getByRole("dialog", { name: "Import memory", exact: true });
  const response = memory.getByRole("textbox", { name: "Paste the response", exact: true });
  await expect(response).toBeEditable();
  if (width === 1280) {
    await expect(memory).toHaveCSS("width", "560px");
    const copy = memory.getByRole("button", { name: "Copy this prompt", exact: true });
    const layout = await copy.evaluate((element) => {
      const title = element.parentElement!.querySelector("h3")!.getBoundingClientRect();
      const button = element.getBoundingClientRect();
      return button.left >= title.right && button.top < title.bottom && button.bottom > title.top;
    });
    expect(layout).toBe(true);
  }
  await response.fill("Disposable local response");
  await expect(memory.getByRole("button", { name: "Import", exact: true })).toBeDisabled();
  await expect.poll(() => memory.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    return rect.left >= 0 && rect.right <= innerWidth && rect.bottom <= innerHeight && element.scrollWidth <= element.clientWidth;
  })).toBe(true);
  await page.screenshot({ path: testInfo.outputPath(`personalization-memory-${width}.png`), fullPage: true });
  const cancel = memory.getByRole("button", { name: "Cancel", exact: true });
  await cancel.scrollIntoViewIfNeeded();
  await expect(cancel).toBeInViewport();
  await cancel.press("Enter");
  await expect(entry).toBeFocused();

  await settings.getByRole("tab", { name: "Knowledge", exact: true }).click();
  const unknown = settings.getByRole("button", { name: "Knowledge preference cannot be read", exact: true });
  await expect(unknown).toBeDisabled();
  await expect(unknown).not.toHaveAttribute("aria-checked");
  await expect(unknown).toHaveAccessibleDescription("The service is not connected. Knowledge preferences cannot be read or saved.");
  await expect(settings.getByRole("textbox", { name: "Search knowledge", exact: true })).toBeDisabled();
  await page.screenshot({ path: testInfo.outputPath(`personalization-knowledge-${width}.png`), fullPage: true });
  const add = settings.getByRole("button", { name: "Add", exact: true });
  await add.press("Enter");
  const knowledge = page.getByRole("dialog", { name: "Add knowledge", exact: true });
  await expect(knowledge.getByRole("textbox", { name: "Name", exact: true })).toBeFocused();
  if (width === 1280) await expect(knowledge).toHaveCSS("width", "680px");
  const content = knowledge.getByRole("textbox", { name: "Content", exact: true });
  await content.fill("Local content");
  await expect.poll(() => content.evaluate((element) => {
    const field = element.getBoundingClientRect();
    const counter = document.getElementById(element.getAttribute("aria-describedby")!)!.getBoundingClientRect();
    return counter.left >= field.left && counter.right <= field.right && counter.top >= field.top && counter.bottom <= field.bottom;
  })).toBe(true);
  await expect(knowledge.getByRole("button", { name: "Save", exact: true })).toBeDisabled();
  await expect.poll(() => knowledge.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    return rect.left >= 0 && rect.right <= innerWidth && rect.bottom <= innerHeight && element.scrollWidth <= element.clientWidth;
  })).toBe(true);
  await page.screenshot({ path: testInfo.outputPath(`personalization-add-knowledge-${width}.png`), fullPage: true });
  await expect(knowledge).toHaveCSS("pointer-events", "auto");
  await page.keyboard.press("Escape");
  await expect(knowledge).toHaveCount(0);
  await expect(settings).toBeVisible();
  await expect(add).toBeFocused();
  expect(writes).toEqual([]);
});

for (const theme of ["light", "dark"]) {
  test(`Mail inline sender and compact developer drafts retain focus and fit ${theme} viewports`, async ({ page }, testInfo) => {
    const width = testInfo.project.name.startsWith("mobile") ? 320 : 1280;
    await page.setViewportSize({ width, height: 844 });
    await page.addInitScript((theme) => {
      localStorage.setItem("kokoro.locale", "en");
      localStorage.setItem("kokoro.theme", theme);
    }, theme);
    const requests: string[] = [];
    page.on("request", (request) => {
      if (new URL(request.url()).pathname.startsWith("/api/session/")) requests.push(request.method());
    });
    await page.goto("/app#settings/mail", { waitUntil: "domcontentloaded" });
    const settings = page.getByTestId("settings-modal");
    const mail = settings.getByTestId("settings-service-mail");
    const add = mail.getByRole("button", { name: "Add authorized sender", exact: true });
    await expect(add).toHaveText("Add authorized sender");
    await add.press("Enter");
    const form = mail.getByRole("form", { name: "Add authorized sender", exact: true });
    await expect(page.getByRole("dialog", { name: "Add authorized sender", exact: true })).toHaveCount(0);
    const email = form.getByRole("textbox", { name: "Sender email", exact: true });
    await expect(email).toBeFocused();
    await email.fill("not an email");
    await email.press("Tab");
    await expect(email).toHaveAttribute("aria-invalid", "true");
    await expect(email).toHaveAccessibleDescription("Enter a valid email address.");
    await email.fill("sender@example.test");
    await expect(form.getByRole("alert")).toHaveCount(0);
    const save = form.getByRole("button", { name: "Save", exact: true });
    await expect(save).toBeDisabled();
    await expect(save).toHaveAccessibleDescription(serviceAvailability.mail);
    await email.press("Enter");
    await expect(form).toBeVisible();
    await expect.poll(() => form.evaluate((element) => {
      const bounds = element.getBoundingClientRect();
      const controls = Array.from(element.querySelectorAll("input, button"), (node) => node.getBoundingClientRect());
      return bounds.left >= 0 && bounds.right <= innerWidth && element.scrollWidth <= element.clientWidth
        && controls.every((rect) => rect.width > 0 && rect.left >= bounds.left && rect.right <= bounds.right);
    })).toBe(true);
    await form.getByRole("button", { name: "Cancel", exact: true }).click();
    await expect(form).toHaveCount(0);
    await expect(add).toBeFocused();
    await add.press("Enter");
    await expect(email).toHaveValue("");
    await expect(email).toBeFocused();
    await email.fill("discard@example.test");
    await email.press("Escape");
    await expect(form).toHaveCount(0);
    await expect(settings).toBeVisible();
    await expect(add).toBeFocused();
    await add.press("Enter");
    await email.fill("tab-private@example.test");
    await mail.getByRole("tab", { name: "Inbox", exact: true }).click();
    await expect(form).toHaveCount(0);
    for (const name of ["Sender", "Content", "Date"]) await expect(mail.getByRole("columnheader", { name, exact: true })).toBeVisible();
    await expect(mail.getByRole("heading", { name: "Inbox", exact: true })).toHaveCount(0);
    await expect(mail.getByRole("button", { name: "Refresh inbox", exact: true })).toBeDisabled();
    expect(await mail.getByRole("button", { name: "Refresh inbox", exact: true }).evaluate((element) => {
      const rect = element.getBoundingClientRect();
      const parent = element.parentElement!.getBoundingClientRect();
      return Math.abs(rect.width - rect.height) <= 1 && rect.width >= 32 && rect.left >= parent.left - 1 && rect.right <= parent.right + 1 && rect.top >= parent.top - 1 && rect.bottom <= parent.bottom + 1;
    })).toBe(true);
    await mail.getByRole("tab", { name: "Settings", exact: true }).click();
    await add.press("Enter");
    await expect(email).toHaveValue("");
    await email.press("Escape");

    for (const [trigger, title, label, desktopWidth] of [
      ["Settings", "Mailbox settings", "Address prefix", "440px"],
      ["Add workflow mailbox", "Add workflow mailbox", "Mailbox suffix", "480px"],
    ] as const) {
      const entry = mail.getByRole("button", { name: trigger, exact: true });
      await entry.press("Enter");
      const dialog = page.getByRole("dialog", { name: title, exact: true });
      const input = dialog.getByRole("textbox", { name: label, exact: true });
      await expect(input).toBeFocused();
      await input.fill("private-draft");
      await expect(dialog.getByText("Domain not configured", { exact: true })).toBeVisible();
      await expect(dialog).not.toContainText("manus.bot");
      await expect(dialog.getByRole("button", { disabled: true })).toHaveAccessibleDescription(serviceAvailability.mail);
      if (width === 1280) await expect(dialog).toHaveCSS("width", desktopWidth);
      await expect.poll(() => dialog.evaluate((element) => {
        const rect = element.getBoundingClientRect();
        return rect.left >= 0 && rect.right <= innerWidth && rect.top >= 0 && rect.bottom <= innerHeight && element.scrollWidth <= element.clientWidth;
      })).toBe(true);
      await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
      await expect(entry).toBeFocused();
      await entry.press("Enter");
      await expect(input).toHaveValue("");
      await expect(input).toBeFocused();
      await expect(dialog).toHaveCSS("pointer-events", "auto");
      await page.keyboard.press("Escape");
      await expect(dialog).toHaveCount(0);
      await expect(settings).toBeVisible();
    }
    await page.screenshot({ path: testInfo.outputPath(`mail-${theme}-${width}.png`), fullPage: true });
    if (width === 320) {
      await settings.getByTestId("settings-more").press("Enter");
      await page.getByTestId("settings-more-developer").press("Enter");
    } else await settings.getByTestId("settings-tab-developer").press("Enter");
    const developer = settings.getByTestId("settings-service-developer");
    for (const [tab, trigger, label, unavailable] of [
      ["API keys", "Create API key", "Name your key", serviceAvailability.apiKeys],
      ["Webhooks", "Create webhook", "URL", serviceAvailability.webhooks],
    ] as const) {
      await developer.getByRole("tab", { name: tab, exact: true }).click();
      await expect(developer.getByRole("button", { name: "Documentation", exact: true })).toHaveAccessibleDescription(serviceAvailability.docs);
      const entry = developer.getByRole("button", { name: trigger, exact: true });
      await entry.press("Enter");
      const dialog = page.getByRole("dialog", { name: trigger, exact: true });
      await expect(dialog.getByRole("textbox", { name: label, exact: true })).toBeFocused();
      if (width === 1280) await expect(dialog).toHaveCSS("width", "400px");
      await expect(dialog.getByRole("button", { disabled: true })).toHaveAccessibleDescription(unavailable);
      await expect.poll(() => dialog.evaluate((element) => {
        const rect = element.getBoundingClientRect();
        return rect.left >= 0 && rect.right <= innerWidth && element.scrollWidth <= element.clientWidth;
      })).toBe(true);
      await expect(dialog).toHaveCSS("pointer-events", "auto");
      await page.keyboard.press("Escape");
      await expect(dialog).toHaveCount(0);
      await expect(settings).toBeVisible();
      await expect(entry).toBeFocused();
    }
    await page.screenshot({ path: testInfo.outputPath(`developer-${theme}-${width}.png`), fullPage: true });
    expect(requests).toEqual([]);
  });
}

// Integration detail pages are local previews; these journeys never authorize a provider.
for (const theme of ["light", "dark"]) {
  test(`Integration cards open local detail pages with inert workflow examples in ${theme} viewports`, async ({ page }, testInfo) => {
    const width = testInfo.project.name.startsWith("mobile") ? 320 : 1280;
    await page.setViewportSize({ width, height: 844 });
    await page.addInitScript((theme) => {
      localStorage.setItem("kokoro.locale", "en");
      localStorage.setItem("kokoro.theme", theme);
    }, theme);
    await page.goto("/app#settings/integration", { waitUntil: "domcontentloaded" });
    const settings = page.getByTestId("settings-modal");
    const content = settings.getByTestId("settings-service-integration");
    await expect(content.getByRole("heading", { name: "Integrations", level: 1 })).toBeVisible();
    expect(await content.getByText("Explore external app integrations for creating tasks.", { exact: true }).evaluate((element) => {
      const rect = element.getBoundingClientRect();
      const header = element.closest("header");
      const title = header?.querySelector("h1")?.getBoundingClientRect();
      const bounds = header?.getBoundingClientRect();
      return Boolean(title && bounds && rect.top >= title.bottom - 1 && rect.bottom <= bounds.bottom + 1);
    })).toBe(true);
    const headerGeometry = await content.getByRole("heading", { name: "Integrations", level: 1 }).evaluate((element) => {
      const title = element.getBoundingClientRect();
      const header = element.parentElement!.getBoundingClientRect();
      return { titleTop: title.top, headerTop: header.top, titleInset: title.top - header.top };
    });
    console.log("Integration overview header", { width, theme, ...headerGeometry });
    if (width === 1280) expect(headerGeometry.titleInset).toBeGreaterThanOrEqual(24);
    const rows = await content.getByRole("list").evaluate((element) => Array.from(element.querySelectorAll("li > button")).map((card) => {
      const rect = card.getBoundingClientRect();
      const item = card.parentElement!.getBoundingClientRect();
      return { top: rect.top, height: rect.height, itemHeight: item.height };
    }));
    console.log("Integration card rows", { width, theme, rows });
    expect(rows).toHaveLength(5);
    for (const row of rows) {
      expect(Math.abs(row.height - row.itemHeight)).toBeLessThanOrEqual(1);
      for (const peer of rows.filter((peer) => Math.abs(peer.top - row.top) <= 1)) expect(Math.abs(row.height - peer.height)).toBeLessThanOrEqual(1);
    }
    const requests: string[] = [];
    page.on("request", (request) => {
      if (new URL(request.url()).pathname.startsWith("/api/")) requests.push(`${request.method()} ${new URL(request.url()).pathname}`);
    });
    for (const [index, provider] of ["Slack", "Apple Messages", "Telegram", "LINE", "Zapier"].entries()) {
      const card = content.getByRole("button", { name: `View ${provider} details`, exact: true });
      await card.scrollIntoViewIfNeeded();
      const geometry = await card.evaluate((element) => {
        const rect = element.getBoundingClientRect();
        const parent = element.parentElement!.getBoundingClientRect();
        const children = Array.from(element.querySelectorAll("strong, span > span, svg, img")).map((child) => child.getBoundingClientRect()).filter((child) => child.width > 0 && child.height > 0);
        return { whole: Math.abs(rect.width - parent.width) <= 1, height: rect.height, contained: children.every((child) => child.left >= rect.left - 1 && child.right <= rect.right + 1 && child.top >= rect.top - 1 && child.bottom <= rect.bottom + 1) };
      });
      expect(geometry.whole).toBe(true);
      expect(geometry.height).toBeGreaterThanOrEqual(44);
      expect(geometry.contained).toBe(true);
      if (index === 0) await card.click({ position: { x: 8, y: 8 } });
      else await card.press(index % 2 ? "Space" : "Enter");
      const detail = settings.getByRole("region", { name: provider, exact: true });
      await expect(page.getByRole("dialog", { name: provider, exact: true })).toHaveCount(0);
      await expect(detail.getByRole("heading", { name: provider, level: 1 })).toBeFocused();
      const primary = detail.getByRole("button", { name: provider === "Zapier" ? "Try it" : "Connect", exact: true }).first();
      await expect(primary).toBeDisabled();
      await expect(primary).toHaveAccessibleDescription(serviceAvailability.integration);
      await expect(detail.getByText(serviceAvailability.integration, { exact: true })).toBeVisible();
      expect(await detail.locator("a, input, textarea, iframe, canvas").count()).toBe(0);
      expect(await detail.evaluate((element) => element.scrollWidth <= element.clientWidth && element.getBoundingClientRect().left >= 0 && element.getBoundingClientRect().right <= innerWidth)).toBe(true);
      expect(await primary.evaluate((element) => {
        const strip = element.parentElement!;
        const rect = strip.getBoundingClientRect();
        return Array.from(strip.children).every((child) => {
          const bounds = child.getBoundingClientRect();
          return bounds.left >= rect.left - 1 && bounds.right <= rect.right + 1 && bounds.top >= rect.top - 1 && bounds.bottom <= rect.bottom + 1;
        });
      })).toBe(true);
      if (provider === "Slack") {
        await expect(detail.getByRole("heading", { name: "Overview", exact: true })).toBeVisible();
        await expect(detail.getByText("The intended use is to organize task requests and updates alongside team conversations. Message handling, commands and notifications are not available here.", { exact: true })).toBeVisible();
      }
      if (provider === "Zapier") {
        const examples = detail.getByRole("region", { name: "Workflow examples (not available yet)", exact: true });
        await expect(examples.getByRole("listitem")).toHaveCount(8);
        await expect(examples.getByRole("heading", { level: 3 })).toHaveText(["Calendly", "Google Forms", "Microsoft Teams", "Outlook", "Salesforce", "Shopify", "Zendesk", "Zoom"]);
        const tries = examples.getByRole("button", { name: "Try it", exact: true });
        await expect(tries).toHaveCount(8);
        for (const action of await tries.all()) {
          await expect(action).toBeDisabled();
          await expect(action).toHaveAccessibleDescription("These are static use examples. The workflow service is not available yet, so they cannot be tried.");
        }
        await tries.last().scrollIntoViewIfNeeded();
        await expect(tries.last()).toBeVisible();
        expect(await examples.evaluate((element) => {
          const rect = element.getBoundingClientRect();
          return element.scrollWidth <= element.clientWidth && Array.from(element.querySelectorAll("li")).every((item) => {
            const bounds = item.getBoundingClientRect();
            return bounds.left >= rect.left - 1 && bounds.right <= rect.right + 1 && Array.from(item.children).every((child) => {
              const content = child.getBoundingClientRect();
              return content.left >= bounds.left - 1 && content.right <= bounds.right + 1 && content.top >= bounds.top - 1 && content.bottom <= bounds.bottom + 1;
            });
          });
        })).toBe(true);
        await page.screenshot({ path: testInfo.outputPath(`integration-examples-${theme}-${width}.png`), fullPage: true });
      }
      await detail.getByRole("button", { name: "Back to integrations", exact: true }).press("Enter");
      await expect(card).toBeFocused();
      await expect(content.getByRole("heading", { name: "Integrations", level: 1 })).toBeVisible();
      await expect(settings).toBeVisible();
    }
    await content.getByRole("button", { name: "View Slack details", exact: true }).press("Enter");
    const search = settings.getByRole("textbox", { name: "Search", exact: true });
    await search.fill("Nickname");
    await settings.getByRole("navigation").getByRole("button", { name: "Nickname", exact: true }).press("Enter");
    await expect(settings.getByRole("heading", { name: "Personalization", level: 1 })).toBeVisible();
    await settings.getByRole("button", { name: "Clear search", exact: true }).click();
    if (width === 320) {
      await settings.getByTestId("settings-more").press("Enter");
      await page.getByTestId("settings-more-integration").press("Enter");
    } else await settings.getByTestId("settings-tab-integration").press("Enter");
    await expect(content.getByRole("heading", { name: "Integrations", level: 1 })).toBeVisible();
    await expect(content.getByRole("region", { name: "Slack", exact: true })).toHaveCount(0);
    await expect(content.getByRole("button", { name: "View Slack details", exact: true })).toBeVisible();
    expect(requests).toEqual([]);
  });
}

for (const theme of ["light", "dark"]) {
  test(`Data management uses local subpages and email drafts stay unallocated in ${theme} viewports`, async ({ page }, testInfo) => {
    const width = testInfo.project.name.startsWith("mobile") ? 320 : 1280;
    await page.setViewportSize({ width, height: 844 });
    await page.addInitScript((theme) => {
      localStorage.setItem("kokoro.locale", "en");
      localStorage.setItem("kokoro.theme", theme);
    }, theme);
    const requests: string[] = [];
    page.on("request", (request) => {
      if (new URL(request.url()).pathname.startsWith("/api/session/")) requests.push(request.method());
    });
    await page.goto("/app#settings/data-management", { waitUntil: "domcontentloaded" });
    const settings = page.getByTestId("settings-modal");
    const data = settings.getByTestId("settings-data-management");
    await expect(settings.getByRole("heading", { name: "Data management", level: 1, exact: true })).toHaveCount(1);
    for (const title of ["Authorized apps", "Cloud browser data", "Purchased domains"]) {
      const entry = data.getByRole("button", { name: `Manage ${title}`, exact: true });
      await expect(entry).toBeEnabled();
      const hitbox = await entry.boundingBox();
      expect(hitbox!.height).toBeGreaterThanOrEqual(width === 320 ? 44 : 32);
      await entry.press("Enter");
      await expect(page.getByRole("dialog", { name: title, exact: true })).toHaveCount(0);
      const detail = page.getByRole("region", { name: title, exact: true });
      const heading = detail.getByRole("heading", { name: title, level: 1, exact: true });
      await expect(heading).toBeFocused();
      await expect(settings.getByRole("heading", { level: 1 })).toHaveCount(1);
      await expect(detail.getByText(serviceAvailability.management, { exact: true })).toBeVisible();
      await expect(detail.getByText(/No authorized|No purchased|No cookies/)).toHaveCount(0);
      if (title === "Cloud browser data") {
        const preference = detail.getByRole("button", { name: "Sign-in preference cannot be read", exact: true });
        await expect(preference).toBeDisabled();
        await expect(preference).not.toHaveAttribute("aria-checked");
        await expect(preference).not.toHaveAttribute("aria-pressed");
        await expect(preference).toHaveAccessibleDescription(/cannot be read/);
        await expect(detail.getByRole("heading", { name: "Cookies and site data", exact: true })).toBeVisible();
      }
      if (title === "Purchased domains") {
        const buy = detail.getByRole("button", { name: "Buy domain", exact: true });
        await expect(buy).toBeDisabled();
        await expect(buy).toHaveAccessibleDescription(serviceAvailability.management);
      }
      await expect.poll(() => detail.evaluate((element) => {
        const title = element.querySelector("h1")!.getBoundingClientRect();
        const back = element.querySelector("header button")!.getBoundingClientRect();
        const bounds = element.getBoundingClientRect();
        return bounds.left >= 0 && bounds.right <= innerWidth && element.scrollWidth <= element.clientWidth
          && back.right <= title.left && title.right <= bounds.right;
      })).toBe(true);
      if (title !== "Cloud browser data") {
        const vertical = await detail.evaluate((element) => {
          const header = element.querySelector("header")!.getBoundingClientRect();
          const viewport = element.closest('[data-slot="scroll-area-viewport"]')!.getBoundingClientRect();
          const content = element.lastElementChild!;
          const children = Array.from(content.children, (child) => child.getBoundingClientRect());
          const top = Math.min(...children.map((rect) => rect.top));
          const bottom = Math.max(...children.map((rect) => rect.bottom));
          const available = viewport.bottom - header.bottom;
          return { top, bottom, areaTop: header.bottom, areaBottom: viewport.bottom, available, centerDelta: Math.abs((top + bottom) / 2 - (header.bottom + viewport.bottom) / 2) };
        });
        console.log("Data centered detail geometry", { title, width, theme, ...vertical });
        expect(vertical.centerDelta).toBeLessThanOrEqual(Math.max(12, vertical.available * 0.06));
        expect(vertical.top).toBeGreaterThanOrEqual(vertical.areaTop);
        expect(vertical.bottom).toBeLessThanOrEqual(vertical.areaBottom + 1);
      }
      await page.screenshot({ path: testInfo.outputPath(`data-${title}-${theme}-${width}.png`), fullPage: true });
      await detail.getByRole("button", { name: "Back to data management", exact: true }).press("Enter");
      await expect(data.getByRole("heading", { name: "Data management", level: 1, exact: true })).toBeVisible();
      await expect(entry).toBeFocused();
    }
    await data.getByRole("button", { name: "Manage Authorized apps", exact: true }).press("Enter");
    // Owner navigation leaves the local detail; returning must start at the overview.
    const search = settings.getByRole("textbox", { name: "Search", exact: true });
    await search.fill("Nickname");
    await settings.getByRole("navigation").getByRole("button", { name: "Nickname", exact: true }).press("Enter");
    await search.fill("Authorized apps");
    await settings.getByRole("navigation").getByRole("button", { name: "Authorized apps", exact: true }).press("Enter");
    await expect(data.getByRole("heading", { name: "Data management", level: 1, exact: true })).toBeVisible();
    await settings.getByRole("button", { name: "Clear search", exact: true }).click();
    if (width === 320) {
      await settings.getByTestId("settings-more").press("Enter");
      await page.getByTestId("settings-more-email").press("Enter");
    } else await settings.getByTestId("settings-tab-email").press("Enter");
    const create = settings.getByRole("button", { name: "Create new item", exact: true });
    await create.press("Enter");
    const dialog = page.getByRole("dialog", { name: "Create email", exact: true });
    const prefix = dialog.getByRole("textbox", { name: "Address prefix", exact: true });
    await expect(prefix).toBeFocused();
    await prefix.fill("private-prefix");
    await expect(prefix).toHaveAccessibleDescription("The domain is not configured. A real email address cannot be generated yet.");
    await expect(dialog.getByText("Domain not configured", { exact: true })).toBeVisible();
    await expect(dialog).not.toContainText("manus.bot");
    await expect(dialog.getByRole("button", { name: "Save", exact: true })).toBeDisabled();
    await expect(dialog.getByRole("button", { name: "Save", exact: true })).toHaveAccessibleDescription(serviceAvailability.email);
    if (width === 1280) await expect(dialog).toHaveCSS("width", "480px");
    await expect.poll(() => prefix.evaluate((element) => {
      const field = element.parentElement!.getBoundingClientRect();
      const controls = Array.from(element.parentElement!.children, (child) => child.getBoundingClientRect());
      return field.left >= 0 && field.right <= innerWidth && controls.every((rect) => rect.left >= field.left && rect.right <= field.right);
    })).toBe(true);
    await page.screenshot({ path: testInfo.outputPath(`email-${theme}-${width}.png`), fullPage: true });
    await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
    await expect(create).toBeFocused();
    await create.press("Enter");
    await expect(prefix).toHaveValue("");
    await expect(prefix).toBeFocused();
    await expect(dialog).toHaveCSS("pointer-events", "auto");
    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
    await expect(settings).toBeVisible();
    await expect(create).toBeFocused();
    expect(requests).toEqual([]);
  });
}

// The explicit preview server covers local navigation and shared layout here.
// Formal account verification/unknown-state behavior is covered by UI tests and normal-session CUA.
for (const theme of ["light", "dark"]) {
  test(`Account preview navigation and confirmation layouts preserve focus in ${theme} viewports`, async ({ page }, testInfo) => {
    const width = testInfo.project.name.startsWith("mobile") ? 320 : 1280;
    await page.setViewportSize({ width, height: 844 });
    await page.addInitScript((theme) => {
      localStorage.setItem("kokoro.locale", "en");
      localStorage.setItem("kokoro.theme", theme);
    }, theme);
    await page.goto("/app#settings/account", { waitUntil: "domcontentloaded" });
    const settings = page.getByTestId("settings-modal");
    await expect(settings.getByRole("textbox", { name: "Full name" })).toHaveValue("Preview User");
    const requests: string[] = [];
    page.on("request", (request) => {
      if (new URL(request.url()).pathname.startsWith("/api/")) requests.push(`${request.method()} ${new URL(request.url()).pathname}`);
    });
    const entry = settings.getByRole("button", { name: "Manage sign-in method", exact: true });
    await entry.press("Enter");
    const methods = settings.getByRole("region", { name: "Manage sign-in method", exact: true });
    await expect(page.getByRole("dialog", { name: "Manage sign-in method", exact: true })).toHaveCount(0);
    await expect(settings.getByRole("heading", { name: "Manage sign-in method", level: 1 })).toBeFocused();
    for (const provider of ["Google", "Microsoft", "Apple"]) await expect(methods.getByText(provider, { exact: true })).toBeVisible();
    await expect(methods.getByRole("button", { name: "Add passkey", exact: true })).toBeVisible();
    await expect(methods.locator("[data-provider]")).toHaveCount(3);
    expect(await methods.evaluate((element) => {
      const page = element.getBoundingClientRect();
      return element.scrollWidth <= element.clientWidth && page.left >= 0 && page.right <= innerWidth && Array.from(element.querySelectorAll("[data-provider]")).every((mark) => {
        const row = mark.parentElement!;
        const bounds = row.getBoundingClientRect();
        return bounds.left >= page.left - 1 && bounds.right <= page.right + 1 && Array.from(row.children).every((child) => {
          const rect = child.getBoundingClientRect();
          return rect.left >= bounds.left - 1 && rect.right <= bounds.right + 1 && rect.top >= bounds.top - 1 && rect.bottom <= bounds.bottom + 1;
        });
      });
    })).toBe(true);
    await page.screenshot({ path: testInfo.outputPath(`account-preview-login-${theme}-${width}.png`), fullPage: true });
    await settings.getByRole("button", { name: "Back to account", exact: true }).press("Enter");
    await expect(entry).toBeFocused();
    await entry.press("Space");
    await expect(methods).toBeVisible();
    await settings.getByTestId("settings-tab-shortcuts").press("Enter");
    await expect(settings.getByRole("heading", { name: "Keyboard shortcuts", level: 1 })).toBeVisible();
    await settings.getByTestId("settings-tab-account").press("Enter");
    await expect(settings.getByRole("heading", { name: "Account", level: 1 })).toBeVisible();
    await expect(methods).toHaveCount(0);
    for (const [triggerName, title] of [["Change", "Change email address"], ["Delete account", "Confirm account deletion"]] as const) {
      const trigger = settings.getByRole("button", { name: triggerName, exact: true });
      await trigger.press("Enter");
      const dialog = page.getByRole("dialog", { name: title, exact: true });
      await expect(dialog).toBeVisible();
      if (width === 1280) await expect(dialog).toHaveCSS("width", "400px");
      expect(await dialog.evaluate((element) => {
        const rect = element.getBoundingClientRect();
        return rect.left >= 0 && rect.right <= innerWidth && rect.top >= 0 && rect.bottom <= innerHeight && element.scrollWidth <= element.clientWidth;
      })).toBe(true);
      await expect(dialog.getByRole("button", { name: triggerName === "Change" ? "Next" : "Delete account", exact: true })).toBeDisabled();
      await expect(dialog).toHaveCSS("pointer-events", "auto");
      await page.screenshot({ path: testInfo.outputPath(`account-preview-${triggerName}-${theme}-${width}.png`), fullPage: true });
      await page.keyboard.press("Escape");
      await expect(dialog).toHaveCount(0);
      await expect(settings).toBeVisible();
      await expect(trigger).toBeFocused();
      await trigger.press("Enter");
      await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
      await expect(trigger).toBeFocused();
    }
    expect(requests).toEqual([]);
  });
}


for (const theme of ["light", "dark"]) {
  test(`Help center search, categories and guides remain usable in ${theme} viewports`, async ({ page }, testInfo) => {
    const width = testInfo.project.name.startsWith("mobile") ? 320 : 1280;
    await page.setViewportSize({ width, height: 844 });
    await page.addInitScript((theme) => {
      localStorage.setItem("kokoro.locale", "en");
      localStorage.setItem("kokoro.theme", theme);
    }, theme);
    await page.goto("/app#settings/help", { waitUntil: "domcontentloaded" });
    const settings = page.getByTestId("settings-modal");
    const help = settings.getByTestId("settings-help");
    const search = help.getByRole("searchbox", { name: "Search help", exact: true });
    await expect(search).toBeVisible();
    expect(await page.evaluate(() => innerWidth)).toBe(width);
    const requests: string[] = [];
    page.on("request", (request) => {
      if (new URL(request.url()).pathname.startsWith("/api/")) requests.push(`${request.method()} ${new URL(request.url()).pathname}`);
    });
    const categories = help.getByRole("group", { name: "Help categories", exact: true });
    await expect(categories.getByRole("button")).toHaveCount(4);
    for (const name of ["Account and devices", "Preferences", "Balance & billing", "Data management"]) {
      await expect(categories.getByRole("button", { name, exact: true })).toHaveAccessibleDescription("2 guides");
    }
    const result = help.getByRole("status");
    await expect(result).toHaveText("8 guides found");
    await expect(search).toHaveAttribute("maxlength", "200");
    const geometry = await categories.evaluate((element) => {
      const bounds = element.getBoundingClientRect();
      const cards = Array.from(element.querySelectorAll("button"), (card) => {
        const rect = card.getBoundingClientRect();
        return { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom,
          contained: Array.from(card.children).every((child) => {
            const childRect = child.getBoundingClientRect();
            return childRect.left >= rect.left - 1 && childRect.right <= rect.right + 1
              && childRect.top >= rect.top - 1 && childRect.bottom <= rect.bottom + 1;
          }) };
      });
      return { left: bounds.left, right: bounds.right, fits: element.scrollWidth <= element.clientWidth, cards };
    });
    expect(geometry.left).toBeGreaterThanOrEqual(0);
    expect(geometry.right).toBeLessThanOrEqual(width);
    expect(geometry.fits).toBe(true);
    expect(geometry.cards.every((card) => card.contained)).toBe(true);
    const [first, second] = geometry.cards;
    expect(first).toBeDefined();
    expect(second).toBeDefined();
    if (width === 320) {
      expect(Math.abs(first!.left - second!.left)).toBeLessThanOrEqual(1);
      expect(second!.top).toBeGreaterThanOrEqual(first!.bottom);
    } else {
      expect(Math.abs(first!.top - second!.top)).toBeLessThanOrEqual(1);
      expect(second!.left).toBeGreaterThanOrEqual(first!.right);
    }
    await search.fill("  CONFLICTS  ");
    await expect(result).toHaveText("2 guides found");
    await expect(help.getByRole("button", { name: "Save your name", exact: true })).toBeVisible();
    await expect(help.getByRole("button", { name: "Set keyboard shortcuts", exact: true })).toBeVisible();
    await categories.getByRole("button", { name: "Preferences", exact: true }).press("Space");
    await expect(result).toHaveText("1 guides found");
    await expect(categories.getByRole("button", { name: "Preferences", exact: true })).toHaveAttribute("aria-pressed", "true");
    await help.getByRole("button", { name: "All categories", exact: true }).press("Enter");
    await expect(result).toHaveText("2 guides found");
    await help.getByRole("button", { name: "Clear search", exact: true }).press("Enter");
    await expect(search).toHaveValue("");
    await expect(search).toBeFocused();
    await expect(result).toHaveText("8 guides found");

    const nameGuide = help.getByRole("button", { name: "Save your name", exact: true });
    const devicesGuide = help.getByRole("button", { name: "View and revoke device sessions", exact: true });
    await nameGuide.focus();
    await nameGuide.press("Enter");
    await expect(nameGuide).toHaveAttribute("aria-expanded", "true");
    await expect(help.getByText("In account settings, edit your name, view login devices, and sign out other sessions.", { exact: true })).toBeVisible();
    await nameGuide.press("ArrowDown");
    await expect(devicesGuide).toBeFocused();
    await devicesGuide.press("Space");
    await expect(devicesGuide).toHaveAttribute("aria-expanded", "true");
    await expect(nameGuide).toHaveAttribute("aria-expanded", "false");
    await devicesGuide.press("Space");
    await expect(devicesGuide).toHaveAttribute("aria-expanded", "false");

    await search.fill("x".repeat(200));
    await expect(result).toHaveText("0 guides found");
    await expect(help.getByRole("heading", { name: "No matching guides", exact: true })).toBeVisible();
    expect(await help.evaluate((element) => {
      const rect = element.getBoundingClientRect();
      const input = element.querySelector('input[type="search"]')!.getBoundingClientRect();
      return element.scrollWidth <= element.clientWidth && rect.left >= 0 && rect.right <= innerWidth
        && input.left >= rect.left && input.right <= rect.right;
    })).toBe(true);
    await help.getByRole("button", { name: "Reset filters", exact: true }).press("Enter");
    await expect(search).toHaveValue("");
    await expect(search).toBeFocused();
    await expect(result).toHaveText("8 guides found");
    await page.screenshot({ path: testInfo.outputPath(`help-center-${theme}-${width}.png`), fullPage: true });

    await search.fill("archive");
    const archive = help.getByRole("button", { name: "Archive and restore tasks", exact: true });
    await archive.press("Enter");
    const guide = help.getByRole("region", { name: "Archive and restore tasks", exact: true });
    await expect(guide.getByText(/continue explicitly rather than repeating blindly/)).toBeVisible();
    expect(requests).toEqual([]);
    await guide.getByRole("button", { name: "Data management", exact: true }).press("Enter");
    await expect(settings.getByRole("heading", { name: "Data management", level: 1, exact: true })).toBeVisible();
    if (width === 320) {
      await settings.getByTestId("settings-more").press("Enter");
      await page.getByTestId("settings-more-help").press("Enter");
    } else await settings.getByTestId("settings-tab-help").press("Enter");
    await expect(search).toHaveValue("");
    await expect(result).toHaveText("8 guides found");
    await expect(help.getByRole("button", { name: "All categories", exact: true })).toHaveAttribute("aria-pressed", "true");
    await expect(help.getByRole("button", { name: "Archive and restore tasks", exact: true })).toHaveAttribute("aria-expanded", "false");
    await expect(help.getByRole("button", { name: /Send|support/i })).toHaveCount(0);
    await expect(help.getByRole("link", { name: /Manus/i })).toHaveCount(0);
  });
}


for (const theme of ["light", "dark"]) {
  test(`Assets guidance phone and wallet dialogs preserve readable geometry and closing in ${theme} viewports`, async ({ page }, testInfo) => {
    const width = testInfo.project.name.startsWith("mobile") ? 320 : 1280;
    await page.setViewportSize({ width, height: 844 });
    await page.addInitScript((theme) => {
      localStorage.setItem("kokoro.locale", "en");
      localStorage.setItem("kokoro.theme", theme);
    }, theme);
    await page.goto("/app#settings/phone", { waitUntil: "domcontentloaded" });
    const settings = page.getByTestId("settings-modal");
    const create = settings.getByRole("button", { name: "Create now", exact: true });
    await expect(create).toBeVisible();
    expect(await page.evaluate(() => innerWidth)).toBe(width);
    const requests: string[] = [];
    page.on("request", (request) => {
      if (new URL(request.url()).pathname.startsWith("/api/")) requests.push(`${request.method()} ${new URL(request.url()).pathname}`);
    });
    const cases = [
      {
        kind: "phone", title: "Assign a virtual phone to your agent",
        reason: "The phone service is not available yet. Numbers cannot be read or created.",
        items: [
          ["Purpose", "Once connected, the service could provide an agent with a number for calls and text messages."],
          ["Your responsibilities", "Region availability, number eligibility, and usage requirements need confirmation before use. No number will be assigned here."],
          ["Recording and storage", "Recording, notification, and storage rules are not configured. No calls are recorded or stored here."],
        ],
      },
      {
        kind: "wallet", title: "Add payment method",
        reason: "The payment method service is not available yet. Payment methods cannot be read or added.",
        items: [
          ["Transaction confirmation", "Each transaction requires explicit confirmation. No transaction is initiated here."],
          ["Payment credentials", "Payment credentials should be managed by a payment provider. This screen does not collect card numbers."],
          ["Orders and support", "The actual merchant is responsible for order handling and support."],
        ],
      },
    ] as const;
    for (const item of cases) {
      if (item.kind === "wallet") {
        if (width === 320) {
          await settings.getByTestId("settings-more").press("Enter");
          await page.getByTestId("settings-more-wallet").press("Enter");
        } else await settings.getByTestId("settings-tab-wallet").press("Enter");
      }
      const trigger = item.kind === "phone" ? create : settings.getByTestId("settings-service-wallet").getByRole("button", { name: "Add", exact: true });
      await trigger.press("Enter");
      const dialog = page.getByRole("dialog", { name: item.title, exact: true });
      await expect(dialog).toBeVisible();
      const icons = dialog.locator('div[aria-hidden="true"] > span');
      await expect(icons).toHaveCount(2);
      const iconBoxes = await icons.evaluateAll((elements) => elements.map((element) => {
        const rect = element.getBoundingClientRect();
        return { width: rect.width, height: rect.height };
      }));
      console.log("Assets guidance icon geometry", { kind: item.kind, width, theme, iconBoxes });
      for (const box of iconBoxes) {
        expect(box.width).toBe(width === 320 ? 52 : 64);
        expect(box.height).toBe(width === 320 ? 52 : 64);
      }
      if (item.kind === "phone") {
        const caption = dialog.getByRole("heading", { name: "Before you start", exact: true });
        await expect(caption).toBeVisible();
        expect(await caption.evaluate((element) => {
          const group = element.parentElement!.getBoundingClientRect();
          const list = element.parentElement!.querySelector("ul")!.getBoundingClientRect();
          const title = element.getBoundingClientRect();
          return title.top >= group.top && title.bottom <= list.top && list.bottom <= group.bottom;
        })).toBe(true);
      }
      const list = dialog.getByRole("list");
      await expect(list.getByRole("listitem")).toHaveCount(3);
      for (const [title, body] of item.items) {
        const heading = list.getByRole("heading", { name: title, exact: true });
        const copy = list.getByText(body, { exact: true });
        await expect(heading).toBeVisible();
        await copy.scrollIntoViewIfNeeded();
        await expect(copy).toBeVisible();
        expect(await copy.evaluate((element) => {
          const dialog = element.closest('[role="dialog"]')!.getBoundingClientRect();
          const rect = element.getBoundingClientRect();
          return rect.left >= dialog.left && rect.right <= dialog.right
            && rect.top >= dialog.top && rect.bottom <= dialog.bottom;
        })).toBe(true);
      }
      expect(await list.evaluate((element) => {
        const list = element.getBoundingClientRect();
        return element.scrollWidth <= element.clientWidth && Array.from(element.querySelectorAll("li"), (row) => {
          const bounds = row.getBoundingClientRect();
          return bounds.left >= list.left && bounds.right <= list.right
            && Array.from(row.querySelectorAll("svg, h3, p"), (child) => {
              const rect = child.getBoundingClientRect();
              return rect.left >= bounds.left - 1 && rect.right <= bounds.right + 1
                && rect.top >= bounds.top - 1 && rect.bottom <= bounds.bottom + 1;
            }).every(Boolean);
        }).every(Boolean);
      })).toBe(true);
      const next = dialog.getByRole("button", { name: "Continue", exact: true });
      const cancel = dialog.getByRole("button", { name: "Cancel", exact: true });
      await expect(next).toBeDisabled();
      await expect(next).toHaveAccessibleDescription(item.reason);
      await expect(dialog.getByText(item.reason, { exact: true })).toBeVisible();
      await cancel.scrollIntoViewIfNeeded();
      const footer = await dialog.locator('[data-slot="dialog-footer"]').evaluate((element) => {
        const bounds = element.getBoundingClientRect();
        const buttons = Array.from(element.querySelectorAll("button"), (button) => {
          const rect = button.getBoundingClientRect();
          return { text: button.textContent, left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom, width: rect.width };
        });
        return { left: bounds.left, right: bounds.right, width: bounds.width, buttons };
      });
      const continueRect = footer.buttons.find((button) => button.text === "Continue")!;
      const cancelRect = footer.buttons.find((button) => button.text === "Cancel")!;
      if (item.kind === "wallet") {
        expect(Math.abs(continueRect.width - footer.width)).toBeLessThanOrEqual(1);
        expect(cancelRect.width).toBeLessThan(continueRect.width);
        expect(cancelRect.top).toBeGreaterThanOrEqual(continueRect.bottom);
      } else {
        expect(Math.abs(continueRect.top - cancelRect.top)).toBeLessThanOrEqual(1);
        expect(cancelRect.right).toBeLessThanOrEqual(continueRect.left);
      }
      expect(await dialog.evaluate((element) => {
        const rect = element.getBoundingClientRect();
        return rect.left >= 0 && rect.right <= innerWidth && rect.top >= 0 && rect.bottom <= innerHeight
          && element.scrollWidth <= element.clientWidth;
      })).toBe(true);
      await expect(cancel).toBeVisible();
      await page.screenshot({ path: testInfo.outputPath(`assets-guidance-${item.kind}-${theme}-${width}.png`), fullPage: true });
      await cancel.press("Enter");
      await expect(dialog).toHaveCount(0);
      await expect(settings).toBeVisible();
      await expect(trigger).toBeFocused();
      await trigger.press("Enter");
      await expect(dialog).toHaveCSS("pointer-events", "auto");
      await dialog.getByRole("button", { name: "Close dialog", exact: true }).focus();
      await page.keyboard.press("Escape");
      await expect(dialog).toHaveCount(0);
      await expect(settings).toBeVisible();
      await expect(trigger).toBeFocused();
    }
    expect(requests).toEqual([]);
  });
}


for (const theme of ["light", "dark"]) {
  test(`Preferences layout keeps long German labels and controls readable in ${theme} viewports`, async ({ page }, testInfo) => {
    const width = testInfo.project.name.startsWith("mobile") ? 320 : 1280;
    await page.setViewportSize({ width, height: 844 });
    await page.addInitScript((theme) => {
      localStorage.setItem("kokoro.locale", "de");
      localStorage.setItem("kokoro.theme", theme);
    }, theme);
    await page.goto("/app#settings/appearance", { waitUntil: "domcontentloaded" });
    const settings = page.getByTestId("settings-modal");
    const notifications = settings.getByRole("region", { name: "Kommunikationseinstellungen", exact: true });
    await expect(notifications).toBeVisible();
    expect(await page.evaluate(() => innerWidth)).toBe(width);
    const requests: string[] = [];
    page.on("request", (request) => {
      if (new URL(request.url()).pathname.startsWith("/api/")) requests.push(`${request.method()} ${new URL(request.url()).pathname}`);
    });
    for (const name of ["Browserbenachrichtigungen", "Tonbenachrichtigungen", "Produktupdates erhalten", "Kokoro-Werbung"]) {
      const control = notifications.getByRole("switch", { name, exact: true });
      await expect(control).toBeDisabled();
      await control.scrollIntoViewIfNeeded();
      const geometry = await control.evaluate((element) => {
        const row = element.parentElement!;
        const bounds = row.getBoundingClientRect();
        const copy = row.firstElementChild!.getBoundingClientRect();
        const control = element.getBoundingClientRect();
        const text = Array.from(row.firstElementChild!.children, (child) => {
          const rect = child.getBoundingClientRect();
          return { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom };
        });
        return { bounds: { left: bounds.left, right: bounds.right, top: bounds.top, bottom: bounds.bottom },
          copy: { left: copy.left, right: copy.right, top: copy.top, bottom: copy.bottom },
          control: { left: control.left, right: control.right, top: control.top, bottom: control.bottom },
          text, borderBottom: getComputedStyle(row).borderBottomWidth, borderTop: getComputedStyle(row).borderTopWidth };
      });
      console.log("German notification row geometry", { name, width, theme, geometry });
      expect(geometry.copy.right).toBeLessThanOrEqual(geometry.control.left);
      expect(geometry.copy.top).toBeGreaterThanOrEqual(geometry.bounds.top);
      expect(geometry.copy.bottom).toBeLessThanOrEqual(geometry.bounds.bottom);
      expect(geometry.text.every((rect) => rect.left >= geometry.bounds.left && rect.right <= geometry.control.left
        && rect.top >= geometry.bounds.top && rect.bottom <= geometry.bounds.bottom)).toBe(true);
      expect(geometry.control.right).toBeLessThanOrEqual(geometry.bounds.right);
      expect(geometry.borderBottom).toBe("0px");
      expect(geometry.borderTop).toBe(name === "Kokoro-Werbung" ? "1px" : "0px");
    }
    await page.screenshot({ path: testInfo.outputPath(`preferences-general-${theme}-${width}.png`), fullPage: true });

    await settings.getByTestId("settings-tab-shortcuts").press("Enter");
    const shortcuts = settings.getByTestId("settings-shortcuts");
    const rows = shortcuts.locator('[class*="shortcutRow"]');
    await expect(rows).toHaveCount(5);
    await expect(rows.nth(1)).toContainText("Spracheingabe");
    await expect(rows.nth(1).getByRole("button", { name: "Spracheingabe ist derzeit nicht verfügbar", exact: true })).toBeDisabled();
    for (const row of await rows.all()) {
      await row.scrollIntoViewIfNeeded();
      expect(await row.evaluate((element) => {
        const bounds = element.getBoundingClientRect();
        const children = Array.from(element.children, (child) => child.getBoundingClientRect());
        const [label, controls] = children;
        return bounds.left >= 0 && bounds.right <= innerWidth && element.scrollWidth <= element.clientWidth
          && children.every((rect) => rect.left >= bounds.left - 1 && rect.right <= bounds.right + 1 && rect.top >= bounds.top - 1 && rect.bottom <= bounds.bottom + 1)
          && !!label && !!controls && (label.right <= controls.left || label.bottom <= controls.top);
      })).toBe(true);
    }
    const original = await page.evaluate(() => localStorage.getItem("kokoro.web.keyboard-shortcuts"));
    const edit = shortcuts.getByRole("button", { name: "Tastenkürzel Neue Aufgabe bearbeiten", exact: true });
    const reset = shortcuts.getByRole("button", { name: "Auf Standard zurücksetzen", exact: true });
    await edit.press("Enter");
    await expect(edit.getByText("Tastenkürzel drücken", { exact: true })).toBeVisible();
    const cancel = shortcuts.getByRole("button", { name: "Aufzeichnung des Tastenkürzels abbrechen", exact: true });
    await expect(cancel).toBeVisible();
    const recordingGeometry = await edit.evaluate((element) => {
      const controls = element.parentElement!.getBoundingClientRect();
      const text = element.firstElementChild!.getBoundingClientRect();
      return text.left >= controls.left && text.right <= controls.right && text.top >= controls.top && text.bottom <= controls.bottom
        && element.scrollWidth <= element.clientWidth;
    });
    expect(recordingGeometry).toBe(true);
    expect(await cancel.evaluate((element) => {
      const rect = element.getBoundingClientRect();
      const range = document.createRange(); range.selectNodeContents(element);
      const text = range.getBoundingClientRect();
      return rect.left >= 0 && rect.right <= innerWidth && text.left >= rect.left && text.right <= rect.right
        && text.top >= rect.top && text.bottom <= rect.bottom;
    })).toBe(true);
    await page.keyboard.press("Escape");
    await expect(cancel).toHaveCount(0);
    await expect(settings).toBeVisible();
    expect(await page.evaluate(() => localStorage.getItem("kokoro.web.keyboard-shortcuts"))).toBe(original);
    await edit.press("Enter");
    await page.keyboard.press("Tab");
    await expect(cancel).toHaveCount(0);
    await expect(settings).toBeVisible();
    expect(await page.evaluate(() => localStorage.getItem("kokoro.web.keyboard-shortcuts"))).toBe(original);
    await reset.scrollIntoViewIfNeeded();
    expect(await reset.evaluate((element) => {
      const rect = element.getBoundingClientRect();
      const viewport = element.closest('[data-slot="scroll-area-viewport"]')!.getBoundingClientRect();
      const range = document.createRange(); range.selectNodeContents(element);
      const text = range.getBoundingClientRect();
      return text.left >= rect.left && text.right <= rect.right && text.top >= rect.top && text.bottom <= rect.bottom
        && rect.left >= 0 && rect.right <= innerWidth && rect.top >= viewport.top && rect.bottom <= viewport.bottom;
    })).toBe(true);
    await page.screenshot({ path: testInfo.outputPath(`preferences-shortcuts-${theme}-${width}.png`), fullPage: true });

    // Preview has no explicit formal CAS Save button; this covers the shared
    // Preview covers identity layout; saving requires an authenticated session.
    await settings.getByTestId("settings-tab-account").press("Enter");
    const account = settings.getByTestId("settings-account");
    const name = account.getByRole("textbox", { name: "Vollständiger Name", exact: true });
    await expect(name).toHaveValue("Preview User");
    const nameGeometry = await name.evaluate((element) => {
      const row = element.closest('[class*="accountIdentityRow"]')!.getBoundingClientRect();
      const input = element.getBoundingClientRect();
      const label = element.parentElement!.firstElementChild!.getBoundingClientRect();
      return { row: { left: row.left, right: row.right }, input: { left: input.left, right: input.right, top: input.top }, label: { left: label.left, right: label.right, bottom: label.bottom },
        columns: getComputedStyle(element.parentElement!).gridTemplateColumns };
    });
    console.log("German preview name geometry", { width, theme, nameGeometry });
    expect(nameGeometry.row.left).toBeGreaterThanOrEqual(0);
    expect(nameGeometry.row.right).toBeLessThanOrEqual(width);
    expect(nameGeometry.input.left).toBeGreaterThanOrEqual(nameGeometry.row.left);
    expect(nameGeometry.input.right).toBeLessThanOrEqual(nameGeometry.row.right);
    expect(nameGeometry.label.left).toBeGreaterThanOrEqual(nameGeometry.row.left);
    expect(nameGeometry.label.right).toBeLessThanOrEqual(nameGeometry.row.right);
    expect(nameGeometry.label.bottom).toBeLessThanOrEqual(nameGeometry.input.top);
    expect(await settings.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
    await page.screenshot({ path: testInfo.outputPath(`preferences-name-preview-${theme}-${width}.png`), fullPage: true });
    expect(requests).toEqual([]);
  });
}

for (const theme of ["light", "dark"]) {
  test(`Usage resource guidance and cards keep their real boundaries in ${theme} viewports`, async ({ page }, testInfo) => {
    const width = testInfo.project.name.startsWith("mobile") ? 320 : 1280;
    await page.setViewportSize({ width, height: 844 });
    await page.addInitScript((theme) => {
      localStorage.setItem("kokoro.locale", "en");
      localStorage.setItem("kokoro.theme", theme);
    }, theme);
    await page.goto("/app#settings/credits", { waitUntil: "domcontentloaded" });
    const settings = page.getByTestId("settings-modal");
    const categories = settings.getByRole("tablist", { name: "Usage categories", exact: true });
    await expect(categories).toBeVisible();
    expect(await page.evaluate(() => innerWidth)).toBe(width);
    const requests: string[] = [];
    page.on("request", (request) => {
      if (new URL(request.url()).pathname.startsWith("/api/")) requests.push(`${request.method()} ${new URL(request.url()).pathname}`);
    });
    const searchTokens = await settings.getByRole("textbox", { name: "Search", exact: true }).evaluate((input) => {
      const wrapper = input.parentElement!;
      const probe = document.createElement("span");
      probe.style.border = "1px solid var(--border)";
      probe.style.color = "var(--muted-foreground)";
      wrapper.appendChild(probe);
      const expected = getComputedStyle(probe);
      const expectedBorder = expected.borderTopColor;
      const expectedIcon = expected.color;
      probe.remove();
      const border = parseFloat(getComputedStyle(input).borderTopWidth) > 0 ? getComputedStyle(input) : getComputedStyle(wrapper);
      return { border: border.borderTopColor, width: parseFloat(border.borderTopWidth), icon: getComputedStyle(wrapper.querySelector("svg")!).color, expectedBorder, expectedIcon };
    });
    expect(searchTokens.width).toBeGreaterThanOrEqual(1);
    expect(searchTokens.border).toBe(searchTokens.expectedBorder);
    expect(searchTokens.icon).toBe(searchTokens.expectedIcon);

    const resourceReason = "Not available yet";
    for (const [tab, title, button] of [["Computer", "Cloud computer", "Create cloud computer"], ["Phone", "Phone", "Create now"]] as const) {
      await categories.getByRole("tab", { name: tab, exact: true }).click();
      const guidance = settings.getByRole("heading", { name: title, exact: true }).locator("..");
      const action = guidance.getByRole("button", { name: button, exact: true });
      await expect(action).toBeVisible();
      await expect(guidance.locator(":scope > span > svg")).toHaveCount(1);
      const geometry = await guidance.evaluate((element) => {
        const bounds = element.getBoundingClientRect();
        const viewport = element.closest('[data-slot="scroll-area-viewport"]')!.getBoundingClientRect();
        const children = Array.from(element.children, (child) => child.getBoundingClientRect());
        const top = Math.min(...children.map((child) => child.top));
        const bottom = Math.max(...children.map((child) => child.bottom));
        const ancestors = [];
        for (let node = element.parentElement; node && ancestors.length < 5; node = node.parentElement) {
          const rect = node.getBoundingClientRect(); const css = getComputedStyle(node);
          ancestors.push({ slot: node.getAttribute("data-slot"), panel: node.getAttribute("data-panel"), height: rect.height, display: css.display, flex: css.flex, cssHeight: css.height, minHeight: css.minHeight });
        }
        return { top: bounds.top, bottom: bounds.bottom, left: bounds.left, right: bounds.right, height: bounds.height, viewportBottom: viewport.bottom, ancestors,
          centerDelta: Math.abs((top + bottom) / 2 - (bounds.top + bounds.bottom) / 2),
          contained: children.every((child) => child.left >= bounds.left - 1 && child.right <= bounds.right + 1 && child.top >= bounds.top - 1 && child.bottom <= bounds.bottom + 1),
          overflow: element.scrollWidth > element.clientWidth };
      });
      console.log("Usage guidance actual remaining-panel geometry", { width, theme, tab, geometry });
      expect(geometry.left).toBeGreaterThanOrEqual(0);
      expect(geometry.right).toBeLessThanOrEqual(width);
      expect(geometry.bottom).toBeGreaterThanOrEqual(geometry.viewportBottom - 1);
      expect(geometry.height).toBeGreaterThan(250);
      expect(geometry.centerDelta).toBeLessThanOrEqual(1);
      expect(geometry.contained).toBe(true);
      expect(geometry.overflow).toBe(false);
      if (tab === "Computer") {
        await expect(action).toBeDisabled();
        await expect(action).toHaveAccessibleDescription(resourceReason);
        await expect(guidance.getByText(resourceReason, { exact: true })).toBeVisible();
        await expect(guidance).toContainText("A workspace for ongoing cloud tasks.");
        await expect(guidance).not.toContainText("not connected");
      } else {
        await expect(guidance.getByText(serviceAvailability.phone, { exact: true })).toBeVisible();
        await action.press("Enter");
        const dialog = page.getByRole("dialog", { name: "Assign a virtual phone to your agent", exact: true });
        await expect(dialog.getByRole("button", { name: "Continue", exact: true })).toBeDisabled();
        await expect(dialog.getByRole("button", { name: "Continue", exact: true })).toHaveAccessibleDescription(serviceAvailability.phone);
        await expect(dialog.getByRole("button", { name: "Cancel", exact: true })).toBeFocused();
        await dialog.getByRole("button", { name: "Cancel", exact: true }).press("Enter");
        await expect(dialog).toHaveCount(0);
        await expect(action).toBeFocused();
        await expect(settings).toBeVisible();
      }
      await page.screenshot({ path: testInfo.outputPath(`usage-${tab}-${theme}-${width}.png`), fullPage: true });
    }

    await categories.getByRole("tab", { name: "Websites & games", exact: true }).click();
    await expect(settings.getByText(resourceReason, { exact: true })).toHaveCount(1);
    const cards = ["Cloud services", "Artificial intelligence", "Integrations"].map((name) => settings.getByRole("heading", { name, exact: true }).locator(".."));
    for (const card of cards) {
      await card.scrollIntoViewIfNeeded();
      await expect(card.getByText("—", { exact: true })).toHaveAccessibleDescription(resourceReason);
      const box = await card.evaluate((element) => {
        const bounds = element.getBoundingClientRect();
        return { top: bounds.top, bottom: bounds.bottom, left: bounds.left, right: bounds.right, height: bounds.height,
          contained: Array.from(element.children).every((child) => { const rect = child.getBoundingClientRect(); return rect.left >= bounds.left - 1 && rect.right <= bounds.right + 1 && rect.top >= bounds.top - 1 && rect.bottom <= bounds.bottom + 1; }),
          border: parseFloat(getComputedStyle(element).borderTopWidth), overflow: element.scrollWidth > element.clientWidth };
      });
      expect(box.left).toBeGreaterThanOrEqual(0);
      expect(box.right).toBeLessThanOrEqual(width);
      expect(box.contained).toBe(true);
      expect(box.overflow).toBe(false);
      expect(box.border).toBeGreaterThanOrEqual(1);
    }
    // Sample all three in one layout frame so scrolling does not affect row geometry.
    const arrangement = await cards[0]!.evaluate((element) => Array.from(element.parentElement!.children, (child) => {
      const rect = child.getBoundingClientRect(); return { top: rect.top, bottom: rect.bottom, left: rect.left, right: rect.right, height: rect.height };
    }));
    expect(arrangement).toHaveLength(3);
    if (width === 1280) {
      expect(Math.max(...arrangement.map((box) => box.top)) - Math.min(...arrangement.map((box) => box.top))).toBeLessThanOrEqual(1);
      expect(Math.max(...arrangement.map((box) => box.height)) - Math.min(...arrangement.map((box) => box.height))).toBeLessThanOrEqual(1);
      expect(arrangement[0]!.right).toBeLessThanOrEqual(arrangement[1]!.left);
      expect(arrangement[1]!.right).toBeLessThanOrEqual(arrangement[2]!.left);
    } else {
      expect(arrangement[0]!.bottom).toBeLessThanOrEqual(arrangement[1]!.top);
      expect(arrangement[1]!.bottom).toBeLessThanOrEqual(arrangement[2]!.top);
    }
    const topUp = settings.getByRole("button", { name: "Auto top-up", exact: true });
    await expect(topUp).toBeDisabled();
    await expect(topUp).toHaveAccessibleDescription(resourceReason);
    const start = settings.getByLabel("Start date", { exact: true });
    await start.scrollIntoViewIfNeeded();
    const lastCardBottom = await cards[2]!.evaluate((element) => element.getBoundingClientRect().bottom);
    expect((await start.boundingBox())!.y).toBeGreaterThan(lastCardBottom);
    await expect(start).toBeDisabled();
    await expect(settings.getByLabel("End date", { exact: true })).toBeDisabled();
    expect(await settings.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
    await page.screenshot({ path: testInfo.outputPath(`usage-websites-${theme}-${width}.png`), fullPage: true });

    // This preview catalog has two offers; the real empty→Reload branch is
    // exercised with the actual PricingClient in the component test.
    if (width === 320) {
      await settings.getByTestId("settings-more").press("Enter");
      const subscription = page.getByTestId("settings-more-subscription");
      await subscription.focus();
      await expect(subscription).toBeFocused();
      await subscription.press("Enter");
      await expect(page.locator("[data-settings-compact-more-menu]")).toHaveCount(0);
    } else {
      await settings.getByTestId("settings-tab-subscription").press("Enter");
    }
    await expect(settings.getByTestId("pricing-card")).toHaveCount(2);
    for (const card of await settings.getByTestId("pricing-card").all()) {
      await expect(card.getByRole("button", { name: "Payments unavailable", exact: true })).toBeDisabled();
    }
    expect(requests).toEqual([]);
  });
}
for (const viewport of [{ width: 1280, height: 1080 }, { width: 1280, height: 500 }, { width: 320, height: 568 }]) {
  for (const theme of ["light", "dark"]) {
    test(`Asset service guidance uses the actual remaining area at ${viewport.width}x${viewport.height} ${theme}`, async ({ page }, testInfo) => {
      await page.setViewportSize(viewport);
      await page.addInitScript((theme) => {
        localStorage.setItem("kokoro.locale", "en");
        localStorage.setItem("kokoro.theme", theme);
      }, theme);
      await page.goto("/app#settings/developer", { waitUntil: "domcontentloaded" });
      const settings = page.getByTestId("settings-modal");
      const developer = settings.getByTestId("settings-service-developer");
      await expect(developer).toBeVisible();
      expect(await page.evaluate(() => ({ width: innerWidth, height: innerHeight }))).toEqual(viewport);
      const requests: string[] = [];
      page.on("request", (request) => {
        if (new URL(request.url()).pathname.startsWith("/api/")) requests.push(`${request.method()} ${new URL(request.url()).pathname}`);
      });
      const assertArea = async (label: string, target: typeof developer) => {
        await target.evaluate((element) => { element.closest('[data-slot="scroll-area-viewport"]')!.scrollTop = 0; });
        const geometry = await target.evaluate((element) => {
          const bounds = element.getBoundingClientRect();
          const viewport = element.closest('[data-slot="scroll-area-viewport"]')!.getBoundingClientRect();
          const children = Array.from(element.children, (child) => child.getBoundingClientRect());
          const top = Math.min(...children.map((child) => child.top));
          const bottom = Math.max(...children.map((child) => child.bottom));
          return { top: bounds.top, bottom: bounds.bottom, viewportBottom: viewport.bottom,
            left: bounds.left, right: bounds.right, contentTop: top, contentBottom: bottom,
            centerDelta: Math.abs((top + bottom) / 2 - (bounds.top + Math.max(bounds.bottom, viewport.bottom)) / 2),
            contained: children.every((child) => child.left >= bounds.left - 1 && child.right <= bounds.right + 1 && child.top >= bounds.top - 1 && child.bottom <= bounds.bottom + 1),
            overflow: element.scrollWidth > element.clientWidth };
        });
        console.log("Asset actual remaining-area geometry", { label, viewport, theme, geometry });
        expect(geometry.bottom).toBeGreaterThanOrEqual(geometry.viewportBottom - 1);
        expect(geometry.centerDelta).toBeLessThanOrEqual(1);
        expect(geometry.contained).toBe(true);
        expect(geometry.left).toBeGreaterThanOrEqual(0);
        expect(geometry.right).toBeLessThanOrEqual(viewport.width);
        expect(geometry.overflow).toBe(false);
        const last = target.locator(":scope > *").last();
        await last.scrollIntoViewIfNeeded();
        await expect(last).toBeInViewport();
      };
      const cancelDialog = async (trigger: typeof developer, title: string, finalAction: string, reason: string) => {
        await trigger.scrollIntoViewIfNeeded();
        await trigger.press("Enter");
        const dialog = page.getByRole("dialog", { name: title, exact: true });
        const final = dialog.getByRole("button", { name: finalAction, exact: true });
        await expect(final).toBeDisabled();
        await expect(final).toHaveAccessibleDescription(reason);
        await expect(dialog.getByText(reason, { exact: true })).toBeVisible();
        const cancel = dialog.getByRole("button", { name: "Cancel", exact: true });
        await cancel.scrollIntoViewIfNeeded();
        await expect(cancel).toBeInViewport();
        await cancel.press("Enter");
        await expect(dialog).toHaveCount(0);
        await expect(trigger).toBeFocused();
        await expect(settings).toBeVisible();
      };

      for (const [tab, title, final, reason] of [
        ["API keys", "Create API key", "Create", serviceAvailability.apiKeys],
        ["Webhooks", "Create webhook", "Save", serviceAvailability.webhooks],
      ] as const) {
        await developer.getByRole("tab", { name: tab, exact: true }).click();
        const trigger = developer.getByRole("button", { name: title, exact: true });
        await assertArea(tab, trigger.locator(".."));
        await cancelDialog(trigger, title, final, reason);
      }

      const selectSection = async (tab: string) => {
        if (viewport.width === 320) {
          await settings.getByTestId("settings-more").press("Enter");
          const item = page.getByTestId(`settings-more-${tab}`);
          await item.focus();
          await expect(item).toBeFocused();
          await item.press("Enter");
          await expect(page.locator("[data-settings-compact-more-menu]")).toHaveCount(0);
        } else await settings.getByTestId(`settings-tab-${tab}`).press("Enter");
      };
      for (const [tab, triggerName, title, final, reason] of [
        ["email", "Create new item", "Create email", "Save", serviceAvailability.email],
        ["phone", "Create now", "Assign a virtual phone to your agent", "Continue", serviceAvailability.phone],
      ] as const) {
        await selectSection(tab);
        const service = settings.getByTestId(`settings-service-${tab}`);
        await assertArea(tab, service.locator(":scope > section"));
        await expect(service.getByText(reason, { exact: true })).toBeVisible();
        await cancelDialog(service.getByRole("button", { name: triggerName, exact: true }), title, final, reason);
      }
      await selectSection("wallet");
      const wallet = settings.getByTestId("settings-service-wallet");
      const invoices = wallet.getByText(serviceAvailability.invoices, { exact: true }).locator("..");
      await assertArea("wallet invoices", invoices);
      await expect(wallet.getByRole("button", { name: "View details", exact: true })).toBeDisabled();
      await expect(wallet.getByRole("button", { name: "View details", exact: true })).toHaveAccessibleDescription(serviceAvailability.invoices);
      await cancelDialog(wallet.getByRole("button", { name: "Add", exact: true }), "Add payment method", "Continue", serviceAvailability.payment);
      expect(await settings.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
      await page.screenshot({ path: testInfo.outputPath(`asset-remaining-${viewport.width}-${viewport.height}-${theme}.png`), fullPage: true });
      expect(requests).toEqual([]);
    });
  }
}

for (const viewport of [{ width: 1280, height: 800 }, { width: 876, height: 778 }, { width: 320, height: 568 }]) {
  for (const theme of ["light", "dark"]) {
    test(`Personalization footer remains reachable without covering the last field at ${viewport.width}x${viewport.height} ${theme}`, async ({ page }, testInfo) => {
      await page.setViewportSize(viewport);
      await page.addInitScript((theme) => {
        localStorage.setItem("kokoro.locale", "en");
        localStorage.setItem("kokoro.theme", theme);
      }, theme);
      await page.goto("/app#settings/personalization", { waitUntil: "domcontentloaded" });
      const settings = page.getByTestId("settings-modal");
      const profile = settings.getByTestId("settings-personalization");
      const footer = profile.getByRole("button", { name: "Import memory", exact: true });
      await expect(footer).toBeVisible();
      expect(await page.evaluate(() => ({ width: innerWidth, height: innerHeight }))).toEqual(viewport);
      const requests: string[] = [];
      page.on("request", (request) => {
        if (new URL(request.url()).pathname.startsWith("/api/")) requests.push(`${request.method()} ${new URL(request.url()).pathname}`);
      });
      const initial = await footer.evaluate((element) => {
        const bounds = element.getBoundingClientRect();
        const viewport = element.closest('[data-slot="scroll-area-viewport"]')!.getBoundingClientRect();
        return { top: bounds.top, bottom: bounds.bottom, viewportTop: viewport.top, viewportBottom: viewport.bottom, scrollTop: element.closest('[data-slot="scroll-area-viewport"]')!.scrollTop };
      });
      console.log("Personalization initial footer geometry", { viewport, theme, initial });
      expect(initial.scrollTop).toBe(0);
      expect(initial.top).toBeGreaterThanOrEqual(initial.viewportTop);
      expect(initial.bottom).toBeLessThanOrEqual(initial.viewportBottom);
      await expect(footer).toBeInViewport();
      const instructions = profile.getByRole("textbox", { name: "Custom instructions", exact: true });
      await instructions.fill("a".repeat(8001));
      await expect(instructions).toHaveAttribute("aria-invalid", "true");
      const fieldError = instructions.locator("..").getByRole("alert");
      await expect(fieldError).toBeVisible();
      await instructions.evaluate((element) => { const viewport = element.closest('[data-slot="scroll-area-viewport"]')!; viewport.scrollTop = viewport.scrollHeight; });
      const final = await instructions.evaluate((element) => {
        const bounds = element.getBoundingClientRect();
        const label = element.parentElement!.getBoundingClientRect();
        const viewport = element.closest('[data-slot="scroll-area-viewport"]')!;
        const footer = element.closest('[data-testid="settings-personalization"]')!.querySelector('[data-slot="tabs-content"][data-state="active"]')!.lastElementChild!;
        const footerBounds = footer.getBoundingClientRect();
        const viewportBounds = viewport.getBoundingClientRect();
        return { top: bounds.top, bottom: bounds.bottom, labelBottom: label.bottom, footerTop: footerBounds.top, footerBottom: footerBounds.bottom,
          viewportTop: viewportBounds.top, viewportBottom: viewportBounds.bottom, scrollTop: viewport.scrollTop,
          contained: bounds.left >= viewportBounds.left && bounds.right <= viewportBounds.right, overflow: viewport.scrollWidth > viewport.clientWidth };
      });
      console.log("Personalization last-field/footer geometry", { viewport, theme, final });
      expect(final.top).toBeGreaterThanOrEqual(final.viewportTop);
      expect(final.bottom).toBeLessThanOrEqual(final.footerTop);
      expect(final.labelBottom).toBeLessThanOrEqual(final.footerTop);
      expect(final.footerBottom).toBeLessThanOrEqual(final.viewportBottom + 1);
      expect(final.contained).toBe(true);
      expect(final.overflow).toBe(false);
      await expect(instructions).toBeInViewport();
      await expect(fieldError).toBeInViewport();
      expect((await fieldError.boundingBox())!.y + (await fieldError.boundingBox())!.height).toBeLessThanOrEqual(final.footerTop);
      await expect(footer).toBeInViewport();
      await instructions.fill("Use concise replies.");
      await expect(instructions).not.toHaveAttribute("aria-invalid", "true");
      await expect(fieldError).toHaveCount(0);
      await instructions.fill("");
      await footer.press("Enter");
      const memory = page.getByRole("dialog", { name: "Import memory", exact: true });
      await expect(memory.getByRole("button", { name: "Import", exact: true })).toBeDisabled();
      const cancel = memory.getByRole("button", { name: "Cancel", exact: true });
      await cancel.scrollIntoViewIfNeeded();
      await cancel.press("Enter");
      await expect(memory).toHaveCount(0);
      await expect(footer).toBeFocused();
      await expect(settings).toBeVisible();
      await profile.getByRole("tab", { name: "Knowledge", exact: true }).click();
      const add = profile.getByRole("button", { name: "Add", exact: true });
      await add.press("Enter");
      const knowledge = page.getByRole("dialog", { name: "Add knowledge", exact: true });
      const reason = "Knowledge saving is not connected. This is a temporary draft, cleared when closed.";
      await expect(knowledge.getByText(reason, { exact: true })).toHaveCount(1);
      await expect(knowledge.getByRole("button", { name: "Save", exact: true })).toBeDisabled();
      await expect(knowledge.getByRole("button", { name: "Save", exact: true })).toHaveAccessibleDescription(reason);
      await knowledge.getByRole("textbox", { name: "Name", exact: true }).fill("private temporary knowledge");
      await knowledge.getByRole("button", { name: "Cancel", exact: true }).press("Enter");
      await expect(add).toBeFocused();
      await add.press("Enter");
      await expect(knowledge.getByRole("textbox", { name: "Name", exact: true })).toHaveValue("");
      await knowledge.getByRole("button", { name: "Cancel", exact: true }).press("Enter");
      await expect(add).toBeFocused();
      await page.screenshot({ path: testInfo.outputPath(`profile-footer-${viewport.width}-${viewport.height}-${theme}.png`), fullPage: true });
      expect(requests).toEqual([]);
    });
  }
}

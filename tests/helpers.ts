import { expect, type Page } from "@playwright/test";
export type PageId =
  "home" | "lab" | "data" | "presets" | "results" | "network";
export const isCompact = (page: Page) => page.viewportSize()!.width <= 900;
export const diagnostics = new WeakMap<Page, string[]>();
export function collectDiagnostics(page: Page) {
  const errors: string[] = [];
  diagnostics.set(page, errors);
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });
  page.on("response", (r) => {
    if (r.status() >= 400) errors.push(`${r.status()} ${r.url()}`);
  });
  page.on("requestfailed", (r) => {
    if (!r.failure()?.errorText.includes("ERR_ABORTED")) errors.push(r.url());
  });
}
export async function saved(page: Page) {
  await page.waitForTimeout(800);
  return JSON.parse(
    await page.evaluate(() => localStorage.getItem("neuralcanvas-v1")!),
  );
}
export async function closeDialog(page: Page) {
  await page.getByRole("button", { name: "패널 닫기" }).click();
  await expect(page.getByRole("dialog")).not.toBeVisible();
}
/** Navigates with the left menu (an overlay drawer on narrow screens). */
export async function goPage(page: Page, id: PageId) {
  if (isCompact(page)) {
    const open = page.getByRole("button", { name: "메뉴 열기", exact: true });
    if (await open.isVisible()) {
      await open.click();
      await expect(page.locator("#nav")).toBeVisible();
      await page.waitForTimeout(300);
    }
  }
  await page.getByTestId(`nav-${id}`).click();
  await expect(page.locator(`.page[data-page="${id}"]`)).toBeVisible();
  if (isCompact(page)) await expect(page.locator("#nav")).toBeHidden();
}
/** Opens a toolbar popover of the training toolbar. */
export async function popover(page: Page, label: string) {
  const button = page.getByRole("button", { name: label, exact: true });
  if ((await button.getAttribute("aria-expanded")) !== "true")
    await button.click();
  await expect(
    page.getByRole("group", { name: label, exact: true }),
  ).toBeVisible();
}
/** Runs an action from the toolbar's more menu (한 스텝, 한 Epoch, 초기화). */
export async function moreTool(page: Page, name: string) {
  await popover(page, "학습 도구 더보기");
  await page.getByRole("button", { name, exact: true }).click();
  if (name !== "초기화") await page.keyboard.press("Escape");
}
export async function closeIfDialog(page: Page) {
  if (await page.getByRole("dialog").isVisible()) await closeDialog(page);
}
/** Data tools sit beside the graph on wide screens and in a sheet on narrow ones. */
export async function openDataTools(page: Page) {
  if (isCompact(page)) {
    await page
      .locator('.page[data-page="data"]')
      .getByRole("button", { name: "편집 도구 열기", exact: true })
      .click();
    await expect(page.getByRole("dialog")).toBeVisible();
  }
}
export async function closeDataTools(page: Page) {
  if (isCompact(page)) await closeDialog(page);
}
/** The network inspector is a panel on wide screens and a sheet on narrow ones. */
export async function openInspector(page: Page) {
  if (isCompact(page)) {
    // Choosing a neuron opens the sheet a moment later; do not click behind it.
    const shown = await page
      .getByRole("dialog")
      .waitFor({ state: "visible", timeout: 2000 })
      .then(
        () => true,
        () => false,
      );
    if (!shown)
      await page.getByRole("button", { name: "신경망 편집 열기" }).click();
  }
  await expect(page.getByLabel("편집 대상")).toBeVisible();
}

import { expect, type Page } from "@playwright/test";
export type SectionName =
  "network" | "training" | "analysis" | "observe" | "files";
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
/** Opens the sidebar (the drawer on narrow screens); a no-op when already open. */
export async function openSide(page: Page) {
  const toggle = page.getByRole("button", {
    name: "사이드바 열기",
    exact: true,
  });
  if (await toggle.isVisible()) {
    await toggle.click();
    await expect(page.locator("#sidebar")).toBeVisible();
    await page.waitForTimeout(350);
  }
}
/** Closes the drawer on narrow screens so the graph and dock are reachable. */
export async function leaveSide(page: Page) {
  if (!isCompact(page)) return;
  const toggle = page.getByRole("button", {
    name: "사이드바 닫기",
    exact: true,
  });
  if (await toggle.isVisible()) {
    await toggle.click();
    await expect(page.locator("#sidebar")).toBeHidden();
  }
}
export async function section(page: Page, name: SectionName) {
  await openSide(page);
  const header = page.locator(`button[data-section="${name}"]`);
  if ((await header.getAttribute("aria-expanded")) === "false") {
    await header.click();
    await page.waitForTimeout(250);
  }
  await expect(header).toHaveAttribute("aria-expanded", "true");
}

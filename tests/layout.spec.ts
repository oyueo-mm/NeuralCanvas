import { test, expect, type Page } from "@playwright/test";
import {
  collectDiagnostics,
  diagnostics,
  isCompact,
  leaveSide,
  openSide,
  saved,
  section,
} from "./helpers";
test.beforeEach(async ({ page }) => {
  collectDiagnostics(page);
  await page.goto("./");
});
test.afterEach(async ({ page }) => {
  expect(diagnostics.get(page)).toEqual([]);
});
const box = async (page: Page, testId: string) =>
  (await page.getByTestId(testId).boundingBox())!;
const sidebarToggle = (page: Page) => page.locator(".sidebar-toggle");
for (const [width, height] of [
  [1680, 1050],
  [1440, 900],
  [1280, 720],
  [1024, 768],
  [768, 1024],
  [430, 932],
  [390, 844],
  [360, 800],
])
  test(`graph-first workspace ${width}x${height}`, async ({ page }, info) => {
    test.skip(
      info.project.name === "mobile" && width > 900,
      "Desktop sizes are covered by the desktop projects.",
    );
    await page.setViewportSize({ width, height });
    await page.waitForTimeout(350);
    await expect(page.getByTestId("data-plot")).toBeVisible();
    await expect(
      page.getByRole("button", { name: "학습 시작", exact: true }),
    ).toBeInViewport({ ratio: 1 });
    const plot = await box(page, "data-plot");
    expect(plot.y + plot.height).toBeLessThanOrEqual(height);
    expect(plot.height).toBeGreaterThan(260);
    const doc = await page.evaluate(() => ({
      w: document.documentElement.scrollWidth,
      h: document.documentElement.scrollHeight,
    }));
    expect(doc.w).toBeLessThanOrEqual(width);
    expect(doc.h).toBeLessThanOrEqual(height + 1);
    const share = (plot.width * plot.height) / (width * height);
    if (width > 900) {
      // The data graph is the largest element and the network sits inside the sidebar.
      expect(share).toBeGreaterThan(0.45);
      await expect(page.getByTestId("network")).toBeInViewport({ ratio: 1 });
      const network = await box(page, "network");
      expect(plot.width * plot.height).toBeGreaterThan(
        network.width * network.height * 2.5,
      );
      expect(network.x).toBeGreaterThan(plot.x + plot.width);
    } else {
      expect(share).toBeGreaterThan(0.45);
      expect(plot.width).toBeGreaterThan(width - 24);
      await expect(page.locator("#sidebar")).toBeHidden();
      await openSide(page);
      await expect(page.getByTestId("network")).toBeVisible();
      await expect(page.getByTestId("network")).toBeInViewport({
        ratio: 0.98,
      });
      await leaveSide(page);
    }
    if (info.project.name === "chromium" || info.project.name === "mobile")
      await page.screenshot({
        path: `test-results/layout-${width}x${height}.png`,
      });
  });
test("sidebar opens and closes, the graph grows and nothing is reset", async ({
  page,
}, info) => {
  test.skip(info.project.name === "mobile", "Desktop sidebar behavior.");
  await expect(page.locator("#sidebar")).toBeVisible();
  await expect(sidebarToggle(page)).toHaveAttribute("aria-expanded", "true");
  await page.getByRole("button", { name: "데이터 확대", exact: true }).click();
  const span = await page.getByTestId("data-plot").getAttribute("data-span");
  await page.getByRole("button", { name: "뉴런 1-0", exact: true }).click();
  await page.getByLabel("편향", { exact: true }).fill("0.5");
  await page.getByRole("button", { name: "신경망 확대", exact: true }).click();
  const zoom = await page.getByTestId("network").getAttribute("data-zoom");
  const before = await saved(page),
    opened = await box(page, "data-plot");
  await sidebarToggle(page).click();
  await expect(page.locator("#sidebar")).toBeHidden();
  await expect(sidebarToggle(page)).toHaveAttribute("aria-expanded", "false");
  await expect
    .poll(async () => (await box(page, "data-plot")).width)
    .toBeGreaterThan(opened.width + 300);
  const closed = await box(page, "data-plot");
  expect(closed.width * closed.height).toBeGreaterThan(
    page.viewportSize()!.width * page.viewportSize()!.height * 0.6,
  );
  expect(await page.getByTestId("data-plot").getAttribute("data-span")).toBe(
    span,
  );
  await sidebarToggle(page).click();
  await expect(page.getByTestId("network")).toBeVisible();
  await expect
    .poll(async () =>
      Math.abs((await box(page, "data-plot")).width - opened.width),
    )
    .toBeLessThan(3);
  expect(await page.getByTestId("data-plot").getAttribute("data-span")).toBe(
    span,
  );
  expect(await page.getByTestId("network").getAttribute("data-zoom")).toBe(
    zoom,
  );
  const after = await saved(page);
  expect(after.data).toEqual(before.data);
  expect(after.model).toEqual(before.model);
  expect(after.model.layers[0].b[0]).toBe(0.5);
  // The closed state survives a reload.
  await sidebarToggle(page).click();
  await page.reload();
  await expect(page.locator("#sidebar")).toBeHidden();
  await expect(page.getByTestId("data-plot")).toBeVisible();
});
test("accordion sections fold independently and sidebar content scrolls on its own", async ({
  page,
}, info) => {
  test.skip(info.project.name === "mobile", "Desktop sidebar behavior.");
  const analysis = page.locator('button[data-section="analysis"]');
  await expect(analysis).toHaveAttribute("aria-expanded", "true");
  await expect(page.getByTestId("loss-chart")).toBeVisible();
  await analysis.click();
  await expect(analysis).toHaveAttribute("aria-expanded", "false");
  await expect(page.getByTestId("loss-chart")).toBeHidden();
  await expect(page.getByTestId("network")).toBeVisible();
  await analysis.click();
  await expect(page.getByTestId("loss-chart")).toBeVisible();
  await section(page, "training");
  await section(page, "files");
  const scroller = page.locator(".sidebar-scroll");
  expect(
    await scroller.evaluate((el) => el.scrollHeight > el.clientHeight),
  ).toBe(true);
  expect(
    await page.evaluate(() => document.documentElement.scrollHeight),
  ).toBeLessThanOrEqual(page.viewportSize()!.height + 1);
  await scroller.evaluate((el) => (el.scrollTop = el.scrollHeight));
  await expect(
    page.getByRole("button", { name: "신경망 PNG 내보내기", exact: true }),
  ).toBeInViewport();
});
test("training keeps running while the sidebar is manipulated", async ({
  page,
}, info) => {
  test.skip(info.project.name === "mobile", "Desktop sidebar behavior.");
  let workers = 0;
  page.on("worker", () => workers++);
  await page.getByRole("button", { name: "학습 시작", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "일시정지", exact: true }),
  ).toBeVisible();
  const step = async () =>
    Number(await page.getByTestId("training-dock").getAttribute("data-step"));
  await expect.poll(step, { timeout: 15000 }).toBeGreaterThan(5);
  await page.locator('button[data-section="training"]').click();
  await expect(page.getByLabel("Optimizer", { exact: true })).toBeVisible();
  await page.locator('button[data-section="analysis"]').click();
  await sidebarToggle(page).click();
  const closedAt = await step();
  await expect.poll(step, { timeout: 15000 }).toBeGreaterThan(closedAt);
  await sidebarToggle(page).click();
  await expect(page.getByTestId("network")).toBeVisible();
  const reopenedAt = await step();
  await expect.poll(step, { timeout: 15000 }).toBeGreaterThan(reopenedAt);
  await expect(page.getByTestId("loss")).not.toHaveText("—");
  expect(workers).toBe(1);
  await page.getByRole("button", { name: "일시정지", exact: true }).click();
});
test("task switch keeps the graph and sidebar layout intact", async ({
  page,
}) => {
  const overflow = () =>
    page.evaluate(() => document.documentElement.scrollWidth <= innerWidth);
  const regression = await box(page, "data-plot");
  await page.getByRole("button", { name: "분류", exact: true }).click();
  await expect(page.getByTestId("decision-boundary")).toBeVisible();
  await expect(page.getByTestId("data-point")).toHaveCount(100);
  const classification = await box(page, "data-plot");
  expect(Math.abs(classification.width - regression.width)).toBeLessThan(4);
  expect(classification.height).toBeGreaterThan(260);
  expect(await overflow()).toBe(true);
  if (!isCompact(page)) {
    await expect(page.getByTestId("network")).toBeInViewport({ ratio: 1 });
    await expect(page.getByTestId("probability")).toBeVisible();
  }
  await page.getByRole("button", { name: "회귀", exact: true }).click();
  await expect(page.getByTestId("prediction")).toBeVisible();
  await expect(page.getByTestId("data-point")).toHaveCount(50);
  expect(await overflow()).toBe(true);
});
test("analysis and input observation work from the sidebar", async ({
  page,
}) => {
  await section(page, "analysis");
  await leaveSide(page);
  await page.getByRole("button", { name: "한 Epoch", exact: true }).click();
  await expect
    .poll(async () => (await saved(page))?.history.length ?? 0)
    .toBeGreaterThan(0);
  await section(page, "analysis");
  await expect(
    page.getByTestId("loss-chart").locator("svg").first(),
  ).toBeVisible();
  await section(page, "observe");
  const x = page.getByLabel("관찰 입력 x", { exact: true });
  await x.fill("2");
  await expect(x).toHaveValue("2");
  expect((await saved(page)).input).toBe(2);
  await page.getByRole("button", { name: "입력 순회", exact: true }).click();
  await page.waitForTimeout(300);
  await page
    .getByRole("button", { name: "순회 일시정지", exact: true })
    .click();
  expect((await saved(page)).input).not.toBe(2);
});
test("network expand view enlarges the network and Esc restores it", async ({
  page,
}, info) => {
  test.skip(info.project.name === "mobile", "Desktop expand view.");
  const small = await box(page, "network");
  await page
    .getByRole("button", { name: "신경망 확대 보기", exact: true })
    .click();
  await expect
    .poll(async () => (await box(page, "network")).width)
    .toBeGreaterThan(small.width * 1.6);
  await expect(page.getByTestId("network")).toBeInViewport({ ratio: 1 });
  await page.keyboard.press("Escape");
  await expect
    .poll(async () => (await box(page, "network")).width)
    .toBeLessThan(small.width + 3);
});
test("drawer on narrow screens closes with the toggle, backdrop and Escape", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const before = await saved(page);
  const plot = await box(page, "data-plot");
  expect(plot.width).toBeGreaterThan(366);
  await expect(page.locator("#sidebar")).toBeHidden();
  await sidebarToggle(page).click();
  await expect(page.locator("#sidebar")).toBeVisible();
  await expect(sidebarToggle(page)).toHaveAttribute("aria-expanded", "true");
  await page.mouse.click(20, 400);
  await expect(page.locator("#sidebar")).toBeHidden();
  await sidebarToggle(page).click();
  await expect(page.locator("#sidebar")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.locator("#sidebar")).toBeHidden();
  await expect(sidebarToggle(page)).toBeFocused();
  const after = await saved(page);
  expect(after.data).toEqual(before.data);
  expect(after.model).toEqual(before.model);
  expect(await box(page, "data-plot")).toEqual(plot);
});
test("reduced motion removes the sidebar transition", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  const duration = await page
    .locator(".workbench")
    .evaluate((el) => getComputedStyle(el).transitionDuration);
  expect(duration).toBe("0s");
});
test("keyboard focus reaches the sidebar controls and the toggle", async ({
  page,
}, info) => {
  test.skip(info.project.name === "mobile", "Desktop keyboard flow.");
  await sidebarToggle(page).focus();
  await expect(sidebarToggle(page)).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.locator("#sidebar")).toBeHidden();
  await page.keyboard.press("Enter");
  await expect(page.locator("#sidebar")).toBeVisible();
  const header = page.locator('button[data-section="training"]');
  await header.focus();
  await page.keyboard.press("Enter");
  await expect(header).toHaveAttribute("aria-expanded", "true");
  await expect(page.getByLabel("Optimizer", { exact: true })).toBeVisible();
});

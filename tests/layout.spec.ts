import { test, expect, type Page } from "@playwright/test";
import {
  closeDialog,
  closeIfDialog,
  collectDiagnostics,
  diagnostics,
  goPage,
  isCompact,
  openInspector,
  popover,
  saved,
} from "./helpers";
test.beforeEach(async ({ page }) => {
  collectDiagnostics(page);
  await page.goto("./");
});
test.afterEach(async ({ page }) => {
  expect(diagnostics.get(page)).toEqual([]);
});
const box = async (page: Page, id: string) =>
  (await page.getByTestId(id).boundingBox())!;
const step = async (page: Page) =>
  Number(await page.getByTestId("training-dock").getAttribute("data-step"));
test("the home page opens first with a live demo and leads into the lab", async ({
  page,
}) => {
  await expect(page.locator('.page[data-page="home"]')).toBeVisible();
  await expect(page.getByRole("heading", { level: 2 }).first()).toContainText(
    "신경망을 직접 만들고",
  );
  const demo = page.getByTestId("home-demo");
  await expect(demo).toBeVisible();
  const before = await demo.locator(".demo-stats").innerText();
  await page.waitForTimeout(900);
  expect(await demo.locator(".demo-stats").innerText()).not.toBe(before);
  await page.getByTestId("home-start").click();
  await expect(page.locator('.page[data-page="lab"]')).toBeVisible();
  // Leaving the home page releases the demo.
  await expect(page.getByTestId("home-demo")).toHaveCount(0);
});
test("reduced motion starts the home demo paused and stops the flow animation", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.reload();
  const demo = page.getByTestId("home-demo");
  await expect(demo.getByRole("button", { name: "재생" })).toBeVisible();
  const first = await demo.locator(".demo-stats").innerText();
  await page.waitForTimeout(500);
  expect(await demo.locator(".demo-stats").innerText()).toBe(first);
  await demo.getByRole("button", { name: "재생" }).click();
  await expect(demo.getByRole("button", { name: "일시정지" })).toBeVisible();
  expect(
    await demo
      .locator("line")
      .first()
      .evaluate((el) => getComputedStyle(el).animationName),
  ).toBe("none");
});
for (const [width, height] of [
  [1920, 1080],
  [1680, 1050],
  [1440, 900],
  [1280, 720],
  [1024, 768],
  [768, 1024],
  [390, 844],
  [360, 800],
])
  test(`the lab keeps the graph dominant at ${width}x${height}`, async ({
    page,
  }, info) => {
    test.skip(
      info.project.name === "mobile" && width > 900,
      "Desktop sizes are covered by the desktop projects.",
    );
    await page.setViewportSize({ width, height });
    await goPage(page, "lab");
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
    expect(share).toBeGreaterThan(
      width > 1100 ? 0.45 : width > 900 ? 0.42 : 0.45,
    );
    if (width <= 900) expect(plot.width).toBeGreaterThan(width - 24);
    if (info.project.name === "chromium" || info.project.name === "mobile")
      await page.screenshot({
        path: `test-results/lab-${width}x${height}.png`,
      });
  });
test("collapsing the navigation grows the graph and is remembered", async ({
  page,
}, info) => {
  test.skip(info.project.name === "mobile", "Collapsing is a desktop feature.");
  await goPage(page, "lab");
  const nav = page.locator("#nav");
  const open = (await nav.boundingBox())!.width,
    plotOpen = await box(page, "data-plot");
  expect(open).toBeGreaterThan(200);
  await page.getByRole("button", { name: "사이드바 접기" }).click();
  await page.waitForTimeout(450);
  const closed = (await nav.boundingBox())!.width,
    plotClosed = await box(page, "data-plot");
  expect(closed).toBeLessThan(80);
  expect(plotClosed.width).toBeGreaterThan(plotOpen.width + 120);
  await expect(page.getByTestId("nav-lab")).toHaveAttribute(
    "data-tip",
    "학습 환경",
  );
  await expect(page.getByTestId("nav-lab")).toHaveAttribute(
    "aria-current",
    "page",
  );
  await page.reload();
  await goPage(page, "lab");
  await page.waitForTimeout(450);
  expect((await nav.boundingBox())!.width).toBeLessThan(80);
  await page.getByRole("button", { name: "사이드바 펼치기" }).click();
  await page.waitForTimeout(450);
  expect((await nav.boundingBox())!.width).toBeGreaterThan(200);
});
test("pages share one experiment and keep zoom, data and the worker", async ({
  page,
}) => {
  let workers = 0;
  page.on("worker", () => workers++);
  await goPage(page, "lab");
  const plot = page.getByTestId("data-plot");
  await page.getByRole("button", { name: "탐색", exact: true }).click();
  await page.getByRole("button", { name: "데이터 확대", exact: true }).click();
  const span = await plot.getAttribute("data-span");
  const data = (await saved(page)).data;
  await page.getByRole("button", { name: "학습 시작", exact: true }).click();
  await expect.poll(() => step(page)).toBeGreaterThan(3);
  for (const id of ["network", "results", "presets", "data", "lab"] as const)
    await goPage(page, id);
  expect(await plot.getAttribute("data-span")).toBe(span);
  const resumed = await step(page);
  await expect.poll(() => step(page)).toBeGreaterThan(resumed);
  await page.getByRole("button", { name: "일시정지", exact: true }).click();
  expect(workers).toBe(1);
  expect((await saved(page)).data).toEqual(data);
  // The data page edits the same graph instance.
  await goPage(page, "data");
  await expect(plot).toBeVisible();
  expect(await plot.getAttribute("data-span")).toBe(span);
});
test("previewing a preset does not change the experiment; applying does", async ({
  page,
}) => {
  await goPage(page, "lab");
  const before = await saved(page);
  await goPage(page, "presets");
  await page.getByTestId("preset-overfit").click();
  await expect(
    page.getByRole("heading", { name: "과적합 실험" }),
  ).toBeVisible();
  expect(JSON.stringify((await saved(page)).data)).toBe(
    JSON.stringify(before.data),
  );
  // Cancelling the confirmation keeps the current experiment.
  await page.getByTestId("apply-preset").click();
  await expect(page.getByRole("dialog")).toContainText("교체됩니다");
  await page.getByRole("button", { name: "취소", exact: true }).click();
  await expect(page.getByRole("dialog")).not.toBeVisible();
  expect((await saved(page)).model).toEqual(before.model);
  await page.getByTestId("apply-preset").click();
  await page.getByTestId("confirm-preset").click();
  await expect(page.locator('.page[data-page="lab"]')).toBeVisible();
  const applied = await saved(page);
  expect(applied.name).toBe("과적합 실험");
  expect(applied.data).toHaveLength(24);
  expect(applied.model.layers.map((l: { b: number[] }) => l.b.length)).toEqual([
    16, 16, 16, 1,
  ]);
  expect(applied.settings).toMatchObject({
    lr: 0.01,
    batch: 4,
    epochs: 4000,
    validation: 0.3,
  });
  expect(applied.history).toEqual([]);
  await expect(page.getByTestId("data-point")).toHaveCount(24);
});
test("a classification preset switches the task and keeps the regression experiment", async ({
  page,
}) => {
  await goPage(page, "lab");
  const regression = await saved(page);
  await goPage(page, "presets");
  await page.getByTestId("preset-xor").click();
  await page.getByTestId("apply-preset").click();
  await page.getByTestId("confirm-preset").click();
  await expect(page.getByTestId("decision-boundary")).toBeVisible();
  expect((await saved(page)).task).toBe("classification");
  await page.getByRole("button", { name: "회귀", exact: true }).click();
  expect((await saved(page)).data).toEqual(regression.data);
});
test("presets can be filtered by task and difficulty", async ({ page }) => {
  await goPage(page, "presets");
  const cards = page.locator(".preset-card");
  const all = await cards.count();
  expect(all).toBeGreaterThanOrEqual(10);
  await page.getByRole("button", { name: "분류", exact: true }).click();
  const classification = await cards.count();
  expect(classification).toBeLessThan(all);
  await page.getByRole("button", { name: "고급", exact: true }).click();
  expect(await cards.count()).toBeLessThan(classification);
  await page.getByRole("button", { name: "전체", exact: true }).click();
  await page.getByRole("button", { name: "모든 난이도", exact: true }).click();
  expect(await cards.count()).toBe(all);
});
test("a large network stays inside the canvas and the inspector works", async ({
  page,
}) => {
  await goPage(page, "presets");
  await page.getByTestId("preset-spiral").click();
  await page.getByTestId("apply-preset").click();
  await page.getByTestId("confirm-preset").click();
  await goPage(page, "network");
  const inside = async () => {
    const svg = await box(page, "network");
    const neurons = page.locator('[data-testid="network"] .nv-neuron');
    expect(await neurons.count()).toBe(2 + 16 + 16 + 1);
    for (let i = 0; i < (await neurons.count()); i++) {
      const b = (await neurons.nth(i).boundingBox())!;
      expect(b.x).toBeGreaterThanOrEqual(svg.x - 1);
      expect(b.y).toBeGreaterThanOrEqual(svg.y - 1);
      expect(b.x + b.width).toBeLessThanOrEqual(svg.x + svg.width + 1);
      expect(b.y + b.height).toBeLessThanOrEqual(svg.y + svg.height + 1);
    }
  };
  await inside();
  const { width, height } = page.viewportSize()!;
  await page.setViewportSize({
    width: Math.max(360, width - 140),
    height: height - 120,
  });
  await page.waitForTimeout(400);
  await inside();
  await page.setViewportSize({ width, height });
  await page.waitForTimeout(400);
  await page.getByRole("button", { name: "뉴런 1-3", exact: true }).click();
  await openInspector(page);
  await expect(page.getByText(/ID l0n3 · layer 1 \/ index 3/)).toBeVisible();
  await expect(page.getByText("가중합 z", { exact: true })).toBeVisible();
  await page.getByLabel("편집 대상").selectOption("e-1-2-5");
  await expect(
    page.getByText("부호 / 크기 |w|", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("최근 배치 ∂L/∂w", { exact: true }),
  ).toBeVisible();
  await closeIfDialog(page);
  for (const mode of ["주요 연결", "선택 중심", "전체 연결"])
    await page.getByRole("button", { name: mode, exact: true }).click();
  // Every connection stays in the model whatever is emphasized.
  expect(await page.locator('[data-testid="network"] .nv-edge').count()).toBe(
    2 * 16 + 16 * 16 + 16,
  );
});
test("the inspector collapses and the network canvas grows", async ({
  page,
}) => {
  test.skip(isCompact(page), "Desktop inspector.");
  await goPage(page, "network");
  const open = await box(page, "network");
  await page.getByRole("button", { name: "Inspector 닫기" }).click();
  await page.waitForTimeout(250);
  expect((await box(page, "network")).width).toBeGreaterThan(open.width + 200);
  await page.getByRole("button", { name: "Inspector 열기" }).click();
});
test("training toolbar: turbo, live speed and mode switching keep one session", async ({
  page,
}) => {
  let workers = 0;
  page.on("worker", () => workers++);
  await goPage(page, "lab");
  await popover(page, "학습 설정");
  await page.getByLabel("목표 Epoch", { exact: true }).fill("100000");
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "고속", exact: true }).click();
  await expect(page.getByTestId("speed-slider")).toBeDisabled();
  await page.getByRole("button", { name: "학습 시작", exact: true }).click();
  await expect(page.getByTestId("throughput")).toContainText("batch/s", {
    timeout: 10000,
  });
  const turboStep = await step(page);
  await expect.poll(() => step(page)).toBeGreaterThan(turboStep + 20);
  // Back to normal mode while running: the same session continues and the slider works.
  await page.getByRole("button", { name: "일반", exact: true }).click();
  await expect(page.getByTestId("speed-slider")).toBeEnabled();
  const slider = page.getByTestId("speed-slider");
  await slider.fill("5");
  await expect(page.getByTestId("speed-control")).toContainText("느림");
  const slow = await step(page);
  await slider.fill("90");
  await expect(page.getByTestId("speed-control")).toContainText("매우 빠름");
  await expect
    .poll(() => step(page), { timeout: 10000 })
    .toBeGreaterThan(slow + 30);
  expect(workers).toBe(1);
  await page.getByRole("button", { name: "일시정지", exact: true }).click();
  const paused = await saved(page);
  const weights = JSON.stringify(paused.model);
  // Changing the speed while paused must not reset the session or the weights.
  await slider.fill("40");
  await page.waitForTimeout(300);
  expect(JSON.stringify((await saved(page)).model)).toBe(weights);
  expect((await saved(page)).settings.speed).toBe(40);
  expect(await step(page)).toBe(paused.history.at(-1).step);
  await page.getByRole("button", { name: "학습 재개", exact: true }).click();
  await expect
    .poll(() => step(page))
    .toBeGreaterThan(paused.history.at(-1).step);
  await page.getByRole("button", { name: "일시정지", exact: true }).click();
  expect(workers).toBe(1);
});
test("turbo training finishes at the target epoch and reports the result", async ({
  page,
}) => {
  await goPage(page, "lab");
  await popover(page, "학습 설정");
  await page.getByLabel("목표 Epoch", { exact: true }).fill("60");
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "고속", exact: true }).click();
  await page.getByRole("button", { name: "학습 시작", exact: true }).click();
  await expect(page.getByTestId("epoch")).toContainText("60", {
    timeout: 20000,
  });
  await expect(page.getByText("학습 완료")).toBeVisible();
  const state = await saved(page);
  // 40 training points in batches of 16 are 3 updates per epoch: 60 epochs = 180 updates.
  expect(state.history.at(-1)).toMatchObject({ epoch: 60, step: 180 });
  await expect(page.getByTestId("throughput")).toContainText("batch/s");
});
test("the navigation drawer opens, traps the page and closes with backdrop and Escape", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(300);
  const menu = page.getByRole("button", { name: "메뉴 열기", exact: true });
  await menu.click();
  await expect(page.locator("#nav")).toBeVisible();
  await expect(page.locator(".workspace")).toHaveAttribute("inert", "");
  await page.keyboard.press("Escape");
  await expect(page.locator("#nav")).toBeHidden();
  await expect(menu).toBeFocused();
  await menu.click();
  await page.locator(".nav-backdrop").click({ position: { x: 370, y: 400 } });
  await expect(page.locator("#nav")).toBeHidden();
  await menu.click();
  await page
    .getByRole("button", { name: "메뉴 닫기", exact: true })
    .last()
    .click();
  await expect(page.locator("#nav")).toBeHidden();
});
test("keyboard navigation reaches the menu and popovers close with Escape", async ({
  page,
}, info) => {
  test.skip(info.project.name === "mobile", "Keyboard flow is a desktop flow.");
  await page.getByTestId("nav-home").focus();
  await page.keyboard.press("Tab");
  await expect(page.getByTestId("nav-lab")).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.locator('.page[data-page="lab"]')).toBeVisible();
  const settings = page.getByRole("button", { name: "학습 설정", exact: true });
  await settings.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("group", { name: "학습 설정" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("group", { name: "학습 설정" })).toBeHidden();
  await expect(settings).toBeFocused();
});
test("the reset confirmation opens from the toolbar", async ({ page }) => {
  await goPage(page, "lab");
  await popover(page, "학습 도구 더보기");
  await page.getByRole("button", { name: "초기화", exact: true }).click();
  await expect(page.getByRole("dialog")).toContainText("초기화합니다");
  await closeDialog(page);
});

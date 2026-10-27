import { test, expect, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";
import {
  closeDialog,
  collectDiagnostics,
  diagnostics,
  leaveSide,
  saved,
  section,
} from "./helpers";
async function stroke(page: Page) {
  await page.getByRole("button", { name: "연속 그리기", exact: true }).click();
  const b = (await page.getByTestId("data-plot").boundingBox())!;
  await page.mouse.move(b.x + 45, b.y + 55);
  await page.mouse.down();
  await page.mouse.move(b.x + b.width - 50, b.y + 80, { steps: 24 });
  await page.mouse.up();
}
test.beforeEach(async ({ page }) => {
  collectDiagnostics(page);
  await page.goto("./");
});
test.afterEach(async ({ page }) => {
  expect(diagnostics.get(page)).toEqual([]);
});
test("regression continuous drawing commits one reversible stroke", async ({
  page,
}) => {
  const original = (await saved(page)).data;
  await stroke(page);
  expect((await saved(page)).data.length).toBeGreaterThan(original.length + 5);
  await page.getByRole("button", { name: "데이터 편집", exact: true }).click();
  await page.getByRole("button", { name: "실행 취소", exact: true }).click();
  expect((await saved(page)).data).toEqual(original);
  await page.getByRole("button", { name: "다시 실행", exact: true }).click();
  expect((await saved(page)).data.length).toBeGreaterThan(original.length + 5);
  await closeDialog(page);
  const b = (await page.getByTestId("data-plot").boundingBox())!,
    count = await page.getByTestId("data-point").count();
  await page.mouse.move(b.x + 50, b.y + 95);
  await page.mouse.down();
  await page.mouse.move(b.x + 52, b.y + 96, { steps: 4 });
  await page.mouse.up();
  await expect(page.getByTestId("data-point")).toHaveCount(count + 1);
});
test("classification drawing, training, boundary, inspectors and mode persistence", async ({
  page,
}) => {
  const regression = await saved(page);
  await page.getByRole("button", { name: "분류", exact: true }).click();
  await expect(page.getByTestId("data-point")).toHaveCount(100);
  await expect(page.getByTestId("decision-boundary")).toBeVisible();
  await page.getByRole("button", { name: "클래스 1", exact: true }).click();
  const plotBox = (await page.getByTestId("data-plot").boundingBox())!;
  await page
    .getByTestId("data-plot")
    .click({ position: { x: plotBox.width * 0.8, y: plotBox.height * 0.18 } });
  await expect(page.getByTestId("data-point")).toHaveCount(101);
  const last = (await page.getByTestId("data-point").last().boundingBox())!;
  await page.mouse.move(last.x + last.width / 2, last.y + last.height / 2);
  await page.mouse.down();
  await page.mouse.move(last.x - 20, last.y + 25, { steps: 5 });
  await page.mouse.up();
  expect((await saved(page)).data.at(-1).label).toBe(1);
  await stroke(page);
  let state = await saved(page);
  expect(state.data.length).toBeGreaterThan(105);
  expect(
    state.data.slice(100).every((p: { label: number }) => p.label === 1),
  ).toBe(true);
  await page.getByRole("button", { name: "데이터 편집", exact: true }).click();
  await page
    .getByLabel("데이터 포인트 선택")
    .selectOption(String(state.data.length - 1));
  await page.getByLabel("점 x", { exact: true }).fill("-3.7");
  await page.getByLabel("선택 점 클래스").selectOption("0");
  state = await saved(page);
  expect(state.data.at(-1).x).toBe(-3.7);
  expect(state.data.at(-1).label).toBe(0);
  await page.getByRole("button", { name: "선택 점 삭제" }).click();
  await page.getByRole("button", { name: "실행 취소", exact: true }).click();
  expect((await saved(page)).data).toEqual(state.data);
  for (const preset of [
    "XOR",
    "Two moons",
    "Concentric circles",
    "Gaussian blobs",
    "Spiral",
  ]) {
    await page.getByRole("button", { name: preset, exact: true }).click();
    expect(
      (await saved(page)).data.every(
        (p: { label: number }) => p.label === 0 || p.label === 1,
      ),
    ).toBe(true);
  }
  await page.getByRole("button", { name: "Two moons", exact: true }).click();
  await closeDialog(page);
  await section(page, "files");
  const csv = page.waitForEvent("download");
  await page.getByRole("button", { name: "CSV 내보내기", exact: true }).click();
  expect(await readFile((await (await csv).path())!, "utf8")).toMatch(
    /^x,y,label\n/,
  );
  await leaveSide(page);
  await page.getByLabel("결정 경계 해상도").selectOption("24");
  await expect(page.getByTestId("decision-boundary")).toBeVisible();
  const initial = await page
    .getByTestId("decision-boundary")
    .getAttribute("href");
  await page.getByRole("button", { name: "학습 시작", exact: true }).click();
  await expect
    .poll(
      async () =>
        Number(
          await page.getByTestId("training-dock").getAttribute("data-step"),
        ),
      { timeout: 30000 },
    )
    .toBeGreaterThan(180);
  await page.getByRole("button", { name: "일시정지", exact: true }).click();
  await expect(page.getByTestId("accuracy")).toHaveText(/\d+\.\d+%/);
  await expect
    .poll(
      async () =>
        await page.getByTestId("decision-boundary").getAttribute("href"),
    )
    .not.toBe(initial);
  state = await saved(page);
  expect(state.history.at(-1).train).toBeLessThan(state.history[0].train);
  expect(state.history.at(-1).validationAccuracy).toBeGreaterThanOrEqual(0);
  await page.waitForTimeout(500);
  const updates = await page
    .getByTestId("data-plot")
    .getAttribute("data-boundary-updates");
  await page.getByRole("button", { name: "좌표 관찰", exact: true }).click();
  await page.getByTestId("data-plot").click({ position: { x: 80, y: 90 } });
  await expect(page.getByTestId("probability")).toHaveText(/\d+\.\d+%/);
  await page.waitForTimeout(500);
  expect(
    await page.getByTestId("data-plot").getAttribute("data-boundary-updates"),
  ).toBe(updates);
  await section(page, "network");
  await page.getByRole("button", { name: "뉴런 1-0", exact: true }).click();
  await expect(page.getByText(/ID l0n0 · layer 1 \/ index 0/)).toBeVisible();
  await expect(
    page.getByText("Incoming 활성 / 전체 · 평균 |w|", { exact: true }),
  ).toBeVisible();
  await leaveSide(page);
  await page.getByRole("button", { name: "회귀", exact: true }).click();
  const restored = await saved(page);
  expect(restored.data).toEqual(regression.data);
  expect(restored.model).toEqual(regression.model);
  await page.getByRole("button", { name: "분류", exact: true }).click();
  const resumed = await saved(page);
  expect(resumed.data).toEqual(state.data);
  expect(resumed.model).toEqual(state.model);
  await page.reload();
  await expect(page.getByTestId("decision-boundary")).toBeVisible();
  expect((await saved(page)).model).toEqual(state.model);
  await page.getByRole("button", { name: "실험 메뉴 열기" }).click();
  const json = page.waitForEvent("download");
  await page.getByRole("button", { name: "저장", exact: true }).click();
  const exported = JSON.parse(
    await readFile((await (await json).path())!, "utf8"),
  );
  expect(exported.version).toBe(2);
  expect(exported.task).toBe("classification");
  expect(exported.other.model).toEqual(regression.model);
  await section(page, "files");
  const png = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "그래프 PNG 내보내기", exact: true })
    .click();
  expect(
    (await readFile((await (await png).path())!)).subarray(1, 4).toString(),
  ).toBe("PNG");
  await section(page, "analysis");
  await expect(page.getByRole("table")).toBeVisible();
  await expect(page.getByTestId("validation-accuracy")).toHaveText(/\d+\.\d+%/);
});
for (const [width, height] of [
  [390, 844],
  [768, 1024],
  [1280, 720],
  [1440, 900],
])
  test(`classification workspace fits ${width}x${height}`, async ({
    page,
  }, info) => {
    await page.setViewportSize({ width, height });
    await page.getByRole("button", { name: "분류", exact: true }).click();
    await expect(page.getByTestId("decision-boundary")).toBeVisible();
    await expect(
      page.getByRole("button", { name: "클래스 1", exact: true }),
    ).toBeInViewport({ ratio: 1 });
    await expect(
      page.getByRole("button", { name: "학습 시작", exact: true }),
    ).toBeInViewport({ ratio: 1 });
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBeLessThanOrEqual(width);
    expect(
      await page.evaluate(() => document.documentElement.scrollHeight),
    ).toBeLessThanOrEqual(height + 1);
    expect(
      (await page.getByTestId("data-plot").boundingBox())!.height,
    ).toBeGreaterThan(150);
    if (info.project.name === "chromium" && (width === 390 || width === 1440))
      await page.screenshot({
        path: `test-results/classification-${width}.png`,
        fullPage: true,
      });
  });

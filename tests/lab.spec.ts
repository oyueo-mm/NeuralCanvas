import { test, expect, type Page } from "@playwright/test";
import { Buffer } from "node:buffer";
import { readFile } from "node:fs/promises";
async function snapshot(page: Page) {
  await page.waitForTimeout(800);
  return JSON.parse(
    await page.evaluate(() => localStorage.getItem("neuralcanvas-v1")!),
  );
}
async function tab(page: Page, name: string) {
  const target = page.getByRole("tab", { name, exact: true });
  if (await target.isVisible()) await target.click();
}
async function close(page: Page) {
  await page.getByRole("button", { name: "패널 닫기" }).click();
  await expect(page.getByRole("dialog")).not.toBeVisible();
}
async function dataEditor(page: Page) {
  await tab(page, "데이터");
  await page.getByRole("button", { name: "데이터 편집", exact: true }).click();
}
async function modelEditor(page: Page) {
  await tab(page, "신경망");
  await page.getByRole("button", { name: "모델 편집", exact: true }).click();
}
const diagnostics = new WeakMap<Page, string[]>();
test.beforeEach(async ({ page }) => {
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
  await page.goto("./");
});
test.afterEach(async ({ page }) => {
  expect(diagnostics.get(page)).toEqual([]);
});
test("point editing, precise coordinates, undo and CSV", async ({ page }) => {
  const plot = page.getByTestId("data-plot"),
    box = await plot.boundingBox();
  await plot.click({
    position: { x: box!.width * 0.78, y: box!.height * 0.18 },
  });
  await expect(page.getByTestId("data-point")).toHaveCount(51);
  const before = (await snapshot(page)).data[50];
  const dot = await page.getByTestId("data-point").last().boundingBox();
  await page.mouse.move(dot!.x + dot!.width / 2, dot!.y + dot!.height / 2);
  await page.mouse.down();
  await page.mouse.move(dot!.x + 26, dot!.y + 22, { steps: 5 });
  await page.mouse.up();
  expect((await snapshot(page)).data[50]).not.toEqual(before);
  await page.getByTestId("data-point").last().click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.getByLabel("점 x", { exact: true }).fill("1.2345678912345");
  await page.getByLabel("점 y", { exact: true }).fill("2.5");
  expect((await snapshot(page)).data[50].x).toBe(1.2345678912345);
  await page.getByLabel("점 x", { exact: true }).focus();
  await expect(page.getByLabel("점 x", { exact: true })).toHaveValue(
    "1.2345678912345",
  );
  await page.getByRole("button", { name: "선택 점 삭제" }).click();
  await page.getByRole("button", { name: "실행 취소", exact: true }).click();
  expect((await snapshot(page)).data.length).toBe(51);
  await page.getByRole("button", { name: "다시 실행", exact: true }).click();
  expect((await snapshot(page)).data.length).toBe(50);
  await page.getByRole("button", { name: "선형", exact: true }).click();
  const saved = await snapshot(page);
  expect(saved.data[0].y).toBeCloseTo(-2.4);
  const csv = page.waitForEvent("download");
  await page.getByRole("button", { name: "CSV 내보내기", exact: true }).click();
  expect((await csv).suggestedFilename()).toBe("dataset.csv");
  await close(page);
  const original = (await snapshot(page)).data;
  await page.getByRole("button", { name: "탐색", exact: true }).click();
  const span = await plot.getAttribute("data-span");
  await page.getByRole("button", { name: "데이터 확대", exact: true }).click();
  expect(await plot.getAttribute("data-span")).not.toBe(span);
  expect((await snapshot(page)).data).toEqual(original);
  await page.getByRole("button", { name: "데이터 화면 맞춤" }).click();
});
test("model editing, worker training, one Epoch and observation", async ({
  page,
}) => {
  let workers = 0;
  page.on("worker", () => workers++);
  await tab(page, "신경망");
  const node = page.getByRole("button", { name: "뉴런 1-0", exact: true });
  await node.click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.getByLabel("편향", { exact: true }).fill("0.75");
  expect((await snapshot(page)).model.layers[0].b[0]).toBe(0.75);
  await page.getByLabel("은닉층 1 활성화").selectOption("sigmoid");
  await page.getByRole("button", { name: "은닉층 1 뉴런 추가" }).click();
  expect((await snapshot(page)).model.layers[0].b.length).toBe(5);
  await page.getByRole("button", { name: "은닉층 1 뉴런 제거" }).click();
  await page.getByRole("button", { name: "은닉층 추가", exact: true }).click();
  expect((await snapshot(page)).model.layers.length).toBe(4);
  await page.getByRole("button", { name: "은닉층 3 삭제" }).click();
  await page.getByLabel("편집 대상").selectOption("e-0-0-0");
  await page.getByLabel("가중치", { exact: true }).fill("1.25");
  await page.getByRole("switch", { name: "연결 활성화" }).uncheck();
  expect((await snapshot(page)).model.layers[0].enabled[0][0]).toBe(false);
  await close(page);
  await tab(page, "데이터");
  const path = await page.getByTestId("prediction").getAttribute("d");
  await page.getByRole("button", { name: "한 스텝", exact: true }).click();
  await expect
    .poll(async () => Number((await snapshot(page)).history.at(-1)?.step ?? 0))
    .toBe(1);
  expect(await page.getByTestId("prediction").getAttribute("d")).not.toBe(path);
  const extra = page.getByRole("button", { name: "학습 추가 조작" });
  if (await extra.isVisible()) await extra.click();
  await page.getByRole("button", { name: "한 Epoch", exact: true }).click();
  await expect
    .poll(async () => (await snapshot(page)).history.at(-1)?.epoch)
    .toBe(1);
  await page.getByRole("button", { name: "학습 재개", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "일시정지", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "한 스텝", exact: true }),
  ).toBeDisabled();
  await tab(page, "신경망");
  await page.getByRole("button", { name: "모델 편집", exact: true }).click();
  await close(page);
  await tab(page, "데이터");
  await page.getByRole("button", { name: "일시정지", exact: true }).click();
  const stopped = await snapshot(page);
  expect(stopped.history.length).toBeGreaterThan(2);
  expect(stopped.model.layers[0].w[0][0]).toBe(1.25);
  expect(workers).toBe(1);
  await page.getByRole("button", { name: "학습 재개", exact: true }).click();
  await expect
    .poll(
      async () =>
        Number(
          await page.getByTestId("training-dock").getAttribute("data-step"),
        ),
      { timeout: 15000 },
    )
    .toBeGreaterThan(stopped.history.at(-1).step);
  await page.getByRole("button", { name: "일시정지", exact: true }).click();
  expect((await snapshot(page)).history.at(-1).step).toBeGreaterThan(
    stopped.history.at(-1).step,
  );
  expect(workers).toBe(1);
  const model = (await snapshot(page)).model;
  await page.getByRole("button", { name: "입력 순회", exact: true }).click();
  await page.waitForTimeout(200);
  await tab(page, "신경망");
  await page
    .getByRole("button", { name: "순회 일시정지", exact: true })
    .click();
  const observed = await snapshot(page);
  expect(observed.model).toEqual(model);
  expect(observed.input).toBeGreaterThan(0);
  const network = page.getByTestId("network");
  const transform = await page
    .getByTestId("network-transform")
    .getAttribute("transform");
  await page.getByRole("button", { name: "신경망 확대" }).click();
  expect(
    await page.getByTestId("network-transform").getAttribute("transform"),
  ).not.toBe(transform);
  const zoom = await network.getAttribute("data-zoom");
  await tab(page, "데이터");
  await tab(page, "신경망");
  expect(await network.getAttribute("data-zoom")).toBe(zoom);
  await tab(page, "분석");
  if (!(await page.getByRole("tab", { name: "분석", exact: true }).isVisible()))
    await page.getByRole("button", { name: /학습 분석/ }).click();
  await expect(page.getByTestId("loss-chart")).toBeVisible();
  await expect(
    page.getByTestId("loss-chart").locator("svg").first(),
  ).toBeVisible();
});
test("drawer focus, settings, JSON compatibility and PNG export", async ({
  page,
}, info) => {
  const settings = page.getByRole("button", { name: "학습 설정 열기" });
  await settings.click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.getByLabel("Optimizer", { exact: true }).selectOption("sgd");
  await page.getByLabel("학습률", { exact: true }).fill("0.005");
  await page.getByLabel("목표 Epoch", { exact: true }).fill("1000");
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await expect(settings).toBeFocused();
  expect((await snapshot(page)).settings.optimizer).toBe("sgd");
  await page.getByRole("button", { name: "실험 메뉴 열기" }).click();
  const dl = page.waitForEvent("download");
  await page.getByRole("button", { name: "실험 저장 · JSON" }).click();
  const downloaded = await dl,
    body = JSON.parse(await readFile((await downloaded.path())!, "utf8"));
  expect(body.version).toBe(2);
  expect(body.settings.lr).toBe(0.005);
  await close(page);
  body.name = "복원 실험";
  body.version = 1;
  delete body.task;
  delete body.classes;
  delete body.input2;
  body.model.layers[0].w[0][0] = 2.5;
  await page
    .locator("input[type=file]")
    .first()
    .setInputFiles({
      name: "legacy-v1.json",
      mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify(body)),
    });
  expect((await snapshot(page)).model.layers[0].w[0][0]).toBe(2.5);
  await page
    .locator("input[type=file]")
    .first()
    .setInputFiles({
      name: "bad.json",
      mimeType: "application/json",
      buffer: Buffer.from('{"version":999}'),
    });
  await expect(page.getByRole("status")).toContainText("불러오기 실패");
  for (const [name, png] of [
    ["데이터", "그래프 PNG 내보내기"],
    ["신경망", "신경망 PNG 내보내기"],
  ]) {
    if (name === "데이터") await dataEditor(page);
    else await modelEditor(page);
    const pending = page.waitForEvent("download");
    await page.getByRole("button", { name: png, exact: true }).click();
    const downloaded = await pending,
      bytes = await readFile((await downloaded.path())!);
    expect(
      bytes
        .subarray(0, 8)
        .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])),
    ).toBe(true);
    await close(page);
  }
  await dataEditor(page);
  await page.getByRole("button", { name: "전체 삭제", exact: true }).click();
  await close(page);
  await page.getByRole("button", { name: "학습 시작", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("두 개 이상");
  await dataEditor(page);
  await page.getByRole("button", { name: "실행 취소", exact: true }).click();
  await close(page);
  await page.reload();
  await expect(page.getByTestId("data-point")).toHaveCount(50);
});
for (const [width, height] of [
  [360, 800],
  [390, 844],
  [430, 932],
  [768, 1024],
  [1024, 768],
  [1280, 720],
  [1440, 900],
  [1680, 1050],
])
  test(`workspace fits ${width}x${height}`, async ({ page }, info) => {
    await page.setViewportSize({ width, height });
    await expect(page.getByTestId("data-plot")).toBeVisible();
    await expect(
      page.getByRole("button", { name: "학습 시작", exact: true }),
    ).toBeInViewport({ ratio: 1 });
    const plot = await page.getByTestId("data-plot").boundingBox();
    expect(plot!.y + plot!.height).toBeLessThanOrEqual(height);
    expect(plot!.height).toBeGreaterThan(200);
    if (width > 900)
      await expect(page.getByTestId("network")).toBeInViewport({ ratio: 1 });
    else {
      await expect(page.getByTestId("network")).not.toBeVisible();
      await page.getByRole("tab", { name: "신경망", exact: true }).click();
      await expect(page.getByTestId("network")).toBeVisible();
      await page.getByRole("tab", { name: "데이터", exact: true }).click();
      expect(
        await page.evaluate(() => document.documentElement.scrollHeight),
      ).toBeLessThanOrEqual(height + 1);
    }
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    if (info.project.name === "chromium" && (width === 390 || width === 1440))
      await page.screenshot({
        path: `test-results/white-${width}.png`,
        fullPage: true,
      });
  });

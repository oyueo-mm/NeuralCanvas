import { test, expect, type Page } from "@playwright/test";
import { Buffer } from "node:buffer";
import { readFile } from "node:fs/promises";
async function snapshot(page: Page) {
  await page.waitForTimeout(850);
  return JSON.parse(
    await page.evaluate(() => localStorage.getItem("neuralcanvas-v1")!),
  );
}
test.beforeEach(async ({ page }) => {
  await page.goto("./");
  await page.evaluate(() => localStorage.clear());
  await page.reload();
});
test("data editing, model editing and real worker training", async ({
  page,
}, info) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const failed: string[] = [];
  page.on("requestfailed", (r) => failed.push(r.url()));
  const plot = page.getByTestId("data-plot");
  const initial = await snapshot(page);
  const box = await plot.boundingBox();
  await plot.click({
    position: { x: box!.width * 0.55, y: box!.height * 0.35 },
  });
  await expect(page.getByTestId("data-point")).toHaveCount(51);
  let saved = await snapshot(page);
  expect(saved.data.length).toBe(51);
  const target = page.getByTestId("data-point").last();
  const before = await target.boundingBox();
  await page.mouse.move(
    before!.x + before!.width / 2,
    before!.y + before!.height / 2,
  );
  await page.mouse.down();
  await page.mouse.move(before!.x + 15, before!.y + 15, { steps: 5 });
  await page.mouse.up();
  saved = await snapshot(page);
  expect(saved.data[50]).not.toEqual(initial.data[0]);
  await page.getByRole("button", { name: "선택 점 삭제" }).click();
  await expect(page.getByTestId("data-point")).toHaveCount(50);
  await page.getByRole("button", { name: "선형", exact: true }).click();
  await expect(page.getByTestId("data-point")).toHaveCount(50);
  await page
    .getByRole("button", { name: "은닉층 1 뉴런 추가", exact: true })
    .click();
  expect((await snapshot(page)).model.layers[0].b.length).toBe(5);
  await page
    .getByRole("button", { name: "은닉층 1 뉴런 제거", exact: true })
    .click();
  await page
    .getByRole("button", { name: "＋ 은닉층 추가", exact: false })
    .click();
  expect((await snapshot(page)).model.layers.length).toBe(4);
  await page
    .getByRole("button", { name: "은닉층 3 삭제", exact: true })
    .click();
  await page.getByRole("button", { name: "연결 0-0-0", exact: true }).focus();
  await page
    .getByRole("button", { name: "연결 0-0-0", exact: true })
    .press("Enter");
  await page.getByLabel("가중치", { exact: true }).fill("1.25");
  let s = await snapshot(page);
  expect(s.model.layers[0].w[0][0]).toBe(1.25);
  await page.getByLabel("연결 활성화").uncheck();
  s = await snapshot(page);
  expect(s.model.layers[0].enabled[0][0]).toBe(false);
  await page.getByRole("button", { name: "뉴런 1-0", exact: true }).focus();
  await page
    .getByRole("button", { name: "뉴런 1-0", exact: true })
    .press("Enter");
  await page.getByLabel("편향", { exact: true }).fill("0.75");
  expect((await snapshot(page)).model.layers[0].b[0]).toBe(0.75);
  await page.getByLabel("은닉층 1 활성화").selectOption("sigmoid");
  expect((await snapshot(page)).model.layers[0].activation).toBe("sigmoid");
  const path = await page.getByTestId("prediction").getAttribute("d");
  await page.getByRole("button", { name: "한 스텝", exact: true }).click();
  await expect
    .poll(async () => Number((await snapshot(page)).history.at(-1)?.step ?? 0))
    .toBe(1);
  expect(await page.getByTestId("prediction").getAttribute("d")).not.toBe(path);
  await page.getByRole("button", { name: "▶ 학습 시작", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Ⅱ 일시정지", exact: true }),
  ).toBeVisible();
  await page.waitForTimeout(500);
  await page.getByRole("button", { name: "Ⅱ 일시정지", exact: true }).click();
  await page.waitForTimeout(150);
  const stopped = await snapshot(page);
  expect(stopped.history.length).toBeGreaterThan(1);
  expect(stopped.model.layers[0].w[0][0]).toBe(1.25);
  await page.getByRole("button", { name: "▶ 학습 시작", exact: true }).click();
  await page.waitForTimeout(250);
  await page.getByRole("button", { name: "Ⅱ 일시정지", exact: true }).click();
  expect((await snapshot(page)).history.at(-1).step).toBeGreaterThan(
    stopped.history.at(-1).step,
  );
  const modelBefore = (await snapshot(page)).model;
  await page.getByRole("button", { name: "▷ 입력 순회", exact: true }).click();
  await page.waitForTimeout(250);
  await page
    .getByRole("button", { name: "Ⅱ 순회 일시정지", exact: true })
    .click();
  const observed = await snapshot(page);
  expect(observed.model).toEqual(modelBefore);
  expect(observed.input).not.toBe(0);
  const network = page.getByTestId("network");
  const transform = await network
    .locator("g")
    .first()
    .getAttribute("transform");
  await page.getByRole("button", { name: "신경망 확대", exact: true }).click();
  expect(await network.locator("g").first().getAttribute("transform")).not.toBe(
    transform,
  );
  await page.getByRole("button", { name: "맞춤", exact: true }).nth(1).click();
  await page.screenshot({
    path: `test-results/${info.project.name}-lab.png`,
    fullPage: true,
  });
  expect(errors).toEqual([]);
  expect(failed).toEqual([]);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});
test("exports both visualizations as PNG", async ({ page }) => {
  const buttons = page.getByRole("button", { name: /PNG/ });
  for (let i = 0; i < 2; i++) {
    const downloaded = page.waitForEvent("download");
    await buttons.nth(i).click();
    const file = await downloaded;
    const path = await file.path();
    const bytes = await readFile(path!);
    expect(
      bytes
        .subarray(0, 8)
        .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])),
    ).toBe(true);
    expect(bytes.length).toBeGreaterThan(5000);
  }
});
test("experiment download, strict import, data CSV and empty state", async ({
  page,
}) => {
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "↓ 실험 저장", exact: true }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe("neuralcanvas-experiment.json");
  const saved = await snapshot(page);
  saved.name = "복원 실험";
  saved.model.layers[0].w[0][0] = 2.5;
  const inputs = page.locator("input[type=file]");
  await inputs
    .nth(0)
    .setInputFiles({
      name: "test.json",
      mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify(saved)),
    });
  await expect(page.getByRole("status")).toContainText("실험을 불러왔습니다");
  expect((await snapshot(page)).model.layers[0].w[0][0]).toBe(2.5);
  await inputs
    .nth(0)
    .setInputFiles({
      name: "bad.json",
      mimeType: "application/json",
      buffer: Buffer.from('{"version":999}'),
    });
  await expect(page.getByRole("status")).toContainText("불러오기 실패");
  await inputs
    .nth(1)
    .setInputFiles({
      name: "data.csv",
      mimeType: "text/csv",
      buffer: Buffer.from("x,y\n-1,-2\n1,2"),
    });
  await expect(page.getByTestId("data-point")).toHaveCount(2);
  await page.getByRole("button", { name: "전체 삭제", exact: true }).click();
  await page.getByRole("button", { name: "▶ 학습 시작", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("두 개 이상");
  await page.getByRole("button", { name: "↶ 실행 취소", exact: true }).click();
  await expect(page.getByTestId("data-point")).toHaveCount(2);
  await page.reload();
  await expect(page.getByTestId("data-point")).toHaveCount(2);
});

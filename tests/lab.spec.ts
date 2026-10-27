import { test, expect } from "@playwright/test";
import { Buffer } from "node:buffer";
import { readFile } from "node:fs/promises";
import {
  closeDialog,
  collectDiagnostics,
  diagnostics,
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
test("point editing, precise coordinates, undo and CSV", async ({ page }) => {
  const plot = page.getByTestId("data-plot"),
    box = await plot.boundingBox();
  await plot.click({
    position: { x: box!.width * 0.78, y: box!.height * 0.18 },
  });
  await expect(page.getByTestId("data-point")).toHaveCount(51);
  const before = (await saved(page)).data[50];
  const dot = await page.getByTestId("data-point").last().boundingBox();
  await page.mouse.move(dot!.x + dot!.width / 2, dot!.y + dot!.height / 2);
  await page.mouse.down();
  await page.mouse.move(dot!.x + 26, dot!.y + 22, { steps: 5 });
  await page.mouse.up();
  expect((await saved(page)).data[50]).not.toEqual(before);
  await page.getByTestId("data-point").last().click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.getByLabel("점 x", { exact: true }).fill("1.2345678912345");
  await page.getByLabel("점 y", { exact: true }).fill("2.5");
  expect((await saved(page)).data[50].x).toBe(1.2345678912345);
  await page.getByLabel("점 x", { exact: true }).focus();
  await expect(page.getByLabel("점 x", { exact: true })).toHaveValue(
    "1.2345678912345",
  );
  await page.getByRole("button", { name: "선택 점 삭제" }).click();
  await page.getByRole("button", { name: "실행 취소", exact: true }).click();
  expect((await saved(page)).data.length).toBe(51);
  await page.getByRole("button", { name: "다시 실행", exact: true }).click();
  expect((await saved(page)).data.length).toBe(50);
  await page.getByRole("button", { name: "선형", exact: true }).click();
  expect((await saved(page)).data[0].y).toBeCloseTo(-2.4);
  await closeDialog(page);
  await section(page, "files");
  const csv = page.waitForEvent("download");
  await page.getByRole("button", { name: "CSV 내보내기", exact: true }).click();
  expect((await csv).suggestedFilename()).toBe("dataset.csv");
  await leaveSide(page);
  const original = (await saved(page)).data;
  await page.getByRole("button", { name: "탐색", exact: true }).click();
  const span = await plot.getAttribute("data-span");
  await page.getByRole("button", { name: "데이터 확대", exact: true }).click();
  expect(await plot.getAttribute("data-span")).not.toBe(span);
  expect((await saved(page)).data).toEqual(original);
  await page.getByRole("button", { name: "데이터 화면 맞춤" }).click();
});
test("model editing in the sidebar, worker training, one Epoch and observation", async ({
  page,
}) => {
  let workers = 0;
  page.on("worker", () => workers++);
  await section(page, "network");
  await page.getByRole("button", { name: "뉴런 1-0", exact: true }).click();
  await page.getByLabel("편향", { exact: true }).fill("0.75");
  expect((await saved(page)).model.layers[0].b[0]).toBe(0.75);
  await page.getByLabel("은닉층 1 활성화").selectOption("sigmoid");
  await page.getByRole("button", { name: "은닉층 1 뉴런 추가" }).click();
  expect((await saved(page)).model.layers[0].b.length).toBe(5);
  await page.getByRole("button", { name: "은닉층 1 뉴런 제거" }).click();
  await page.getByRole("button", { name: "은닉층 추가", exact: true }).click();
  expect((await saved(page)).model.layers.length).toBe(4);
  await page.getByRole("button", { name: "은닉층 3 삭제" }).click();
  await page.getByLabel("편집 대상").selectOption("e-0-0-0");
  await page.getByLabel("가중치", { exact: true }).fill("1.25");
  await page.getByRole("switch", { name: "연결 활성화" }).uncheck();
  expect((await saved(page)).model.layers[0].enabled[0][0]).toBe(false);
  await leaveSide(page);
  const path = await page.getByTestId("prediction").getAttribute("d");
  await page.getByRole("button", { name: "한 스텝", exact: true }).click();
  await expect
    .poll(async () => Number((await saved(page)).history.at(-1)?.step ?? 0))
    .toBe(1);
  expect(await page.getByTestId("prediction").getAttribute("d")).not.toBe(path);
  await page.getByRole("button", { name: "한 Epoch", exact: true }).click();
  await expect
    .poll(async () => (await saved(page)).history.at(-1)?.epoch)
    .toBe(1);
  await page.getByRole("button", { name: "학습 재개", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "일시정지", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "한 스텝", exact: true }),
  ).toBeDisabled();
  // Opening, editing nothing and closing the sidebar must not disturb a running session.
  await openSide(page);
  await leaveSide(page);
  await page.getByRole("button", { name: "일시정지", exact: true }).click();
  const stopped = await saved(page);
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
  expect((await saved(page)).history.at(-1).step).toBeGreaterThan(
    stopped.history.at(-1).step,
  );
  expect(workers).toBe(1);
  const model = (await saved(page)).model;
  await section(page, "observe");
  await page.getByRole("button", { name: "입력 순회", exact: true }).click();
  await page.waitForTimeout(200);
  await page
    .getByRole("button", { name: "순회 일시정지", exact: true })
    .click();
  const observed = await saved(page);
  expect(observed.model).toEqual(model);
  expect(observed.input).toBeGreaterThan(0);
  await section(page, "network");
  const network = page.getByTestId("network");
  const transform = await page
    .getByTestId("network-transform")
    .getAttribute("transform");
  await page.getByRole("button", { name: "신경망 확대", exact: true }).click();
  expect(
    await page.getByTestId("network-transform").getAttribute("transform"),
  ).not.toBe(transform);
  const zoom = await network.getAttribute("data-zoom");
  await leaveSide(page);
  await openSide(page);
  expect(await network.getAttribute("data-zoom")).toBe(zoom);
  await section(page, "analysis");
  await expect(page.getByTestId("loss-chart")).toBeVisible();
  await expect(
    page.getByTestId("loss-chart").locator("svg").first(),
  ).toBeVisible();
});
test("settings, menu focus, JSON compatibility and PNG export", async ({
  page,
}) => {
  await section(page, "training");
  await page.getByLabel("Optimizer", { exact: true }).selectOption("sgd");
  await page.getByLabel("학습률", { exact: true }).fill("0.005");
  await page.getByLabel("목표 Epoch", { exact: true }).fill("1000");
  expect((await saved(page)).settings.optimizer).toBe("sgd");
  await leaveSide(page);
  const menu = page.getByRole("button", { name: "실험 메뉴 열기" });
  await menu.click();
  await expect(page.getByLabel("실험 이름")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByLabel("실험 이름")).not.toBeVisible();
  await expect(menu).toBeFocused();
  await menu.click();
  await page.getByLabel("실험 이름").fill("이름 변경");
  const dl = page.waitForEvent("download");
  await page.getByRole("button", { name: "저장", exact: true }).click();
  const downloaded = await dl,
    body = JSON.parse(await readFile((await downloaded.path())!, "utf8"));
  expect(body.version).toBe(2);
  expect(body.name).toBe("이름 변경");
  expect(body.settings.lr).toBe(0.005);
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
  expect((await saved(page)).model.layers[0].w[0][0]).toBe(2.5);
  await page
    .locator("input[type=file]")
    .first()
    .setInputFiles({
      name: "bad.json",
      mimeType: "application/json",
      buffer: Buffer.from('{"version":999}'),
    });
  await expect(page.getByRole("status")).toContainText("불러오기 실패");
  await section(page, "files");
  for (const png of ["그래프 PNG 내보내기", "신경망 PNG 내보내기"]) {
    const pending = page.waitForEvent("download");
    await page.getByRole("button", { name: png, exact: true }).click();
    const bytes = await readFile((await (await pending).path())!);
    expect(
      bytes
        .subarray(0, 8)
        .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])),
    ).toBe(true);
  }
  await leaveSide(page);
  await page.getByRole("button", { name: "데이터 편집", exact: true }).click();
  await page.getByRole("button", { name: "전체 삭제", exact: true }).click();
  await closeDialog(page);
  await page.getByRole("button", { name: "학습 시작", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("두 개 이상");
  await page.getByRole("button", { name: "데이터 편집", exact: true }).click();
  await page.getByRole("button", { name: "실행 취소", exact: true }).click();
  await closeDialog(page);
  await page.reload();
  await expect(page.getByTestId("data-point")).toHaveCount(50);
});

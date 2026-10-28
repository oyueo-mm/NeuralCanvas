import { test, expect, type Page } from "@playwright/test";
import { Buffer } from "node:buffer";
import { classes, createModel, dataset, defaults } from "../src/engine";
import { goPage, saved } from "./helpers";
const step = async (page: Page) =>
  Number(await page.getByTestId("training-dock").getAttribute("data-step"));
async function importExperiment(
  page: Page,
  sizes: number[],
  points: number,
  batch: number,
) {
  const experiment = {
    version: 2,
    task: "regression",
    classes: classes.map((c) => ({ ...c })),
    input2: 0,
    name: "성능 측정",
    model: createModel(sizes),
    data: dataset("사인", points, 0.2),
    settings: { ...defaults, batch, epochs: 100000, validation: 0.2 },
    history: [],
    input: 0,
  };
  await page
    .locator("input[type=file]")
    .first()
    .setInputFiles({
      name: "perf.json",
      mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify(experiment)),
    });
  await expect(page.getByTestId("data-point")).toHaveCount(points);
}
/** Runs one mode for a fixed time and reports real updates per second and frame pacing. */
async function measure(page: Page, mode: "일반" | "고속", ms: number) {
  await page.getByRole("button", { name: mode, exact: true }).click();
  if (mode === "일반") await page.getByTestId("speed-slider").fill("100");
  await page.evaluate(() => {
    const w = window as unknown as {
      __gaps: number[];
      __long: number;
      __stop: boolean;
    };
    w.__gaps = [];
    w.__long = 0;
    w.__stop = false;
    let last = performance.now();
    const loop = (now: number) => {
      w.__gaps.push(now - last);
      last = now;
      if (!w.__stop) requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
    new PerformanceObserver(
      (list) => (w.__long += list.getEntries().length),
    ).observe({
      entryTypes: ["longtask"],
    });
  });
  const before = await step(page);
  const start = Date.now();
  await page.getByRole("button", { name: /학습 (시작|재개)/ }).click();
  await page.waitForTimeout(ms);
  await page.getByRole("button", { name: "일시정지", exact: true }).click();
  const seconds = (Date.now() - start) / 1000;
  const updates = (await step(page)) - before;
  const frames = await page.evaluate(() => {
    const w = window as unknown as {
      __gaps: number[];
      __long: number;
      __stop: boolean;
    };
    w.__stop = true;
    const gaps = [...w.__gaps].sort((a, b) => a - b);
    return {
      maxGapMs: Math.round(gaps.at(-1) ?? 0),
      p95GapMs: Math.round(gaps[Math.floor(gaps.length * 0.95)] ?? 0),
      longTasks: w.__long,
    };
  });
  return { mode, updatesPerSec: Math.round(updates / seconds), ...frames };
}
test("turbo training processes far more updates than normal training and keeps the page responsive", async ({
  page,
}, info) => {
  test.skip(info.project.name !== "chromium", "Measured once, in Chromium.");
  test.setTimeout(180000);
  await page.goto("./");
  await goPage(page, "lab");
  const report: unknown[] = [];
  for (const [label, sizes, points, batch] of [
    ["작은 모델 4-4 · 50점", [4, 4], 50, 16],
    ["큰 모델 16-16-16-16 · 2000점", [16, 16, 16, 16], 2000, 32],
  ] as const) {
    await importExperiment(page, [...sizes], points, batch);
    const normal = await measure(page, "일반", 3000);
    await importExperiment(page, [...sizes], points, batch);
    const turbo = await measure(page, "고속", 3000);
    report.push({
      label,
      normal,
      turbo,
      speedup: +(turbo.updatesPerSec / normal.updatesPerSec).toFixed(2),
    });
    expect(turbo.updatesPerSec).toBeGreaterThan(normal.updatesPerSec);
    // Control messages and rendering stay serviceable while turbo runs.
    expect(turbo.p95GapMs).toBeLessThan(120);
  }
  console.log("PERFORMANCE " + JSON.stringify(report));
  info.annotations.push({
    type: "performance",
    description: JSON.stringify(report),
  });
});
test("a long turbo run keeps memory and the history bounded", async ({
  page,
}, info) => {
  test.skip(info.project.name !== "chromium", "Measured once, in Chromium.");
  test.setTimeout(120000);
  await page.goto("./");
  await goPage(page, "lab");
  await importExperiment(page, [16, 16, 16, 16], 2000, 32);
  await page.getByRole("button", { name: "고속", exact: true }).click();
  await page.getByRole("button", { name: "학습 시작", exact: true }).click();
  await page.waitForTimeout(1500);
  const heap = () =>
    page.evaluate(
      () =>
        (performance as unknown as { memory?: { usedJSHeapSize: number } })
          .memory?.usedJSHeapSize ?? 0,
    );
  const early = await heap();
  await page.waitForTimeout(12000);
  const late = await heap();
  await page.getByRole("button", { name: "일시정지", exact: true }).click();
  const state = await saved(page);
  expect(state.history.length).toBeLessThanOrEqual(1000);
  expect(state.history.at(-1).epoch).toBeGreaterThan(0);
  console.log(
    "MEMORY " +
      JSON.stringify({
        earlyMB: +(early / 1e6).toFixed(1),
        lateMB: +(late / 1e6).toFixed(1),
        history: state.history.length,
        epoch: state.history.at(-1).epoch,
      }),
  );
  // Allow normal garbage-collector noise but not unbounded growth.
  if (early) expect(late).toBeLessThan(early * 3 + 20e6);
});

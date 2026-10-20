import { chromium, devices } from "@playwright/test";
import {
  createModel,
  classificationDataset,
  defaults,
  classes,
} from "../src/engine.ts";
import { writeFile } from "node:fs/promises";
const browser = await chromium.launch(),
  results = [];
try {
  for (const [sizes, points, mobile] of [
    [[8, 8], 100, false],
    [[16, 16, 16, 16], 500, false],
    [[8, 8], 100, true],
  ]) {
    const page = await browser.newPage(
      mobile
        ? { ...devices["iPhone 13"], viewport: { width: 390, height: 844 } }
        : { viewport: { width: 1440, height: 900 } },
    );
    await page.goto(
      process.env.NEURALCANVAS_URL ?? "http://127.0.0.1:4175/NeuralCanvas/",
    );
    await page
      .locator("input[type=file]")
      .first()
      .setInputFiles({
        name: "bench.json",
        mimeType: "application/json",
        buffer: Buffer.from(
          JSON.stringify({
            version: 2,
            task: "classification",
            classes,
            name: "Classification performance",
            model: createModel(sizes, "tanh", 42, "xavier", "classification"),
            data: classificationDataset("Two moons", points, 0.08, 42),
            settings: { ...defaults, epochs: 100000 },
            history: [],
            input: 0,
            input2: 0,
          }),
        ),
      });
    await page.getByTestId("decision-boundary").waitFor();
    const boundary = [];
    for (const n of [24, 48, 96]) {
      await page.getByLabel("결정 경계 해상도").selectOption(String(n));
      await page.getByTestId("decision-boundary").waitFor();
      boundary.push({
        resolution: n,
        workerMs: Number(
          await page.getByTestId("data-plot").getAttribute("data-boundary-ms"),
        ),
        mainPaintMs: Number(
          await page
            .getByTestId("data-plot")
            .getAttribute("data-boundary-paint-ms"),
        ),
      });
    }
    await page.getByLabel("결정 경계 해상도").selectOption("48");
    await page.getByTestId("decision-boundary").waitFor();
    const cdp = await page.context().newCDPSession(page);
    await cdp.send("Performance.enable");
    await page.getByRole("button", { name: "학습 시작", exact: true }).click();
    const before = await cdp.send("Performance.getMetrics");
    const sample = await page.evaluate(
      () =>
        new Promise((resolve) => {
          let first = 0,
            last = 0,
            frames = 0,
            maxGap = 0,
            longTasks = 0;
          const boundaryTimes = [],
            observer = new PerformanceObserver(
              (list) => (longTasks += list.getEntries().length),
            );
          observer.observe({ type: "longtask" });
          let previous = "";
          function tick(now) {
            if (!first) first = now;
            if (last) maxGap = Math.max(maxGap, now - last);
            last = now;
            frames++;
            const svg = document.querySelector('[data-testid="data-plot"]'),
              updates = svg.dataset.boundaryUpdates;
            if (updates !== previous) {
              boundaryTimes.push(Number(svg.dataset.boundaryMs));
              previous = updates;
            }
            if (now - first >= 2500) {
              observer.disconnect();
              resolve({
                frames,
                elapsedMs: now - first,
                rafHz: ((frames - 1) * 1000) / (now - first),
                maxFrameGapMs: maxGap,
                longTasks,
                boundaryTimes,
              });
            } else requestAnimationFrame(tick);
          }
          requestAnimationFrame(tick);
        }),
    );
    const after = await cdp.send("Performance.getMetrics"),
      value = (r, n) => r.metrics.find((m) => m.name === n)?.value ?? 0,
      delta = (n) => (value(after, n) - value(before, n)) * 1000;
    await page.getByRole("button", { name: "일시정지", exact: true }).click();
    await page.waitForTimeout(800);
    const state = JSON.parse(
      await page.evaluate(() => localStorage.getItem("neuralcanvas-v1")),
    );
    results.push({
      sizes,
      points,
      mobile,
      boundary,
      ...sample,
      mainThreadMs: delta("TaskDuration"),
      mainThreadPercent: (100 * delta("TaskDuration")) / delta("Timestamp"),
      layoutMs: delta("LayoutDuration"),
      styleMs: delta("RecalcStyleDuration"),
      step: state.history.at(-1)?.step,
      accuracy: state.history.at(-1)?.accuracy,
    });
    if (!mobile && sizes.length === 2)
      await page.screenshot({
        path: "docs/images/classification-desktop.png",
        fullPage: true,
      });
    if (mobile)
      await page.screenshot({
        path: "docs/images/classification-mobile.png",
        fullPage: true,
      });
    await page.close();
  }
  console.log(JSON.stringify(results, null, 2));
  await writeFile(
    "docs/performance-classification.json",
    JSON.stringify(results, null, 2),
  );
} finally {
  await browser.close();
}

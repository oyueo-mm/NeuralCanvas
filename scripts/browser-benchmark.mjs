import { chromium } from "@playwright/test";
import { createModel, dataset, defaults } from "../src/engine.ts";
const browser = await chromium.launch();
const results = [];
for (const [sizes, points] of [
  [[4, 4], 50],
  [[16, 16, 16, 16], 500],
]) {
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1000 },
  });
  await page.goto("http://127.0.0.1:4173/NeuralCanvas/");
  const experiment = {
    version: 1,
    name: "UI performance",
    model: createModel(sizes),
    data: dataset("사인", points),
    settings: { ...defaults, epochs: 100000, speed: 20 },
    history: [],
    input: 0,
  };
  await page
    .locator("input[type=file]")
    .first()
    .setInputFiles({
      name: "bench.json",
      mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify(experiment)),
    });
  await page.getByRole("button", { name: "▶ 학습 시작", exact: true }).click();
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Performance.enable");
  const before = await cdp.send("Performance.getMetrics");
  const metrics = await page.evaluate(
    () =>
      new Promise((resolve) => {
        let first = 0,
          last = 0,
          frames = 0,
          maxGap = 0;
        const gaps = [];
        let longTasks = 0;
        let observer;
        if (PerformanceObserver.supportedEntryTypes.includes("longtask")) {
          observer = new PerformanceObserver(
            (list) => (longTasks += list.getEntries().length),
          );
          observer.observe({ type: "longtask" });
        }
        const tick = (now) => {
          if (!first) first = now;
          if (last) {
            const gap = now - last;
            maxGap = Math.max(maxGap, gap);
            gaps.push(gap);
          }
          last = now;
          frames++;
          if (now - first >= 2000) {
            observer?.disconnect();
            resolve({
              frames,
              durationMs: now - first,
              rafHz: ((frames - 1) * 1000) / (now - first),
              maxFrameGapMs: maxGap,
              longTasks,
            });
          } else requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      }),
  );
  const after = await cdp.send("Performance.getMetrics");
  const value = (r, n) => r.metrics.find((m) => m.name === n)?.value ?? 0;
  const mainThreadTaskMs =
    (value(after, "TaskDuration") - value(before, "TaskDuration")) * 1000;
  const elapsedMs =
    (value(after, "Timestamp") - value(before, "Timestamp")) * 1000;
  await page.getByRole("button", { name: "Ⅱ 일시정지", exact: true }).click();
  const result = {
    sizes,
    points,
    ...metrics,
    mainThreadTaskMs,
    mainThreadTaskPercent: (mainThreadTaskMs / elapsedMs) * 100,
  };
  results.push(result);
  await page.close();
}
console.log(JSON.stringify(results, null, 2));
await browser.close();

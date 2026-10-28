import { it, expect } from "vitest";
import { createModel, dataset, defaults } from "./engine";
import { Trainer } from "./training";
it("measures actual batch throughput", () => {
  for (const sizes of [
    [4, 4],
    [16, 16, 16, 16],
  ])
    for (const points of [50, 500]) {
      const t = new Trainer(createModel(sizes), dataset("사인", points), {
        ...defaults,
        batch: 16,
        validation: 0,
      });
      const start = performance.now();
      for (let i = 0; i < 200; i++) t.batch();
      const ms = performance.now() - start;
      console.log(
        JSON.stringify({
          sizes,
          points,
          batches: 200,
          ms,
          stepsPerSecond: 200000 / ms,
        }),
      );
      expect(t.step).toBe(200);
    }
});
// Normal mode measures the loss after every update; turbo measures it once per slice.
it("compares normal and turbo update throughput on small and large workloads", () => {
  const rows = [];
  for (const [sizes, points] of [
    [[4, 4], 50],
    [[8, 8], 500],
    [[16, 16, 16, 16], 500],
    [[16, 16, 16, 16], 2000],
  ] as const) {
    const make = () =>
      new Trainer(createModel([...sizes]), dataset("사인", points, 0.1), {
        ...defaults,
        batch: 16,
        validation: 0.2,
      });
    const normal = make(),
      turbo = make(),
      normalSteps = points >= 2000 ? 100 : 400;
    let start = performance.now();
    for (let i = 0; i < normalSteps; i++) normal.batch();
    const normalRate = (normalSteps * 1000) / (performance.now() - start);
    start = performance.now();
    let steps = 0;
    while (performance.now() - start < 400) {
      for (let i = 0; i < 25; i++) turbo.advance();
      steps += 25;
      turbo.metrics();
    }
    const turboRate = (steps * 1000) / (performance.now() - start);
    rows.push({
      sizes: sizes.join("-"),
      points,
      normalPerSec: Math.round(normalRate),
      turboPerSec: Math.round(turboRate),
      speedup: +(turboRate / normalRate).toFixed(2),
    });
    expect(turboRate).toBeGreaterThan(normalRate);
  }
  console.log(JSON.stringify(rows));
});

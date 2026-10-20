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

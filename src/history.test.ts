import { expect, it } from "vitest";
import { appendHistory, historyLimit } from "./history";
const rec = (step: number) => ({
  epoch: Math.floor(step / 4),
  step,
  train: 1 / step,
});
it("keeps the whole curve within the limit and the newest record", () => {
  let h: ReturnType<typeof rec>[] = [];
  for (let s = 1; s <= 5000; s += 7)
    h = appendHistory(
      h,
      Array.from({ length: 7 }, (_, k) => rec(s + k)),
    );
  expect(h.length).toBeLessThanOrEqual(historyLimit);
  expect(h.at(-1)!.step).toBe(5005);
  expect(h[0].step).toBe(1);
  const steps = h.map((r) => r.step);
  expect(steps).toEqual([...steps].sort((a, b) => a - b));
});
it("does not copy when nothing is appended", () => {
  const h = [rec(1)];
  expect(appendHistory(h, [])).toBe(h);
});

import { describe, expect, it } from "vitest";
import { experimentPresets, presetExperiment, presetPoints } from "./presets";
import { loadExperiment } from "./storage";
import { Trainer } from "./training";
const train = (id: string, epochs: number) => {
  const p = experimentPresets.find((x) => x.id === id)!,
    e = presetExperiment(p),
    t = new Trainer(e.model, e.data, e.settings);
  while (t.epoch < epochs) t.advance();
  return t.metrics();
};
describe("experiment presets", () => {
  it("offers 10 to 15 presets across both tasks and every difficulty", () => {
    expect(experimentPresets.length).toBeGreaterThanOrEqual(10);
    expect(experimentPresets.length).toBeLessThanOrEqual(15);
    expect(new Set(experimentPresets.map((p) => p.id)).size).toBe(
      experimentPresets.length,
    );
    for (const task of ["regression", "classification"])
      expect(experimentPresets.some((p) => p.task === task)).toBe(true);
    expect(new Set(experimentPresets.map((p) => p.difficulty)).size).toBe(3);
  });
  it.each(experimentPresets.map((p) => [p.id, p] as const))(
    "%s builds a valid, reproducible experiment",
    (_, p) => {
      const e = presetExperiment(p);
      expect(() => loadExperiment(JSON.stringify(e))).not.toThrow();
      expect(e.task).toBe(p.task);
      expect(e.data).toHaveLength(p.data.count);
      expect(presetPoints(p)).toEqual(e.data);
      expect(e.model.layers.map((l) => l.b.length)).toEqual([...p.hidden, 1]);
      expect(e.settings).toMatchObject(p.settings);
      if (p.task === "classification")
        expect(new Set(e.data.map((d) => d.label))).toEqual(new Set([0, 1]));
    },
  );
  it("every preset can be trained: the loss falls within 60 epochs", () => {
    for (const p of experimentPresets) {
      const e = presetExperiment(p),
        t = new Trainer(e.model, e.data, e.settings),
        before = t.metrics().train;
      while (t.epoch < 60) t.advance();
      expect(t.metrics().train, p.id).toBeLessThan(before);
    }
  });
  it("the underfitting preset stays far from the data", () => {
    expect(train("underfit", 800).train).toBeGreaterThan(1);
  });
  it("the overfitting preset shows a validation gap on this seed", () => {
    const m = train("overfit", 2500);
    expect(m.validation!).toBeGreaterThan(m.train * 4);
  });
  it("small classification presets reach high accuracy", () => {
    expect(train("xor", 600).accuracy!).toBeGreaterThan(0.9);
    expect(train("blobs", 300).accuracy!).toBeGreaterThan(0.95);
  });
});

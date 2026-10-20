import { describe, expect, it } from "vitest";
import {
  accuracy,
  activate,
  binaryCrossEntropy,
  classificationDataset,
  classificationPresets,
  classes,
  confusionMatrix,
  createModel,
  dataset,
  defaults,
  forward,
  gradients,
  loss,
  parseCSV,
  resizeModel,
  validatePoints,
  type Activation,
} from "./engine";
import { sampleBoundary, boundaryContour } from "./boundary";
import { Trainer } from "./training";
import { loadExperiment, type Experiment } from "./storage";

describe("binary classification mathematics", () => {
  it("uses both coordinates, sigmoid probabilities and exact BCE", () => {
    const m = createModel([], "tanh", 42, "zero", "classification");
    m.layers[0].w[0] = [2, -3];
    m.layers[0].b[0] = 0.5;
    expect(forward(m, [1, 2]).z[0][0]).toBe(-3.5);
    expect(forward(m, [1, 2]).y).toBeCloseTo(1 / (1 + Math.exp(3.5)), 14);
    expect(binaryCrossEntropy(0, 1)).toBeCloseTo(Math.log(2), 14);
    expect(loss(m, [{ x: 1, y: 2, label: 1 }])).toBeCloseTo(
      Math.log1p(Math.exp(3.5)),
      14,
    );
    expect(binaryCrossEntropy(1000, 0)).toBe(1000);
    expect(binaryCrossEntropy(-1000, 1)).toBe(1000);
    expect(activate(-1000, "sigmoid")).toBe(0);
    expect(activate(1000, "sigmoid")).toBe(1);
    m.layers[0].b[0] = 1000;
    expect(gradients(m, [{ x: 0, y: 0, label: 0 }]).b[0][0]).toBe(1);
  });
  for (const activation of [
    "tanh",
    "sigmoid",
    "relu",
    "leakyRelu",
    "linear",
  ] as Activation[]) {
    it(`BCE finite-difference gradient checking: ${activation}, masked edge`, () => {
      const m = createModel([3, 2], activation, 17, "xavier", "classification"),
        points = classificationDataset("Gaussian blobs", 8, 0.1, 19);
      m.layers[0].enabled[0][0] = false;
      const g = gradients(m, points),
        eps = 1e-5;
      m.layers.forEach((layer, l) =>
        layer.w.forEach((row, j) => {
          row.forEach((v, i) => {
            row[i] = v + eps;
            const plus = loss(m, points);
            row[i] = v - eps;
            const minus = loss(m, points);
            row[i] = v;
            expect(g.w[l][j][i]).toBeCloseTo((plus - minus) / (2 * eps), 6);
          });
          const v = layer.b[j];
          layer.b[j] = v + eps;
          const plus = loss(m, points);
          layer.b[j] = v - eps;
          const minus = loss(m, points);
          layer.b[j] = v;
          expect(g.b[l][j]).toBeCloseTo((plus - minus) / (2 * eps), 6);
        }),
      );
      expect(g.w[0][0][0]).toBe(0);
    });
  }
  for (const kind of ["XOR", "Two moons"])
    it(`${kind} learns a nonlinear boundary on held-out points`, () => {
      const m = createModel([8, 8], "tanh", 42, "xavier", "classification"),
        data = classificationDataset(kind, 160, 0.08, 42),
        trainer = new Trainer(m, data, { ...defaults, batch: 32 });
      const before = loss(m, data);
      let metrics;
      for (let i = 0; i < 1600; i++) metrics = trainer.batch();
      const unseen = classificationDataset(kind, 400, 0.08, 2026);
      console.log(
        `${kind}: BCE ${before} → ${loss(m, data)}, held-out accuracy=${accuracy(m, unseen)}, validation=${metrics!.validationAccuracy}`,
      );
      expect(loss(m, data)).toBeLessThan(0.17);
      expect(accuracy(m, unseen)).toBeGreaterThan(0.94);
      expect(metrics!.accuracy).toBeGreaterThan(0.95);
      expect(metrics!.validationAccuracy).toBeGreaterThan(0.9);
      expect(trainer.train.some((p) => trainer.validation.includes(p))).toBe(
        false,
      );
      const boundary = sampleBoundary(m, { cx: 0, cy: 0, span: 8 }, 24);
      expect(Math.min(...boundary.values)).toBeLessThan(0.15);
      expect(Math.max(...boundary.values)).toBeGreaterThan(0.85);
      expect(boundaryContour(boundary).length).toBeGreaterThan(15);
    });
  it("SGD decreases logistic BCE and confusion matrix counts actual labels", () => {
    const m = createModel([], "tanh", 42, "zero", "classification"),
      data = classificationDataset("Gaussian blobs", 60, 0, 42),
      t = new Trainer(m, data, {
        ...defaults,
        optimizer: "sgd",
        validation: 0,
        batch: 60,
        lr: 0.1,
      });
    for (let i = 0; i < 100; i++) t.batch();
    expect(accuracy(m, data)).toBeGreaterThan(0.98);
    expect(loss(m, data)).toBeLessThan(0.05);
    const matrix = confusionMatrix(m, data);
    expect(matrix.flat().reduce((s, v) => s + v, 0)).toBe(60);
    expect(matrix[0][0] + matrix[1][1]).toBe(
      Math.round(accuracy(m, data)! * 60),
    );
  });
});

describe("classification data, boundary and persistence", () => {
  for (const kind of classificationPresets)
    it(`seeded preset ${kind} has both labels and finite coordinates`, () => {
      const data = classificationDataset(kind, 101, 0.1, 8);
      expect(data).toEqual(classificationDataset(kind, 101, 0.1, 8));
      expect(validatePoints(data, "classification")).toEqual(data);
      expect(new Set(data.map((p) => p.label)).size).toBe(2);
    });
  it("validates class labels and parses lossless three-column CSV", () => {
    expect(
      parseCSV("x,y,label\n1.25,-2.75,1\n0,0,0", "classification"),
    ).toEqual([
      { x: 1.25, y: -2.75, label: 1 },
      { x: 0, y: 0, label: 0 },
    ]);
    for (const text of ["1,2", "1,2,2", "1,2,NaN", "1,2,"])
      expect(() => parseCSV(text, "classification")).toThrow();
    expect(() => validatePoints([{ x: 1, y: 2 }], "classification")).toThrow();
  });
  it("samples actual grid probabilities and interpolates the p=.5 contour", () => {
    const m = createModel([], "tanh", 42, "zero", "classification");
    m.layers[0].w[0] = [1, 0];
    const b = sampleBoundary(m, { cx: 0, cy: 0, span: 4 }, 8);
    expect(b.values).toHaveLength(81);
    expect(b.values[0]).toBeCloseTo(activate(-2, "sigmoid"), 6);
    expect(b.values[4]).toBe(0.5);
    expect(b.values[8]).toBeCloseTo(activate(2, "sigmoid"), 6);
    const contour = boundaryContour(b);
    expect(contour).toHaveLength(8);
    contour.forEach(([x, , u]) => {
      expect(x).toBe(0.5);
      expect(u).toBe(0.5);
    });
    expect(() => sampleBoundary(m, { cx: 0, cy: 0, span: 4 }, 512)).toThrow();
    expect(() =>
      sampleBoundary(createModel(), { cx: 0, cy: 0, span: 4 }, 8),
    ).toThrow();
  });
  it("preserves two-input weights when resizing and fixes the sigmoid output", () => {
    const m = createModel([2], "tanh", 42, "xavier", "classification");
    const next = resizeModel(m, [3], ["relu", "linear"]);
    expect(next.task).toBe("classification");
    expect(next.layers[0].w[0]).toEqual(m.layers[0].w[0]);
    expect(next.layers.at(-1)!.activation).toBe("sigmoid");
    expect(Number.isFinite(forward(next, [1, 2]).y)).toBe(true);
  });
  it("roundtrips v2 with a separate regression snapshot and still reads v1 unchanged", () => {
    const old: Experiment = {
      version: 1,
      name: "legacy",
      model: createModel(),
      data: dataset("사인"),
      settings: defaults,
      history: [],
      input: 0.42,
    };
    expect(loadExperiment(JSON.stringify(old))).toEqual(old);
    const e: Experiment = {
      version: 2,
      task: "classification",
      classes: [...classes],
      input2: 1.25,
      name: "classification",
      model: createModel([3], "tanh", 42, "xavier", "classification"),
      data: classificationDataset("Two moons"),
      settings: defaults,
      history: [
        {
          epoch: 1,
          step: 1,
          train: 0.5,
          validation: 0.6,
          accuracy: 0.8,
          validationAccuracy: 0.7,
        },
      ],
      input: -0.75,
      other: old,
    };
    expect(loadExperiment(JSON.stringify(e))).toEqual(e);
    const bad = structuredClone(e);
    bad.data[0].label = 3 as 0;
    expect(() => loadExperiment(JSON.stringify(bad))).toThrow();
    const wrong = structuredClone(e);
    wrong.model.layers.at(-1)!.activation = "linear";
    expect(() => loadExperiment(JSON.stringify(wrong))).toThrow();
    const shape = structuredClone(e);
    shape.model.layers[0].w[0] = [1];
    expect(() => loadExperiment(JSON.stringify(shape))).toThrow();
    const recursive = structuredClone(e);
    recursive.other!.other = old;
    expect(() => loadExperiment(JSON.stringify(recursive))).toThrow();
  });
});

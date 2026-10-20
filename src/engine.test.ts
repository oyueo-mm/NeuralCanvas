import { describe, it, expect } from "vitest";
import {
  activate,
  derivative,
  activations,
  createModel,
  forward,
  gradients,
  loss,
  Optimizer,
  defaults,
  dataset,
  resizeModel,
  parseCSV,
  validatePoints,
} from "./engine";
import { Trainer } from "./training";
import { loadExperiment } from "./storage";
describe("forward and activations", () => {
  it("matches hand calculation including bias and disabled edge", () => {
    const m = createModel([]);
    m.layers[0].w = [[2]];
    m.layers[0].b = [3];
    expect(forward(m, 4).y).toBe(11);
    m.layers[0].enabled = [[false]];
    expect(forward(m, 4).y).toBe(3);
  });
  it("computes multilayer values", () => {
    const m = createModel([1], "linear");
    m.layers[0].w = [[2]];
    m.layers[0].b = [1];
    m.layers[1].w = [[3]];
    m.layers[1].b = [-2];
    expect(forward(m, 2).y).toBe(13);
    expect(forward(m, 2).z).toEqual([[5], [13]]);
  });
  for (const a of activations)
    it(`${a} derivative`, () => {
      for (const x of [-2, -0.3, 0.7, 3])
        expect(derivative(x, a)).toBeCloseTo(
          (activate(x + 1e-6, a) - activate(x - 1e-6, a)) / 2e-6,
          5,
        );
    });
  it("stable sigmoid and ReLU zero rule", () => {
    expect(activate(-1000, "sigmoid")).toBe(0);
    expect(activate(1000, "sigmoid")).toBe(1);
    expect(derivative(0, "relu")).toBe(0);
  });
});
describe("finite difference gradient checks", () => {
  for (const activation of ["linear", "tanh", "sigmoid"] as const)
    for (const seed of [1, 42, 123])
      it(`${activation}, seed ${seed}, all weights and biases`, () => {
        const m = createModel([3, 2], activation, seed);
        m.layers[0].enabled[0][0] = false;
        const data = [
            { x: -0.7, y: 0.5 },
            { x: 0.2, y: -0.4 },
            { x: 0.8, y: 0.3 },
          ],
          g = gradients(m, data),
          eps = 1e-5;
        let maxAbs = 0,
          maxRel = 0;
        m.layers.forEach((l, k) => {
          const check = (
            get: () => number,
            set: (v: number) => void,
            analytic: number,
          ) => {
            const v = get();
            set(v + eps);
            const hi = loss(m, data);
            set(v - eps);
            const lo = loss(m, data);
            set(v);
            const numeric = (hi - lo) / (2 * eps),
              abs = Math.abs(numeric - analytic),
              relative =
                abs / Math.max(1e-7, Math.abs(numeric) + Math.abs(analytic));
            maxAbs = Math.max(maxAbs, abs);
            maxRel = Math.max(maxRel, relative);
            expect(abs < 1e-8 || relative < 1e-4).toBe(true);
          };
          l.w.forEach((row, j) => {
            row.forEach((_, i) =>
              check(
                () => row[i],
                (v) => (row[i] = v),
                g.w[k][j][i],
              ),
            );
            check(
              () => l.b[j],
              (v) => (l.b[j] = v),
              g.b[k][j],
            );
          });
        });
        console.log(
          `gradient ${activation}/${seed}: abs=${maxAbs.toExponential(2)} rel=${maxRel.toExponential(2)}`,
        );
      });
  it("averages the batch gradient", () => {
    const m = createModel([2]);
    const d = [{ x: 0.4, y: 0.3 }];
    expect(gradients(m, d)).toEqual(gradients(m, [...d, ...d]));
  });
});
describe("optimizers", () => {
  it("SGD hand update", () => {
    const m = createModel([], "linear", 42, "zero");
    const g = gradients(m, [{ x: 2, y: 1 }]);
    new Optimizer().update(m, g, {
      ...defaults,
      optimizer: "sgd",
      lr: 0.1,
      clip: 0,
    });
    expect(m.layers[0].w[0][0]).toBeCloseTo(0.4);
    expect(m.layers[0].b[0]).toBeCloseTo(0.2);
  });
  it("Adam first and second step bias correction", () => {
    const m = createModel([], "linear", 42, "zero"),
      o = new Optimizer(),
      g = { w: [[[2]]], b: [[2]], dz: [[2]] };
    o.update(m, g, { ...defaults, lr: 0.1, clip: 0 });
    expect(m.layers[0].w[0][0]).toBeCloseTo(-0.1, 7);
    o.update(m, g, { ...defaults, lr: 0.1, clip: 0 });
    expect(m.layers[0].w[0][0]).toBeCloseTo(-0.2, 7);
    expect(o.t).toBe(2);
  });
  it("disabled edges do not update even with existing Adam momentum", () => {
    const m = createModel([]),
      o = new Optimizer();
    o.update(m, gradients(m, [{ x: 2, y: 1 }]), defaults);
    m.layers[0].enabled[0][0] = false;
    const before = m.layers[0].w[0][0];
    for (let i = 0; i < 5; i++)
      o.update(m, gradients(m, [{ x: 2, y: 1 }]), defaults);
    expect(m.layers[0].w[0][0]).toBe(before);
  });
});
describe("training experiments", () => {
  it("linear SGD regression converges", () => {
    const m = createModel([]),
      d = dataset("선형", 40),
      t = new Trainer(m, d, {
        ...defaults,
        optimizer: "sgd",
        lr: 0.01,
        validation: 0,
        batch: 40,
      });
    const before = loss(m, d);
    for (let i = 0; i < 1000; i++) t.batch();
    console.log(`linear MSE ${before} -> ${loss(m, d)}`);
    expect(loss(m, d)).toBeLessThan(1e-10);
    expect(forward(m, 1).y).toBeCloseTo(1.1, 4);
  });
  it("nonlinear Adam sine regression converges", () => {
    const m = createModel([8, 8]),
      d = dataset("사인", 60),
      t = new Trainer(m, d, { ...defaults, validation: 0, batch: 60 });
    const before = loss(m, d);
    for (let i = 0; i < 2500; i++) t.batch();
    console.log(`sine MSE ${before} -> ${loss(m, d)}`);
    expect(loss(m, d)).toBeLessThan(0.03);
  });
  it("training is deterministic and validation is excluded", () => {
    const run = () => {
      const t = new Trainer(
        createModel([3]),
        dataset("사인", 30, 0.1),
        defaults,
      );
      for (let i = 0; i < 100; i++) t.batch();
      return t;
    };
    const a = run(),
      b = run();
    expect(a.model).toEqual(b.model);
    expect(a.train.length).toBe(24);
    expect(a.validation.length).toBe(6);
    expect(a.train.some((p) => a.validation.includes(p))).toBe(false);
  });
  it("constant x and single sample remain finite", () => {
    const t = new Trainer(createModel([2]), [{ x: 1, y: 2 }], defaults);
    for (let i = 0; i < 20; i++) t.batch();
    expect(Number.isFinite(loss(t.model, t.train))).toBe(true);
  });
  it("model capacity comparison reports measured results", () => {
    for (const width of [1, 4, 8]) {
      const m = createModel([width]),
        d = dataset("사인", 40),
        t = new Trainer(m, d, { ...defaults, validation: 0, batch: 40 });
      for (let i = 0; i < 1000; i++) t.batch();
      console.log(`capacity width=${width} MSE=${loss(m, d)}`);
      expect(Number.isFinite(loss(m, d))).toBe(true);
    }
  });
  it("learning rates compared using the same initialization", () => {
    for (const lr of [0.001, 0.01, 0.1]) {
      const m = createModel([4]),
        d = dataset("사인", 40),
        t = new Trainer(m, d, { ...defaults, lr, validation: 0, batch: 40 });
      for (let i = 0; i < 500; i++) t.batch();
      console.log(`learning rate=${lr} MSE=${loss(m, d)}`);
      expect(Number.isFinite(loss(m, d))).toBe(true);
    }
  });
});
describe("datasets, shapes and persistence", () => {
  it("seeded datasets and initializations reproduce", () => {
    expect(dataset("사인", 20, 0.1, 3)).toEqual(dataset("사인", 20, 0.1, 3));
    expect(createModel([4], "relu", 12, "he")).toEqual(
      createModel([4], "relu", 12, "he"),
    );
    expect(
      createModel([3], "tanh", 42, "zero")
        .layers[0].w.flat()
        .every((v) => v === 0),
    ).toBe(true);
  });
  it("preserves existing edges when adding neurons", () => {
    const m = createModel([2, 2]);
    m.layers[1].enabled[0][0] = false;
    const n = resizeModel(m, [3, 2], ["tanh", "tanh", "linear"]);
    expect(n.layers[0].w[0][0]).toBe(m.layers[0].w[0][0]);
    expect(n.layers[1].w[0][0]).toBe(m.layers[1].w[0][0]);
    expect(n.layers[1].enabled[0][0]).toBe(false);
    expect(n.layers[1].w[0].length).toBe(3);
  });
  it("all layer configurations maintain consistent shapes", () => {
    for (const sizes of [[], [1], [16, 16, 16, 16]]) {
      const m = createModel(sizes);
      expect(Number.isFinite(forward(m, 0.3).y)).toBe(true);
      expect(gradients(m, [{ x: 1, y: 2 }]).w.length).toBe(sizes.length + 1);
    }
  });
  it("parses CSV and rejects malformed data", () => {
    expect(parseCSV("x,y\n1,2\n3,4")).toEqual([
      { x: 1, y: 2 },
      { x: 3, y: 4 },
    ]);
    for (const s of ["1,", "1,2,3", "NaN,2", "Infinity,2"])
      expect(() => parseCSV(s)).toThrow();
    expect(() => validatePoints([{ x: 1, y: Infinity }])).toThrow();
    expect(() => validatePoints(Array(2001).fill({ x: 1, y: 2 }))).toThrow();
  });
  it("strict experiment roundtrip and malformed matrix rejection", () => {
    const e = {
      version: 1,
      name: "test",
      model: createModel([2]),
      data: dataset("사인"),
      settings: defaults,
      history: [],
      input: 0,
    };
    expect(loadExperiment(JSON.stringify(e))).toEqual(e);
    e.model.layers[0].w[0] = [];
    expect(() => loadExperiment(JSON.stringify(e))).toThrow();
  });
});

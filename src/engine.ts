export type Activation = "linear" | "tanh" | "sigmoid" | "relu" | "leakyRelu";
export type Task = "regression" | "classification";
export type Point = { x: number; y: number; label?: 0 | 1 };
export type ClassDefinition = { id: 0 | 1; name: string; color: string };
export const classes = [
  { id: 0, name: "클래스 0", color: "#2563eb" },
  { id: 1, name: "클래스 1", color: "#e35b36" },
] as const;
export type Layer = {
  id: string;
  neurons: string[];
  activation: Activation;
  w: number[][];
  b: number[];
  enabled: boolean[][];
};
export type Model = {
  task?: Task;
  layers: Layer[];
  seed: number;
  init: "xavier" | "he" | "zero";
};
export type Settings = {
  lr: number;
  batch: number;
  epochs: number;
  optimizer: "adam" | "sgd";
  speed: number;
  seed: number;
  validation: number;
  clip: number;
};
export const defaults: Settings = {
  lr: 0.01,
  batch: 16,
  epochs: 2000,
  optimizer: "adam",
  speed: 20,
  seed: 42,
  validation: 0.2,
  clip: 10,
};
export const activations: Activation[] = [
  "linear",
  "tanh",
  "sigmoid",
  "relu",
  "leakyRelu",
];
export function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s += 0x6d2b79f5;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export function activate(z: number, a: Activation): number {
  switch (a) {
    case "linear":
      return z;
    case "tanh":
      return Math.tanh(z);
    case "sigmoid":
      return z >= 0 ? 1 / (1 + Math.exp(-z)) : Math.exp(z) / (1 + Math.exp(z));
    case "relu":
      return Math.max(0, z);
    case "leakyRelu":
      return z > 0 ? z : 0.01 * z;
  }
}
export function derivative(z: number, a: Activation) {
  const v = activate(z, a);
  switch (a) {
    case "linear":
      return 1;
    case "tanh":
      return 1 - v * v;
    case "sigmoid":
      return v * (1 - v);
    case "relu":
      return z > 0 ? 1 : 0;
    case "leakyRelu":
      return z > 0 ? 1 : 0.01;
  }
}
export function createModel(
  sizes = [4, 4],
  activation: Activation = "tanh",
  seed = 42,
  init: Model["init"] = "xavier",
  task: Task = "regression",
): Model {
  const random = rng(seed);
  let previous = task === "classification" ? 2 : 1;
  const layers = [...sizes, 1].map((n, l) => {
    const scale =
      init === "he" ? Math.sqrt(2 / previous) : Math.sqrt(2 / (previous + n));
    const layer: Layer = {
      id: `layer-${l}`,
      neurons: Array.from({ length: n }, (_, j) => `l${l}n${j}`),
      activation:
        l === sizes.length
          ? task === "classification"
            ? "sigmoid"
            : "linear"
          : activation,
      w: Array.from({ length: n }, () =>
        Array.from({ length: previous }, () =>
          init === "zero"
            ? 0
            : Math.sqrt(-2 * Math.log(Math.max(random(), 1e-12))) *
              Math.cos(2 * Math.PI * random()) *
              scale,
        ),
      ),
      b: Array(n).fill(0),
      enabled: Array.from({ length: n }, () => Array(previous).fill(true)),
    };
    previous = n;
    return layer;
  });
  return { layers, seed, init, ...(task === "classification" ? { task } : {}) };
}
export function resizeModel(model: Model, sizes: number[], acts: Activation[]) {
  const next = createModel(sizes, "tanh", model.seed, model.init, model.task);
  // Preserve edges only when source and destination layer identities are unchanged.
  next.layers.forEach((layer, l) => {
    layer.activation =
      model.task === "classification" && l === next.layers.length - 1
        ? "sigmoid"
        : (acts[l] ?? "linear");
    const old = model.layers[l];
    if (!old || model.layers.length !== next.layers.length) return;
    layer.w.forEach((row, j) => {
      if (j < old.b.length) layer.b[j] = old.b[j];
      row.forEach((_, i) => {
        if (old.w[j]?.[i] !== undefined) {
          row[i] = old.w[j][i];
          layer.enabled[j][i] = old.enabled[j][i];
        }
      });
    });
  });
  return next;
}
export function forward(m: Model, x: number | number[]) {
  const a: number[][] = [
      Array.isArray(x) ? x : m.task === "classification" ? [x, 0] : [x],
    ],
    z: number[][] = [];
  m.layers.forEach((l, k) => {
    const sums = l.w.map((row, j) =>
      row.reduce((v, w, i) => v + (l.enabled[j][i] ? w * a[k][i] : 0), l.b[j]),
    );
    z.push(sums);
    a.push(sums.map((v) => activate(v, l.activation)));
  });
  return { a, z, y: a.at(-1)![0] };
}
export function loss(m: Model, data: Point[]) {
  return data.length
    ? data.reduce((s, p) => {
        const f = forward(m, m.task === "classification" ? [p.x, p.y] : p.x);
        return (
          s +
          (m.task === "classification"
            ? binaryCrossEntropy(f.z.at(-1)![0], p.label!)
            : (f.y - p.y) ** 2)
        );
      }, 0) / data.length
    : 0;
}
// BCE from logits stays finite even when sigmoid rounds to zero or one.
export function binaryCrossEntropy(logit: number, target: number) {
  return (
    Math.max(logit, 0) - logit * target + Math.log1p(Math.exp(-Math.abs(logit)))
  );
}
export function accuracy(m: Model, data: Point[]) {
  return data.length
    ? data.filter((p) => Number(forward(m, [p.x, p.y]).y >= 0.5) === p.label)
        .length / data.length
    : undefined;
}
export function confusionMatrix(m: Model, data: Point[]) {
  const matrix = [
    [0, 0],
    [0, 0],
  ];
  data.forEach(
    (p) => matrix[p.label!][Number(forward(m, [p.x, p.y]).y >= 0.5)]++,
  );
  return matrix;
}
export function gradients(m: Model, data: Point[]) {
  const w = m.layers.map((l) => l.w.map((row) => row.map(() => 0))),
    b = m.layers.map((l) => l.b.map(() => 0));
  const dz = m.layers.map((l) => l.b.map(() => 0));
  for (const p of data) {
    const classification = m.task === "classification";
    const f = forward(m, classification ? [p.x, p.y] : p.x);
    let da = [
      ((classification ? 1 : 2) * (f.y - (classification ? p.label! : p.y))) /
        data.length,
    ];
    for (let l = m.layers.length - 1; l >= 0; l--) {
      const layer = m.layers[l],
        prev = f.a[l].map(() => 0);
      layer.w.forEach((row, j) => {
        const d =
          da[j] *
          (classification && l === m.layers.length - 1
            ? 1
            : derivative(f.z[l][j], layer.activation));
        b[l][j] += d;
        dz[l][j] += d;
        row.forEach((v, i) => {
          if (layer.enabled[j][i]) {
            w[l][j][i] += d * f.a[l][i];
            prev[i] += d * v;
          }
        });
      });
      da = prev;
    }
  }
  return { w, b, dz };
}
export type Gradients = ReturnType<typeof gradients>;
export class Optimizer {
  t = 0;
  mom = new Map<string, [number, number]>();
  update(m: Model, g: Gradients, s: Settings) {
    this.t++;
    const update = (key: string, v: number, d: number) => {
      if (s.clip > 0) d = Math.max(-s.clip, Math.min(s.clip, d));
      if (s.optimizer === "sgd") return v - s.lr * d;
      const [a, b] = this.mom.get(key) ?? [0, 0],
        ma = 0.9 * a + 0.1 * d,
        mb = 0.999 * b + 0.001 * d * d;
      this.mom.set(key, [ma, mb]);
      return (
        v -
        (s.lr * (ma / (1 - 0.9 ** this.t))) /
          (Math.sqrt(mb / (1 - 0.999 ** this.t)) + 1e-8)
      );
    };
    m.layers.forEach((l, k) => {
      l.w.forEach((row, j) => {
        row.forEach((v, i) => {
          if (l.enabled[j][i])
            row[i] = update(`${k}/${j}/${i}`, v, g.w[k][j][i]);
        });
        l.b[j] = update(`${k}/${j}/b`, l.b[j], g.b[k][j]);
      });
    });
  }
}
export function shuffle<T>(values: T[], random: () => number) {
  const out = [...values];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}
export const presets = [
  "사인",
  "코사인",
  "선형",
  "이차",
  "절댓값",
  "계단",
  "잡음 비선형",
] as const;
export function dataset(
  kind: string,
  count = 50,
  noise = 0,
  seed = 42,
): Point[] {
  const random = rng(seed);
  return Array.from({ length: count }, (_, i) => {
    const x = -4 + (8 * i) / Math.max(1, count - 1);
    let y =
      kind === "선형"
        ? 0.7 * x + 0.4
        : kind === "이차"
          ? 0.3 * x * x - 2
          : kind === "절댓값"
            ? Math.abs(x) - 2
            : kind === "계단"
              ? x < 0
                ? -1.5
                : 1.5
              : kind === "코사인"
                ? 2 * Math.cos(x)
                : 2 * Math.sin(x);
    if (kind === "잡음 비선형") y += 0.5 * Math.cos(3 * x);
    return { x, y: y + (random() - 0.5) * 2 * noise };
  });
}
export function validatePoints(
  value: unknown,
  task: Task = "regression",
): Point[] {
  if (!Array.isArray(value) || value.length > 2000)
    throw Error("데이터는 최대 2,000개의 좌표 배열이어야 합니다.");
  return value.map((p) => {
    if (
      !p ||
      typeof p.x !== "number" ||
      typeof p.y !== "number" ||
      !Number.isFinite(p.x) ||
      !Number.isFinite(p.y) ||
      Math.abs(p.x) > 1000 ||
      Math.abs(p.y) > 1000
    )
      throw Error("x, y는 -1000~1000 범위의 유한한 숫자여야 합니다.");
    if (task === "classification" && p.label !== 0 && p.label !== 1)
      throw Error("분류 데이터의 label은 0 또는 1이어야 합니다.");
    return {
      x: p.x,
      y: p.y,
      ...(task === "classification" ? { label: p.label } : {}),
    };
  });
}
export function parseCSV(text: string, task: Task = "regression") {
  const rows = text.trim().split(/\r?\n/);
  if (/^\s*x\s*,\s*y\s*(,\s*label\s*)?$/i.test(rows[0])) rows.shift();
  return validatePoints(
    rows
      .filter((r) => r.trim())
      .map((row) => {
        const cells = row.split(",");
        if (
          cells.length !== (task === "classification" ? 3 : 2) ||
          cells.some((c) => !c.trim())
        )
          throw Error(
            task === "classification"
              ? "분류 CSV는 x,y,label 세 열이어야 합니다."
              : "CSV는 x,y 두 열이어야 합니다.",
          );
        return {
          x: Number(cells[0]),
          y: Number(cells[1]),
          ...(task === "classification" ? { label: Number(cells[2]) } : {}),
        };
      }),
    task,
  );
}

export const classificationPresets = [
  "XOR",
  "Two moons",
  "Concentric circles",
  "Gaussian blobs",
  "Spiral",
] as const;
export function classificationDataset(
  kind: string,
  count = 100,
  noise = 0.12,
  seed = 42,
): Point[] {
  const random = rng(seed);
  const normal = () =>
    Math.sqrt(-2 * Math.log(Math.max(random(), 1e-12))) *
    Math.cos(2 * Math.PI * random());
  return Array.from({ length: count }, (_, i) => {
    let label = (i % 2) as 0 | 1,
      x: number,
      y: number;
    if (kind === "XOR") {
      x = (random() * 2 - 1) * 3;
      y = (random() * 2 - 1) * 3;
      label = Number(x * y >= 0) as 0 | 1;
    } else if (kind === "Two moons") {
      const t = random() * Math.PI;
      x = 2.2 * (label ? 1 - Math.cos(t) : Math.cos(t)) - 1.1;
      y = 2.2 * (label ? 0.5 - Math.sin(t) : Math.sin(t)) - 0.55;
    } else if (kind === "Concentric circles") {
      const t = random() * 2 * Math.PI,
        r = label ? 2.8 : 1.2;
      x = r * Math.cos(t);
      y = r * Math.sin(t);
    } else if (kind === "Spiral") {
      const r = 0.3 + 3 * (i / Math.max(1, count - 1)),
        t = r * 2.4 + label * Math.PI;
      x = r * Math.cos(t);
      y = r * Math.sin(t);
    } else {
      x = (label ? 1.6 : -1.6) + normal() * 0.65;
      y = (label ? 1 : -1) + normal() * 0.65;
    }
    return { x: x + normal() * noise, y: y + normal() * noise, label };
  });
}

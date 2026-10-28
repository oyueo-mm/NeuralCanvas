import {
  classificationDataset,
  classes,
  createModel,
  dataset,
  defaults,
  rng,
  type Activation,
  type Point,
  type Settings,
  type Task,
} from "./engine";
import type { Experiment } from "./storage";
import { themedClasses } from "./theme";
export type Difficulty = "입문" | "중급" | "고급";
export const difficulties: Difficulty[] = ["입문", "중급", "고급"];
export type ExperimentPreset = {
  id: string;
  name: string;
  description: string;
  task: Task;
  difficulty: Difficulty;
  /** Dataset generator and its reproducible parameters. */
  data: { kind: string; count: number; noise: number; seed: number };
  hidden: number[];
  activations: Activation[];
  init: "xavier" | "he";
  settings: Pick<
    Settings,
    "lr" | "batch" | "epochs" | "optimizer" | "seed" | "validation"
  >;
  /** What the experiment is meant to show; it is an expectation, not a guarantee. */
  expectation: string;
};
const base = { optimizer: "adam", seed: 42, validation: 0.2 } as const;
export const experimentPresets: ExperimentPreset[] = [
  {
    id: "linear",
    name: "선형 회귀",
    description: "직선 관계를 작은 신경망으로 근사합니다.",
    task: "regression",
    difficulty: "입문",
    data: { kind: "선형", count: 40, noise: 0.15, seed: 11 },
    hidden: [4],
    activations: ["tanh"],
    init: "xavier",
    settings: { ...base, lr: 0.02, batch: 8, epochs: 600 },
    expectation: "손실이 빠르게 낮아지고 예측선이 직선에 가까워집니다.",
  },
  {
    id: "quadratic",
    name: "이차함수",
    description: "포물선 모양을 은닉층 두 개로 학습합니다.",
    task: "regression",
    difficulty: "입문",
    data: { kind: "이차", count: 50, noise: 0.1, seed: 12 },
    hidden: [8, 8],
    activations: ["tanh", "tanh"],
    init: "xavier",
    settings: { ...base, lr: 0.01, batch: 10, epochs: 800 },
    expectation: "휘어진 곡선을 따라가며 손실이 감소합니다.",
  },
  {
    id: "sine",
    name: "사인함수",
    description: "주기적인 파형을 비선형 활성화로 근사합니다.",
    task: "regression",
    difficulty: "중급",
    data: { kind: "사인", count: 60, noise: 0.1, seed: 13 },
    hidden: [8, 8],
    activations: ["tanh", "tanh"],
    init: "xavier",
    settings: { ...base, lr: 0.01, batch: 10, epochs: 1500 },
    expectation: "충분한 Epoch 뒤에 파형의 굴곡을 따라갑니다.",
  },
  {
    id: "step",
    name: "계단함수",
    description: "불연속한 점프를 매끄러운 함수로 근사해 봅니다.",
    task: "regression",
    difficulty: "중급",
    data: { kind: "계단", count: 60, noise: 0.1, seed: 14 },
    hidden: [8, 8],
    activations: ["tanh", "tanh"],
    init: "xavier",
    settings: { ...base, lr: 0.02, batch: 10, epochs: 1500 },
    expectation: "경계 근처가 완만하게 이어지는 S자 곡선이 됩니다.",
  },
  {
    id: "highfreq",
    name: "고주파 비선형",
    description: "빠르게 진동하는 함수를 큰 모델로 학습합니다.",
    task: "regression",
    difficulty: "고급",
    data: { kind: "고주파", count: 140, noise: 0.05, seed: 15 },
    hidden: [16, 16],
    activations: ["tanh", "tanh"],
    init: "xavier",
    settings: { ...base, lr: 0.005, batch: 16, epochs: 4000 },
    expectation:
      "작은 모델보다 오래 걸리며, 진동을 모두 따라가지 못할 수 있습니다.",
  },
  {
    id: "underfit",
    name: "과소적합 실험",
    description:
      "표현력이 부족한 모델이 사인 곡선을 따라가지 못하는 모습을 봅니다.",
    task: "regression",
    difficulty: "입문",
    data: { kind: "사인", count: 60, noise: 0.1, seed: 16 },
    hidden: [1],
    activations: ["linear"],
    init: "xavier",
    settings: { ...base, lr: 0.02, batch: 10, epochs: 800 },
    expectation: "손실이 일정 수준에서 멈추고 예측은 직선에 머뭅니다.",
  },
  {
    id: "overfit",
    name: "과적합 실험",
    description:
      "표본이 적고 잡음이 큰데 모델은 큽니다. 검증 손실을 비교해 보세요.",
    task: "regression",
    difficulty: "고급",
    data: { kind: "사인", count: 24, noise: 0.7, seed: 17 },
    hidden: [16, 16, 16],
    activations: ["tanh", "tanh", "tanh"],
    init: "xavier",
    settings: { ...base, lr: 0.01, batch: 4, epochs: 4000, validation: 0.3 },
    expectation:
      "학습 손실은 계속 줄지만 검증 손실이 더 높게 남는 경향이 있습니다.",
  },
  {
    id: "xor",
    name: "XOR",
    description: "한 직선으로 나눌 수 없는 고전적인 비선형 문제입니다.",
    task: "classification",
    difficulty: "입문",
    data: { kind: "XOR", count: 120, noise: 0.1, seed: 21 },
    hidden: [6],
    activations: ["tanh"],
    init: "xavier",
    settings: { ...base, lr: 0.03, batch: 16, epochs: 600 },
    expectation: "결정 경계가 네 영역을 가르며 정확도가 높아집니다.",
  },
  {
    id: "blobs",
    name: "Gaussian Blobs",
    description: "직선으로 나뉘는 두 무리를 분류합니다.",
    task: "classification",
    difficulty: "입문",
    data: { kind: "Gaussian blobs", count: 120, noise: 0.1, seed: 22 },
    hidden: [4],
    activations: ["tanh"],
    init: "xavier",
    settings: { ...base, lr: 0.02, batch: 16, epochs: 300 },
    expectation: "빠르게 높은 정확도에 도달합니다.",
  },
  {
    id: "moons",
    name: "Two Moons",
    description: "맞물린 초승달 두 개를 구분합니다.",
    task: "classification",
    difficulty: "중급",
    data: { kind: "Two moons", count: 160, noise: 0.1, seed: 23 },
    hidden: [8, 8],
    activations: ["tanh", "tanh"],
    init: "xavier",
    settings: { ...base, lr: 0.01, batch: 16, epochs: 400 },
    expectation: "곡선형 결정 경계가 만들어집니다.",
  },
  {
    id: "circles",
    name: "Concentric Circles",
    description: "안쪽 원과 바깥 고리를 분리하는 닫힌 경계를 학습합니다.",
    task: "classification",
    difficulty: "중급",
    data: { kind: "Concentric circles", count: 160, noise: 0.08, seed: 24 },
    hidden: [8, 8],
    activations: ["tanh", "tanh"],
    init: "xavier",
    settings: { ...base, lr: 0.01, batch: 16, epochs: 400 },
    expectation: "중심을 감싸는 둥근 결정 경계가 나타납니다.",
  },
  {
    id: "spiral",
    name: "Spiral",
    description: "서로 감긴 나선 두 개를 큰 모델로 분리합니다.",
    task: "classification",
    difficulty: "고급",
    data: { kind: "Spiral", count: 200, noise: 0.05, seed: 25 },
    hidden: [16, 16],
    activations: ["tanh", "tanh"],
    init: "xavier",
    settings: { ...base, lr: 0.01, batch: 16, epochs: 2500 },
    expectation: "오래 걸리며 학습이 정체되는 구간이 있을 수 있습니다.",
  },
  {
    id: "checker",
    name: "복잡한 비선형 경계",
    description: "체스판 모양으로 클래스가 번갈아 나타나는 문제입니다.",
    task: "classification",
    difficulty: "고급",
    data: { kind: "체스판", count: 300, noise: 0.05, seed: 26 },
    hidden: [16, 16, 16],
    activations: ["tanh", "tanh", "tanh"],
    init: "xavier",
    settings: { ...base, lr: 0.01, batch: 32, epochs: 3000 },
    expectation:
      "학습 정확도는 높아지지만 검증 정확도는 낮게 남을 수 있습니다.",
  },
];
/** Dataset kinds that the base engine does not provide. */
function customData(kind: string, count: number, noise: number, seed: number) {
  const random = rng(seed),
    jitter = () => (random() - 0.5) * 2 * noise;
  if (kind === "고주파")
    return Array.from({ length: count }, (_, i): Point => {
      const x = -4 + (8 * i) / Math.max(1, count - 1);
      return { x, y: Math.sin(3 * x) + 0.6 * Math.sin(7 * x) + jitter() };
    });
  const normal = () =>
    Math.sqrt(-2 * Math.log(Math.max(random(), 1e-12))) *
    Math.cos(2 * Math.PI * random());
  return Array.from({ length: count }, (): Point => {
    const x = (random() * 2 - 1) * 3,
      y = (random() * 2 - 1) * 3;
    return {
      x: x + normal() * noise,
      y: y + normal() * noise,
      label: ((Math.floor(x * 0.67 + 100) + Math.floor(y * 0.67 + 100)) % 2) as
        0 | 1,
    };
  });
}
export function presetPoints(p: ExperimentPreset): Point[] {
  const { kind, count, noise, seed } = p.data;
  if (kind === "고주파" || kind === "체스판")
    return customData(kind, count, noise, seed);
  return p.task === "classification"
    ? classificationDataset(kind, count, noise, seed)
    : dataset(kind, count, noise, seed);
}
export function presetExperiment(p: ExperimentPreset): Experiment {
  const model = createModel(p.hidden, "tanh", p.settings.seed, p.init, p.task);
  p.activations.forEach((a, k) => (model.layers[k].activation = a));
  return {
    version: 2,
    task: p.task,
    classes: classes.map((c) => ({ ...c, color: themedClasses[c.id].color })),
    name: p.name,
    model,
    data: presetPoints(p),
    settings: { ...defaults, ...p.settings },
    history: [],
    input: 0,
    input2: 0,
  };
}
export const presetById = (id: string) =>
  experimentPresets.find((p) => p.id === id);

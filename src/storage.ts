import {
  activations,
  validatePoints,
  type Model,
  type Settings,
  type Point,
} from "./engine";
export type RecordItem = {
  epoch: number;
  step: number;
  train: number;
  validation?: number;
};
export type Experiment = {
  version: 1;
  name: string;
  model: Model;
  data: Point[];
  settings: Settings;
  history: RecordItem[];
  input: number;
};
const finite = (v: unknown, min: number, max: number): v is number =>
  typeof v === "number" && Number.isFinite(v) && v >= min && v <= max;
export function loadExperiment(text: string): Experiment {
  if (text.length > 5_000_000)
    throw Error("파일이 너무 큽니다. 최대 5MB입니다.");
  const e = JSON.parse(text);
  if (e?.version !== 1 || typeof e.name !== "string" || e.name.length > 200)
    throw Error("지원하지 않는 실험 형식입니다.");
  const data = validatePoints(e.data),
    m = e.model,
    s = e.settings;
  if (
    !m ||
    !Array.isArray(m.layers) ||
    m.layers.length < 1 ||
    m.layers.length > 5 ||
    !finite(m.seed, 0, 4294967295) ||
    !["xavier", "he", "zero"].includes(m.init)
  )
    throw Error("모델 형식이 올바르지 않습니다.");
  let previous = 1;
  const ids = new Set<string>();
  for (const [k, l] of m.layers.entries()) {
    const n = l?.b?.length;
    if (
      !Number.isInteger(n) ||
      n < 1 ||
      n > 16 ||
      (k === m.layers.length - 1 && n !== 1) ||
      !activations.includes(l.activation) ||
      typeof l.id !== "string" ||
      !Array.isArray(l.neurons) ||
      l.neurons.length !== n ||
      l.neurons.some(
        (id: unknown) => typeof id !== "string" || ids.has(id) || !ids.add(id),
      ) ||
      !Array.isArray(l.w) ||
      l.w.length !== n ||
      !Array.isArray(l.enabled) ||
      l.enabled.length !== n ||
      !l.b.every((v: unknown) => finite(v, -1e6, 1e6))
    )
      throw Error("층 정의가 올바르지 않습니다.");
    for (let j = 0; j < n; j++) {
      if (
        !Array.isArray(l.w[j]) ||
        l.w[j].length !== previous ||
        !l.w[j].every((v: unknown) => finite(v, -1e6, 1e6)) ||
        !Array.isArray(l.enabled[j]) ||
        l.enabled[j].length !== previous ||
        !l.enabled[j].every((v: unknown) => typeof v === "boolean")
      )
        throw Error("가중치 행렬 크기 또는 값이 올바르지 않습니다.");
    }
    previous = n;
  }
  if (
    !s ||
    !finite(s.lr, 0.000001, 1) ||
    !Number.isInteger(s.batch) ||
    s.batch < 1 ||
    s.batch > 2000 ||
    !Number.isInteger(s.epochs) ||
    s.epochs < 1 ||
    s.epochs > 100000 ||
    !["adam", "sgd"].includes(s.optimizer) ||
    !finite(s.speed, 1, 100) ||
    !finite(s.validation, 0, 0.5) ||
    !finite(s.clip, 0, 1000) ||
    !finite(s.seed, 0, 4294967295)
  )
    throw Error("학습 설정이 올바르지 않습니다.");
  if (
    !Array.isArray(e.history) ||
    e.history.length > 1000 ||
    e.history.some(
      (r: RecordItem) =>
        !finite(r.step, 0, 1e10) ||
        !finite(r.epoch, 0, 1e10) ||
        !finite(r.train, 0, 1e15) ||
        (r.validation !== undefined && !finite(r.validation, 0, 1e15)),
    ) ||
    !finite(e.input, -1000, 1000)
  )
    throw Error("이력 또는 입력값이 올바르지 않습니다.");
  return { ...e, data };
}
export function download(
  name: string,
  text: string,
  type = "application/json",
) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export function exportSVG(svg: SVGSVGElement, name: string) {
  const clone = svg.cloneNode(true) as SVGSVGElement;
  clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  clone.setAttribute("width", String(svg.viewBox.baseVal.width));
  clone.setAttribute("height", String(svg.viewBox.baseVal.height));
  const source = new XMLSerializer().serializeToString(clone);
  const url = URL.createObjectURL(
    new Blob([source], { type: "image/svg+xml" }),
  );
  const img = new Image();
  img.onload = () => {
    const canvas = document.createElement("canvas");
    canvas.width = img.width * 2;
    canvas.height = img.height * 2;
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    canvas.toBlob((blob) => {
      if (blob) {
        const u = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.download = name;
        a.href = u;
        a.click();
        setTimeout(() => URL.revokeObjectURL(u), 1000);
      }
    });
    URL.revokeObjectURL(url);
  };
  img.src = url;
}

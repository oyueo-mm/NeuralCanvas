import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  createModel,
  dataset,
  defaults,
  forward,
  parseCSV,
  resizeModel,
  rng,
  shuffle,
  type Activation,
  type Gradients,
  type Model,
  type Point,
  type Settings,
  validatePoints,
  classes,
  classificationDataset,
  type Task,
  type ClassDefinition,
} from "./engine";
import type { Selection } from "./Network";
import { loadExperiment, type Experiment, type RecordItem } from "./storage";
import type { Request } from "./worker";
export function useLab() {
  const [model, setModel] = useState(() => createModel()),
    [data, setData] = useState<Point[]>(() => dataset("사인")),
    [settings, setSettings] = useState<Settings>(defaults),
    [history, setHistory] = useState<RecordItem[]>([]),
    [running, setRunning] = useState(false),
    [epoch, setEpoch] = useState(0),
    [step, setStep] = useState(0),
    [gradient, setGradient] = useState<Gradients>(),
    [message, setMessage] = useState(
      "점을 만들고, 신경망을 설계하고, 학습을 관찰하세요.",
    ),
    [input, setInput] = useState(0),
    [input2, setInput2] = useState(0),
    [activeClass, setActiveClass] = useState<0 | 1>(0),
    [classDefinitions, setClassDefinitions] = useState<ClassDefinition[]>([
      ...classes,
    ]),
    [resolution, setResolution] = useState(48),
    [playing, setPlaying] = useState(false),
    [sweepSpeed, setSweepSpeed] = useState(1),
    [sweepMode, setSweepMode] = useState("왕복"),
    [phase, setPhase] = useState(0),
    [selection, setSelection] = useState<Selection>(null),
    [point, setPoint] = useState<number | null>(null),
    [preset, setPreset] = useState("사인"),
    [count, setCount] = useState(50),
    [noise, setNoise] = useState(0),
    [undo, setUndo] = useState<Point[][]>([]),
    [redo, setRedo] = useState<Point[][]>([]),
    [name, setName] = useState("나의 첫 번째 신경망"),
    [tab, setTab] = useState("data");
  const worker = useRef<Worker | null>(null),
    revision = useRef(0),
    direction = useRef(1),
    file = useRef<HTMLInputElement>(null),
    datasetFile = useRef<HTMLInputElement>(null),
    saveTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined),
    restore = useRef(false);
  const task: Task = model.task ?? "regression";
  const modes = useRef<
    Partial<
      Record<
        Task,
        {
          experiment: Experiment;
          undo: Point[][];
          redo: Point[][];
          preset: string;
          count: number;
          noise: number;
          activeClass: 0 | 1;
        }
      >
    >
  >({});
  const plotSVG = useRef<SVGSVGElement | null>(null),
    networkSVG = useRef<SVGSVGElement | null>(null);
  const f = useMemo(
      () => forward(model, task === "classification" ? [input, input2] : input),
      [model, input, input2, task],
    ),
    latest = history.at(-1),
    parameters = model.layers.reduce(
      (s, l) => s + l.b.length + l.w.reduce((a, r) => a + r.length, 0),
      0,
    );
  const stopWorker = useCallback(() => {
    revision.current++;
    worker.current?.terminate();
    worker.current = null;
    setRunning(false);
  }, []);
  const invalidate = useCallback(
    (text = "변경을 반영하고 학습 이력을 초기화했습니다.") => {
      stopWorker();
      setHistory([]);
      setEpoch(0);
      setStep(0);
      setGradient(undefined);
      setMessage(text);
    },
    [stopWorker],
  );
  const editModel = (m: Model) => {
    invalidate();
    setModel(m);
  };
  const changeData = useCallback(
    (p: Point[]) => {
      try {
        const valid = validatePoints(p, task);
        setUndo((u) => [...u.slice(-49), data]);
        setRedo([]);
        invalidate("데이터가 변경되었습니다. 학습 상태를 초기화했습니다.");
        setData(valid);
      } catch (e) {
        setMessage(String(e));
      }
    },
    [data, invalidate, task],
  );
  const changeSettings = (s: Settings) => {
    invalidate();
    setSettings(s);
  };
  const resize = (sizes: number[], acts: Activation[]) => {
    setSelection(null);
    editModel(
      resizeModel(model, sizes, [
        ...acts,
        task === "classification" ? "sigmoid" : "linear",
      ]),
    );
  };
  const mutate = (fn: (m: Model) => void) => {
    const m = structuredClone(model);
    fn(m);
    editModel(m);
  };
  function ensureWorker() {
    if (worker.current) return worker.current;
    const w = new Worker(new URL("./worker.ts", import.meta.url), {
      type: "module",
    });
    worker.current = w;
    const version = revision.current;
    w.onmessage = (e) => {
      const r = e.data;
      if (r.revision !== revision.current) return;
      if (r.type === "snapshot") {
        setModel(r.model);
        setEpoch(r.epoch);
        setStep(r.step);
        setGradient(r.gradient);
        setRunning(r.running);
      }
      if (r.type === "history")
        setHistory((h) => [...h, ...r.records].slice(-1000));
      if (r.type === "error") {
        stopWorker();
        setMessage(r.message);
      }
    };
    w.onerror = (e) => {
      setMessage(`Worker 오류: ${e.message}`);
      stopWorker();
    };
    w.postMessage({
      type: "init",
      revision: version,
      model,
      data,
      settings,
      epoch,
      step,
    } satisfies Request);
    return w;
  }
  function train(type: "run" | "pause" | "step" | "epoch") {
    if (type !== "pause" && data.length < 2) {
      setMessage("학습하려면 데이터 포인트가 두 개 이상 필요합니다.");
      return;
    }
    if (type === "run" && epoch >= settings.epochs) {
      setMessage("목표 Epoch에 도달했습니다. 목표를 늘리거나 초기화하세요.");
      return;
    }
    setPlaying(false);
    const w = ensureWorker();
    w.postMessage({ type, revision: revision.current } satisfies Request);
    setRunning(type === "run");
    setMessage(
      type === "pause"
        ? "학습을 일시정지했습니다. 재개하면 Optimizer 상태가 유지됩니다."
        : type === "run"
          ? "학습 중입니다."
          : "학습을 한 단계 진행했습니다.",
    );
  }
  const experiment = (includeOther = true): Experiment => ({
    version: 2,
    task,
    classes: classDefinitions,
    input2,
    ...(includeOther &&
    modes.current[task === "regression" ? "classification" : "regression"]
      ? {
          other:
            modes.current[
              task === "regression" ? "classification" : "regression"
            ]!.experiment,
        }
      : {}),
    name,
    model,
    data,
    settings,
    history,
    input,
  });
  const latestExperiment = useRef<Experiment | null>(null);
  latestExperiment.current = experiment();
  useEffect(() => {
    const flush = () => {
      try {
        localStorage.setItem(
          "neuralcanvas-v1",
          JSON.stringify(latestExperiment.current),
        );
      } catch {
        /* Storage may be unavailable. */
      }
    };
    window.addEventListener("pagehide", flush);
    return () => window.removeEventListener("pagehide", flush);
  }, []);
  function resetModel(init = model.init) {
    const fresh = createModel(sizes, "tanh", settings.seed, init, task);
    acts.forEach((a, k) => (fresh.layers[k].activation = a));
    setSelection(null);
    editModel(fresh);
  }
  function applyExperiment(e: Experiment) {
    stopWorker();
    setModel(e.model);
    setData(e.data);
    setSettings(e.settings);
    setHistory(e.history);
    setEpoch(e.history.at(-1)?.epoch ?? 0);
    setStep(e.history.at(-1)?.step ?? 0);
    setInput(e.input);
    setInput2(e.input2 ?? 0);
    setClassDefinitions(
      classes.map((c) => ({
        ...c,
        name: e.classes?.[c.id]?.name ?? c.name,
        color: e.classes?.[c.id]?.color ?? c.color,
      })),
    );
    setName(e.name);
    setUndo([]);
    setRedo([]);
    setPoint(null);
    setSelection(null);
    setPlaying(false);
    setGradient(undefined);
    setPreset(e.model.task === "classification" ? "XOR" : "사인");
    if (e.other)
      modes.current[e.other.model.task ?? "regression"] = {
        experiment: { ...e.other, other: undefined },
        undo: [],
        redo: [],
        preset: e.other.model.task === "classification" ? "XOR" : "사인",
        count: e.other.data.length,
        noise: 0,
        activeClass: 0,
      };
    setMessage(
      "실험을 불러왔습니다. 가중치는 복원되며 다음 학습은 새 Optimizer로 시작합니다.",
    );
  }
  function switchTask(next: Task) {
    if (next === task) return;
    modes.current[task] = {
      experiment: experiment(false),
      undo,
      redo,
      preset,
      count,
      noise,
      activeClass,
    };
    const cached = modes.current[next];
    const e: Experiment = cached?.experiment ?? {
      version: 2,
      task: next,
      classes: [...classes],
      name: next === "classification" ? "나의 분류 실험" : "나의 회귀 실험",
      model: createModel(
        next === "classification" ? [8, 8] : [4, 4],
        "tanh",
        42,
        "xavier",
        next,
      ),
      data:
        next === "classification"
          ? classificationDataset("XOR", 100)
          : dataset("사인"),
      settings: { ...defaults },
      history: [],
      input: 0,
      input2: 0,
    };
    applyExperiment(e);
    setUndo(cached?.undo ?? []);
    setRedo(cached?.redo ?? []);
    setPreset(cached?.preset ?? (next === "classification" ? "XOR" : "사인"));
    setCount(cached?.count ?? (next === "classification" ? 100 : 50));
    setNoise(cached?.noise ?? (next === "classification" ? 0.12 : 0));
    setActiveClass(cached?.activeClass ?? 0);
    setMessage(
      `${next === "classification" ? "분류" : "회귀"} 실험으로 전환했습니다. 다른 모드의 데이터와 모델은 보관됩니다.`,
    );
  }
  useEffect(() => {
    if (restore.current) return;
    restore.current = true;
    try {
      const stored = localStorage.getItem("neuralcanvas-v1");
      if (stored) applyExperiment(loadExperiment(stored));
    } catch {
      setMessage("자동 저장을 복원하지 못했습니다. 기본 실험으로 시작합니다.");
    }
    return () => {
      worker.current?.terminate();
    };
  }, []);
  useEffect(() => {
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      try {
        localStorage.setItem("neuralcanvas-v1", JSON.stringify(experiment()));
      } catch {
        /* Storage can be unavailable in private browsing. */
      }
    }, 700);
    return () => clearTimeout(saveTimer.current);
  }, [model, data, settings, history, input, input2, name]);
  useEffect(() => {
    if (!playing) return;
    let id = 0,
      last = 0;
    const animate = (now: number) => {
      if (last) {
        const dt = Math.min(0.1, (now - last) / 1000);
        setInput((x) => {
          let next = x + direction.current * dt * sweepSpeed;
          if (next > 5 || next < -5) {
            if (sweepMode === "왕복") {
              direction.current *= -1;
              next = Math.max(-5, Math.min(5, next));
            } else if (sweepMode === "반복") {
              next = -5;
              direction.current = 1;
            } else {
              setPlaying(false);
              next = 5;
            }
          }
          return next;
        });
        setPhase(Math.floor(now / 550) % (model.layers.length + 1));
      }
      last = now;
      id = requestAnimationFrame(animate);
    };
    id = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(id);
  }, [playing, sweepSpeed, sweepMode, model.layers.length]);
  async function importFile(
    e: React.ChangeEvent<HTMLInputElement>,
    kind: "experiment" | "dataset",
  ) {
    const item = e.target.files?.[0];
    if (!item) return;
    try {
      if (item.size > 5_000_000)
        throw Error("파일은 최대 5MB까지 불러올 수 있습니다.");
      const text = await item.text();
      if (kind === "experiment") applyExperiment(loadExperiment(text));
      else
        changeData(
          item.name.endsWith(".csv")
            ? parseCSV(text, task)
            : validatePoints(JSON.parse(text), task),
        );
    } catch (err) {
      setMessage(`불러오기 실패: ${String(err)}`);
    }
    e.target.value = "";
  }
  const hidden = model.layers.slice(0, -1),
    sizes = hidden.map((l) => l.b.length),
    acts = hidden.map((l) => l.activation);
  const edge = selection?.type === "edge" ? selection : null,
    node = selection?.type === "node" ? selection : null;

  const validationIndices = useMemo(() => {
    const n = Math.max(
      0,
      Math.min(data.length - 1, Math.floor(data.length * settings.validation)),
    );
    return new Set(
      shuffle(
        data.map((_, i) => i),
        rng(settings.seed),
      ).slice(0, n),
    );
  }, [data, settings.validation, settings.seed]);
  return {
    plotSVG,
    networkSVG,
    model,
    data,
    settings,
    history,
    running,
    epoch,
    step,
    gradient,
    message,
    input,
    input2,
    setInput2,
    task,
    switchTask,
    activeClass,
    setActiveClass,
    resolution,
    setResolution,
    classDefinitions,
    playing,
    sweepSpeed,
    sweepMode,
    phase,
    selection,
    point,
    preset,
    count,
    noise,
    undo,
    redo,
    name,
    tab,
    file,
    datasetFile,
    direction,
    f,
    latest,
    parameters,
    hidden,
    sizes,
    acts,
    edge,
    node,
    validationIndices,
    setModel,
    setData,
    setSettings,
    setHistory,
    setRunning,
    setEpoch,
    setStep,
    setGradient,
    setMessage,
    setInput,
    setPlaying,
    setSweepSpeed,
    setSweepMode,
    setSelection,
    setPoint,
    setPreset,
    setCount,
    setNoise,
    setUndo,
    setRedo,
    setName,
    setTab,
    stopWorker,
    invalidate,
    editModel,
    changeData,
    changeSettings,
    resize,
    mutate,
    train,
    experiment,
    resetModel,
    applyExperiment,
    importFile,
  };
}
export type Lab = ReturnType<typeof useLab>;

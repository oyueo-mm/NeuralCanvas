import { useEffect, useRef, useState } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";
import {
  activations,
  createModel,
  dataset,
  defaults,
  forward,
  loss,
  parseCSV,
  presets,
  resizeModel,
  type Activation,
  type Gradients,
  type Model,
  type Point,
  type Settings,
  validatePoints,
} from "./engine";
import { Plot } from "./Plot";
import { Network, type Selection } from "./Network";
import {
  download,
  loadExperiment,
  type Experiment,
  type RecordItem,
} from "./storage";
import type { Request } from "./worker";
const fmt = (n: number) => (Number.isFinite(n) ? n.toFixed(5) : "—");
function NumberField({
  label,
  value,
  onChange,
  min = -1000000,
  max = 1000000,
  step = "any",
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  step?: number | "any";
}) {
  return (
    <label className="field">
      <span>{label}</span>
      <input
        type="number"
        aria-label={label}
        value={value}
        min={min}
        max={max}
        step={step}
        onChange={(e) => {
          const v = e.target.valueAsNumber;
          if (
            Number.isFinite(v) &&
            v >= min &&
            v <= max &&
            (step !== 1 || Number.isInteger(v))
          )
            onChange(v);
        }}
      />
    </label>
  );
}
export default function App() {
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
    [tab, setTab] = useState("all");
  const worker = useRef<Worker | null>(null),
    revision = useRef(0),
    direction = useRef(1),
    file = useRef<HTMLInputElement>(null),
    datasetFile = useRef<HTMLInputElement>(null),
    saveTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined),
    restore = useRef(false);
  const f = forward(model, input),
    latest = history.at(-1),
    parameters = model.layers.reduce(
      (s, l) => s + l.b.length + l.w.reduce((a, r) => a + r.length, 0),
      0,
    );
  const stopWorker = () => {
    revision.current++;
    worker.current?.terminate();
    worker.current = null;
    setRunning(false);
  };
  const invalidate = (
    text = "변경 사항을 반영했습니다. 학습 및 Optimizer 상태를 초기화했습니다.",
  ) => {
    stopWorker();
    setHistory([]);
    setEpoch(0);
    setStep(0);
    setGradient(undefined);
    setMessage(text);
  };
  const editModel = (m: Model) => {
    invalidate();
    setModel(m);
  };
  const changeData = (p: Point[]) => {
    try {
      validatePoints(p);
      setUndo((u) => [...u.slice(-49), data]);
      setRedo([]);
      invalidate("데이터가 변경되었습니다. 학습 상태를 초기화했습니다.");
      setData(p);
    } catch (e) {
      setMessage(String(e));
    }
  };
  const changeSettings = (s: Settings) => {
    invalidate();
    setSettings(s);
  };
  const resize = (sizes: number[], acts: Activation[]) => {
    setSelection(null);
    editModel(resizeModel(model, sizes, [...acts, "linear"]));
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
          ? "Worker에서 실제 역전파 학습 중입니다."
          : "실제 모델 업데이트를 진행합니다.",
    );
  }
  const experiment = (): Experiment => ({
    version: 1,
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
    const fresh = createModel(sizes, "tanh", settings.seed, init);
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
    setName(e.name);
    setUndo([]);
    setRedo([]);
    setPoint(null);
    setSelection(null);
    setPlaying(false);
    setGradient(undefined);
    setMessage(
      "실험을 불러왔습니다. 가중치는 복원되며 다음 학습은 새 Optimizer로 시작합니다.",
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
  }, [model, data, settings, history, input, name]);
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
            ? parseCSV(text)
            : validatePoints(JSON.parse(text)),
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
  return (
    <>
      <header className="topbar">
        <a href="#" className="brand">
          <span className="brand-mark">⌘</span>
          <span>
            Neural<span className="brand-light">Canvas</span>
            <small>INTERACTIVE NEURAL NETWORK LAB</small>
          </span>
        </a>
        <div className="header-right">
          <span className={`status ${running ? "training" : ""}`}>
            <i />
            {running ? "학습 중" : "실험 준비"}
          </span>
          <button onClick={() => file.current?.click()}>불러오기</button>
          <button
            onClick={() =>
              download(
                "neuralcanvas-experiment.json",
                JSON.stringify(experiment(), null, 2),
              )
            }
          >
            ↓ 실험 저장
          </button>
          <a
            className="github-link"
            href="https://github.com/oyueo-mm/NeuralCanvas"
            target="_blank"
            rel="noreferrer"
          >
            GitHub ↗
          </a>
        </div>
      </header>
      <main>
        <section className="intro">
          <div>
            <div className="eyebrow">
              <span className="tiny-square" /> YOUR IDEAS. YOUR NETWORK.
            </div>
            <h1>
              신경망을, 직접 만져보세요<span>.</span>
            </h1>
            <p>
              점을 찍어 데이터를 만들고, 연결을 바꾸고, 학습의 순간을
              관찰하세요.
            </p>
          </div>
          <div className="experiment-name">
            <span className="eyebrow">EXPERIMENT / 001</span>
            <input
              aria-label="실험 이름"
              value={name}
              maxLength={200}
              onChange={(e) => setName(e.target.value)}
            />
            <span className="small muted">브라우저에 자동 저장됩니다</span>
          </div>
        </section>
        <section className="training-bar">
          <div className="training-buttons">
            <button
              className="primary"
              onClick={() => train(running ? "pause" : "run")}
            >
              {running ? "Ⅱ 일시정지" : "▶ 학습 시작"}
            </button>
            <button onClick={() => train("step")}>한 스텝</button>
            <button onClick={() => train("epoch")}>한 Epoch</button>
            <button
              title="현재 가중치를 유지하고 학습 세션 종료"
              onClick={() => {
                stopWorker();
                setMessage(
                  "학습을 정지했습니다. 가중치는 유지되며 다음 시작 시 Optimizer가 초기화됩니다.",
                );
              }}
            >
              ■ 정지
            </button>
            <button onClick={() => resetModel()}>↺ 초기화</button>
          </div>
          <div className="training-stats">
            <div>
              <span>EPOCH</span>
              <strong data-testid="epoch">
                {epoch.toLocaleString()}
                <small> / {settings.epochs.toLocaleString()}</small>
              </strong>
            </div>
            <div>
              <span>TRAIN MSE</span>
              <strong className="lime-text" data-testid="loss">
                {fmt(latest?.train ?? loss(model, data))}
              </strong>
            </div>
            <div>
              <span>PARAMETERS</span>
              <strong>{parameters}</strong>
            </div>
          </div>
        </section>
        <div className="notice" role="status">
          <span>↳</span> {message}
        </div>
        <nav className="mobile-tabs">
          {[
            ["all", "전체"],
            ["data", "데이터"],
            ["network", "신경망"],
          ].map(([id, label]) => (
            <button
              key={id}
              className={tab === id ? "active" : ""}
              onClick={() => setTab(id)}
            >
              {label}
            </button>
          ))}
        </nav>
        <div className={`workspace tab-${tab}`}>
          <div className="left-column">
            <Plot
              model={model}
              data={data}
              input={input}
              setInput={setInput}
              change={changeData}
              selected={point}
              select={setPoint}
            />
            <details className="panel dataset-panel" open>
              <summary>
                <span className="eyebrow">DATASET STUDIO</span>
                <span>데이터 만들기 & 편집</span>
              </summary>
              <div className="details-body">
                <div className="preset-grid">
                  {presets.map((p) => (
                    <button
                      key={p}
                      className={preset === p ? "selected" : ""}
                      onClick={() => {
                        setPreset(p);
                        setPoint(null);
                        changeData(dataset(p, count, noise, settings.seed));
                      }}
                    >
                      {p}
                    </button>
                  ))}
                </div>
                <div className="form-grid">
                  <NumberField
                    label="표본 수"
                    value={count}
                    min={2}
                    max={500}
                    step={1}
                    onChange={setCount}
                  />
                  <NumberField
                    label="잡음"
                    value={noise}
                    min={0}
                    max={3}
                    onChange={setNoise}
                  />
                </div>
                <div className="toolbar">
                  <button
                    onClick={() =>
                      changeData(dataset(preset, count, noise, settings.seed))
                    }
                  >
                    프리셋 다시 생성
                  </button>
                  <button
                    disabled={!undo.length}
                    onClick={() => {
                      const p = undo.at(-1)!;
                      setRedo((r) => [...r, data]);
                      setUndo((u) => u.slice(0, -1));
                      invalidate();
                      setData(p);
                      setPoint(null);
                    }}
                  >
                    ↶ 실행 취소
                  </button>
                  <button
                    disabled={!redo.length}
                    onClick={() => {
                      setUndo((u) => [...u, data]);
                      setData(redo.at(-1)!);
                      setRedo((r) => r.slice(0, -1));
                      invalidate();
                      setPoint(null);
                    }}
                  >
                    ↷ 다시 실행
                  </button>
                </div>
                {point !== null && data[point] && (
                  <div className="point-editor">
                    <span className="eyebrow">POINT {point + 1}</span>
                    <NumberField
                      label="점 x"
                      value={data[point].x}
                      min={-1000}
                      max={1000}
                      onChange={(v) =>
                        changeData(
                          data.map((p, i) =>
                            i === point ? { ...p, x: v } : p,
                          ),
                        )
                      }
                    />
                    <NumberField
                      label="점 y"
                      value={data[point].y}
                      min={-1000}
                      max={1000}
                      onChange={(v) =>
                        changeData(
                          data.map((p, i) =>
                            i === point ? { ...p, y: v } : p,
                          ),
                        )
                      }
                    />
                    <button
                      onClick={() => {
                        changeData(data.filter((_, i) => i !== point));
                        setPoint(null);
                      }}
                    >
                      선택 점 삭제
                    </button>
                  </div>
                )}
                <div className="toolbar border-top">
                  <button onClick={() => datasetFile.current?.click()}>
                    CSV / JSON 가져오기
                  </button>
                  <button
                    onClick={() =>
                      download(
                        "dataset.csv",
                        "x,y\n" + data.map((p) => `${p.x},${p.y}`).join("\n"),
                        "text/csv",
                      )
                    }
                  >
                    CSV 내보내기
                  </button>
                  <button
                    className="danger"
                    onClick={() => {
                      changeData([]);
                      setPoint(null);
                    }}
                  >
                    전체 삭제
                  </button>
                </div>
                <p className="small muted">
                  좌표는 원본 단위로 계산합니다. 정규화는 적용하지 않습니다.
                  최대 2,000개 점.
                </p>
              </div>
            </details>
          </div>
          <div className="right-column">
            <Network
              model={model}
              input={input}
              selection={selection}
              select={setSelection}
              gradient={gradient}
              playing={playing}
              phase={phase}
            />
            {(edge || node) && (
              <section className="panel inspector">
                <div className="panel-heading">
                  <h2>{edge ? "연결 편집" : "뉴런 편집"}</h2>
                  <button onClick={() => setSelection(null)}>닫기 ×</button>
                </div>
                {edge && (
                  <div className="details-body">
                    <p className="mono">
                      L{edge.l} · N{edge.i + 1} → L{edge.l + 1} · N{edge.j + 1}
                    </p>
                    <div className="form-grid">
                      <NumberField
                        label="가중치"
                        value={model.layers[edge.l].w[edge.j][edge.i]}
                        onChange={(v) =>
                          mutate(
                            (m) => (m.layers[edge.l].w[edge.j][edge.i] = v),
                          )
                        }
                      />
                      <label className="checkbox">
                        <input
                          type="checkbox"
                          checked={model.layers[edge.l].enabled[edge.j][edge.i]}
                          onChange={(e) =>
                            mutate(
                              (m) =>
                                (m.layers[edge.l].enabled[edge.j][edge.i] =
                                  e.target.checked),
                            )
                          }
                        />
                        연결 활성화
                      </label>
                    </div>
                    <p className="mono small">
                      기여 w·a ={" "}
                      {(model.layers[edge.l].enabled[edge.j][edge.i]
                        ? model.layers[edge.l].w[edge.j][edge.i] *
                          f.a[edge.l][edge.i]
                        : 0
                      ).toFixed(5)}{" "}
                      · ∂L/∂w ={" "}
                      {gradient?.w[edge.l]?.[edge.j]?.[edge.i]?.toFixed(6) ??
                        "—"}
                    </p>
                  </div>
                )}
                {node && (
                  <div className="details-body">
                    <div className="form-grid">
                      <NumberField
                        label="편향"
                        value={model.layers[node.l].b[node.j]}
                        onChange={(v) =>
                          mutate((m) => (m.layers[node.l].b[node.j] = v))
                        }
                      />
                      <div className="mono small">
                        z = {fmt(f.z[node.l][node.j])}
                        <br />a = {fmt(f.a[node.l + 1][node.j])}
                        <br />φ = {model.layers[node.l].activation}
                        <br />
                        ∂L/∂z ={" "}
                        {gradient?.dz[node.l]?.[node.j]?.toFixed(6) ?? "—"}
                      </div>
                    </div>
                    <p className="mono small equation">
                      z ={" "}
                      {model.layers[node.l].w[node.j]
                        .map(
                          (w, i) =>
                            `${model.layers[node.l].enabled[node.j][i] ? `(${w.toFixed(3)} × ${f.a[node.l][i].toFixed(3)})` : "0 [비활성]"}`,
                        )
                        .join(" + ")}{" "}
                      + {model.layers[node.l].b[node.j].toFixed(3)}
                    </p>
                  </div>
                )}
              </section>
            )}
            <details className="panel" open>
              <summary>
                <span className="eyebrow">MODEL BUILDER</span>
                <span>작은 연결이 만드는 큰 변화</span>
              </summary>
              <div className="details-body">
                <div className="layer-list">
                  <div className="layer-row">
                    <span className="muted small">INPUT</span>
                    <span className="layer-pill">1 뉴런</span>
                    <span className="small muted">실수 x</span>
                  </div>
                  {hidden.map((l, k) => (
                    <div className="layer-row" key={l.id}>
                      <span className="small">은닉층 {k + 1}</span>
                      <div className="stepper">
                        <button
                          aria-label={`은닉층 ${k + 1} 뉴런 제거`}
                          disabled={l.b.length <= 1}
                          onClick={() =>
                            resize(
                              sizes.map((n, i) => (i === k ? n - 1 : n)),
                              acts,
                            )
                          }
                        >
                          −
                        </button>
                        <b>{l.b.length}</b>
                        <button
                          aria-label={`은닉층 ${k + 1} 뉴런 추가`}
                          disabled={l.b.length >= 16}
                          onClick={() =>
                            resize(
                              sizes.map((n, i) => (i === k ? n + 1 : n)),
                              acts,
                            )
                          }
                        >
                          ＋
                        </button>
                      </div>
                      <select
                        aria-label={`은닉층 ${k + 1} 활성화`}
                        value={l.activation}
                        onChange={(e) =>
                          mutate(
                            (m) =>
                              (m.layers[k].activation = e.target
                                .value as Activation),
                          )
                        }
                      >
                        {activations.map((a) => (
                          <option key={a}>{a}</option>
                        ))}
                      </select>
                      <button
                        aria-label={`은닉층 ${k + 1} 삭제`}
                        onClick={() =>
                          resize(
                            sizes.filter((_, i) => i !== k),
                            acts.filter((_, i) => i !== k),
                          )
                        }
                      >
                        ×
                      </button>
                    </div>
                  ))}
                  <div className="layer-row">
                    <span className="muted small">OUTPUT</span>
                    <span className="layer-pill">1 뉴런</span>
                    <span className="small muted">linear · ŷ</span>
                  </div>
                </div>
                <button
                  className="add-layer"
                  disabled={hidden.length >= 4}
                  onClick={() => resize([...sizes, 4], [...acts, "tanh"])}
                >
                  ＋ 은닉층 추가 <span>최대 4개 층 · 층당 16개 뉴런</span>
                </button>
                <p className="small muted">
                  뉴런 수 변경 시 기존 연결을 유지합니다. 층 추가·삭제 시 모델을
                  재초기화합니다.
                </p>
              </div>
            </details>
            <details className="panel">
              <summary>
                <span className="eyebrow">TRAINING SETTINGS</span>
                <span>학습 설정</span>
              </summary>
              <div className="details-body">
                <div className="form-grid">
                  <label className="field">
                    <span>Optimizer</span>
                    <select
                      aria-label="Optimizer"
                      value={settings.optimizer}
                      onChange={(e) =>
                        changeSettings({
                          ...settings,
                          optimizer: e.target.value as Settings["optimizer"],
                        })
                      }
                    >
                      <option value="adam">Adam</option>
                      <option value="sgd">SGD</option>
                    </select>
                  </label>
                  <NumberField
                    label="학습률"
                    min={0.000001}
                    max={1}
                    value={settings.lr}
                    onChange={(lr) => changeSettings({ ...settings, lr })}
                  />
                  <NumberField
                    label="배치 크기"
                    min={1}
                    max={2000}
                    step={1}
                    value={settings.batch}
                    onChange={(batch) => changeSettings({ ...settings, batch })}
                  />
                  <NumberField
                    label="목표 Epoch"
                    min={1}
                    max={100000}
                    step={1}
                    value={settings.epochs}
                    onChange={(epochs) =>
                      changeSettings({ ...settings, epochs })
                    }
                  />
                  <NumberField
                    label="시드"
                    min={0}
                    max={4294967295}
                    step={1}
                    value={settings.seed}
                    onChange={(seed) => changeSettings({ ...settings, seed })}
                  />
                  <NumberField
                    label="검증 비율"
                    min={0}
                    max={0.5}
                    value={settings.validation}
                    onChange={(validation) =>
                      changeSettings({ ...settings, validation })
                    }
                  />
                  <NumberField
                    label="기울기 클리핑"
                    min={0}
                    max={1000}
                    value={settings.clip}
                    onChange={(clip) => changeSettings({ ...settings, clip })}
                  />
                  <label className="field">
                    <span>가중치 초기화</span>
                    <select
                      aria-label="가중치 초기화"
                      value={model.init}
                      onChange={(e) =>
                        resetModel(e.target.value as Model["init"])
                      }
                    >
                      {["xavier", "he", "zero"].map((v) => (
                        <option key={v}>{v}</option>
                      ))}
                    </select>
                  </label>
                </div>
                <label className="slider-label">
                  학습률 · 로그 스케일
                  <input
                    type="range"
                    min="-6"
                    max="0"
                    step=".1"
                    value={Math.log10(settings.lr)}
                    onChange={(e) =>
                      changeSettings({ ...settings, lr: 10 ** +e.target.value })
                    }
                  />
                </label>
                <label className="slider-label">
                  학습 속도 · 최대 {settings.speed} 배치 / 갱신
                  <input
                    type="range"
                    min="1"
                    max="100"
                    value={settings.speed}
                    onChange={(e) =>
                      changeSettings({ ...settings, speed: +e.target.value })
                    }
                  />
                </label>
                <p className="small muted">
                  속도는 연산량, 학습률은 업데이트 크기입니다. 설정 변경 시 학습
                  세션을 초기화합니다. Zero 초기화는 은닉 뉴런의 대칭성 때문에
                  학습이 제한될 수 있습니다.
                </p>
              </div>
            </details>
          </div>
        </div>
        <section className="panel observation">
          <div className="observation-title">
            <span className="eyebrow">03 / FOLLOW THE SIGNAL</span>
            <h2>입력 하나의 여정</h2>
            <p className="small muted">
              가중치를 고정하고 순전파를 관찰합니다.
            </p>
          </div>
          <button
            className={playing ? "primary" : "outline-lime"}
            disabled={running}
            onClick={() => {
              direction.current = 1;
              setPlaying(!playing);
            }}
          >
            {playing ? "Ⅱ 순회 일시정지" : "▷ 입력 순회"}
          </button>
          <div className="sweep-slider">
            <div>
              <span className="mono">x = {input.toFixed(2)}</span>
              <strong className="mono">ŷ = {f.y.toFixed(4)}</strong>
            </div>
            <input
              aria-label="관찰 입력 x"
              type="range"
              min="-5"
              max="5"
              step=".01"
              value={input}
              onChange={(e) => setInput(+e.target.value)}
            />
            <div className="small muted">
              <span>−5</span>
              <span>+5</span>
            </div>
          </div>
          <div className="sweep-options">
            <NumberField
              label="순회 속도"
              value={sweepSpeed}
              min={0.1}
              max={5}
              onChange={setSweepSpeed}
            />
            <select
              aria-label="순회 방식"
              value={sweepMode}
              onChange={(e) => setSweepMode(e.target.value)}
            >
              {["왕복", "반복", "한 방향"].map((v) => (
                <option key={v}>{v}</option>
              ))}
            </select>
            <NumberField
              label="입력 x"
              value={input}
              min={-5}
              max={5}
              onChange={setInput}
            />
          </div>
        </section>
        <details className="panel analysis" open>
          <summary>
            <span className="eyebrow">04 / LEARNING INSIGHTS</span>
            <span>학습의 흔적</span>
          </summary>
          <div className="analysis-grid">
            <div className="loss-chart">
              <div className="chart-title">
                <h3>
                  Loss history <small>MSE / optimizer step</small>
                </h3>
                <button
                  onClick={() =>
                    download(
                      "loss.csv",
                      "step,epoch,train,validation\n" +
                        history
                          .map(
                            (r) =>
                              `${r.step},${r.epoch},${r.train},${r.validation ?? ""}`,
                          )
                          .join("\n"),
                      "text/csv",
                    )
                  }
                >
                  ↓ CSV
                </button>
              </div>
              <div style={{ height: 190 }}>
                {history.length ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={history}>
                      <CartesianGrid stroke="#2a372e" vertical={false} />
                      <XAxis
                        dataKey="step"
                        stroke="#84988a"
                        tick={{ fontSize: 10 }}
                        minTickGap={40}
                      />
                      <YAxis
                        stroke="#84988a"
                        tick={{ fontSize: 10 }}
                        width={60}
                      />
                      <Tooltip
                        contentStyle={{
                          background: "#18231c",
                          border: "1px solid #3a4b3e",
                          borderRadius: 8,
                        }}
                      />
                      <Line
                        name="Train"
                        type="linear"
                        dataKey="train"
                        stroke="#c6ed8b"
                        dot={false}
                        isAnimationActive={false}
                      />
                      <Line
                        name="Validation"
                        type="linear"
                        dataKey="validation"
                        stroke="#b798f2"
                        dot={false}
                        isAnimationActive={false}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="empty-chart">
                    <span>↗</span>학습을 시작하면 실제 손실이 여기에 기록됩니다.
                  </div>
                )}
              </div>
            </div>
            <div className="insights">
              <div className="metric-row">
                <span>Validation MSE</span>
                <strong>
                  {latest?.validation === undefined
                    ? "—"
                    : fmt(latest.validation)}
                </strong>
              </div>
              <div className="metric-row">
                <span>Optimizer steps</span>
                <strong>{step.toLocaleString()}</strong>
              </div>
              <div className="metric-row">
                <span>가중치 범위</span>
                <strong>
                  {Math.min(...model.layers.flatMap((l) => l.w.flat())).toFixed(
                    2,
                  )}{" "}
                  ~{" "}
                  {Math.max(...model.layers.flatMap((l) => l.w.flat())).toFixed(
                    2,
                  )}
                </strong>
              </div>
              <div className="metric-row">
                <span>기울기 L2 norm</span>
                <strong>
                  {gradient
                    ? Math.sqrt(
                        gradient.w
                          .flat(2)
                          .concat(gradient.b.flat())
                          .reduce((s, v) => s + v * v, 0),
                      ).toFixed(4)
                    : "—"}
                </strong>
              </div>
              <p className="small muted">
                검증 표본은 시드로 분리하며 학습에서 제외합니다. 최근 1,000개
                스텝만 보존합니다.
              </p>
            </div>
          </div>
        </details>
        <details className="panel learn">
          <summary>
            <span className="eyebrow">BEHIND THE CANVAS</span>
            <span>어떻게 학습하나요?</span>
          </summary>
          <div className="learn-grid">
            <div>
              <h3>01. 순전파</h3>
              <p>
                각 뉴런은 입력의 가중합에 편향을 더하고 활성화 함수를
                적용합니다.
              </p>
              <code>z = Σ wᵢaᵢ + b · a = φ(z)</code>
            </div>
            <div>
              <h3>02. 역전파</h3>
              <p>
                예측과 실제 데이터 사이의 평균제곱오차를 연쇄법칙으로
                미분합니다.
              </p>
              <code>L = mean((ŷ − y)²)</code>
            </div>
            <div>
              <h3>03. 업데이트</h3>
              <p>
                SGD 또는 Adam이 실제 기울기로 가중치를 조정합니다. 활성화 값과
                곡선은 현재 모델에서 계산됩니다.
              </p>
              <code>w ← w − η ∂L/∂w</code>
            </div>
          </div>
          <p className="small muted details-body">
            층 강조 애니메이션은 계산 순서를 설명하는 교육적 비유입니다. 모든
            값은 현재 관찰 입력 x를 기준으로 계산됩니다.
          </p>
        </details>
        <footer>
          <span>
            NeuralCanvas{" "}
            <span className="muted">/ 직접 만드는 딥러닝 실험실</span>
          </span>
          <span className="mono small">
            BUILT TO EXPLORE. DESIGNED TO UNDERSTAND.
          </span>
        </footer>
      </main>
      <input
        hidden
        ref={file}
        type="file"
        accept=".json"
        onChange={(e) => importFile(e, "experiment")}
      />
      <input
        hidden
        ref={datasetFile}
        type="file"
        accept=".json,.csv"
        onChange={(e) => importFile(e, "dataset")}
      />
    </>
  );
}

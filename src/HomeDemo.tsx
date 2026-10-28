import { useEffect, useMemo, useRef, useState } from "react";
import { createModel, dataset, defaults, forward } from "./engine";
import { palette } from "./theme";
import { Trainer } from "./training";
import { Icon } from "./ui";
const W = 560,
  nodeR = 13,
  xs = [70, 190, 310, 430],
  sizes = [1, 5, 5, 1],
  rangeX = 4;
const nodeY = (l: number, j: number) => 70 + (j - (sizes[l] - 1) / 2) * 38 + 80;
const wave = (t: number) => {
  const p = (t / 4200) % 2;
  return (p < 1 ? p : 2 - p) * 2 * rangeX - rangeX;
};
const reducedMotion = () =>
  typeof matchMedia === "function" &&
  matchMedia("(prefers-reduced-motion: reduce)").matches;
/**
 * A small real network, trained in the page with the same Trainer as the lab. The pulse that
 * sweeps the input is a real forward pass; it is a demo of the mechanism, not a saved result.
 */
export function HomeDemo() {
  const trainer = useMemo(
    () =>
      new Trainer(
        createModel([5, 5], "tanh", 3),
        dataset("사인", 28, 0.12, 7),
        {
          ...defaults,
          lr: 0.03,
          batch: 7,
          epochs: 1e9,
          validation: 0,
          seed: 5,
        },
      ),
    [],
  );
  const [running, setRunning] = useState(() => !reducedMotion()),
    [, setFrame] = useState(0),
    clock = useRef(0),
    metrics = useRef(trainer.metrics());
  useEffect(() => {
    if (!running) return;
    let id = 0,
      last = 0,
      shown = 0;
    const loop = (now: number) => {
      id = requestAnimationFrame(loop);
      if (document.hidden || now - last < 33) return;
      last = now;
      const start = performance.now();
      // Never spend more than a few milliseconds of the frame on training.
      for (let i = 0; i < 6 && performance.now() - start < 6; i++)
        trainer.advance();
      metrics.current = trainer.metrics();
      clock.current = now;
      if (now - shown > 33) {
        shown = now;
        setFrame((f) => f + 1);
      }
    };
    id = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(id);
  }, [running, trainer]);
  const model = trainer.model,
    x = wave(clock.current),
    f = forward(model, x),
    sx = (v: number) => 24 + ((v + rangeX) / (2 * rangeX)) * 512,
    sy = (v: number) => 305 - ((v + 3) / 6) * 105;
  const curve = Array.from({ length: 65 }, (_, i) => {
    const v = -rangeX + (i * 2 * rangeX) / 64;
    return `${i ? "L" : "M"}${sx(v).toFixed(1)} ${sy(forward(model, v).y).toFixed(1)}`;
  }).join("");
  return (
    <div className="demo-card" data-testid="home-demo">
      <div className="demo-heading">
        <span className="demo-label">실제 계산</span>
        <span>브라우저에서 학습 중인 작은 신경망</span>
      </div>
      <svg
        viewBox={`0 0 ${W} 330`}
        role="img"
        aria-label="입력 신호가 은닉층을 지나 예측으로 바뀌는 신경망 애니메이션"
        className="demo-svg"
      >
        {model.layers.map((layer, l) =>
          layer.w.map((row, j) =>
            row.map((w, i) => (
              <line
                key={`${l}-${j}-${i}`}
                className={running ? "demo-flow" : undefined}
                x1={xs[l]}
                y1={nodeY(l, i)}
                x2={xs[l + 1]}
                y2={nodeY(l + 1, j)}
                stroke={w >= 0 ? palette.sageDeep : palette.rose}
                strokeOpacity={Math.min(0.85, 0.12 + Math.abs(w) * 0.35)}
                strokeWidth={0.8 + Math.min(2.6, Math.abs(w))}
              />
            )),
          ),
        )}
        {sizes.map((n, l) =>
          Array.from({ length: n }, (_, j) => {
            const a = f.a[l][j],
              level = Math.min(1, Math.abs(a));
            return (
              <circle
                key={`${l}-${j}`}
                cx={xs[l]}
                cy={nodeY(l, j)}
                r={nodeR}
                fill={a >= 0 ? palette.sage : palette.pink}
                fillOpacity={0.25 + level * 0.75}
                stroke={a >= 0 ? palette.sageDeep : palette.rose}
                strokeWidth="1.6"
              />
            );
          }),
        )}
        <text
          x={xs[0]}
          y="46"
          textAnchor="middle"
          fontSize="11"
          fill={palette.muted}
        >
          입력 x
        </text>
        <text
          x={xs[3]}
          y="46"
          textAnchor="middle"
          fontSize="11"
          fill={palette.muted}
        >
          예측 ŷ
        </text>
        <g>
          <rect
            x="24"
            y="200"
            width="512"
            height="105"
            rx="6"
            fill="none"
            stroke={palette.grid}
          />
          <line x1="24" x2="536" y1={sy(0)} y2={sy(0)} stroke={palette.grid} />
          {trainer.train.concat(trainer.validation).map((p, i) => (
            <circle
              key={i}
              cx={sx(p.x)}
              cy={sy(p.y)}
              r="3.2"
              fill={palette.sage}
            />
          ))}
          <path
            d={curve}
            fill="none"
            stroke={palette.sageDeep}
            strokeWidth="2.4"
          />
          <line
            x1={sx(x)}
            x2={sx(x)}
            y1="200"
            y2="305"
            stroke={palette.pink}
            strokeWidth="2"
          />
          <circle cx={sx(x)} cy={sy(f.y)} r="5" fill={palette.rose} />
        </g>
      </svg>
      <div className="demo-playback">
        <button
          className="primary"
          aria-pressed={running}
          onClick={() => setRunning(!running)}
        >
          <Icon name={running ? "pause" : "play"} />
          {running ? "일시정지" : "재생"}
        </button>
        <button
          aria-label="처음부터"
          onClick={() => {
            const fresh = createModel([5, 5], "tanh", 3);
            trainer.model.layers.forEach((layer, k) => {
              layer.w = fresh.layers[k].w;
              layer.b = fresh.layers[k].b;
            });
            trainer.optimizer.t = 0;
            trainer.optimizer.mom.clear();
            trainer.step = trainer.epoch = trainer.cursor = 0;
            trainer.order = [];
            metrics.current = trainer.metrics();
            setFrame((v) => v + 1);
          }}
        >
          <Icon name="reset" />
          처음부터
        </button>
        <span className="demo-stats" aria-live="off">
          <small>step</small> {trainer.step.toLocaleString()}
          <small> · MSE</small> {metrics.current.train.toFixed(3)}
        </span>
      </div>
    </div>
  );
}

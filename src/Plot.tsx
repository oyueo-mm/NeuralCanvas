import { useRef, useState, type PointerEvent } from "react";
import { forward, type Model, type Point } from "./engine";
import { exportSVG } from "./storage";
type Props = {
  model: Model;
  data: Point[];
  input: number;
  setInput: (n: number) => void;
  change: (p: Point[]) => void;
  selected: number | null;
  select: (i: number | null) => void;
};
export function Plot({
  model,
  data,
  input,
  setInput,
  change,
  selected,
  select,
}: Props) {
  const [mode, setMode] = useState<"edit" | "pan">("edit"),
    [range, setRange] = useState({ cx: 0, cy: 0, span: 10 }),
    [cursor, setCursor] = useState<Point | null>(null);
  const svg = useRef<SVGSVGElement>(null),
    drag = useRef<{
      i: number;
      start: Point;
      original: Point[];
      range: typeof range;
    } | null>(null);
  const W = 600,
    H = 460,
    pad = 40;
  const sx = (x: number) =>
      pad + ((x - range.cx + range.span / 2) / range.span) * (W - pad * 2),
    sy = (y: number) =>
      H - pad - ((y - range.cy + range.span / 2) / range.span) * (H - pad * 2);
  const from = (e: PointerEvent<SVGSVGElement>) => {
    const p = svg.current!.createSVGPoint();
    p.x = e.clientX;
    p.y = e.clientY;
    const local = p.matrixTransform(svg.current!.getScreenCTM()!.inverse());
    return {
      x:
        range.cx +
        ((local.x - pad) / (W - 2 * pad)) * range.span -
        range.span / 2,
      y:
        range.cy +
        ((H - pad - local.y) / (H - 2 * pad)) * range.span -
        range.span / 2,
    };
  };
  const ticks = Array.from(
      { length: 11 },
      (_, i) => range.cx - range.span / 2 + (range.span * i) / 10,
    ),
    yticks = Array.from(
      { length: 11 },
      (_, i) => range.cy - range.span / 2 + (range.span * i) / 10,
    );
  const path = Array.from({ length: 241 }, (_, i) => {
    const x = range.cx - range.span / 2 + (range.span * i) / 240,
      y = forward(model, x).y;
    return `${i ? "L" : "M"}${sx(x)},${Math.max(-10000, Math.min(10000, sy(y)))}`;
  }).join(" ");
  function fit() {
    if (!data.length) {
      setRange({ cx: 0, cy: 0, span: 10 });
      return;
    }
    const xs = data.map((p) => p.x),
      ys = data.map((p) => p.y),
      lo = Math.min(...xs),
      hi = Math.max(...xs),
      bottom = Math.min(...ys),
      top = Math.max(...ys);
    setRange({
      cx: (lo + hi) / 2,
      cy: (bottom + top) / 2,
      span: Math.max(2, hi - lo, top - bottom) * 1.25,
    });
  }
  return (
    <section className="panel plot-panel">
      <div className="panel-heading">
        <div>
          <span className="eyebrow">01 / DATA SPACE</span>
          <h2>
            데이터 캔버스 <span className="count">{data.length} points</span>
          </h2>
        </div>
        <button
          onClick={() =>
            svg.current && exportSVG(svg.current, "neuralcanvas-plot.png")
          }
          title="그래프 PNG 다운로드"
        >
          ↗ PNG
        </button>
      </div>
      <div className="plot-tools">
        <div className="segmented">
          <button
            className={mode === "edit" ? "active" : ""}
            onClick={() => setMode("edit")}
          >
            ＋ 점 편집
          </button>
          <button
            className={mode === "pan" ? "active" : ""}
            onClick={() => setMode("pan")}
          >
            ✥ 탐색
          </button>
        </div>
        <div className="button-group">
          <button
            aria-label="데이터 축소"
            onClick={() =>
              setRange({ ...range, span: Math.min(2000, range.span * 1.25) })
            }
          >
            −
          </button>
          <button
            aria-label="데이터 확대"
            onClick={() =>
              setRange({ ...range, span: Math.max(0.1, range.span / 1.25) })
            }
          >
            ＋
          </button>
          <button onClick={fit}>맞춤</button>
        </div>
      </div>
      <svg
        ref={svg}
        data-testid="data-plot"
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label="데이터와 신경망 예측 곡선"
        className={`data-plot ${mode}`}
        onWheel={(e) =>
          setRange({
            ...range,
            span: Math.max(
              0.1,
              Math.min(2000, range.span * (e.deltaY > 0 ? 1.1 : 0.9)),
            ),
          })
        }
        onPointerDown={(e) => {
          if (e.button !== 0) return;
          const p = from(e);
          let i = -1,
            best = 12;
          data.forEach((v, j) => {
            const d = Math.hypot(sx(v.x) - sx(p.x), sy(v.y) - sy(p.y));
            if (d < best) {
              best = d;
              i = j;
            }
          });
          if (mode === "edit" && i < 0) {
            if (data.length >= 2000) return;
            change([...data, p]);
            select(data.length);
            return;
          }
          select(i < 0 ? null : i);
          drag.current = {
            i: mode === "pan" ? -1 : i,
            start: p,
            original: structuredClone(data),
            range,
          };
          e.currentTarget.setPointerCapture(e.pointerId);
        }}
        onPointerMove={(e) => {
          const p = from(e);
          setCursor(p);
          const d = drag.current;
          if (!d) return;
          if (d.i === -1) {
            setRange({
              ...range,
              cx: range.cx + d.start.x - p.x,
              cy: range.cy + d.start.y - p.y,
            });
          } else {
            const next = [...d.original];
            next[d.i] = {
              x: Math.max(-1000, Math.min(1000, p.x)),
              y: Math.max(-1000, Math.min(1000, p.y)),
            };
            change(next);
          }
        }}
        onPointerUp={() => (drag.current = null)}
        onPointerCancel={() => (drag.current = null)}
        onPointerLeave={() => setCursor(null)}
      >
        <defs>
          <clipPath id="plotClip">
            <rect x={pad} y={pad} width={W - pad * 2} height={H - pad * 2} />
          </clipPath>
        </defs>
        <rect width={W} height={H} fill="#141e19" rx="8" />
        {ticks.map((x, i) => (
          <g key={i}>
            <line
              x1={sx(x)}
              x2={sx(x)}
              y1={pad}
              y2={H - pad}
              stroke="#29372e"
              strokeWidth="1"
            />
            <text
              x={sx(x)}
              y={H - 16}
              fill="#8b9d91"
              fontSize="11"
              textAnchor="middle"
            >
              {x.toFixed(1)}
            </text>
          </g>
        ))}
        {yticks.map((y, i) => (
          <g key={i}>
            <line
              x1={pad}
              x2={W - pad}
              y1={sy(y)}
              y2={sy(y)}
              stroke="#29372e"
            />
            <text
              x="29"
              y={sy(y) + 4}
              fill="#8b9d91"
              fontSize="11"
              textAnchor="end"
            >
              {y.toFixed(1)}
            </text>
          </g>
        ))}
        <g clipPath="url(#plotClip)">
          <line x1={sx(0)} x2={sx(0)} y1={pad} y2={H - pad} stroke="#617367" />
          <line x1={pad} x2={W - pad} y1={sy(0)} y2={sy(0)} stroke="#617367" />
          <path
            data-testid="prediction"
            d={path}
            fill="none"
            stroke="#c6ed8b"
            strokeWidth="2.5"
          />
          {data.map((p, i) => (
            <circle
              key={i}
              data-testid="data-point"
              cx={sx(p.x)}
              cy={sy(p.y)}
              r={i === selected ? 6 : 4}
              fill="#b798f2"
              stroke={i === selected ? "#fff" : "#d8c7fa"}
              strokeWidth={i === selected ? 2 : 1}
            >
              <title>
                {i + 1}: ({p.x.toFixed(3)}, {p.y.toFixed(3)})
              </title>
            </circle>
          ))}
          <line
            x1={sx(input)}
            x2={sx(input)}
            y1={pad}
            y2={H - pad}
            stroke="#dfb875"
            strokeDasharray="4 5"
          />
          <circle
            cx={sx(input)}
            cy={sy(forward(model, input).y)}
            r="6"
            fill="#dfb875"
            stroke="#141e19"
            strokeWidth="2"
          />
        </g>
        <text x={W - 22} y={H - 18} fill="#c6ed8b" fontSize="12">
          x
        </text>
        <text x="20" y="24" fill="#c6ed8b" fontSize="12">
          y
        </text>
      </svg>
      <div className="plot-caption">
        <span>
          <i className="dot purple" />
          학습 데이터 <i className="dot lime" />
          모델 예측
        </span>
        <span className="mono">
          {cursor
            ? `x ${cursor.x.toFixed(2)} · y ${cursor.y.toFixed(2)}`
            : "클릭으로 추가 · 드래그로 이동"}
        </span>
      </div>
      <div className="input-inline">
        <label htmlFor="probe-small">관찰 입력</label>
        <input
          id="probe-small"
          type="range"
          min="-5"
          max="5"
          step=".01"
          value={input}
          onChange={(e) => setInput(+e.target.value)}
        />
        <span className="mono">{input.toFixed(2)}</span>
      </div>
    </section>
  );
}

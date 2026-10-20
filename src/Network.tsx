import { useRef, useState } from "react";
import { forward, type Model, type Gradients } from "./engine";
import { exportSVG } from "./storage";
export type Selection =
  | { type: "edge"; l: number; j: number; i: number }
  | { type: "node"; l: number; j: number }
  | null;
export function Network({
  model,
  input,
  selection,
  select,
  gradient,
  playing,
  phase,
}: {
  model: Model;
  input: number;
  selection: Selection;
  select: (s: Selection) => void;
  gradient?: Gradients;
  playing: boolean;
  phase: number;
}) {
  const [zoom, setZoom] = useState(1),
    [pan, setPan] = useState({ x: 0, y: 0 });
  const svg = useRef<SVGSVGElement>(null),
    drag = useRef<{ x: number; y: number; px: number; py: number } | null>(
      null,
    );
  const f = forward(model, input),
    sizes = [1, ...model.layers.map((l) => l.b.length)],
    H = Math.max(330, Math.max(...sizes) * 37 + 80),
    W = 650;
  const pos = (l: number, j: number) => ({
    x: 65 + (l * (W - 130)) / (sizes.length - 1),
    y:
      H / 2 +
      (j - (sizes[l] - 1) / 2) * Math.min(48, (H - 100) / Math.max(...sizes)),
  });
  return (
    <section className="panel network-panel">
      <div className="panel-heading">
        <div>
          <span className="eyebrow">02 / NETWORK ARCHITECTURE</span>
          <h2>신경망 들여다보기</h2>
        </div>
        <div className="button-group">
          <button
            aria-label="신경망 축소"
            onClick={() => setZoom(Math.max(0.4, zoom / 1.2))}
          >
            −
          </button>
          <button
            aria-label="신경망 확대"
            onClick={() => setZoom(Math.min(4, zoom * 1.2))}
          >
            ＋
          </button>
          <button
            onClick={() => {
              setZoom(1);
              setPan({ x: 0, y: 0 });
            }}
          >
            맞춤
          </button>
          <button
            onClick={() =>
              svg.current && exportSVG(svg.current, "neuralcanvas-network.png")
            }
          >
            PNG
          </button>
        </div>
      </div>
      <div className="network-wrap">
        <svg
          ref={svg}
          data-testid="network"
          viewBox={`0 0 ${W} ${H}`}
          aria-label="신경망 구조"
          onWheel={(e) =>
            setZoom(
              Math.max(0.4, Math.min(4, zoom * (e.deltaY > 0 ? 0.9 : 1.1))),
            )
          }
          onPointerDown={(e) => {
            if (e.target === e.currentTarget) {
              drag.current = {
                x: e.clientX,
                y: e.clientY,
                px: pan.x,
                py: pan.y,
              };
              e.currentTarget.setPointerCapture(e.pointerId);
            }
          }}
          onPointerMove={(e) => {
            if (drag.current) {
              const d = drag.current;
              setPan({
                x: d.px + ((e.clientX - d.x) * W) / e.currentTarget.clientWidth,
                y:
                  d.py + ((e.clientY - d.y) * H) / e.currentTarget.clientHeight,
              });
            }
          }}
          onPointerUp={() => (drag.current = null)}
          onPointerCancel={() => (drag.current = null)}
        >
          <g
            transform={`translate(${W / 2 + pan.x} ${H / 2 + pan.y}) scale(${zoom}) translate(${-W / 2} ${-H / 2})`}
          >
            {model.layers.map((l, k) =>
              l.w.map((row, j) =>
                row.map((w, i) => {
                  const a = pos(k, i),
                    b = pos(k + 1, j),
                    chosen =
                      selection?.type === "edge" &&
                      selection.l === k &&
                      selection.j === j &&
                      selection.i === i;
                  return (
                    <g
                      key={`${k}-${j}-${i}`}
                      className="edge"
                      role="button"
                      aria-label={`연결 ${k}-${i}-${j}`}
                      tabIndex={0}
                      onKeyDown={(e) =>
                        e.key === "Enter" &&
                        select({ type: "edge", l: k, j, i })
                      }
                      onClick={() => select({ type: "edge", l: k, j, i })}
                    >
                      <title>{`w=${w.toFixed(4)} · 기여=${(l.enabled[j][i] ? w * f.a[k][i] : 0).toFixed(4)} · ∂L/∂w=${gradient?.w[k]?.[j]?.[i]?.toFixed(5) ?? "—"}`}</title>
                      <line
                        x1={a.x}
                        y1={a.y}
                        x2={b.x}
                        y2={b.y}
                        stroke={
                          chosen
                            ? "#fff"
                            : !l.enabled[j][i]
                              ? "#536056"
                              : w >= 0
                                ? "#a6c976"
                                : "#aa87cc"
                        }
                        strokeWidth={
                          chosen ? 3 : Math.min(4, 0.5 + Math.abs(w))
                        }
                        strokeOpacity={l.enabled[j][i] ? 0.65 : 0.25}
                        strokeDasharray={l.enabled[j][i] ? undefined : "4 5"}
                      />
                      <line
                        x1={a.x}
                        y1={a.y}
                        x2={b.x}
                        y2={b.y}
                        stroke="transparent"
                        strokeWidth="13"
                      />
                    </g>
                  );
                }),
              ),
            )}
            {sizes.map((n, l) => (
              <g key={l}>
                <text
                  x={pos(l, 0).x}
                  y="27"
                  textAnchor="middle"
                  fill="#93a196"
                  fontSize="11"
                >
                  {l === 0
                    ? "INPUT"
                    : l === sizes.length - 1
                      ? "OUTPUT"
                      : `HIDDEN ${l}`}
                </text>
                {Array.from({ length: n }, (_, j) => {
                  const p = pos(l, j),
                    value = f.a[l][j],
                    chosen =
                      selection?.type === "node" &&
                      selection.l === l - 1 &&
                      selection.j === j;
                  return (
                    <g
                      key={j}
                      role="button"
                      tabIndex={l ? 0 : -1}
                      aria-label={`뉴런 ${l}-${j}`}
                      onKeyDown={(e) =>
                        l &&
                        e.key === "Enter" &&
                        select({ type: "node", l: l - 1, j })
                      }
                      onClick={() => l && select({ type: "node", l: l - 1, j })}
                      className="neuron"
                    >
                      <title>
                        {l
                          ? `z=${f.z[l - 1][j].toFixed(4)} · a=${value.toFixed(4)} · b=${model.layers[l - 1].b[j].toFixed(4)}`
                          : `입력 ${input}`}
                      </title>
                      <circle
                        cx={p.x}
                        cy={p.y}
                        r="18"
                        fill={value >= 0 ? "#273b26" : "#352b43"}
                        stroke={
                          chosen
                            ? "#fff"
                            : playing && phase === l
                              ? "#efcf91"
                              : value >= 0
                                ? "#a9cf7c"
                                : "#b293db"
                        }
                        strokeWidth={playing && phase === l ? 3 : 1.3}
                      />
                      <text
                        x={p.x}
                        y={p.y + 4}
                        textAnchor="middle"
                        fill="#eef3e9"
                        fontSize="10"
                        fontFamily="monospace"
                      >
                        {value.toFixed(2)}
                      </text>
                    </g>
                  );
                })}
                <text
                  x={pos(l, 0).x}
                  y={H - 16}
                  textAnchor="middle"
                  fill="#708477"
                  fontSize="10"
                >
                  {l === 0 ? "x" : model.layers[l - 1].activation}
                </text>
              </g>
            ))}
          </g>
        </svg>
      </div>
      <div className="plot-caption">
        <span>
          <i className="dot lime" />
          양수 <i className="dot purple" />
          음수 <span className="dashed">┄</span> 비활성
        </span>
        <span>뉴런·연결을 클릭해 편집</span>
      </div>
    </section>
  );
}

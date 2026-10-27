import {
  memo,
  useMemo,
  useRef,
  useState,
  type PointerEvent,
  type RefObject,
} from "react";
import { forward, type Model, type Gradients } from "./engine";
import { palette } from "./theme";
import { Icon, useElementSize } from "./ui";
export type Selection =
  | { type: "edge"; l: number; j: number; i: number }
  | { type: "node"; l: number; j: number }
  | null;
export const Network = memo(function Network({
  model,
  input,
  input2,
  selection,
  select,
  gradient,
  playing,
  phase,
  expanded,
  onExpand,
  exportRef,
}: {
  model: Model;
  input: number;
  input2: number;
  selection: Selection;
  select: (s: Selection) => void;
  gradient?: Gradients;
  playing: boolean;
  phase: number;
  expanded: boolean;
  onExpand: () => void;
  exportRef: RefObject<SVGSVGElement | null>;
}) {
  const [view, setView] = useState({ zoom: 1, x: 0, y: 0 }),
    { ref, width, height } = useElementSize(),
    W = Math.max(300, width),
    H = Math.max(220, height),
    svg = useRef<SVGSVGElement>(null);
  const pointers = useRef(new Map<number, { x: number; y: number }>()),
    gesture = useRef<{
      start: { x: number; y: number };
      view: typeof view;
      object: Selection;
      moved: boolean;
    } | null>(null),
    pinch = useRef<{
      distance: number;
      mid: { x: number; y: number };
      view: typeof view;
    } | null>(null);
  const f = useMemo(
      () =>
        forward(
          model,
          model.task === "classification" ? [input, input2] : input,
        ),
      [model, input, input2],
    ),
    sizes = [
      model.task === "classification" ? 2 : 1,
      ...model.layers.map((l) => l.b.length),
    ],
    worldW = Math.max(W, (sizes.length - 1) * 120 + 100),
    worldH = Math.max(H, (Math.max(...sizes) - 1) * 60 + 120),
    fitScale = Math.min(W / worldW, H / worldH),
    radius = 20,
    showValues = fitScale * view.zoom >= 0.8;
  const pos = (l: number, j: number) => ({
    x: 50 + (l * (worldW - 100)) / (sizes.length - 1),
    y: worldH / 2 + (j - (sizes[l] - 1) / 2) * 60,
  });
  const local = (e: PointerEvent<SVGSVGElement>) => {
    const p = e.currentTarget.createSVGPoint();
    p.x = e.clientX;
    p.y = e.clientY;
    return p.matrixTransform(e.currentTarget.getScreenCTM()!.inverse());
  };
  const zoom = (factor: number) =>
    setView((v) => ({
      ...v,
      zoom: Math.max(0.4, Math.min(5, v.zoom * factor)),
    }));
  function down(e: PointerEvent<SVGSVGElement>) {
    if (e.button !== 0) return;
    const p = local(e);
    pointers.current.set(e.pointerId, p);
    e.currentTarget.setPointerCapture(e.pointerId);
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      pinch.current = {
        distance: Math.hypot(a.x - b.x, a.y - b.y),
        mid: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 },
        view,
      };
      gesture.current = null;
      return;
    }
    if (pointers.current.size > 2) return;
    const token = (e.target as Element)
        .closest("[data-object]")
        ?.getAttribute("data-object"),
      parts = token?.split("-");
    const object: Selection =
      parts?.[0] === "n"
        ? { type: "node", l: +parts[1], j: +parts[2] }
        : parts?.[0] === "e"
          ? { type: "edge", l: +parts[1], j: +parts[2], i: +parts[3] }
          : null;
    gesture.current = { start: p, view, object, moved: false };
  }
  function move(e: PointerEvent<SVGSVGElement>) {
    const p = local(e);
    if (pointers.current.has(e.pointerId)) pointers.current.set(e.pointerId, p);
    if (pointers.current.size >= 2 && pinch.current) {
      const [a, b] = [...pointers.current.values()],
        base = pinch.current;
      setView({
        zoom: Math.max(
          0.4,
          Math.min(
            5,
            (base.view.zoom * Math.hypot(a.x - b.x, a.y - b.y)) /
              Math.max(1, base.distance),
          ),
        ),
        x: base.view.x + (a.x + b.x) / 2 - base.mid.x,
        y: base.view.y + (a.y + b.y) / 2 - base.mid.y,
      });
      return;
    }
    const g = gesture.current;
    if (!g) return;
    g.moved ||= Math.hypot(p.x - g.start.x, p.y - g.start.y) > 5;
    if (g.moved)
      setView({
        ...g.view,
        x: g.view.x + p.x - g.start.x,
        y: g.view.y + p.y - g.start.y,
      });
  }
  function up(e: PointerEvent<SVGSVGElement>) {
    if (e.currentTarget.hasPointerCapture(e.pointerId))
      e.currentTarget.releasePointerCapture(e.pointerId);
    pointers.current.delete(e.pointerId);
    if (pinch.current) {
      if (!pointers.current.size) pinch.current = null;
      gesture.current = null;
      return;
    }
    const g = gesture.current;
    if (g && !g.moved && g.object) select(g.object);
    gesture.current = null;
  }
  return (
    <section className="network-panel" aria-label="신경망">
      <div className="network-toolbar" role="toolbar" aria-label="신경망 도구">
        <span className="count" aria-label="층 구조">
          {sizes.join(" → ")}
        </span>
        <div className="tool-group tool-end">
          <button
            className="tool"
            aria-label="신경망 축소"
            title="축소"
            onClick={() => zoom(1 / 1.2)}
          >
            <Icon name="minus" />
          </button>
          <button
            className="tool"
            aria-label="신경망 확대"
            title="확대"
            onClick={() => zoom(1.2)}
          >
            <Icon name="plus" />
          </button>
          <button
            className="tool"
            aria-label="신경망 화면 맞춤"
            title="화면 맞춤"
            onPointerUp={(e) => {
              if (e.pointerType === "touch") setView({ zoom: 1, x: 0, y: 0 });
            }}
            onClick={() => setView({ zoom: 1, x: 0, y: 0 })}
          >
            <Icon name="fit" />
          </button>
          <button
            className="tool"
            aria-label={expanded ? "신경망 확대 보기 닫기" : "신경망 확대 보기"}
            title={expanded ? "확대 보기 닫기" : "확대 보기"}
            aria-pressed={expanded}
            onClick={onExpand}
          >
            <Icon name={expanded ? "collapse" : "expand"} />
          </button>
        </div>
      </div>
      <div className="scene network-scene" ref={ref}>
        <svg
          ref={(node) => {
            svg.current = node;
            exportRef.current = node;
          }}
          data-testid="network"
          data-zoom={view.zoom}
          data-world-height={worldH}
          data-node-spacing="60"
          viewBox={`0 0 ${W} ${H}`}
          aria-label="신경망 구조"
          onWheel={(e) => zoom(e.deltaY > 0 ? 0.9 : 1.1)}
          onPointerDown={down}
          onPointerMove={move}
          onPointerUp={up}
          onPointerCancel={(e) => {
            pointers.current.delete(e.pointerId);
            gesture.current = null;
            pinch.current = null;
          }}
        >
          <rect
            width={W}
            height={H}
            fill={palette.paper}
            pointerEvents="none"
          />
          <g
            transform={`translate(${W / 2 + view.x} ${H / 2 + view.y}) scale(${view.zoom * fitScale}) translate(${-worldW / 2} ${-worldH / 2})`}
            data-testid="network-transform"
          >
            {model.layers.map((layer, l) =>
              layer.w.map((row, j) =>
                row.map((w, i) => {
                  const a = pos(l, i),
                    b = pos(l + 1, j),
                    enabled = layer.enabled[j][i],
                    chosen =
                      selection?.type === "edge" &&
                      selection.l === l &&
                      selection.j === j &&
                      selection.i === i;
                  return (
                    <g
                      key={`${l}-${j}-${i}`}
                      data-object={`e-${l}-${j}-${i}`}
                      className={`edge ${chosen ? "selected" : ""}`}
                      role="button"
                      aria-label={`연결 ${l}-${i}-${j}`}
                      aria-pressed={chosen}
                      tabIndex={0}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          select({ type: "edge", l, j, i });
                        }
                      }}
                    >
                      <title>{`가중치 ${w.toFixed(5)} · 기여 ${(enabled ? w * f.a[l][i] : 0).toFixed(5)} · 기울기 ${gradient?.w[l]?.[j]?.[i]?.toFixed(6) ?? "없음"} · ${enabled ? "활성" : "비활성"}`}</title>
                      <line
                        x1={a.x}
                        y1={a.y}
                        x2={b.x}
                        y2={b.y}
                        stroke={
                          chosen
                            ? palette.ink
                            : !enabled
                              ? palette.disabled
                              : w >= 0
                                ? palette.sageDeep
                                : palette.rose
                        }
                        strokeOpacity={chosen ? 1 : enabled ? 0.6 : 0.7}
                        strokeWidth={
                          chosen ? 3 : Math.min(3.5, 0.6 + Math.abs(w))
                        }
                        strokeDasharray={
                          !enabled ? "3 6" : w < 0 ? "9 3" : undefined
                        }
                      />
                      <line
                        x1={a.x}
                        y1={a.y}
                        x2={b.x}
                        y2={b.y}
                        stroke="transparent"
                        strokeWidth="18"
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
                  y="20"
                  textAnchor="middle"
                  fill={palette.muted}
                  fontSize="11"
                >
                  {l === 0
                    ? "입력"
                    : l === sizes.length - 1
                      ? "출력"
                      : `은닉 ${l}`}
                </text>
                {Array.from({ length: n }, (_, j) => {
                  const p = pos(l, j),
                    a = f.a[l][j],
                    chosen =
                      selection?.type === "node" &&
                      selection.l === l - 1 &&
                      selection.j === j;
                  return (
                    <g
                      key={j}
                      data-object={l ? `n-${l - 1}-${j}` : undefined}
                      className={`neuron ${chosen ? "selected" : ""}`}
                      role={l ? "button" : undefined}
                      tabIndex={l ? 0 : undefined}
                      aria-label={l ? `뉴런 ${l}-${j}` : "입력 뉴런"}
                      aria-pressed={l ? chosen : undefined}
                      onKeyDown={(e) => {
                        if (l && (e.key === "Enter" || e.key === " ")) {
                          e.preventDefault();
                          select({ type: "node", l: l - 1, j });
                        }
                      }}
                    >
                      <title>
                        {l
                          ? `가중합 ${f.z[l - 1][j].toFixed(5)} · 활성화 ${a.toFixed(5)} · 편향 ${model.layers[l - 1].b[j].toFixed(5)}`
                          : `입력 ${f.a[0][j].toFixed(5)}`}
                      </title>
                      <circle
                        cx={p.x}
                        cy={p.y}
                        r={Math.max(22, radius)}
                        fill="transparent"
                      />
                      <circle
                        cx={p.x}
                        cy={p.y}
                        r={radius}
                        fill={
                          chosen ? palette.pink : a >= 0 ? "#EEF3EA" : "#FBF3F6"
                        }
                        stroke={
                          chosen
                            ? palette.ink
                            : a >= 0
                              ? palette.sageDeep
                              : palette.rose
                        }
                        strokeWidth={chosen ? 3 : 1.75}
                      />
                      {playing && phase === l && (
                        <circle
                          cx={p.x}
                          cy={p.y}
                          r={radius + 5}
                          fill="none"
                          stroke={palette.sage}
                          strokeWidth="3"
                          pointerEvents="none"
                        />
                      )}
                      <text
                        x={p.x}
                        y={p.y + 3.5}
                        fill={palette.ink}
                        fontSize={radius < 14 ? "8" : "10"}
                        textAnchor="middle"
                        fontFamily="ui-monospace,monospace"
                        pointerEvents="none"
                        visibility={
                          fitScale * view.zoom < 0.5 && !chosen
                            ? "hidden"
                            : "visible"
                        }
                      >
                        {l === 0
                          ? model.task === "classification"
                            ? `x${j + 1}`
                            : "x"
                          : chosen && showValues
                            ? a.toFixed(2)
                            : `${j + 1}`}
                      </text>
                    </g>
                  );
                })}
                <text
                  x={pos(l, 0).x}
                  y={worldH - 20}
                  fill={palette.muted}
                  fontSize="11"
                  textAnchor="middle"
                >
                  {l === 0
                    ? model.task === "classification"
                      ? "x₁, x₂"
                      : "x"
                    : model.layers[l - 1].activation}
                </text>
              </g>
            ))}
          </g>
        </svg>
      </div>
      <div className="plot-footer">
        <div className="legend">
          <span>
            <i className="line positive" />+
          </span>
          <span>
            <i className="line negative" />−
          </span>
          <span>
            <i className="line disabled" />
            비활성
          </span>
        </div>
        <span className="coordinate-hint">{Math.round(view.zoom * 100)}%</span>
      </div>
    </section>
  );
});

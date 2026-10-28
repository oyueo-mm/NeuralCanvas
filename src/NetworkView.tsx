import {
  memo,
  useMemo,
  useRef,
  useState,
  type PointerEvent,
  type ReactNode,
  type RefObject,
} from "react";
import { forward, type Gradients, type Model } from "./engine";
import { palette } from "./theme";
import { Icon, useElementSize } from "./ui";
export type Selection =
  | { type: "edge"; l: number; j: number; i: number }
  | { type: "node"; l: number; j: number }
  | null;
export type EdgeMode = "all" | "major" | "focus";
export type ValueMode = "index" | "activation" | "bias";
const layerGap = 150,
  spacing = 56,
  padX = 80,
  padY = 76,
  radius = 17;
type View = { zoom: number; x: number; y: number };
const home: View = { zoom: 1, x: 0, y: 0 };
/**
 * Full-canvas network. The world has a fixed layout (layers evenly spaced, neurons evenly
 * spaced, margins for labels) and the default view is derived from the canvas size, so
 * a resize can never leave neurons outside the canvas until the person pans or zooms.
 */
export const NetworkView = memo(function NetworkView({
  model,
  input,
  input2,
  selection,
  select,
  gradient,
  playing,
  phase,
  exportRef,
  edgeMode,
  setEdgeMode,
  valueMode,
  setValueMode,
  extra,
}: {
  model: Model;
  input: number;
  input2: number;
  selection: Selection;
  select: (s: Selection) => void;
  gradient?: Gradients;
  playing: boolean;
  phase: number;
  exportRef: RefObject<SVGSVGElement | null>;
  edgeMode: EdgeMode;
  setEdgeMode: (m: EdgeMode) => void;
  valueMode: ValueMode;
  setValueMode: (m: ValueMode) => void;
  extra?: ReactNode;
}) {
  const [view, setView] = useState<View>(home),
    [hover, setHover] = useState<{ l: number; j: number } | null>(null),
    { ref, width, height } = useElementSize(),
    W = Math.max(280, width),
    H = Math.max(200, height);
  const pointers = useRef(new Map<number, { x: number; y: number }>()),
    gesture = useRef<{
      start: { x: number; y: number };
      view: View;
      object: Selection;
      moved: boolean;
    } | null>(null),
    pinch = useRef<{
      distance: number;
      mid: { x: number; y: number };
      view: View;
    } | null>(null);
  const f = useMemo(
      () =>
        forward(
          model,
          model.task === "classification" ? [input, input2] : input,
        ),
      [model, input, input2],
    ),
    sizes = useMemo(
      () => [
        model.task === "classification" ? 2 : 1,
        ...model.layers.map((l) => l.b.length),
      ],
      [model],
    ),
    worldW = (sizes.length - 1) * layerGap + 2 * padX,
    worldH = (Math.max(...sizes) - 1) * spacing + 2 * padY,
    fit = Math.min(W / worldW, H / worldH, 1.8),
    scale = fit * view.zoom,
    maxAbs = useMemo(
      () =>
        Math.max(
          1e-9,
          ...model.layers.flatMap((l) =>
            l.w.flatMap((row, j) =>
              row.map((w, i) => (l.enabled[j][i] ? Math.abs(w) : 0)),
            ),
          ),
        ),
      [model],
    );
  const pos = (l: number, j: number) => ({
    x: padX + l * layerGap,
    y: worldH / 2 + (j - (sizes[l] - 1) / 2) * spacing,
  });
  // Neuron whose connections are emphasized: hover wins over the selection.
  const focus =
    hover ??
    (selection?.type === "node"
      ? { l: selection.l + 1, j: selection.j }
      : null);
  const local = (e: PointerEvent<SVGSVGElement>) => {
    const p = e.currentTarget.createSVGPoint();
    p.x = e.clientX;
    p.y = e.clientY;
    return p.matrixTransform(e.currentTarget.getScreenCTM()!.inverse());
  };
  const zoom = (factor: number) =>
    setView((v) => ({ ...v, zoom: Math.max(0.3, Math.min(6, v.zoom * factor)) }));
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
          0.3,
          Math.min(
            6,
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
    if (g && !g.moved) select(g.object);
    gesture.current = null;
  }
  const edgeStyle = (
    l: number,
    j: number,
    i: number,
    w: number,
    enabled: boolean,
  ) => {
    const strength = Math.abs(w) / maxAbs,
      chosen =
        selection?.type === "edge" &&
        selection.l === l &&
        selection.j === j &&
        selection.i === i,
      related =
        focus !== null &&
        ((focus.l === l + 1 && focus.j === j) ||
          (focus.l === l && focus.j === i));
    const major = strength >= 0.35;
    let emphasis = 1;
    if (edgeMode === "major" && !major) emphasis = 0.22;
    if (edgeMode === "focus")
      emphasis = focus || selection?.type === "edge" ? 0.1 : major ? 1 : 0.22;
    if (related || chosen) emphasis = 1;
    return {
      chosen,
      color: chosen
        ? palette.ink
        : !enabled
          ? palette.disabled
          : w >= 0
            ? palette.sageDeep
            : palette.rose,
      opacity: chosen
        ? 1
        : (enabled ? 0.16 + 0.62 * strength : 0.5) * emphasis +
          (related ? 0.2 : 0),
      width: chosen ? 3.6 : (0.7 + 2.6 * strength) * (related ? 1.4 : 1),
    };
  };
  const showText = scale >= 0.55;
  return (
    <section className="network-view" aria-label="신경망">
      <div className="network-toolbar" role="toolbar" aria-label="신경망 도구">
        <span className="count" aria-label="층 구조">
          {sizes.join(" → ")}
        </span>
        <div className="segmented" role="group" aria-label="연결 표시">
          {(
            [
              ["all", "전체 연결"],
              ["major", "주요 연결"],
              ["focus", "선택 중심"],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              aria-pressed={edgeMode === id}
              title={
                id === "major"
                  ? "가중치 절댓값이 큰 연결을 강조합니다. 나머지 연결도 그대로 계산에 쓰입니다"
                  : undefined
              }
              onClick={() => setEdgeMode(id)}
            >
              {label}
            </button>
          ))}
        </div>
        <label className="field inline-field">
          <span>값 표시</span>
          <select
            aria-label="뉴런 값 표시"
            value={valueMode}
            onChange={(e) => setValueMode(e.target.value as ValueMode)}
          >
            <option value="index">번호</option>
            <option value="activation">활성화</option>
            <option value="bias">편향</option>
          </select>
        </label>
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
              if (e.pointerType === "touch") setView(home);
            }}
            onClick={() => setView(home)}
          >
            <Icon name="fit" />
          </button>
          {extra}
        </div>
      </div>
      <div className="scene network-scene" ref={ref}>
        <svg
          ref={(node) => {
            exportRef.current = node;
          }}
          data-testid="network"
          data-zoom={view.zoom}
          data-fit={fit.toFixed(3)}
          data-world-height={worldH}
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
          <rect width={W} height={H} fill={palette.white} pointerEvents="none" />
          <g
            transform={`translate(${W / 2 + view.x} ${H / 2 + view.y}) scale(${scale}) translate(${-worldW / 2} ${-worldH / 2})`}
            data-testid="network-transform"
          >
            <g className="nv-edges">
              {model.layers.map((layer, l) =>
                layer.w.map((row, j) =>
                  row.map((w, i) => {
                    const a = pos(l, i),
                      b = pos(l + 1, j),
                      enabled = layer.enabled[j][i],
                      s = edgeStyle(l, j, i, w, enabled);
                    return (
                      <g
                        key={`${l}-${j}-${i}`}
                        data-object={`e-${l}-${j}-${i}`}
                        className="nv-edge"
                        aria-label={`연결 ${l}-${i}-${j}`}
                      >
                        <title>{`가중치 ${w.toFixed(5)} · 기여 ${(enabled ? w * f.a[l][i] : 0).toFixed(5)} · 기울기 ${gradient?.w[l]?.[j]?.[i]?.toFixed(6) ?? "없음"} · ${enabled ? "활성" : "비활성"}`}</title>
                        <line
                          x1={a.x}
                          y1={a.y}
                          x2={b.x}
                          y2={b.y}
                          stroke={s.color}
                          strokeOpacity={Math.min(1, s.opacity)}
                          strokeWidth={s.width}
                          strokeDasharray={!enabled ? "3 6" : undefined}
                          pointerEvents="none"
                        />
                        <line
                          x1={a.x}
                          y1={a.y}
                          x2={b.x}
                          y2={b.y}
                          stroke="transparent"
                          strokeWidth="14"
                        />
                      </g>
                    );
                  }),
                ),
              )}
            </g>
            {sizes.map((n, l) => (
              <g key={l}>
                <text
                  x={pos(l, 0).x}
                  y={padY - 38}
                  textAnchor="middle"
                  fill={palette.muted}
                  fontSize="13"
                  fontWeight="600"
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
                      selection.j === j,
                    level = Math.min(1, Math.abs(a)),
                    label =
                      l === 0
                        ? model.task === "classification"
                          ? `x${j + 1}`
                          : "x"
                        : valueMode === "activation"
                          ? a.toFixed(2)
                          : valueMode === "bias"
                            ? model.layers[l - 1].b[j].toFixed(2)
                            : `${j + 1}`;
                  return (
                    <g
                      key={j}
                      data-object={l ? `n-${l - 1}-${j}` : undefined}
                      className="nv-neuron"
                      role={l ? "button" : undefined}
                      tabIndex={l ? 0 : undefined}
                      aria-label={l ? `뉴런 ${l}-${j}` : "입력 뉴런"}
                      aria-pressed={l ? chosen : undefined}
                      onPointerEnter={(e) =>
                        l && e.pointerType === "mouse" && setHover({ l, j })
                      }
                      onPointerLeave={() => setHover(null)}
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
                      <circle cx={p.x} cy={p.y} r={radius + 5} fill="transparent" />
                      <circle
                        cx={p.x}
                        cy={p.y}
                        r={radius}
                        fill={
                          chosen
                            ? palette.pink
                            : a >= 0
                              ? palette.sage
                              : palette.pink
                        }
                        fillOpacity={chosen ? 1 : 0.18 + 0.62 * level}
                        stroke={
                          chosen
                            ? palette.ink
                            : a >= 0
                              ? palette.sageDeep
                              : palette.rose
                        }
                        strokeWidth={chosen ? 3.4 : 1.8}
                      />
                      {playing && phase === l && (
                        <circle
                          cx={p.x}
                          cy={p.y}
                          r={radius + 6}
                          fill="none"
                          stroke={palette.sage}
                          strokeWidth="3"
                          pointerEvents="none"
                        />
                      )}
                      <text
                        x={p.x}
                        y={p.y + 4}
                        fill={palette.ink}
                        fontSize={label.length > 4 ? 9 : 11}
                        textAnchor="middle"
                        fontFamily="ui-monospace,monospace"
                        pointerEvents="none"
                        visibility={showText || chosen ? "visible" : "hidden"}
                      >
                        {label}
                      </text>
                    </g>
                  );
                })}
                <text
                  x={pos(l, 0).x}
                  y={worldH - padY + 44}
                  fill={palette.muted}
                  fontSize="12"
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

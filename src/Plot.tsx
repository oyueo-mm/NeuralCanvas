import {
  memo,
  useId,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent,
  type RefObject,
} from "react";
import {
  forward,
  type Model,
  type Point,
  type ClassDefinition,
} from "./engine";
import { useBoundary } from "./useBoundary";
import { classStroke, palette } from "./theme";
import { Icon, useElementSize } from "./ui";
type Range = { cx: number; cy: number; span: number };
type Mode = "edit" | "draw" | "pan" | "observe";
type Props = {
  exportRef: RefObject<SVGSVGElement | null>;
  model: Model;
  data: Point[];
  input: number;
  input2: number;
  activeClass: 0 | 1;
  classDefinitions: ClassDefinition[];
  setActiveClass: (c: 0 | 1) => void;
  resolution: number;
  observe: (x: number, y: number) => void;
  change: (p: Point[]) => void;
  selected: number | null;
  select: (i: number | null) => void;
  /** Opens the data editor; pages that edit inline omit it. */
  edit?: () => void;
  validationIndices: Set<number>;
};
// Plot margins leave room for tick labels without wasting canvas.
const padL = 46,
  padR = 26,
  padT = 14,
  padB = 30;
function niceTicks(min: number, max: number, target: number) {
  const raw = (max - min) / Math.max(1, target),
    mag = 10 ** Math.floor(Math.log10(raw)),
    n = raw / mag,
    step = (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * mag,
    ticks: number[] = [];
  for (let v = Math.ceil(min / step - 1e-9) * step; v <= max + 1e-9; v += step)
    ticks.push(Math.abs(v) < step * 1e-6 ? 0 : v);
  return {
    ticks,
    decimals: Math.min(6, Math.max(0, -Math.floor(Math.log10(step)))),
  };
}
const modes: { id: Mode; label: string; icon: string }[] = [
  { id: "edit", label: "점 편집", icon: "cursor" },
  { id: "draw", label: "연속 그리기", icon: "draw" },
  { id: "pan", label: "탐색", icon: "pan" },
];
export const Plot = memo(function Plot({
  model,
  data,
  input,
  input2,
  activeClass,
  classDefinitions: classes,
  setActiveClass,
  resolution,
  observe,
  change,
  selected,
  select,
  edit,
  validationIndices,
  exportRef,
}: Props) {
  const [mode, setMode] = useState<Mode>("edit"),
    [range, setRange] = useState<Range>({ cx: 0, cy: 0, span: 10 }),
    [cursor, setCursor] = useState<Point | null>(null),
    [preview, setPreview] = useState<Point[] | null>(null);
  const { ref, width, height } = useElementSize(),
    W = Math.max(240, width),
    H = Math.max(180, height),
    iw = W - padL - padR,
    ih = H - padT - padB,
    id = useId().replace(/:/g, "");
  const svg = useRef<SVGSVGElement>(null),
    pointers = useRef(new Map<number, { x: number; y: number }>()),
    gesture = useRef<{
      point: number;
      start: { x: number; y: number };
      range: Range;
      data: Point[];
      moved: boolean;
      last: { x: number; y: number };
    } | null>(null),
    pinch = useRef<{
      distance: number;
      mid: { x: number; y: number };
      range: Range;
    } | null>(null),
    draft = useRef<Point[] | null>(null);
  const sx = (x: number) =>
      padL + ((x - range.cx + range.span / 2) / range.span) * iw,
    sy = (y: number) =>
      padT + ih - ((y - range.cy + range.span / 2) / range.span) * ih;
  const local = (e: PointerEvent<SVGSVGElement>) => {
    const p = e.currentTarget.createSVGPoint();
    p.x = e.clientX;
    p.y = e.clientY;
    return p.matrixTransform(e.currentTarget.getScreenCTM()!.inverse());
  };
  const math = (p: { x: number; y: number }, r = range) => ({
    x: r.cx + ((p.x - padL) / iw) * r.span - r.span / 2,
    y: r.cy + ((padT + ih - p.y) / ih) * r.span - r.span / 2,
  });
  const classification = model.task === "classification";
  const boundary = useBoundary(
    model,
    range,
    resolution,
    classification,
    classes,
  );
  const visibleBoundary =
    boundary &&
    boundary.grid.range.cx === range.cx &&
    boundary.grid.range.cy === range.cy &&
    boundary.grid.range.span === range.span &&
    boundary.grid.resolution === resolution
      ? boundary
      : null;
  const path = useMemo(
    () =>
      classification
        ? ""
        : Array.from({ length: 241 }, (_, i) => {
            const x = range.cx - range.span / 2 + (range.span * i) / 240,
              y = forward(model, x).y;
            const px = padL + (i / 240) * iw,
              py =
                padT + ih - ((y - range.cy + range.span / 2) / range.span) * ih;
            return `${i ? "L" : "M"}${px},${Math.max(-10000, Math.min(10000, py))}`;
          }).join(" "),
    [model, range, iw, ih, classification],
  );
  const xTicks = niceTicks(
      range.cx - range.span / 2,
      range.cx + range.span / 2,
      Math.max(3, Math.min(12, Math.round(iw / 90))),
    ),
    yTicks = niceTicks(
      range.cy - range.span / 2,
      range.cy + range.span / 2,
      Math.max(3, Math.min(10, Math.round(ih / 60))),
    ),
    shown = preview ?? data,
    radius = Math.max(4, Math.min(6.5, 3.4 + Math.min(W, H) / 220));
  function fit() {
    const xs = data.map((p) => p.x),
      ys = data.map((p) => p.y);
    if (!data.length) {
      setRange({ cx: 0, cy: 0, span: 10 });
      return;
    }
    setRange({
      cx: (Math.min(...xs) + Math.max(...xs)) / 2,
      cy: (Math.min(...ys) + Math.max(...ys)) / 2,
      span:
        Math.max(
          2,
          Math.max(...xs) - Math.min(...xs),
          Math.max(...ys) - Math.min(...ys),
        ) * 1.25,
    });
  }
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
        range,
      };
      gesture.current = null;
      draft.current = null;
      setPreview(null);
      return;
    }
    if (pointers.current.size > 2) return;
    draft.current = null;
    let point = -1,
      best = e.pointerType === "touch" ? 24 : 13;
    data.forEach((v, j) => {
      const distance = Math.hypot(sx(v.x) - p.x, sy(v.y) - p.y);
      if (distance < best) {
        point = j;
        best = distance;
      }
    });
    gesture.current = {
      point:
        mode === "pan"
          ? -2
          : mode === "draw"
            ? -3
            : mode === "observe"
              ? -4
              : point,
      start: p,
      range,
      data,
      moved: false,
      last: p,
    };
    if (mode === "draw" && data.length < 2000) {
      const position = math(p);
      draft.current = [
        ...data,
        { ...position, ...(classification ? { label: activeClass } : {}) },
      ];
      setPreview(draft.current);
    }
    if (mode === "observe") {
      const position = math(p);
      observe(position.x, position.y);
    }
  }
  function move(e: PointerEvent<SVGSVGElement>) {
    const p = local(e);
    if (pointers.current.has(e.pointerId)) pointers.current.set(e.pointerId, p);
    if (pointers.current.size >= 2 && pinch.current) {
      const [a, b] = [...pointers.current.values()],
        base = pinch.current,
        d = Math.max(1, Math.hypot(a.x - b.x, a.y - b.y));
      setRange({
        cx:
          base.range.cx -
          (((a.x + b.x) / 2 - base.mid.x) / iw) * base.range.span,
        cy:
          base.range.cy +
          (((a.y + b.y) / 2 - base.mid.y) / ih) * base.range.span,
        span: Math.max(
          0.1,
          Math.min(2000, (base.range.span * base.distance) / d),
        ),
      });
      return;
    }
    const g = gesture.current;
    if (!g) {
      if (e.pointerType !== "touch") setCursor(math(p));
      return;
    }
    g.moved ||= Math.hypot(p.x - g.start.x, p.y - g.start.y) > 5;
    if (g.point === -2) {
      setRange({
        ...g.range,
        cx: g.range.cx - ((p.x - g.start.x) / iw) * g.range.span,
        cy: g.range.cy + ((p.y - g.start.y) / ih) * g.range.span,
      });
    } else if (
      g.point === -3 &&
      Math.hypot(p.x - g.last.x, p.y - g.last.y) >=
        (e.pointerType === "touch" ? 14 : 10)
    ) {
      if (
        (draft.current?.length ?? data.length) < 2000 &&
        p.x >= padL &&
        p.x <= W - padR &&
        p.y >= padT &&
        p.y <= H - padB
      ) {
        const position = math(p, g.range);
        draft.current = [
          ...(draft.current ?? data),
          { ...position, ...(classification ? { label: activeClass } : {}) },
        ];
        g.last = p;
        setPreview(draft.current);
      }
    } else if (g.point === -4) {
      const position = math(p);
      observe(position.x, position.y);
    } else if (g.point >= 0 && g.moved) {
      const next = [...g.data],
        position = math(p, g.range);
      next[g.point] = {
        ...next[g.point],
        x: Math.max(-1000, Math.min(1000, position.x)),
        y: Math.max(-1000, Math.min(1000, position.y)),
      };
      draft.current = next;
      setPreview(next);
    }
  }
  function up(e: PointerEvent<SVGSVGElement>) {
    if (e.currentTarget.hasPointerCapture(e.pointerId))
      e.currentTarget.releasePointerCapture(e.pointerId);
    pointers.current.delete(e.pointerId);
    if (pinch.current) {
      if (pointers.current.size === 0) pinch.current = null;
      gesture.current = null;
      return;
    }
    const g = gesture.current;
    if (g && g.point !== -2 && g.point !== -4) {
      if (draft.current) {
        change(draft.current);
        select(g.point >= 0 ? g.point : draft.current.length - 1);
      } else if (g.point >= 0) {
        select(g.point);
        if (classification) observe(data[g.point].x, data[g.point].y);
        svg.current?.focus({ preventScroll: true });
        edit?.();
      } else if (!g.moved && data.length < 2000) {
        const p = math(local(e));
        change([
          ...data,
          { ...p, ...(classification ? { label: activeClass } : {}) },
        ]);
        select(data.length);
      }
    }
    gesture.current = null;
    draft.current = null;
    setPreview(null);
  }
  const zoomBy = (factor: number) =>
    setRange({
      ...range,
      span: Math.max(0.1, Math.min(2000, range.span * factor)),
    });
  const probe = classification ? forward(model, [input, input2]).y : 0;
  const modeButtons = classification
    ? [...modes, { id: "observe" as const, label: "좌표 관찰", icon: "probe" }]
    : modes;
  return (
    <section className="plot-panel" aria-label="데이터 그래프">
      <div className="plot-toolbar" role="toolbar" aria-label="그래프 도구">
        <div className="tool-group" role="group" aria-label="데이터 조작 모드">
          {modeButtons.map((m) => (
            <button
              key={m.id}
              className="tool"
              aria-label={m.label}
              title={m.label}
              aria-pressed={mode === m.id}
              onClick={() => setMode(m.id)}
            >
              <Icon name={m.icon} />
            </button>
          ))}
        </div>
        {classification && (
          <>
            <div
              className="class-selector"
              role="group"
              aria-label="활성 클래스"
            >
              {classes.map((c) => (
                <button
                  key={c.id}
                  aria-pressed={activeClass === c.id}
                  onClick={() => setActiveClass(c.id)}
                  style={{ "--class-color": c.color } as CSSProperties}
                >
                  <i />
                  {c.name}
                </button>
              ))}
            </div>
          </>
        )}
        <span className="count" aria-label="데이터 개수">
          {data.length}
        </span>
        <div className="tool-group tool-end">
          <button
            className="tool"
            aria-label="데이터 축소"
            title="축소"
            onClick={() => zoomBy(1.25)}
          >
            <Icon name="minus" />
          </button>
          <button
            className="tool"
            aria-label="데이터 확대"
            title="확대"
            onClick={() => zoomBy(1 / 1.25)}
          >
            <Icon name="plus" />
          </button>
          <button
            className="tool"
            aria-label="데이터 화면 맞춤"
            title="화면 맞춤"
            onPointerUp={(e) => {
              if (e.pointerType === "touch") fit();
            }}
            onClick={fit}
          >
            <Icon name="fit" />
          </button>
          {edit && (
            <button
              className="tool edit-data"
              aria-label="편집 도구 열기"
              title="편집 도구 열기"
              onClick={edit}
              onPointerUp={(e) => {
                if (e.pointerType === "touch") edit();
              }}
            >
              <Icon name="edit" />
            </button>
          )}
        </div>
      </div>
      <div ref={ref} className="scene">
        <svg
          ref={(node) => {
            svg.current = node;
            exportRef.current = node;
          }}
          data-testid="data-plot"
          data-span={range.span}
          viewBox={`0 0 ${W} ${H}`}
          role="img"
          tabIndex={0}
          aria-label={
            classification
              ? "분류 데이터와 결정 경계"
              : "데이터와 신경망 예측 곡선"
          }
          data-boundary-updates={boundary?.updates ?? 0}
          data-boundary-ms={boundary?.grid.milliseconds ?? 0}
          data-boundary-paint-ms={boundary?.paintMilliseconds ?? 0}
          className={`data-plot ${mode}`}
          onPointerDown={down}
          onDragStart={(e) => e.preventDefault()}
          onPointerMove={move}
          onPointerUp={up}
          onPointerCancel={(e) => {
            pointers.current.delete(e.pointerId);
            gesture.current = null;
            draft.current = null;
            pinch.current = null;
            setPreview(null);
          }}
          onPointerLeave={() => setCursor(null)}
          onWheel={(e) => zoomBy(e.deltaY > 0 ? 1.1 : 0.9)}
        >
          <defs>
            <clipPath id={id}>
              <rect x={padL} y={padT} width={iw} height={ih} />
            </clipPath>
          </defs>
          <rect width={W} height={H} fill={palette.white} />
          {classification && visibleBoundary && (
            <image
              pointerEvents="none"
              data-testid="decision-boundary"
              href={visibleBoundary.image}
              x={padL}
              y={padT}
              width={iw}
              height={ih}
              preserveAspectRatio="none"
            />
          )}
          {xTicks.ticks.map((x) => (
            <g key={x}>
              <line
                x1={sx(x)}
                x2={sx(x)}
                y1={padT}
                y2={padT + ih}
                stroke={palette.grid}
              />
              <text
                x={sx(x)}
                y={H - 10}
                textAnchor="middle"
                fill={palette.muted}
                fontSize="12"
              >
                {x.toFixed(xTicks.decimals)}
              </text>
            </g>
          ))}
          {yTicks.ticks.map((y) => (
            <g key={y}>
              <line
                x1={padL}
                x2={padL + iw}
                y1={sy(y)}
                y2={sy(y)}
                stroke={palette.grid}
              />
              <text
                x={padL - 8}
                y={sy(y) + 4}
                textAnchor="end"
                fill={palette.muted}
                fontSize="12"
              >
                {y.toFixed(yTicks.decimals)}
              </text>
            </g>
          ))}
          <g clipPath={`url(#${id})`}>
            <line
              x1={sx(0)}
              x2={sx(0)}
              y1={padT}
              y2={padT + ih}
              stroke={palette.axis}
              strokeWidth="1.5"
            />
            <line
              x1={padL}
              x2={padL + iw}
              y1={sy(0)}
              y2={sy(0)}
              stroke={palette.axis}
              strokeWidth="1.5"
            />
            {!classification && (
              <path
                data-testid="prediction"
                d={path}
                fill="none"
                stroke={palette.sageDeep}
                strokeWidth="2.75"
                strokeLinejoin="round"
              />
            )}
            {classification && visibleBoundary && (
              <path
                data-testid="boundary-contour"
                d={visibleBoundary.contour
                  .map(
                    ([x, y, u, v]) =>
                      `M${padL + x * iw},${padT + y * ih}L${padL + u * iw},${padT + v * ih}`,
                  )
                  .join(" ")}
                stroke={palette.ink}
                strokeWidth="1.75"
                strokeDasharray="5 3"
                fill="none"
              />
            )}
            {shown.map((p, i) => {
              const validation = validationIndices.has(i),
                chosen = i === selected;
              return (
                <g key={i}>
                  {classification && validation && (
                    <circle
                      cx={sx(p.x)}
                      cy={sy(p.y)}
                      r={radius + 3.4}
                      fill="none"
                      stroke={palette.ink}
                      strokeWidth="1.5"
                      strokeDasharray="2.5 2"
                      pointerEvents="none"
                    />
                  )}
                  <circle
                    data-testid="data-point"
                    data-validation={validation}
                    data-class={p.label}
                    cx={sx(p.x)}
                    cy={sy(p.y)}
                    r={chosen ? radius + 1.7 : radius}
                    fill={
                      classification
                        ? classes[p.label ?? 0].color
                        : validation
                          ? palette.pink
                          : palette.sage
                    }
                    stroke={
                      chosen
                        ? palette.ink
                        : classification
                          ? classStroke[p.label ?? 0]
                          : validation
                            ? palette.rose
                            : palette.sageDeep
                    }
                    strokeWidth={chosen ? 2.75 : validation ? 2 : 1.5}
                  >
                    <title>
                      {i + 1}: ({p.x.toFixed(4)}, {p.y.toFixed(4)}) ·{" "}
                      {classification ? `${classes[p.label ?? 0].name} · ` : ""}
                      {validation ? "검증" : "학습"}
                    </title>
                  </circle>
                </g>
              );
            })}
            {!classification && (
              <line
                x1={sx(input)}
                x2={sx(input)}
                y1={padT}
                y2={padT + ih}
                stroke={palette.ink}
                strokeWidth="1.25"
                strokeDasharray="5 5"
              />
            )}
            <circle
              cx={sx(input)}
              cy={sy(classification ? input2 : forward(model, input).y)}
              r={radius + 1.5}
              fill={palette.ink}
              stroke={palette.white}
              strokeWidth="2"
            />
          </g>
          <text
            x={W - 8}
            y={H - 10}
            textAnchor="end"
            fontSize="12"
            fill={palette.ink}
          >
            {classification ? "x₁" : "x"}
          </text>
          <text x={6} y={12} fontSize="12" fill={palette.ink}>
            {classification ? "x₂" : "y"}
          </text>
        </svg>
      </div>
      <div className="plot-footer">
        {classification ? (
          <div className="legend">
            <span>P(1)</span>
            <i
              className="probability-scale"
              style={{
                background: `linear-gradient(90deg, ${classes[0].color}, ${classes[1].color})`,
              }}
            />
            <span>
              <i className="line contour" />p = 0.5
            </span>
            {validationIndices.size > 0 && (
              <span>
                <i className="dot validation-ring" />
                검증
              </span>
            )}
          </div>
        ) : (
          <div className="legend">
            <span>
              <i className="dot train" />
              학습
            </span>
            {validationIndices.size > 0 && (
              <span>
                <i className="dot validation" />
                검증
              </span>
            )}
            <span>
              <i className="line prediction" />
              예측
            </span>
            <span>
              <i className="line probe" />
              관찰
            </span>
          </div>
        )}
        {classification && mode === "observe" && (
          <span className="probe-readout">
            C{Number(probe >= 0.5)}{" "}
            <strong data-testid="probability">
              {((probe >= 0.5 ? probe : 1 - probe) * 100).toFixed(1)}%
            </strong>
          </span>
        )}
        <span className="coordinate-hint" aria-hidden="true">
          {cursor ? `(${cursor.x.toFixed(2)}, ${cursor.y.toFixed(2)})` : ""}
        </span>
      </div>
    </section>
  );
});

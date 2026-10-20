import {
  memo,
  useId,
  useMemo,
  useRef,
  useState,
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
import { exportSVG } from "./storage";
import { Icon, useElementSize } from "./ui";
type Range = { cx: number; cy: number; span: number };
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
  active: boolean;
  setResolution: (n: number) => void;
  observe: (x: number, y: number) => void;
  change: (p: Point[]) => void;
  selected: number | null;
  select: (i: number | null) => void;
  edit: () => void;
  validationIndices: Set<number>;
};
export const Plot = memo(function Plot({
  model,
  data,
  input,
  input2,
  activeClass,
  classDefinitions: classes,
  setActiveClass,
  resolution,
  setResolution,
  observe,
  active,
  change,
  selected,
  select,
  edit,
  validationIndices,
  exportRef,
}: Props) {
  const [mode, setMode] = useState<"edit" | "draw" | "pan" | "observe">("edit"),
    [range, setRange] = useState<Range>({ cx: 0, cy: 0, span: 10 }),
    [cursor, setCursor] = useState<Point | null>(null),
    [preview, setPreview] = useState<Point[] | null>(null);
  const { ref, width, height } = useElementSize(),
    W = Math.max(280, width),
    H = Math.max(200, height),
    pad = 34,
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
      pad + ((x - range.cx + range.span / 2) / range.span) * (W - 2 * pad),
    sy = (y: number) =>
      H - pad - ((y - range.cy + range.span / 2) / range.span) * (H - 2 * pad);
  const local = (e: PointerEvent<SVGSVGElement>) => {
    const p = e.currentTarget.createSVGPoint();
    p.x = e.clientX;
    p.y = e.clientY;
    return p.matrixTransform(e.currentTarget.getScreenCTM()!.inverse());
  };
  const math = (p: { x: number; y: number }, r = range) => ({
    x: r.cx + ((p.x - pad) / (W - 2 * pad)) * r.span - r.span / 2,
    y: r.cy + ((H - pad - p.y) / (H - 2 * pad)) * r.span - r.span / 2,
  });
  const classification = model.task === "classification";
  const boundary = useBoundary(
    model,
    range,
    resolution,
    classification && active,
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
            const px = pad + (i / 240) * (W - 2 * pad),
              py =
                H -
                pad -
                ((y - range.cy + range.span / 2) / range.span) * (H - 2 * pad);
            return `${i ? "L" : "M"}${px},${Math.max(-10000, Math.min(10000, py))}`;
          }).join(" "),
    [model, range, W, H, classification],
  );
  const ticks = Array.from(
      { length: 6 },
      (_, i) => range.cx - range.span / 2 + (range.span * i) / 5,
    ),
    ys = Array.from(
      { length: 6 },
      (_, i) => range.cy - range.span / 2 + (range.span * i) / 5,
    ),
    shown = preview ?? data;
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
          (((a.x + b.x) / 2 - base.mid.x) / (W - 2 * pad)) * base.range.span,
        cy:
          base.range.cy +
          (((a.y + b.y) / 2 - base.mid.y) / (H - 2 * pad)) * base.range.span,
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
        cx: g.range.cx - ((p.x - g.start.x) / (W - 2 * pad)) * g.range.span,
        cy: g.range.cy + ((p.y - g.start.y) / (H - 2 * pad)) * g.range.span,
      });
    } else if (
      g.point === -3 &&
      Math.hypot(p.x - g.last.x, p.y - g.last.y) >=
        (e.pointerType === "touch" ? 14 : 10)
    ) {
      if (
        (draft.current?.length ?? data.length) < 2000 &&
        p.x >= pad &&
        p.x <= W - pad &&
        p.y >= pad &&
        p.y <= H - pad
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
        edit();
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
  return (
    <section className="visual-panel plot-panel" aria-label="데이터 작업 공간">
      <header className="visual-heading">
        <h2>
          <Icon name="data" />
          {classification ? "데이터와 결정 경계" : "데이터와 예측"}{" "}
          <span className="count">{data.length}개</span>
        </h2>
        <div className="heading-actions">
          <button
            className="icon-button"
            aria-label="데이터 그래프 PNG"
            onClick={() =>
              svg.current && exportSVG(svg.current, "neuralcanvas-plot.png")
            }
          >
            <Icon name="download" />
          </button>
          <button
            className="subtle-button"
            onClick={edit}
            onPointerUp={(e) => {
              if (e.pointerType === "touch") edit();
            }}
          >
            <Icon name="edit" />
            데이터 편집
          </button>
        </div>
      </header>
      <div className="graph-toolbar">
        <div className="segmented" aria-label="데이터 조작 모드">
          <button
            aria-pressed={mode === "edit"}
            className={mode === "edit" ? "active" : ""}
            onClick={() => setMode("edit")}
          >
            <Icon name="edit" />점 편집
          </button>
          <button
            aria-pressed={mode === "draw"}
            className={mode === "draw" ? "active" : ""}
            onClick={() => setMode("draw")}
          >
            연속 그리기
          </button>
          <button
            aria-pressed={mode === "pan"}
            className={mode === "pan" ? "active" : ""}
            onClick={() => setMode("pan")}
          >
            <Icon name="pan" />
            탐색
          </button>
        </div>
        <div className="button-group">
          <button
            className="icon-button"
            aria-label="데이터 축소"
            onClick={() =>
              setRange({ ...range, span: Math.min(2000, range.span * 1.25) })
            }
          >
            <Icon name="minus" />
          </button>
          <button
            className="icon-button"
            aria-label="데이터 확대"
            onClick={() =>
              setRange({ ...range, span: Math.max(0.1, range.span / 1.25) })
            }
          >
            <Icon name="plus" />
          </button>
          <button
            className="icon-button"
            aria-label="데이터 화면 맞춤"
            onPointerUp={(e) => {
              if (e.pointerType === "touch") fit();
            }}
            title="데이터 화면 맞춤"
            onClick={fit}
          >
            <Icon name="fit" />
          </button>
        </div>
      </div>
      {classification && (
        <div className="classification-tools">
          <div className="class-selector" role="group" aria-label="활성 클래스">
            {classes.map((c) => (
              <button
                key={c.id}
                aria-pressed={activeClass === c.id}
                onClick={() => setActiveClass(c.id)}
                style={{ "--class-color": c.color } as React.CSSProperties}
              >
                <i />
                {c.name}
              </button>
            ))}
          </div>
          <button
            className={mode === "observe" ? "selected" : ""}
            aria-pressed={mode === "observe"}
            onClick={() => setMode("observe")}
          >
            좌표 관찰
          </button>
          <label className="resolution-control">
            격자
            <select
              aria-label="결정 경계 해상도"
              value={resolution}
              onChange={(e) => setResolution(+e.target.value)}
            >
              {[24, 48, 72, 96].map((n) => (
                <option key={n} value={n}>
                  {n} × {n}
                </option>
              ))}
            </select>
          </label>
        </div>
      )}
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
          onWheel={(e) =>
            setRange({
              ...range,
              span: Math.max(
                0.1,
                Math.min(2000, range.span * (e.deltaY > 0 ? 1.1 : 0.9)),
              ),
            })
          }
        >
          <defs>
            <clipPath id={id}>
              <rect x={pad} y={pad} width={W - 2 * pad} height={H - 2 * pad} />
            </clipPath>
          </defs>
          <rect width={W} height={H} fill="#ffffff" />
          {classification && visibleBoundary && (
            <image
              pointerEvents="none"
              data-testid="decision-boundary"
              href={visibleBoundary.image}
              x={pad}
              y={pad}
              width={W - 2 * pad}
              height={H - 2 * pad}
              preserveAspectRatio="none"
            />
          )}
          {ticks.map((x, i) => (
            <g key={i}>
              <line
                x1={sx(x)}
                x2={sx(x)}
                y1={pad}
                y2={H - pad}
                stroke="#edf1f5"
              />
              <text
                x={sx(x)}
                y={H - 13}
                textAnchor="middle"
                fill="#64748b"
                fontSize="12"
              >
                {x.toFixed(range.span < 1 ? 2 : 1)}
              </text>
            </g>
          ))}
          {ys.map((y, i) => (
            <g key={i}>
              <line
                x1={pad}
                x2={W - pad}
                y1={sy(y)}
                y2={sy(y)}
                stroke="#edf1f5"
              />
              <text
                x={pad - 8}
                y={sy(y) + 4}
                textAnchor="end"
                fill="#64748b"
                fontSize="12"
              >
                {y.toFixed(range.span < 1 ? 2 : 1)}
              </text>
            </g>
          ))}
          <g clipPath={`url(#${id})`}>
            <line
              x1={sx(0)}
              x2={sx(0)}
              y1={pad}
              y2={H - pad}
              stroke="#cbd5e1"
            />
            <line
              x1={pad}
              x2={W - pad}
              y1={sy(0)}
              y2={sy(0)}
              stroke="#cbd5e1"
            />
            {!classification && (
              <path
                data-testid="prediction"
                d={path}
                fill="none"
                stroke="#2563eb"
                strokeWidth="2.5"
              />
            )}
            {classification && visibleBoundary && (
              <path
                data-testid="boundary-contour"
                d={visibleBoundary.contour
                  .map(
                    ([x, y, u, v]) =>
                      `M${pad + x * (W - 2 * pad)},${pad + y * (H - 2 * pad)}L${pad + u * (W - 2 * pad)},${pad + v * (H - 2 * pad)}`,
                  )
                  .join(" ")}
                stroke="#475569"
                strokeWidth="1.5"
                strokeDasharray="4 3"
                fill="none"
              />
            )}
            {shown.map((p, i) => {
              const validation = validationIndices.has(i);
              return (
                <circle
                  key={i}
                  data-testid="data-point"
                  data-validation={validation}
                  data-class={p.label}
                  cx={sx(p.x)}
                  cy={sy(p.y)}
                  r={i === selected ? 6 : 4.3}
                  fill={
                    classification
                      ? classes[p.label ?? 0].color
                      : validation
                        ? "#fff"
                        : "#0d9488"
                  }
                  stroke={
                    i === selected
                      ? "#0f172a"
                      : classification
                        ? "#fff"
                        : validation
                          ? "#d97706"
                          : "#087f73"
                  }
                  strokeWidth={i === selected ? 2.5 : 1.5}
                >
                  <title>
                    {i + 1}: ({p.x.toFixed(4)}, {p.y.toFixed(4)}) ·{" "}
                    {classification ? `${classes[p.label ?? 0].name} · ` : ""}
                    {validation ? "검증" : "학습"}
                  </title>
                </circle>
              );
            })}
            {!classification && (
              <line
                x1={sx(input)}
                x2={sx(input)}
                y1={pad}
                y2={H - pad}
                stroke="#d97706"
                strokeDasharray="5 5"
              />
            )}
            <circle
              cx={sx(input)}
              cy={sy(classification ? input2 : forward(model, input).y)}
              r="6"
              fill="#d97706"
              stroke="#fff"
              strokeWidth="2"
            />
          </g>
          <text x={W - 15} y={H - 13} fontSize="12" fill="#334155">
            {classification ? "x₁" : "x"}
          </text>
          <text x="13" y="18" fontSize="12" fill="#334155">
            {classification ? "x₂" : "y"}
          </text>
        </svg>
      </div>
      <div className="graph-footer">
        {classification ? (
          <div className="legend boundary-legend">
            <span>P(1)</span>
            <i
              className="probability-scale"
              style={{
                background: `linear-gradient(90deg, ${classes[0].color}33, ${classes[1].color}33)`,
              }}
            />
            <span>0 → 1</span>
            <span>┄ p = 0.5</span>
            <span className="boundary-timing">
              {boundary
                ? `${boundary.grid.milliseconds.toFixed(0)} ms`
                : "계산 중"}
            </span>
          </div>
        ) : (
          <div className="legend">
            <span>
              <i className="dot teal" />
              학습
            </span>
            {validationIndices.size > 0 && (
              <span>
                <i className="dot hollow" />
                검증
              </span>
            )}
            <span>
              <i className="line blue" />
              예측
            </span>
            <span>
              <i className="line amber" />
              관찰
            </span>
          </div>
        )}
        <span className="coordinate-hint">
          {cursor
            ? `(${cursor.x.toFixed(2)}, ${cursor.y.toFixed(2)})`
            : mode === "draw"
              ? "드래그로 추가 · 한 번에 실행 취소"
              : mode === "observe"
                ? "탭·드래그로 확률 관찰"
                : mode === "edit"
                  ? "탭으로 추가 · 점을 눌러 편집"
                  : "드래그 이동 · 두 손가락 확대"}
        </span>
      </div>
    </section>
  );
});

import { memo, useMemo, useRef, useState } from "react";
import type { Point } from "./engine";
import {
  difficulties,
  experimentPresets,
  presetPoints,
  type Difficulty,
  type ExperimentPreset,
} from "./presets";
import { palette, themedClasses } from "./theme";
import { Drawer } from "./ui";
import type { Lab } from "./useLab";
const cache = new Map<string, Point[]>();
const pointsOf = (p: ExperimentPreset) => {
  let points = cache.get(p.id);
  if (!points) cache.set(p.id, (points = presetPoints(p)));
  return points;
};
/** Data distribution only; no trained result is ever drawn here. */
function Scatter({
  preset,
  width,
  height,
  detail,
}: {
  preset: ExperimentPreset;
  width: number;
  height: number;
  detail?: boolean;
}) {
  const points = pointsOf(preset),
    xs = points.map((p) => p.x),
    ys = points.map((p) => p.y),
    pad = detail ? 28 : 8,
    [x0, x1] = [Math.min(...xs), Math.max(...xs)],
    [y0, y1] = [Math.min(...ys), Math.max(...ys)],
    sx = (v: number) => pad + ((v - x0) / (x1 - x0 || 1)) * (width - 2 * pad),
    sy = (v: number) =>
      height - pad - ((v - y0) / (y1 - y0 || 1)) * (height - 2 * pad);
  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className={detail ? "preset-preview" : "preset-thumb"}
      role="img"
      aria-label={`${preset.name} 데이터 분포`}
    >
      <rect width={width} height={height} fill={palette.white} />
      {detail && (
        <>
          <line
            x1={pad}
            x2={width - pad}
            y1={sy(0)}
            y2={sy(0)}
            stroke={palette.grid}
          />
          <line
            x1={sx(0)}
            x2={sx(0)}
            y1={pad}
            y2={height - pad}
            stroke={palette.grid}
          />
        </>
      )}
      {points.map((p, i) => (
        <circle
          key={i}
          cx={sx(p.x)}
          cy={sy(p.y)}
          r={detail ? 4 : 2.2}
          fill={
            preset.task === "classification"
              ? themedClasses[p.label ?? 0].color
              : palette.sage
          }
          stroke={
            preset.task === "classification"
              ? p.label
                ? palette.ink
                : palette.white
              : palette.sageDeep
          }
          strokeWidth={detail ? 1 : 0.6}
        />
      ))}
    </svg>
  );
}
function Structure({ preset }: { preset: ExperimentPreset }) {
  const sizes = [preset.task === "classification" ? 2 : 1, ...preset.hidden, 1],
    w = 220,
    h = 90,
    x = (l: number) => 18 + (l * (w - 36)) / (sizes.length - 1),
    y = (l: number, j: number) =>
      h / 2 + (j - (sizes[l] - 1) / 2) * Math.min(9, (h - 14) / 16);
  return (
    <svg
      viewBox={`0 0 ${w} ${h}`}
      className="preset-structure"
      aria-hidden="true"
    >
      {sizes
        .slice(1)
        .map((n, l) =>
          Array.from({ length: n }, (_, j) =>
            Array.from({ length: sizes[l] }, (_, i) => (
              <line
                key={`${l}-${j}-${i}`}
                x1={x(l)}
                x2={x(l + 1)}
                y1={y(l, i)}
                y2={y(l + 1, j)}
                stroke={palette.sageLight}
                strokeWidth="0.5"
              />
            )),
          ),
        )}
      {sizes.map((n, l) =>
        Array.from({ length: n }, (_, j) => (
          <circle
            key={`${l}-${j}`}
            cx={x(l)}
            cy={y(l, j)}
            r="2.8"
            fill={palette.sage}
          />
        )),
      )}
    </svg>
  );
}
export const PresetsPage = memo(function PresetsPage({
  lab: l,
  onApplied,
}: {
  lab: Lab;
  onApplied: () => void;
}) {
  const [task, setTask] = useState<"all" | "regression" | "classification">(
      "all",
    ),
    [level, setLevel] = useState<"all" | Difficulty>("all"),
    [selected, setSelected] = useState(experimentPresets[0].id),
    [confirm, setConfirm] = useState(false),
    opener = useRef<HTMLElement | null>(null);
  const shown = useMemo(
    () =>
      experimentPresets.filter(
        (p) =>
          (task === "all" || p.task === task) &&
          (level === "all" || p.difficulty === level),
      ),
    [task, level],
  );
  const preset = shown.find((p) => p.id === selected) ?? shown[0] ?? undefined;
  const chip = (
    current: string,
    value: string,
    label: string,
    set: (v: never) => void,
  ) => (
    <button
      key={value}
      aria-pressed={current === value}
      onClick={() => set(value as never)}
    >
      {label}
    </button>
  );
  return (
    <div className="presets-page">
      <div className="presets-list">
        <div className="filters">
          <div className="segmented" role="group" aria-label="유형 필터">
            {chip(task, "all", "전체", setTask)}
            {chip(task, "regression", "회귀", setTask)}
            {chip(task, "classification", "분류", setTask)}
          </div>
          <div className="segmented" role="group" aria-label="난이도 필터">
            {chip(level, "all", "모든 난이도", setLevel)}
            {difficulties.map((d) => chip(level, d, d, setLevel))}
          </div>
        </div>
        <ul className="preset-cards" aria-label="프리셋 목록">
          {shown.map((p) => (
            <li key={p.id}>
              <button
                className="preset-card"
                data-testid={`preset-${p.id}`}
                aria-pressed={preset?.id === p.id}
                onClick={() => setSelected(p.id)}
              >
                <Scatter preset={p} width={160} height={100} />
                <span className="preset-title">{p.name}</span>
                <span className="preset-meta">
                  {p.task === "regression" ? "회귀" : "분류"} · {p.difficulty}
                </span>
              </button>
            </li>
          ))}
        </ul>
        {!shown.length && (
          <p className="muted">조건에 맞는 프리셋이 없습니다.</p>
        )}
      </div>
      {preset && (
        <section className="preset-detail" aria-label="프리셋 미리보기">
          <h2>{preset.name}</h2>
          <p>{preset.description}</p>
          <Scatter preset={preset} width={420} height={260} detail />
          <dl className="detail-list">
            <div>
              <dt>데이터</dt>
              <dd>
                {preset.data.count}개 · 잡음 {preset.data.noise} · 시드{" "}
                {preset.data.seed}
              </dd>
            </div>
            <div>
              <dt>구조</dt>
              <dd>
                {[
                  preset.task === "classification" ? 2 : 1,
                  ...preset.hidden,
                  1,
                ].join(" → ")}{" "}
                · {[...new Set(preset.activations)].join(", ")}
              </dd>
            </div>
            <div>
              <dt>학습 설정</dt>
              <dd>
                {preset.settings.optimizer === "adam" ? "Adam" : "SGD"} · lr{" "}
                {preset.settings.lr} · 배치 {preset.settings.batch} ·{" "}
                {preset.settings.epochs.toLocaleString()} Epoch
              </dd>
            </div>
            <div>
              <dt>기대 현상</dt>
              <dd>{preset.expectation}</dd>
            </div>
          </dl>
          <Structure preset={preset} />
          <button
            className="primary wide"
            data-testid="apply-preset"
            onClick={() => {
              opener.current = document.activeElement as HTMLElement;
              setConfirm(true);
            }}
          >
            실험에 적용
          </button>
          <p className="muted small">
            미리보기는 현재 실험을 바꾸지 않습니다. 결과는 기기와 시드에 따라
            달라질 수 있습니다.
          </p>
        </section>
      )}
      {confirm && preset && (
        <Drawer
          title="프리셋 적용"
          onClose={() => setConfirm(false)}
          returnFocus={opener.current}
        >
          <p>
            현재 {l.task === "regression" ? "회귀" : "분류"} 실험의
            데이터·모델·학습 이력이 <b>{preset.name}</b> 구성으로 교체됩니다.
            {preset.task !== l.task &&
              " 다른 유형이므로 현재 실험은 보관되고 유형이 전환됩니다."}
          </p>
          <div className="button-row">
            <button onClick={() => setConfirm(false)}>취소</button>
            <button
              className="primary"
              data-testid="confirm-preset"
              onClick={() => {
                l.applyPreset(preset);
                setConfirm(false);
                onApplied();
              }}
            >
              적용
            </button>
          </div>
        </Drawer>
      )}
    </div>
  );
});

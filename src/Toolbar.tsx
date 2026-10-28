import { useId, useLayoutEffect, useRef, type ReactNode } from "react";
import { TrainingSettings } from "./Panels";
import { exportSVG } from "./storage";
import { formatRate, speedLabel, targetRate } from "./speed";
import { format, Icon, Popover } from "./ui";
import type { Lab } from "./useLab";
/** Floats over the bottom of its parent; the parent keeps room for it via --toolbar-space. */
export function FloatingToolbar({
  children,
  label,
  ...rest
}: {
  children: ReactNode;
  label: string;
  "data-testid"?: string;
  "data-step"?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const toolbar = ref.current!,
      parent = toolbar.parentElement;
    const measure = () => {
      const height = toolbar.getBoundingClientRect().height;
      if (height > 0)
        parent?.style.setProperty("--toolbar-space", `${height + 20}px`);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(toolbar);
    return () => {
      observer.disconnect();
      parent?.style.removeProperty("--toolbar-space");
    };
  }, []);
  return (
    <div
      ref={ref}
      className="floating-toolbar"
      role="toolbar"
      aria-label={label}
      {...rest}
    >
      {children}
    </div>
  );
}
function SpeedControl({ lab: l }: { lab: Lab }) {
  const id = useId(),
    turbo = l.mode === "turbo",
    speed = l.settings.speed;
  const detail = turbo ? "최대" : `≈ ${formatRate(targetRate(speed))} batch/s`;
  return (
    <div className="speed-control" data-testid="speed-control">
      <div className="speed-heading">
        <label htmlFor={id}>
          학습 속도 <strong>{turbo ? "최대" : speedLabel(speed)}</strong>
        </label>
        <span>{detail}</span>
      </div>
      <input
        id={id}
        type="range"
        min={1}
        max={100}
        step={1}
        value={speed}
        disabled={turbo}
        aria-label="학습 속도"
        aria-valuetext={`${turbo ? "최대" : speedLabel(speed)}, ${detail}`}
        title={
          turbo
            ? "고속학습은 기기가 처리할 수 있는 최대 속도로 실행합니다"
            : "학습 중에도 가중치와 Optimizer를 유지한 채 바뀝니다"
        }
        data-testid="speed-slider"
        onChange={(e) => l.setSpeed(+e.target.value)}
      />
    </div>
  );
}
export function TrainingToolbar({
  lab: l,
  onReset,
  onResults,
}: {
  lab: Lab;
  onReset: () => void;
  onResults: () => void;
}) {
  const metric = l.task === "classification" ? "BCE" : "MSE",
    turbo = l.mode === "turbo",
    progress = Math.min(1, l.epoch / l.settings.epochs);
  return (
    <FloatingToolbar
      label="학습 컨트롤"
      data-testid="training-dock"
      data-step={l.step}
    >
      <div
        className="tb-progress"
        role="progressbar"
        aria-label="Epoch 진행률"
        aria-valuemin={0}
        aria-valuemax={l.settings.epochs}
        aria-valuenow={l.epoch}
      >
        <i style={{ width: `${progress * 100}%` }} />
      </div>
      <div className="tb-row">
        <div className="segmented tb-mode" role="group" aria-label="학습 방식">
          <button
            aria-label="일반"
            aria-pressed={!turbo}
            title="학습 과정을 실시간으로 관찰합니다"
            onClick={() => l.setMode("normal")}
          >
            <Icon name="play" />
            <span>일반</span>
          </button>
          <button
            aria-label="고속"
            aria-pressed={turbo}
            title="그래프 갱신을 줄이고 계산 처리량을 최대로 높입니다"
            onClick={() => l.setMode("turbo")}
          >
            <Icon name="bolt" />
            <span>고속</span>
          </button>
        </div>
        <button
          className="primary train-button"
          onClick={() => l.train(l.running ? "pause" : "run")}
        >
          <Icon name={l.running ? "pause" : "play"} />
          {l.running ? "일시정지" : l.step ? "학습 재개" : "학습 시작"}
        </button>
        <button
          className="tb-button"
          aria-label="정지"
          title="가중치를 유지하고 학습 세션을 끝냅니다"
          disabled={!l.step && !l.running}
          onClick={() => {
            l.stopWorker();
            l.setMessage("정지했습니다.");
          }}
        >
          <Icon name="stop" />
          <span>정지</span>
        </button>
        <SpeedControl lab={l} />
        <div className="tb-tools">
          <Popover label="학습 설정" icon="settings" className="wide-popover">
            <TrainingSettings lab={l} />
          </Popover>
          <Popover label="시각화 설정" icon="eye">
            <div className="form-stack">
              {l.task === "classification" && (
                <label className="field">
                  <span>결정 경계 해상도</span>
                  <select
                    aria-label="결정 경계 해상도"
                    value={l.resolution}
                    onChange={(e) => l.setResolution(+e.target.value)}
                  >
                    {[24, 48, 72, 96].map((n) => (
                      <option key={n} value={n}>
                        {n} × {n}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              <button
                onClick={() =>
                  l.plotSVG.current &&
                  exportSVG(l.plotSVG.current, "neuralcanvas-plot.png")
                }
              >
                <Icon name="download" />
                그래프 PNG 내보내기
              </button>
            </div>
          </Popover>
          <button
            className="tb-button"
            aria-label="학습 결과 보기"
            title="학습 결과 열기"
            onClick={onResults}
          >
            <Icon name="chart" />
          </button>
          <Popover label="학습 도구 더보기" icon="more" title="더보기">
            <div className="form-stack">
              <button
                disabled={l.running || l.data.length < 2}
                onClick={() => l.train("step")}
              >
                <Icon name="step" />한 스텝
              </button>
              <button
                disabled={l.running || l.data.length < 2}
                onClick={() => l.train("epoch")}
              >
                <Icon name="epoch" />한 Epoch
              </button>
              <button className="danger" disabled={l.running} onClick={onReset}>
                <Icon name="reset" />
                초기화
              </button>
            </div>
          </Popover>
        </div>
      </div>
      <dl className="tb-metrics" aria-label="학습 지표">
        <div>
          <dt>Epoch</dt>
          <dd data-testid="epoch">
            {l.epoch.toLocaleString()}
            <small>/{l.settings.epochs.toLocaleString()}</small>
          </dd>
        </div>
        <div>
          <dt>{metric}</dt>
          <dd data-testid="loss">{l.latest ? format(l.latest.train) : "—"}</dd>
        </div>
        {l.latest?.validation !== undefined && (
          <div className="validation-metric">
            <dt>검증</dt>
            <dd>{format(l.latest.validation)}</dd>
          </div>
        )}
        {l.task === "classification" && (
          <div>
            <dt>정확도</dt>
            <dd data-testid="accuracy">
              {l.latest?.accuracy === undefined
                ? "—"
                : `${(l.latest.accuracy * 100).toFixed(1)}%`}
            </dd>
          </div>
        )}
        {l.rate.batchesPerSec > 0 && (
          <div className="rate-metric">
            <dt>처리량</dt>
            <dd data-testid="throughput">
              {formatRate(l.rate.batchesPerSec)} batch/s
              <small> · {formatRate(l.rate.epochsPerSec)} epoch/s</small>
            </dd>
          </div>
        )}
      </dl>
    </FloatingToolbar>
  );
}

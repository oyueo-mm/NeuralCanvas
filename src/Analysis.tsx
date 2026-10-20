import { lazy, memo, Suspense } from "react";
import type { Lab } from "./useLab";
import { download } from "./storage";
import { format, Icon } from "./ui";
const LossChart = lazy(() => import("./LossChart"));
export const Analysis = memo(function Analysis({ lab: l }: { lab: Lab }) {
  const weights = l.model.layers.flatMap((layer) => layer.w.flat()),
    norm = l.gradient
      ? Math.sqrt(
          l.gradient.w
            .flat(2)
            .concat(l.gradient.b.flat())
            .reduce((s, v) => s + v * v, 0),
        )
      : undefined;
  return (
    <section className="analysis-content">
      <div className="section-heading">
        <div>
          <h2>학습 손실</h2>
          <p className="caption">
            실제 배치별 평균제곱오차 · 최근 1,000회 업데이트
          </p>
        </div>
        <button
          onClick={() =>
            download(
              "loss.csv",
              "step,epoch,train,validation\n" +
                l.history
                  .map(
                    (r) =>
                      `${r.step},${r.epoch},${r.train},${r.validation ?? ""}`,
                  )
                  .join("\n"),
              "text/csv",
            )
          }
        >
          <Icon name="download" />
          손실 CSV
        </button>
      </div>
      <div className="loss-chart" data-testid="loss-chart">
        {l.history.length ? (
          <Suspense
            fallback={
              <div className="empty-chart">차트를 불러오는 중입니다.</div>
            }
          >
            <LossChart history={l.history} />
          </Suspense>
        ) : (
          <div className="empty-chart">
            <Icon name="chart" />
            <strong>학습의 변화를 관찰하세요</strong>
            <span>학습을 시작하면 손실이 여기에 기록됩니다.</span>
          </div>
        )}
      </div>
      <dl className="analysis-metrics">
        <div>
          <dt>업데이트</dt>
          <dd>{l.step.toLocaleString()}</dd>
        </div>
        <div>
          <dt>검증 MSE</dt>
          <dd>
            {l.latest?.validation === undefined
              ? "—"
              : format(l.latest.validation)}
          </dd>
        </div>
        <div>
          <dt>가중치 범위</dt>
          <dd>
            {format(Math.min(...weights), 3)} ~{" "}
            {format(Math.max(...weights), 3)}
          </dd>
        </div>
        <div>
          <dt>기울기 L2 norm</dt>
          <dd>{norm === undefined ? "—" : format(norm, 4)}</dd>
        </div>
      </dl>
      <p className="caption">
        검증 데이터는 학습에서 제외합니다. 검증 비율이 0이면 검증 손실을
        생성하지 않습니다.
      </p>
      <details className="learning-help">
        <summary>학습 원리 알아보기</summary>
        <div className="learn-grid">
          <div>
            <h3>순전파</h3>
            <p>각 뉴런은 가중합과 편향에 활성화 함수를 적용합니다.</p>
            <code>z = Σ wᵢaᵢ + b, a = φ(z)</code>
          </div>
          <div>
            <h3>역전파</h3>
            <p>실제 데이터와 예측의 차이를 연쇄법칙으로 미분합니다.</p>
            <code>L = mean((ŷ − y)²)</code>
          </div>
          <div>
            <h3>업데이트</h3>
            <p>SGD 또는 Adam이 실제 기울기로 가중치를 조정합니다.</p>
            <code>w ← w − η ∂L/∂w</code>
          </div>
        </div>
      </details>
    </section>
  );
});

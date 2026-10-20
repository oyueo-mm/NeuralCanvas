import { lazy, memo, Suspense, useMemo } from "react";
import { confusionMatrix } from "./engine";
import type { Lab } from "./useLab";
import { download } from "./storage";
import { format, Icon } from "./ui";
const LossChart = lazy(() => import("./LossChart"));
export const Analysis = memo(function Analysis({ lab: l }: { lab: Lab }) {
  const confusion = useMemo(
    () =>
      l.task === "classification" ? confusionMatrix(l.model, l.data) : null,
    [l.task, l.model, l.data],
  );
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
            실제 배치별{" "}
            {l.task === "classification"
              ? "이진 교차 엔트로피"
              : "평균제곱오차"}{" "}
            · 최근 1,000회 업데이트
          </p>
        </div>
        <button
          onClick={() =>
            download(
              "loss.csv",
              "step,epoch,train,validation,accuracy,validation_accuracy\n" +
                l.history
                  .map(
                    (r) =>
                      `${r.step},${r.epoch},${r.train},${r.validation ?? ""},${r.accuracy ?? ""},${r.validationAccuracy ?? ""}`,
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
          <dt>{l.task === "classification" ? "검증 BCE" : "검증 MSE"}</dt>
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
      {confusion && (
        <section className="classification-analysis">
          <dl className="analysis-metrics">
            <div>
              <dt>학습 정확도</dt>
              <dd>
                {l.latest?.accuracy === undefined
                  ? "—"
                  : `${(l.latest.accuracy * 100).toFixed(1)}%`}
              </dd>
            </div>
            <div>
              <dt>검증 정확도</dt>
              <dd data-testid="validation-accuracy">
                {l.latest?.validationAccuracy === undefined
                  ? "—"
                  : `${(l.latest.validationAccuracy * 100).toFixed(1)}%`}
              </dd>
            </div>
          </dl>
          <table className="confusion-matrix">
            <caption>혼동 행렬 · 전체 데이터 · 행: 실제 / 열: 예측</caption>
            <thead>
              <tr>
                <th scope="col">실제 \ 예측</th>
                <th scope="col">클래스 0</th>
                <th scope="col">클래스 1</th>
              </tr>
            </thead>
            <tbody>
              {confusion.map((row, i) => (
                <tr key={i}>
                  <th scope="row">클래스 {i}</th>
                  {row.map((v, j) => (
                    <td key={j}>{v}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
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
            <code>
              {l.task === "classification"
                ? "L = −mean(y log p + (1−y) log(1−p))"
                : "L = mean((ŷ − y)²)"}
            </code>
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

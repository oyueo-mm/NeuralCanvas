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
      <div className="analysis-head">
        <span>
          {l.task === "classification" ? "BCE" : "MSE"} · 최근 1,000회
        </span>
        <button
          className="tool"
          aria-label="손실 CSV"
          title="손실 CSV"
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
        </button>
      </div>
      <div className="loss-chart" data-testid="loss-chart">
        {l.history.length ? (
          <Suspense fallback={<div className="empty-chart" />}>
            <LossChart history={l.history} task={l.task} />
          </Suspense>
        ) : (
          <div className="empty-chart">
            <Icon name="chart" />
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
            <caption>혼동 행렬 · 행 실제 / 열 예측</caption>
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
    </section>
  );
});

import { memo } from "react";
import { Analysis } from "./Analysis";
import { formatRate } from "./speed";
import type { Lab } from "./useLab";
export const ResultsPage = memo(function ResultsPage({ lab: l }: { lab: Lab }) {
  return (
    <div className="results-page">
      <dl className="results-summary" aria-label="누적 학습량">
        <div>
          <dt>누적 Epoch</dt>
          <dd data-testid="results-epoch">{l.epoch.toLocaleString()}</dd>
        </div>
        <div>
          <dt>누적 업데이트</dt>
          <dd>{l.step.toLocaleString()}</dd>
        </div>
        <div>
          <dt>학습 방식</dt>
          <dd>{l.mode === "turbo" ? "고속" : "일반"}</dd>
        </div>
        <div>
          <dt>처리량</dt>
          <dd>
            {l.running && l.rate.batchesPerSec
              ? `${formatRate(l.rate.batchesPerSec)} batch/s`
              : "—"}
          </dd>
        </div>
      </dl>
      <Analysis lab={l} />
      <p className="muted small">
        기록은 최대 1,000개이며 길어지면 전체 곡선을 유지하도록 솎아 냅니다. 누적
        Epoch와 업데이트는 기록과 별도로 집계합니다.
      </p>
    </div>
  );
});

import {
  activations,
  dataset,
  presets,
  classificationPresets,
  classificationDataset,
  type Activation,
  type Settings,
} from "./engine";
import { download, exportSVG } from "./storage";
import { format, Icon, NumberField } from "./ui";
import type { Lab } from "./useLab";
export function DataEditor({ lab: l }: { lab: Lab }) {
  const classes = l.classDefinitions;
  const makeData = (kind: string) =>
    l.task === "classification"
      ? classificationDataset(kind, l.count, l.noise, l.settings.seed)
      : dataset(kind, l.count, l.noise, l.settings.seed);
  return (
    <>
      <div className="button-row">
        <button
          disabled={!l.undo.length}
          onClick={() => {
            l.setRedo((r) => [...r, l.data]);
            l.setData(l.undo.at(-1)!);
            l.setUndo((u) => u.slice(0, -1));
            l.invalidate();
            l.setPoint(null);
          }}
        >
          실행 취소
        </button>
        <button
          disabled={!l.redo.length}
          onClick={() => {
            l.setUndo((u) => [...u, l.data]);
            l.setData(l.redo.at(-1)!);
            l.setRedo((r) => r.slice(0, -1));
            l.invalidate();
            l.setPoint(null);
          }}
        >
          다시 실행
        </button>
      </div>
      <label className="field point-picker">
        <span>데이터 포인트</span>
        <select
          aria-label="데이터 포인트 선택"
          value={l.point !== null && l.data[l.point] ? l.point : ""}
          onChange={(e) =>
            l.setPoint(e.target.value === "" ? null : +e.target.value)
          }
        >
          <option value="">점을 선택하세요</option>
          {l.data.map((p, i) => (
            <option key={i} value={i}>
              {i + 1}번 · ({format(p.x, 4)}, {format(p.y, 4)})
            </option>
          ))}
        </select>
      </label>
      {l.point !== null && (
        <section className="editor-section selection-section">
          <h3>선택한 점</h3>
          {l.point !== null && l.data[l.point] ? (
            <>
              <p className="muted">
                {l.point + 1}번 점 · ({format(l.data[l.point].x)},{" "}
                {format(l.data[l.point].y)})
              </p>
              <div className="form-grid">
                <NumberField
                  label="점 x"
                  value={l.data[l.point].x}
                  min={-1000}
                  max={1000}
                  onChange={(v) =>
                    l.changeData(
                      l.data.map((p, i) =>
                        i === l.point ? { ...p, x: v } : p,
                      ),
                    )
                  }
                />
                <NumberField
                  label="점 y"
                  value={l.data[l.point].y}
                  min={-1000}
                  max={1000}
                  onChange={(v) =>
                    l.changeData(
                      l.data.map((p, i) =>
                        i === l.point ? { ...p, y: v } : p,
                      ),
                    )
                  }
                />
              </div>
              {l.task === "classification" && (
                <label className="field">
                  <span>점 클래스</span>
                  <select
                    aria-label="선택 점 클래스"
                    value={l.data[l.point].label}
                    onChange={(e) =>
                      l.changeData(
                        l.data.map((p, i) =>
                          i === l.point
                            ? { ...p, label: +e.target.value as 0 | 1 }
                            : p,
                        ),
                      )
                    }
                  >
                    {classes.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              <details className="precision">
                <summary>전체 정밀도 보기</summary>
                <code>
                  x = {l.data[l.point].x}
                  <br />y = {l.data[l.point].y}
                </code>
              </details>
              <button
                className="danger wide"
                onClick={() => {
                  l.changeData(l.data.filter((_, i) => i !== l.point));
                  l.setPoint(null);
                }}
              >
                선택 점 삭제
              </button>
            </>
          ) : (
            <p className="muted">
              그래프의 점을 누르면 좌표를 수정하거나 삭제할 수 있습니다.
            </p>
          )}
        </section>
      )}

      <div className="section-label">데이터셋</div>
      <div className="preset-grid">
        {(l.task === "classification" ? classificationPresets : presets).map(
          (p) => (
            <button
              key={p}
              aria-pressed={l.preset === p}
              className={l.preset === p ? "selected" : ""}
              onClick={() => {
                l.setPreset(p);
                l.setPoint(null);
                l.changeData(makeData(p));
              }}
            >
              {p}
            </button>
          ),
        )}
      </div>
      <div className="form-grid">
        <NumberField
          label="표본 수"
          value={l.count}
          min={2}
          max={500}
          step={1}
          onChange={l.setCount}
        />
        <NumberField
          label="잡음"
          value={l.noise}
          min={0}
          max={3}
          onChange={l.setNoise}
        />
      </div>
      <button className="wide" onClick={() => l.changeData(makeData(l.preset))}>
        프리셋 다시 생성
      </button>

      <section className="editor-section">
        <h3>가져오기 · 내보내기</h3>
        <div className="button-row">
          <button onClick={() => l.datasetFile.current?.click()}>
            CSV / JSON 가져오기
          </button>
          <button
            onClick={() =>
              download(
                "dataset.csv",
                (l.task === "classification" ? "x,y,label\n" : "x,y\n") +
                  l.data
                    .map(
                      (p) =>
                        `${p.x},${p.y}${l.task === "classification" ? `,${p.label}` : ""}`,
                    )
                    .join("\n"),
                "text/csv",
              )
            }
          >
            CSV 내보내기
          </button>
          <button
            onClick={() =>
              l.plotSVG.current &&
              exportSVG(l.plotSVG.current, "neuralcanvas-plot.png")
            }
          >
            그래프 PNG 내보내기
          </button>
        </div>
        <button
          className="text-button danger"
          onClick={() => {
            l.changeData([]);
            l.setPoint(null);
          }}
        >
          전체 삭제
        </button>
        <p className="caption">
          최대 2,000개 점 · 원본 좌표로 학습합니다. 수정 시 학습 이력이
          초기화됩니다.
        </p>
      </section>
    </>
  );
}
export function ModelEditor({ lab: l }: { lab: Lab }) {
  const value =
    l.selection?.type === "edge"
      ? `e-${l.selection.l}-${l.selection.j}-${l.selection.i}`
      : l.selection
        ? `n-${l.selection.l}-${l.selection.j}`
        : "";
  return (
    <>
      <label className="field">
        <span>뉴런 또는 연결 선택</span>
        <select
          aria-label="편집 대상"
          value={value}
          onChange={(e) => {
            const [type, a, b, c] = e.target.value.split("-");
            l.setSelection(
              type === "n"
                ? { type: "node", l: +a, j: +b }
                : type === "e"
                  ? { type: "edge", l: +a, j: +b, i: +c }
                  : null,
            );
          }}
        >
          <option value="">구조 편집</option>
          <optgroup label="뉴런">
            {l.model.layers.flatMap((layer, k) =>
              layer.b.map((_, j) => (
                <option key={`n${k}-${j}`} value={`n-${k}-${j}`}>
                  {k === l.model.layers.length - 1 ? "출력" : `은닉 ${k + 1}`} ·
                  뉴런 {j + 1}
                </option>
              )),
            )}
          </optgroup>
          <optgroup label="연결">
            {l.model.layers.flatMap((layer, k) =>
              layer.w.flatMap((row, j) =>
                row.map((_, i) => (
                  <option key={`e${k}-${j}-${i}`} value={`e-${k}-${j}-${i}`}>
                    층 {k} · {i + 1} → 층 {k + 1} · {j + 1}
                  </option>
                )),
              ),
            )}
          </optgroup>
        </select>
      </label>
      {l.edge && (
        <section className="inspector editor-section">
          <h3>연결 편집</h3>
          <p className="muted">
            층 {l.edge.l} · 뉴런 {l.edge.i + 1} → 층 {l.edge.l + 1} · 뉴런{" "}
            {l.edge.j + 1}
          </p>
          <NumberField
            label="가중치"
            value={l.model.layers[l.edge.l].w[l.edge.j][l.edge.i]}
            onChange={(v) =>
              l.mutate((m) => (m.layers[l.edge!.l].w[l.edge!.j][l.edge!.i] = v))
            }
          />
          <label className="switch-row">
            <span>연결 활성화</span>
            <input
              type="checkbox"
              role="switch"
              aria-label="연결 활성화"
              checked={l.model.layers[l.edge.l].enabled[l.edge.j][l.edge.i]}
              onChange={(e) =>
                l.mutate(
                  (m) =>
                    (m.layers[l.edge!.l].enabled[l.edge!.j][l.edge!.i] =
                      e.target.checked),
                )
              }
            />
          </label>
          <dl className="detail-list">
            <div>
              <dt>부호 / 크기 |w|</dt>
              <dd>
                {l.model.layers[l.edge.l].w[l.edge.j][l.edge.i] >= 0
                  ? "양수 (+)"
                  : "음수 (−)"}{" "}
                /{" "}
                {format(
                  Math.abs(l.model.layers[l.edge.l].w[l.edge.j][l.edge.i]),
                )}
              </dd>
            </div>
            <div>
              <dt>From → To ID</dt>
              <dd>
                {l.edge.l
                  ? l.model.layers[l.edge.l - 1].neurons[l.edge.i]
                  : `x${l.edge.i + 1}`}{" "}
                → {l.model.layers[l.edge.l].neurons[l.edge.j]}
              </dd>
            </div>
            <div>
              <dt>현재 입력의 기여량 w·a</dt>
              <dd>
                {format(
                  l.model.layers[l.edge.l].enabled[l.edge.j][l.edge.i]
                    ? l.model.layers[l.edge.l].w[l.edge.j][l.edge.i] *
                        l.f.a[l.edge.l][l.edge.i]
                    : 0,
                )}
              </dd>
            </div>
            <div>
              <dt>최근 배치 ∂L/∂w</dt>
              <dd>
                {l.gradient
                  ? format(l.gradient.w[l.edge.l][l.edge.j][l.edge.i])
                  : "—"}
              </dd>
            </div>
          </dl>
        </section>
      )}
      {l.node && (
        <section className="inspector editor-section">
          <h3>뉴런 편집</h3>
          <p className="muted neuron-identity">
            ID {l.model.layers[l.node.l].neurons[l.node.j]} · layer{" "}
            {l.node.l + 1} / index {l.node.j}
          </p>
          <div className="form-grid">
            <NumberField
              label="편향"
              value={l.model.layers[l.node.l].b[l.node.j]}
              onChange={(v) =>
                l.mutate((m) => (m.layers[l.node!.l].b[l.node!.j] = v))
              }
            />
            <label className="field">
              <span>층 활성화 함수</span>
              <select
                aria-label="선택 뉴런 층 활성화"
                value={l.model.layers[l.node.l].activation}
                disabled={l.node.l === l.model.layers.length - 1}
                onChange={(e) =>
                  l.mutate(
                    (m) =>
                      (m.layers[l.node!.l].activation = e.target
                        .value as Activation),
                  )
                }
              >
                {activations.map((a) => (
                  <option key={a}>{a}</option>
                ))}
              </select>
            </label>
          </div>
          <dl className="detail-list">
            <div>
              <dt>가중합 z</dt>
              <dd>{format(l.f.z[l.node.l][l.node.j])}</dd>
            </div>
            <div>
              <dt>활성화 출력 a</dt>
              <dd>{format(l.f.a[l.node.l + 1][l.node.j])}</dd>
            </div>
            <div>
              <dt>최근 배치 ∂L/∂z</dt>
              <dd>
                {l.gradient ? format(l.gradient.dz[l.node.l][l.node.j]) : "—"}
              </dd>
            </div>
          </dl>
          <dl className="detail-list weight-summary">
            <div>
              <dt>Incoming 활성 / 전체 · 평균 |w|</dt>
              <dd>
                {
                  l.model.layers[l.node.l].enabled[l.node.j].filter(Boolean)
                    .length
                }{" "}
                / {l.model.layers[l.node.l].w[l.node.j].length} ·{" "}
                {format(
                  l.model.layers[l.node.l].w[l.node.j].reduce(
                    (s, w) => s + Math.abs(w),
                    0,
                  ) / l.model.layers[l.node.l].w[l.node.j].length,
                  4,
                )}
              </dd>
            </div>
            <div>
              <dt>Outgoing 활성 / 전체 · 평균 |w|</dt>
              <dd>
                {(() => {
                  const next = l.model.layers[l.node!.l + 1];
                  return next
                    ? `${next.enabled.filter((row) => row[l.node!.j]).length} / ${next.b.length} · ${format(next.w.reduce((s, row) => s + Math.abs(row[l.node!.j]), 0) / next.b.length, 4)}`
                    : "출력 뉴런";
                })()}
              </dd>
            </div>
          </dl>
          <details>
            <summary>입력별 기여량</summary>
            <div className="contributions">
              {l.model.layers[l.node.l].w[l.node.j].map((w, i) => (
                <button
                  key={i}
                  onClick={() =>
                    l.setSelection({
                      type: "edge",
                      l: l.node!.l,
                      j: l.node!.j,
                      i,
                    })
                  }
                >
                  <span>
                    입력 {i + 1} ·{" "}
                    {l.model.layers[l.node!.l].enabled[l.node!.j][i]
                      ? `${format(w, 4)} × ${format(l.f.a[l.node!.l][i], 4)}`
                      : "비활성"}
                  </span>
                  <strong>
                    {format(
                      l.model.layers[l.node!.l].enabled[l.node!.j][i]
                        ? w * l.f.a[l.node!.l][i]
                        : 0,
                    )}
                  </strong>
                  <Icon name="chevron" />
                </button>
              ))}
            </div>
          </details>
        </section>
      )}
      <section className="editor-section">
        <h3>네트워크 구조</h3>
        <div className="layer-row input-row">
          <span>입력층</span>
          <span className="count">
            {l.task === "classification" ? "2 뉴런 · x₁, x₂" : "1 뉴런 · x"}
          </span>
        </div>
        {l.hidden.map((layer, k) => (
          <div className="layer-config" key={layer.id}>
            <div className="layer-row">
              <strong>은닉층 {k + 1}</strong>
              <div className="stepper">
                <button
                  className="icon-button"
                  aria-label={`은닉층 ${k + 1} 뉴런 제거`}
                  disabled={layer.b.length <= 1}
                  onClick={() =>
                    l.resize(
                      l.sizes.map((n, i) => (i === k ? n - 1 : n)),
                      l.acts,
                    )
                  }
                >
                  <Icon name="minus" />
                </button>
                <b>{layer.b.length}</b>
                <button
                  className="icon-button"
                  aria-label={`은닉층 ${k + 1} 뉴런 추가`}
                  disabled={layer.b.length >= 16}
                  onClick={() =>
                    l.resize(
                      l.sizes.map((n, i) => (i === k ? n + 1 : n)),
                      l.acts,
                    )
                  }
                >
                  <Icon name="plus" />
                </button>
              </div>
              <button
                className="icon-button danger"
                aria-label={`은닉층 ${k + 1} 삭제`}
                onClick={() =>
                  l.resize(
                    l.sizes.filter((_, i) => i !== k),
                    l.acts.filter((_, i) => i !== k),
                  )
                }
              >
                <Icon name="close" />
              </button>
            </div>
            <label className="field inline-field">
              <span>활성화</span>
              <select
                aria-label={`은닉층 ${k + 1} 활성화`}
                value={layer.activation}
                onChange={(e) =>
                  l.mutate(
                    (m) =>
                      (m.layers[k].activation = e.target.value as Activation),
                  )
                }
              >
                {activations.map((a) => (
                  <option key={a}>{a}</option>
                ))}
              </select>
            </label>
          </div>
        ))}
        <div className="layer-row input-row">
          <span>출력층</span>
          <span className="count">
            1 뉴런 · {l.model.layers.at(-1)!.activation}
          </span>
        </div>
        <button
          className="wide add-layer"
          disabled={l.hidden.length >= 4}
          onClick={() => l.resize([...l.sizes, 4], [...l.acts, "tanh"])}
        >
          <Icon name="plus" />
          은닉층 추가
        </button>
        <p className="caption">
          최대 4개 은닉층, 층당 16개 뉴런. 층 추가·삭제는 전체 가중치를
          초기화합니다. 뉴런 수 변경은 기존 연결을 유지합니다.
        </p>
      </section>
      <button className="danger wide" onClick={() => l.resetModel()}>
        <Icon name="reset" />
        가중치·학습 이력 초기화
      </button>
      <button
        className="wide"
        onClick={() =>
          l.networkSVG.current &&
          exportSVG(l.networkSVG.current, "neuralcanvas-network.png")
        }
      >
        신경망 PNG 내보내기
      </button>
    </>
  );
}
export function TrainingSettings({ lab: l }: { lab: Lab }) {
  const change = (key: keyof Settings, value: number | string) =>
    l.changeSettings({ ...l.settings, [key]: value });
  return (
    <>
      <p className="caption intro-caption">
        설정 변경 시 현재 학습 세션이 초기화됩니다. 가중치는 유지됩니다.
      </p>
      <div className="form-grid">
        <label className="field">
          <span>Optimizer</span>
          <select
            aria-label="Optimizer"
            value={l.settings.optimizer}
            onChange={(e) => change("optimizer", e.target.value)}
          >
            <option value="adam">Adam</option>
            <option value="sgd">SGD</option>
          </select>
        </label>
        <NumberField
          label="학습률"
          min={0.000001}
          max={1}
          value={l.settings.lr}
          onChange={(v) => change("lr", v)}
        />
        <NumberField
          label="배치 크기"
          min={1}
          max={2000}
          step={1}
          value={l.settings.batch}
          onChange={(v) => change("batch", v)}
        />
        <NumberField
          label="목표 Epoch"
          min={1}
          max={100000}
          step={1}
          value={l.settings.epochs}
          onChange={(v) => change("epochs", v)}
        />
      </div>
      <label className="slider-label">
        학습률 · 로그 스케일
        <input
          aria-label="로그 학습률"
          type="range"
          min="-6"
          max="0"
          step=".1"
          value={Math.log10(l.settings.lr)}
          onChange={(e) => change("lr", 10 ** +e.target.value)}
        />
      </label>
      <details className="editor-section advanced">
        <summary>고급 설정</summary>
        <div className="form-grid">
          <NumberField
            label="시드"
            min={0}
            max={4294967295}
            step={1}
            value={l.settings.seed}
            onChange={(v) => change("seed", v)}
          />
          <NumberField
            label="검증 비율"
            min={0}
            max={0.5}
            value={l.settings.validation}
            onChange={(v) => change("validation", v)}
          />
          <NumberField
            label="기울기 클리핑"
            min={0}
            max={1000}
            value={l.settings.clip}
            onChange={(v) => change("clip", v)}
          />
        </div>
        <label className="slider-label">
          학습 속도 · 최대 {l.settings.speed} 배치 / 갱신
          <input
            aria-label="학습 속도"
            type="range"
            min="1"
            max="100"
            value={l.settings.speed}
            onChange={(e) => change("speed", +e.target.value)}
          />
        </label>
        <p className="caption">
          학습 속도는 한 번에 처리하는 연산량이며, 학습률은 가중치 업데이트의
          크기입니다.
        </p>
      </details>
      <details className="editor-section advanced">
        <summary>가중치 초기화</summary>
        <p className="caption">
          선택한 방식으로 가중치와 학습 이력을 초기화합니다.
        </p>
        <div className="button-row">
          {(["xavier", "he", "zero"] as const).map((init) => (
            <button key={init} onClick={() => l.resetModel(init)}>
              {init}
            </button>
          ))}
        </div>
        <p className="caption">
          Zero 초기화는 은닉 뉴런의 대칭성 때문에 학습이 제한될 수 있습니다.
        </p>
      </details>
    </>
  );
}
export function ObservationSettings({ lab: l }: { lab: Lab }) {
  return (
    <>
      <p className="muted">
        모델의 가중치를 고정하고 입력이 각 층을 거치는 과정을 관찰합니다.
        {l.task === "classification" &&
          " 데이터 화면의 좌표 관찰로 두 입력을 함께 바꿀 수 있습니다."}
      </p>
      <div className="form-grid">
        <NumberField
          label="입력 x"
          value={l.input}
          min={-5}
          max={5}
          onChange={l.setInput}
        />
        {l.task === "classification" && (
          <NumberField
            label="입력 x2"
            value={l.input2}
            min={-1000}
            max={1000}
            onChange={l.setInput2}
          />
        )}
        <NumberField
          label="순회 속도"
          value={l.sweepSpeed}
          min={0.1}
          max={5}
          onChange={l.setSweepSpeed}
        />
        <label className="field">
          <span>순회 방식</span>
          <select
            aria-label="순회 방식"
            value={l.sweepMode}
            onChange={(e) => l.setSweepMode(e.target.value)}
          >
            {["왕복", "반복", "한 방향"].map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </label>
      </div>
      <dl className="detail-list">
        <div>
          <dt>현재 입력 x</dt>
          <dd>{format(l.input)}</dd>
        </div>
        <div>
          <dt>{l.task === "classification" ? "P(클래스 1)" : "모델 출력 ŷ"}</dt>
          <dd>{format(l.f.y)}</dd>
        </div>
      </dl>
      <p className="caption">
        층 강조는 실제 계산 순서를 설명하는 교육적 비유입니다. 모든 활성화와
        출력은 현재 입력과 실제 가중치에서 계산됩니다.
      </p>
    </>
  );
}

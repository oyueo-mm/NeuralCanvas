import { useCallback, useEffect, useRef, useState } from "react";
import { useLab } from "./useLab";
import { Plot } from "./Plot";
import { Network, type Selection } from "./Network";
import { Analysis } from "./Analysis";
import {
  DataEditor,
  ModelEditor,
  TrainingSettings,
  ObservationSettings,
} from "./Panels";
import { Drawer, format, Icon, useCompact } from "./ui";
import { download } from "./storage";
type Panel =
  "data" | "model" | "settings" | "observation" | "menu" | "reset" | null;
export default function App() {
  const l = useLab(),
    [panel, setPanel] = useState<Panel>(null),
    [analysis, setAnalysis] = useState(false),
    [dockMore, setDockMore] = useState(false);
  const compact = useCompact();
  const opener = useRef<HTMLElement | null>(null);
  const dataSnapshot = useRef({ model: l.model, input: l.input });
  const networkSnapshot = useRef({
    model: l.model,
    input: l.input,
    gradient: l.gradient,
    playing: l.playing,
    phase: l.phase,
  });
  if (!compact || l.tab === "data")
    dataSnapshot.current = { model: l.model, input: l.input };
  if (!compact || l.tab === "network")
    networkSnapshot.current = {
      model: l.model,
      input: l.input,
      gradient: l.gradient,
      playing: l.playing,
      phase: l.phase,
    };
  const openData = useCallback(() => {
      opener.current = document.activeElement as HTMLElement;
      setPanel("data");
    }, []),
    openModel = useCallback(() => {
      opener.current = document.activeElement as HTMLElement;
      setPanel("model");
    }, []);
  const selectObject = useCallback(
    (selection: Selection) => {
      opener.current = document.activeElement as HTMLElement;
      l.setSelection(selection);
      setPanel("model");
    },
    [l.setSelection],
  );
  useEffect(() => {
    const viewport = window.visualViewport;
    const update = () => {
      document.documentElement.style.setProperty(
        "--visual-height",
        `${viewport?.height ?? window.innerHeight}px`,
      );
    };
    viewport?.addEventListener("resize", update);
    update();
    return () => viewport?.removeEventListener("resize", update);
  }, []);
  const save = () =>
    download(
      "neuralcanvas-experiment.json",
      JSON.stringify(l.experiment(), null, 2),
    );
  const openEditor = () =>
    setPanel(
      l.tab === "network"
        ? "model"
        : l.tab === "analysis"
          ? "settings"
          : "data",
    );
  const state = l.running
    ? "학습 중"
    : l.epoch >= l.settings.epochs
      ? "학습 완료"
      : l.step
        ? "대기"
        : "준비";
  const title =
    panel === "data"
      ? "데이터 편집"
      : panel === "model"
        ? "모델 편집"
        : panel === "settings"
          ? "학습 설정"
          : panel === "observation"
            ? "입력 관찰 설정"
            : panel === "reset"
              ? "모델 초기화"
              : "실험 메뉴";
  return (
    <div
      className={`app-shell active-${l.tab}`}
      onPointerDownCapture={(e) => {
        const target = (e.target as Element).closest(
          'button, a, [role="button"]',
        ) as HTMLElement | null;
        if (!panel && target) opener.current = target;
        target?.focus({ preventScroll: true });
      }}
      onKeyDownCapture={(e) => {
        if (!panel && (e.key === "Enter" || e.key === " "))
          opener.current = document.activeElement as HTMLElement;
      }}
    >
      <header className="app-header">
        <a className="brand" href="#" aria-label="NeuralCanvas 홈">
          <span className="brand-mark">
            <Icon name="network" />
          </span>
          <strong>
            Neural<span>Canvas</span>
          </strong>
          <span className="brand-caption">신경망 실험실</span>
        </a>
        <div className="header-actions">
          <span className={`status-badge ${l.running ? "running" : ""}`}>
            <i />
            {state}
          </span>
          <button
            className="icon-button"
            aria-label="학습 설정 열기"
            onClick={() => setPanel("settings")}
          >
            <Icon name="settings" />
          </button>
          <button className="desktop-action" onClick={save}>
            <Icon name="save" />
            저장
          </button>
          <button
            className="desktop-action"
            onClick={() => l.file.current?.click()}
          >
            불러오기
          </button>
          <a
            className="github-link desktop-action"
            href="https://github.com/oyueo-mm/NeuralCanvas"
            target="_blank"
            rel="noreferrer"
          >
            GitHub ↗
          </a>
          <button
            className="icon-button"
            aria-label="실험 메뉴 열기"
            onClick={() => setPanel("menu")}
          >
            <Icon name="more" />
          </button>
        </div>
      </header>
      <main className="workspace-main">
        <section className="experiment-strip" aria-label="학습 상태">
          <div className="experiment-title">
            <strong>{l.name}</strong>
            <span>
              1차원 회귀 · {l.settings.optimizer === "adam" ? "Adam" : "SGD"}
            </span>
          </div>
          <div className="summary-metrics">
            <div>
              <span>Epoch</span>
              <strong data-testid="epoch">
                {l.epoch.toLocaleString()}
                <small> / {l.settings.epochs.toLocaleString()}</small>
              </strong>
            </div>
            <div>
              <span>학습 MSE</span>
              <strong data-testid="loss">
                {l.latest ? format(l.latest.train) : "—"}
              </strong>
            </div>
            {l.latest?.validation !== undefined && (
              <div className="validation-summary">
                <span>검증 MSE</span>
                <strong>{format(l.latest.validation)}</strong>
              </div>
            )}
            <div className="parameter-summary">
              <span>파라미터</span>
              <strong>{l.parameters}</strong>
            </div>
          </div>
        </section>
        <nav className="workspace-tabs" aria-label="작업 공간">
          <div role="tablist" aria-label="모바일 작업 공간">
            {[
              ["data", "데이터", "data"],
              ["network", "신경망", "network"],
              ["analysis", "분석", "chart"],
            ].map(([id, label, icon]) => (
              <button
                key={id}
                id={`tab-${id}`}
                role="tab"
                aria-selected={l.tab === id}
                aria-controls={`pane-${id}`}
                tabIndex={l.tab === id ? 0 : -1}
                onClick={() => l.setTab(id)}
                onKeyDown={(e) => {
                  if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
                    e.preventDefault();
                    const ids = ["data", "network", "analysis"],
                      next =
                        ids[
                          (ids.indexOf(l.tab) +
                            (e.key === "ArrowRight" ? 1 : 2)) %
                            3
                        ];
                    l.setTab(next);
                    document.getElementById(`tab-${next}`)?.focus();
                  }
                }}
              >
                <Icon name={icon} />
                {label}
              </button>
            ))}
          </div>
        </nav>
        <div className="visual-workspace">
          <div
            id="pane-data"
            className="pane data-pane"
            role="region"
            aria-label="데이터 화면"
          >
            <Plot
              exportRef={l.plotSVG}
              model={dataSnapshot.current.model}
              data={l.data}
              input={dataSnapshot.current.input}
              change={l.changeData}
              selected={l.point}
              select={l.setPoint}
              edit={openData}
              validationIndices={l.validationIndices}
            />
          </div>
          <div
            id="pane-network"
            className="pane network-pane"
            role="region"
            aria-label="신경망 화면"
          >
            <Network
              exportRef={l.networkSVG}
              model={networkSnapshot.current.model}
              input={networkSnapshot.current.input}
              selection={l.selection}
              select={selectObject}
              gradient={networkSnapshot.current.gradient}
              playing={networkSnapshot.current.playing}
              phase={networkSnapshot.current.phase}
              edit={openModel}
            />
          </div>
        </div>
        <section className="observation-bar" aria-label="공통 입력 관찰">
          <button
            className={`observation-play ${l.playing ? "observing" : ""}`}
            aria-label={l.playing ? "순회 일시정지" : "입력 순회"}
            title="가중치를 고정하고 입력을 관찰합니다"
            disabled={l.running}
            onClick={() => {
              l.direction.current = 1;
              l.setPlaying(!l.playing);
            }}
          >
            <Icon name={l.playing ? "pause" : "play"} />
            <span>{l.playing ? "순회 중" : "입력 관찰"}</span>
          </button>
          <span className="probe-value">
            x <strong>{l.input.toFixed(2)}</strong>
          </span>
          <input
            aria-label="관찰 입력 x"
            type="range"
            min="-5"
            max="5"
            step=".01"
            value={l.input}
            onChange={(e) => l.setInput(+e.target.value)}
          />
          <span className="probe-output">
            ŷ <strong>{format(l.f.y, 4)}</strong>
          </span>
          <button
            className="icon-button"
            aria-label="입력 관찰 설정 열기"
            onClick={() => setPanel("observation")}
          >
            <Icon name="settings" />
          </button>
        </section>
        <section
          className="training-dock"
          aria-label="학습 도크"
          data-testid="training-dock"
          data-step={l.step}
        >
          <div className="dock-primary">
            <button
              className="primary train-button"
              onClick={() => {
                l.train(l.running ? "pause" : "run");
                setDockMore(false);
              }}
            >
              <Icon name={l.running ? "pause" : "play"} />
              {l.running ? "일시정지" : l.step ? "학습 재개" : "학습 시작"}
            </button>
            <button
              className="step-button"
              disabled={l.running || l.data.length < 2}
              onClick={() => l.train("step")}
            >
              <Icon name="step" />한 스텝
            </button>
            <button
              className="mobile-edit"
              aria-label="현재 화면 편집"
              onClick={openEditor}
            >
              <Icon name={l.tab === "analysis" ? "settings" : "edit"} />
              {l.tab === "analysis" ? "설정" : "편집"}
            </button>
            <button
              className="icon-button mobile-more"
              aria-label="학습 추가 조작"
              aria-expanded={dockMore}
              onClick={() => setDockMore(!dockMore)}
            >
              <Icon name="more" />
            </button>
          </div>
          <div className={`dock-secondary ${dockMore ? "expanded" : ""}`}>
            <button
              disabled={l.running || l.data.length < 2}
              onClick={() => {
                l.train("epoch");
                setDockMore(false);
              }}
            >
              한 Epoch
            </button>
            <button
              disabled={!l.step && !l.running}
              title="가중치를 유지하고 학습 세션을 끝냅니다. 일시정지는 Optimizer를 유지합니다."
              onClick={() => {
                l.stopWorker();
                l.setMessage("학습을 종료했습니다. 가중치는 유지됩니다.");
                setDockMore(false);
              }}
            >
              <Icon name="stop" />
              정지
            </button>
            <button
              className="reset-button"
              disabled={l.running}
              onClick={() => {
                setPanel("reset");
                setDockMore(false);
              }}
            >
              <Icon name="reset" />
              초기화
            </button>
          </div>
          <div className="dock-right">
            <button onClick={() => setPanel("settings")}>
              <Icon name="settings" />
              학습 설정
            </button>
            <span className="dock-description">
              {l.running
                ? "데이터에서 학습하고 있습니다."
                : "관찰하거나, 연결을 바꾸어 보세요."}
            </span>
          </div>
          <div className="notice" role="status" title={l.message}>
            {l.message}
          </div>
        </section>
        <section
          id="pane-analysis"
          className={`analysis-workspace ${analysis ? "expanded" : ""}`}
          aria-label="분석 화면"
        >
          <button
            className="analysis-toggle"
            aria-expanded={analysis}
            onClick={() => setAnalysis(!analysis)}
          >
            <span>
              <Icon name="chart" />
              학습 분석{" "}
              <small>
                {l.step
                  ? `${l.step.toLocaleString()}회 업데이트`
                  : "손실 · 가중치 · 기울기"}
              </small>
            </span>
            <span>{analysis ? "접기 −" : "펼치기 ＋"}</span>
          </button>
          {(analysis || l.tab === "analysis") && <Analysis lab={l} />}
        </section>
      </main>
      {panel && (
        <Drawer
          title={title}
          onClose={() => setPanel(null)}
          returnFocus={opener.current}
        >
          {panel === "data" ? (
            <DataEditor lab={l} />
          ) : panel === "model" ? (
            <ModelEditor lab={l} />
          ) : panel === "settings" ? (
            <TrainingSettings lab={l} />
          ) : panel === "observation" ? (
            <ObservationSettings lab={l} />
          ) : panel === "reset" ? (
            <>
              <p>
                모델 가중치와 학습 이력을 초기화합니다. 현재 데이터와 신경망
                구조는 유지합니다.
              </p>
              <div className="button-row">
                <button onClick={() => setPanel(null)}>취소</button>
                <button
                  className="danger"
                  onClick={() => {
                    l.resetModel();
                    setPanel(null);
                  }}
                >
                  초기화 실행
                </button>
              </div>
            </>
          ) : (
            <>
              <label className="field">
                <span>실험 이름</span>
                <input
                  aria-label="실험 이름"
                  value={l.name}
                  maxLength={200}
                  onChange={(e) => l.setName(e.target.value)}
                />
              </label>
              <div className="menu-actions">
                <button onClick={save}>
                  <Icon name="save" />
                  실험 저장 · JSON
                </button>
                <button onClick={() => l.file.current?.click()}>
                  <Icon name="download" />
                  실험 불러오기
                </button>
                <button onClick={() => setPanel("settings")}>
                  <Icon name="settings" />
                  학습 설정
                </button>
                <a
                  href="https://github.com/oyueo-mm/NeuralCanvas"
                  target="_blank"
                  rel="noreferrer"
                >
                  GitHub 저장소 ↗
                </a>
              </div>
              <p className="caption">
                변경 내용은 이 브라우저에 자동 저장됩니다. JSON 파일로 다른
                기기에 실험을 옮길 수 있습니다.
              </p>
              <details className="editor-section">
                <summary>처음 사용하시나요?</summary>
                <p>
                  점 편집 모드에서 그래프를 눌러 데이터를 추가하세요. 모델
                  편집에서 층과 연결을 바꾸고, 학습 시작을 눌러 실제 예측이
                  변하는 과정을 관찰하세요.
                </p>
                <p>
                  일시정지는 학습 상태를 유지합니다. 정지는 가중치를 유지하고
                  학습 세션을 종료합니다. 데이터·모델 수정은 학습 이력을
                  초기화합니다.
                </p>
              </details>
            </>
          )}
        </Drawer>
      )}
      <input
        hidden
        ref={l.file}
        type="file"
        accept=".json"
        onChange={(e) => l.importFile(e, "experiment")}
      />
      <input
        hidden
        ref={l.datasetFile}
        type="file"
        accept=".json,.csv"
        onChange={(e) => l.importFile(e, "dataset")}
      />
    </div>
  );
}

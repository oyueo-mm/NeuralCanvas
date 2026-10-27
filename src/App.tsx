import { useCallback, useEffect, useRef, useState } from "react";
import { useLab } from "./useLab";
import { Plot } from "./Plot";
import type { Selection } from "./Network";
import { DataEditor } from "./Panels";
import {
  Sidebar,
  defaultSections,
  type SectionId,
  type SectionState,
} from "./Sidebar";
import { Drawer, format, Icon, useCompact } from "./ui";
import { download } from "./storage";
type Panel = "data" | "reset" | null;
type Ui = { sidebar: boolean; sections: SectionState };
const uiKey = "neuralcanvas-ui";
function loadUi(): Ui {
  const fallback = { sidebar: true, sections: defaultSections };
  try {
    const stored = JSON.parse(localStorage.getItem(uiKey) ?? "null");
    if (!stored) return fallback;
    return {
      sidebar: stored.sidebar !== false,
      sections: Object.fromEntries(
        Object.entries(defaultSections).map(([k, v]) => [
          k,
          typeof stored.sections?.[k] === "boolean" ? stored.sections[k] : v,
        ]),
      ) as SectionState,
    };
  } catch {
    return fallback;
  }
}
const isError = (text: string) =>
  /실패|오류|Error|두 개 이상|복원하지/.test(text);
export default function App() {
  const l = useLab(),
    compact = useCompact(),
    [panel, setPanel] = useState<Panel>(null),
    [ui, setUi] = useState(loadUi),
    [drawer, setDrawer] = useState(false),
    [expanded, setExpanded] = useState(false),
    [menu, setMenu] = useState(false),
    [toast, setToast] = useState(false);
  const opener = useRef<HTMLElement | null>(null),
    toggle = useRef<HTMLButtonElement>(null),
    menuButton = useRef<HTMLButtonElement>(null),
    menuBox = useRef<HTMLDivElement>(null);
  const visible = compact ? drawer : ui.sidebar;
  useEffect(() => {
    try {
      localStorage.setItem(uiKey, JSON.stringify(ui));
    } catch {
      /* Storage may be unavailable. */
    }
  }, [ui]);
  const toggleSidebar = () => {
    setExpanded(false);
    if (compact) setDrawer(!drawer);
    else setUi({ ...ui, sidebar: !ui.sidebar });
  };
  const toggleSection = useCallback(
    (id: SectionId) =>
      setUi((u) => ({
        ...u,
        sections: { ...u.sections, [id]: !u.sections[id] },
      })),
    [],
  );
  useEffect(() => {
    if (!visible) setExpanded(false);
  }, [visible]);
  useEffect(() => {
    if (!l.message) {
      setToast(false);
      return;
    }
    setToast(true);
    const timer = setTimeout(
      () => setToast(false),
      isError(l.message) ? 7000 : 3000,
    );
    return () => clearTimeout(timer);
  }, [l.message, l.messageId]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || panel || menu) return;
      if (expanded) setExpanded(false);
      else if (compact && drawer) {
        setDrawer(false);
        toggle.current?.focus({ preventScroll: true });
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [panel, menu, expanded, compact, drawer]);
  useEffect(() => {
    if (!menu) return;
    const onDown = (e: PointerEvent) => {
      const target = e.target as Node;
      if (
        !menuBox.current?.contains(target) &&
        !menuButton.current?.contains(target)
      )
        setMenu(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setMenu(false);
        menuButton.current?.focus({ preventScroll: true });
      }
    };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [menu]);
  // Plot props must not change identity while only the sidebar re-renders.
  const dataSnapshot = useRef({
    model: l.model,
    input: l.input,
    input2: l.input2,
  });
  dataSnapshot.current = { model: l.model, input: l.input, input2: l.input2 };
  const openData = useCallback(() => {
    opener.current = document.activeElement as HTMLElement;
    setPanel("data");
  }, []);
  const selectObject = useCallback(
    (selection: Selection) => l.setSelection(selection),
    [l.setSelection],
  );
  const observe = useCallback(
    (x: number, y: number) => {
      l.setInput(x);
      l.setInput2(y);
    },
    [l.setInput, l.setInput2],
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
  const save = () => {
    setMenu(false);
    download(
      "neuralcanvas-experiment.json",
      JSON.stringify(l.experiment(), null, 2),
    );
  };
  const state = l.running
    ? "학습 중"
    : l.epoch >= l.settings.epochs
      ? "학습 완료"
      : l.step
        ? "대기"
        : "준비";
  const metric = l.task === "classification" ? "BCE" : "MSE";
  return (
    <div
      className={`app-shell task-${l.task} ${visible ? "sidebar-open" : "sidebar-closed"}`}
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
        <a className="brand" href="#" aria-label="NeuralCanvas">
          <span className="brand-mark">
            <Icon name="network" />
          </span>
          <strong>
            Neural<span>Canvas</span>
          </strong>
        </a>
        <div className="segmented" role="group" aria-label="실험 유형">
          <button
            aria-pressed={l.task === "regression"}
            onClick={() => l.switchTask("regression")}
          >
            회귀
          </button>
          <button
            aria-pressed={l.task === "classification"}
            onClick={() => l.switchTask("classification")}
          >
            분류
          </button>
        </div>
        <div className="header-actions">
          <span className={`status-badge ${l.running ? "running" : ""}`}>
            <i />
            <span>{state}</span>
          </span>
          <div className="menu-wrap">
            <button
              ref={menuButton}
              className="icon-button"
              aria-label="실험 메뉴 열기"
              aria-expanded={menu}
              aria-haspopup="true"
              title="더보기"
              onClick={() => setMenu(!menu)}
            >
              <Icon name="more" />
            </button>
            {menu && (
              <div
                ref={menuBox}
                className="menu"
                aria-label="실험 메뉴"
                role="group"
              >
                <label className="field">
                  <span>실험 이름</span>
                  <input
                    aria-label="실험 이름"
                    value={l.name}
                    maxLength={200}
                    onChange={(e) => l.setName(e.target.value)}
                  />
                </label>
                <button onClick={save}>
                  <Icon name="save" />
                  저장
                </button>
                <button
                  onClick={() => {
                    setMenu(false);
                    l.file.current?.click();
                  }}
                >
                  <Icon name="download" />
                  불러오기
                </button>
                <a
                  href="https://github.com/oyueo-mm/NeuralCanvas"
                  target="_blank"
                  rel="noreferrer"
                  onClick={() => setMenu(false)}
                >
                  GitHub ↗
                </a>
              </div>
            )}
          </div>
          <button
            ref={toggle}
            className="icon-button sidebar-toggle"
            aria-label={visible ? "사이드바 닫기" : "사이드바 열기"}
            aria-expanded={visible}
            aria-controls="sidebar"
            title={visible ? "사이드바 닫기" : "사이드바 열기"}
            onClick={toggleSidebar}
          >
            <Icon name="sidebar" />
          </button>
        </div>
      </header>
      <div className="workbench">
        <main className="stage">
          <Plot
            key={l.task}
            exportRef={l.plotSVG}
            model={dataSnapshot.current.model}
            data={l.data}
            input={dataSnapshot.current.input}
            input2={dataSnapshot.current.input2}
            activeClass={l.activeClass}
            classDefinitions={l.classDefinitions}
            setActiveClass={l.setActiveClass}
            resolution={l.resolution}
            setResolution={l.setResolution}
            observe={observe}
            change={l.changeData}
            selected={l.point}
            select={l.setPoint}
            edit={openData}
            validationIndices={l.validationIndices}
          />
          <section
            className="dock"
            aria-label="학습 컨트롤"
            data-testid="training-dock"
            data-step={l.step}
          >
            <div className="dock-controls">
              <button
                className="primary train-button"
                onClick={() => l.train(l.running ? "pause" : "run")}
              >
                <Icon name={l.running ? "pause" : "play"} />
                {l.running ? "일시정지" : l.step ? "학습 재개" : "학습 시작"}
              </button>
              <button
                aria-label="한 스텝"
                title="한 스텝"
                disabled={l.running || l.data.length < 2}
                onClick={() => l.train("step")}
              >
                <Icon name="step" />
                <span>한 스텝</span>
              </button>
              <button
                aria-label="한 Epoch"
                title="한 Epoch"
                disabled={l.running || l.data.length < 2}
                onClick={() => l.train("epoch")}
              >
                <Icon name="epoch" />
                <span>한 Epoch</span>
              </button>
              <button
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
              <button
                className="reset-button"
                aria-label="초기화"
                title="초기화"
                disabled={l.running}
                onClick={() => setPanel("reset")}
              >
                <Icon name="reset" />
                <span>초기화</span>
              </button>
            </div>
            <dl className="metrics" aria-label="학습 지표">
              <div>
                <dt>Epoch</dt>
                <dd data-testid="epoch">
                  {l.epoch.toLocaleString()}
                  <small>/{l.settings.epochs.toLocaleString()}</small>
                </dd>
              </div>
              <div>
                <dt>{metric}</dt>
                <dd data-testid="loss">
                  {l.latest ? format(l.latest.train) : "—"}
                </dd>
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
            </dl>
            <div
              className={`toast ${toast && l.message ? "show" : ""} ${isError(l.message) ? "error" : ""}`}
              role="status"
            >
              {toast ? l.message : ""}
            </div>
          </section>
        </main>
        {compact && drawer && (
          <button
            className="sidebar-backdrop"
            tabIndex={-1}
            aria-hidden="true"
            onClick={() => setDrawer(false)}
          />
        )}
        <Sidebar
          lab={l}
          visible={visible}
          sections={ui.sections}
          toggleSection={toggleSection}
          select={selectObject}
          networkExpanded={expanded}
          toggleExpanded={() => setExpanded(!expanded)}
          save={save}
        />
      </div>
      {panel && (
        <Drawer
          title={panel === "data" ? "데이터 편집" : "모델 초기화"}
          onClose={() => setPanel(null)}
          returnFocus={opener.current}
        >
          {panel === "data" ? (
            <DataEditor lab={l} />
          ) : (
            <>
              <p>가중치와 학습 이력을 초기화합니다.</p>
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

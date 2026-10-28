import { useCallback, useEffect, useRef, useState } from "react";
import { useLab } from "./useLab";
import { DataEditor } from "./Panels";
import { Home } from "./Home";
import { LabPage } from "./LabPage";
import { DataPage } from "./DataPage";
import { PresetsPage } from "./PresetsPage";
import { ResultsPage } from "./ResultsPage";
import { NetworkPage } from "./NetworkPage";
import { Nav, pages, type Page } from "./Nav";
import { Drawer, Icon, useCompact, usePersisted, useWhileActive } from "./ui";
import { download } from "./storage";
type Panel = "data" | "reset" | null;
const isError = (text: string) =>
  /실패|오류|Error|두 개 이상|복원하지|발산/.test(text);
const taskPages: Page[] = ["lab", "data", "network", "results"];
export default function App() {
  const l = useLab(),
    compact = useCompact(),
    [page, setPage] = useState<Page>("home"),
    [seen, setSeen] = useState<Set<Page>>(new Set(["lab"])),
    [collapsed, setCollapsed] = usePersisted("neuralcanvas-nav", false),
    [navOpen, setNavOpen] = useState(false),
    [panel, setPanel] = useState<Panel>(null),
    [menu, setMenu] = useState(false),
    [toast, setToast] = useState(false);
  const opener = useRef<HTMLElement | null>(null),
    heading = useRef<HTMLHeadingElement>(null),
    menuButton = useRef<HTMLButtonElement>(null),
    menuBox = useRef<HTMLDivElement>(null),
    menuToggle = useRef<HTMLButtonElement>(null),
    first = useRef(true);
  const go = useCallback((next: Page) => {
    setPage(next);
    setSeen((s) => (s.has(next) ? s : new Set(s).add(next)));
    setNavOpen(false);
  }, []);
  useEffect(() => {
    if (first.current) first.current = false;
    else heading.current?.focus({ preventScroll: true });
  }, [page]);
  useEffect(() => {
    if (!compact) setNavOpen(false);
  }, [compact]);
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
    if (!navOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || panel || menu) return;
      setNavOpen(false);
      menuToggle.current?.focus({ preventScroll: true });
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [navOpen, panel, menu]);
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
  useEffect(() => {
    const viewport = window.visualViewport;
    const update = () =>
      document.documentElement.style.setProperty(
        "--visual-height",
        `${viewport?.height ?? window.innerHeight}px`,
      );
    viewport?.addEventListener("resize", update);
    update();
    return () => viewport?.removeEventListener("resize", update);
  }, []);
  // Hidden pages keep their state but stop re-rendering with every training update.
  const lab = useWhileActive(l, page === "lab"),
    data = useWhileActive(l, page === "data"),
    network = useWhileActive(l, page === "network"),
    results = useWhileActive(l, page === "results"),
    presets = useWhileActive(l, page === "presets");
  const openData = useCallback(() => {
    opener.current = document.activeElement as HTMLElement;
    setPanel("data");
  }, []);
  const askReset = useCallback(() => {
    opener.current = document.activeElement as HTMLElement;
    setPanel("reset");
  }, []);
  const toResults = useCallback(() => go("results"), [go]);
  const toLab = useCallback(() => go("lab"), [go]);
  const save = () => {
    setMenu(false);
    download(
      "neuralcanvas-experiment.json",
      JSON.stringify(l.experiment(), null, 2),
    );
  };
  const state = l.running
    ? l.mode === "turbo"
      ? "고속 학습 중"
      : "학습 중"
    : l.epoch >= l.settings.epochs
      ? "학습 완료"
      : l.step
        ? "대기"
        : "준비";
  const title = pages.find((p) => p.id === page)!.label;
  const pane = (id: Page) => ({
    hidden: page !== id,
    className: `page page-${id}`,
    "data-page": id,
  });
  return (
    <div
      className={`app-shell task-${l.task} ${collapsed && !compact ? "nav-collapsed" : ""}`}
      data-page={page}
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
      <a href="#page-content" className="skip-link">
        본문으로 이동
      </a>
      <Nav
        page={page}
        go={go}
        collapsed={collapsed}
        toggle={() => setCollapsed(!collapsed)}
        compact={compact}
        open={navOpen}
        close={() => {
          setNavOpen(false);
          menuToggle.current?.focus({ preventScroll: true });
        }}
      />
      <div className="workspace" inert={compact && navOpen}>
        <header className="topbar">
          {compact && (
            <button
              ref={menuToggle}
              className="icon-button"
              aria-label="메뉴 열기"
              aria-expanded={navOpen}
              aria-controls="nav"
              onClick={() => setNavOpen(true)}
            >
              <Icon name="menu" />
            </button>
          )}
          <h1 ref={heading} tabIndex={-1} className="page-title">
            {title}
          </h1>
          <div className="header-actions">
            {taskPages.includes(page) && (
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
            )}
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
          </div>
        </header>
        <main id="page-content" className="page-content">
          {page === "home" && (
            <div className="page page-home" data-page="home">
              <Home onStart={() => go("lab")} onPresets={() => go("presets")} />
            </div>
          )}
          <div {...pane("lab")}>
            <LabPage
              lab={lab}
              edit={openData}
              onReset={askReset}
              onResults={toResults}
            />
          </div>
          {seen.has("data") && (
            <div {...pane("data")}>
              <DataPage lab={data} />
            </div>
          )}
          {seen.has("presets") && (
            <div {...pane("presets")}>
              <PresetsPage lab={presets} onApplied={toLab} />
            </div>
          )}
          {seen.has("results") && (
            <div {...pane("results")}>
              <ResultsPage lab={results} />
            </div>
          )}
          {seen.has("network") && (
            <div {...pane("network")}>
              <NetworkPage lab={network} active={page === "network"} />
            </div>
          )}
        </main>
        <div
          className={`toast ${toast && l.message ? "show" : ""} ${isError(l.message) ? "error" : ""}`}
          role="status"
        >
          {toast ? l.message : ""}
        </div>
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

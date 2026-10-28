import { Icon } from "./ui";
export type Page = "home" | "lab" | "data" | "presets" | "results" | "network";
export const pages: { id: Page; label: string; icon: string }[] = [
  { id: "home", label: "홈", icon: "home" },
  { id: "lab", label: "학습 환경", icon: "lab" },
  { id: "data", label: "데이터 편집", icon: "data" },
  { id: "presets", label: "프리셋", icon: "presets" },
  { id: "results", label: "학습 결과", icon: "chart" },
  { id: "network", label: "신경망", icon: "network" },
];
export function Nav({
  page,
  go,
  collapsed,
  toggle,
  compact,
  open,
  close,
}: {
  page: Page;
  go: (page: Page) => void;
  collapsed: boolean;
  toggle: () => void;
  compact: boolean;
  open: boolean;
  close: () => void;
}) {
  // On narrow screens the same navigation is an overlay drawer that is never collapsed.
  const iconOnly = collapsed && !compact;
  return (
    <>
      {compact && open && (
        <button
          className="nav-backdrop"
          aria-label="메뉴 닫기"
          tabIndex={-1}
          onClick={close}
        />
      )}
      <aside
        id="nav"
        className={`nav ${iconOnly ? "collapsed" : ""} ${open ? "open" : ""}`}
        aria-label="주 메뉴"
        inert={compact && !open}
      >
        <div className="nav-head">
          <button
            className="brand"
            aria-label="NeuralCanvas 홈"
            onClick={() => go("home")}
          >
            <span className="brand-mark">
              <Icon name="network" />
            </span>
            <strong className="nav-label">
              Neural<span>Canvas</span>
            </strong>
          </button>
          <button
            className="nav-collapse"
            aria-label={
              compact
                ? "메뉴 닫기"
                : collapsed
                  ? "사이드바 펼치기"
                  : "사이드바 접기"
            }
            aria-expanded={compact ? open : !collapsed}
            aria-controls="nav-list"
            data-tip={collapsed && !compact ? "사이드바 펼치기" : undefined}
            onClick={compact ? close : toggle}
          >
            <Icon name={compact ? "close" : "panelLeft"} />
          </button>
        </div>
        <nav id="nav-list" aria-label="페이지">
          {pages.map((p) => (
            <button
              key={p.id}
              data-testid={`nav-${p.id}`}
              data-tip={iconOnly ? p.label : undefined}
              aria-label={p.label}
              aria-current={page === p.id ? "page" : undefined}
              onClick={() => go(p.id)}
            >
              <Icon name={p.icon} />
              <span className="nav-label">{p.label}</span>
            </button>
          ))}
        </nav>
      </aside>
    </>
  );
}

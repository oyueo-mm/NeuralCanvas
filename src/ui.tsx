import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { flushSync } from "react-dom";
export const format = (n: number, digits = 5) =>
  Number.isFinite(n) ? Number(n.toPrecision(digits)).toString() : "—";
export function useCompact() {
  const [compact, setCompact] = useState(
    () => matchMedia("(max-width:900px)").matches,
  );
  useEffect(() => {
    const query = matchMedia("(max-width:900px)"),
      update = () => setCompact(query.matches);
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);
  return compact;
}
export function NumberField({
  label,
  value,
  onChange,
  min = -1e6,
  max = 1e6,
  step = "any",
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  step?: number | "any";
}) {
  const [focused, setFocused] = useState(false),
    [draft, setDraft] = useState(String(value));
  const id = useId();
  return (
    <label className="field" htmlFor={id}>
      <span>{label}</span>
      <input
        id={id}
        type="number"
        inputMode={step === 1 ? "numeric" : "decimal"}
        aria-label={label}
        min={min}
        max={max}
        step={step}
        value={focused ? draft : format(value, 7)}
        title={`전체 정밀도: ${value}`}
        onFocus={(e) => {
          flushSync(() => {
            setFocused(true);
            setDraft(String(value));
          });
          e.currentTarget.select();
        }}
        onChange={(e) => {
          setDraft(e.target.value);
          const n = e.target.valueAsNumber;
          if (
            Number.isFinite(n) &&
            n >= min &&
            n <= max &&
            (step !== 1 || Number.isInteger(n))
          )
            onChange(n);
        }}
        onBlur={() => setFocused(false)}
      />
    </label>
  );
}
export function Drawer({
  title,
  children,
  onClose,
  returnFocus,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
  returnFocus?: HTMLElement | null;
}) {
  const dialog = useRef<HTMLDialogElement>(null),
    id = useId(),
    pressed = useRef(false),
    closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    const origin =
      returnFocus ?? (document.activeElement as HTMLElement | null);
    dialog.current?.showModal();
    const before = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = before;
      dialog.current?.close();
      if (origin?.isConnected) origin.focus({ preventScroll: true });
    };
  }, []);
  return (
    <dialog
      ref={dialog}
      className="drawer"
      aria-labelledby={id}
      onPointerDownCapture={() => (pressed.current = true)}
      // A touch that opened this drawer is followed by a synthesized click at the same
      // spot. It has no pointerdown inside the drawer, so it must not activate anything.
      onClickCapture={(e) => {
        if (e.detail > 0 && !pressed.current) {
          e.stopPropagation();
          e.preventDefault();
        }
      }}
      onCancel={(e) => {
        e.preventDefault();
        closeRef.current();
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          const r = e.currentTarget.getBoundingClientRect();
          if (
            e.clientX < r.left ||
            e.clientX > r.right ||
            e.clientY < r.top ||
            e.clientY > r.bottom
          )
            closeRef.current();
        }
      }}
    >
      <div className="sheet-handle" />
      <header className="drawer-header">
        <h2 id={id}>{title}</h2>
        <button
          className="icon-button"
          aria-label="패널 닫기"
          onClick={onClose}
        >
          <Icon name="close" />
        </button>
      </header>
      <div className="drawer-content">{children}</div>
    </dialog>
  );
}
export function Icon({ name }: { name: string }) {
  const paths: Record<string, ReactNode> = {
    play: <path d="m8 5 11 7-11 7Z" />,
    pause: (
      <>
        <path d="M8 5v14M16 5v14" />
      </>
    ),
    settings: (
      <>
        <path d="M4 7h16M4 17h16M8 4v6M16 14v6" />
      </>
    ),
    save: (
      <>
        <path d="M5 3h12l4 4v14H3V3h2Z" />
        <path d="M7 3v6h10V3M7 21v-8h10v8" />
      </>
    ),
    more: (
      <>
        <circle cx="5" cy="12" r="1" />
        <circle cx="12" cy="12" r="1" />
        <circle cx="19" cy="12" r="1" />
      </>
    ),
    data: (
      <>
        <path d="M4 3v17h17M6 15l5-6 5 3 5-7" />
        <circle cx="11" cy="9" r="1.5" />
      </>
    ),
    network: (
      <>
        <path d="m5 12 7-7 7 7-7 7-7-7Zm0 0h14M12 5v14" />
        <circle cx="5" cy="12" r="2" />
        <circle cx="12" cy="5" r="2" />
        <circle cx="19" cy="12" r="2" />
        <circle cx="12" cy="19" r="2" />
      </>
    ),
    chart: (
      <>
        <path d="M4 3v17h17M7 8l4 5 4-7 5-3" />
      </>
    ),
    edit: (
      <>
        <path d="m15 4 5 5M4 20l5-1L21 7l-5-5L4 14v6Z" />
      </>
    ),
    close: <path d="m6 6 12 12M6 18 18 6" />,
    plus: <path d="M12 5v14M5 12h14" />,
    minus: <path d="M5 12h14" />,
    fit: (
      <>
        <path d="M8 3H3v5M16 3h5v5M3 16v5h5M21 16v5h-5" />
        <circle cx="12" cy="12" r="3" />
      </>
    ),
    step: (
      <>
        <path d="m5 5 10 7-10 7ZM19 5v14" />
      </>
    ),
    reset: (
      <>
        <path d="M4 10a8 8 0 1 1 1 8M4 4v6h6" />
      </>
    ),
    pan: (
      <>
        <path d="M12 2v20M2 12h20m-14-6 4-4 4 4M8 18l4 4 4-4M6 8l-4 4 4 4m12-8 4 4-4 4" />
      </>
    ),
    download: (
      <>
        <path d="M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5" />
      </>
    ),
    stop: <rect x="6" y="6" width="12" height="12" rx="1" />,
    epoch: <path d="m4 5 8 7-8 7ZM12 5l8 7-8 7Z" />,
    cursor: <path d="m5 3 14 8-6.5 2L10 19.5Z" />,
    draw: <path d="M3 16c3-9 5-9 7-4s4 5 7-4c1.5-3.5 2.5-3 4-2" />,
    probe: (
      <>
        <circle cx="12" cy="12" r="3" />
        <path d="M12 3v4M12 17v4M3 12h4M17 12h4" />
      </>
    ),
    sidebar: (
      <>
        <rect x="3" y="4" width="18" height="16" rx="2" />
        <path d="M15 4v16" />
      </>
    ),
    expand: <path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7" />,
    collapse: <path d="M21 9h-6V3M3 15h6v6M15 9l6-6M9 15l-6 6" />,
    down: <path d="m6 9 6 6 6-6" />,
    chevron: <path d="m8 5 7 7-7 7" />,
    help: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M9 8a3 3 0 1 1 4 3c-1 0-1 2-1 2M12 17h.01" />
      </>
    ),
  };
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {paths[name] ?? paths.more}
    </svg>
  );
}
export function useElementSize() {
  const ref = useRef<HTMLDivElement>(null),
    [size, setSize] = useState({ width: 600, height: 400 });
  useEffect(() => {
    const target = ref.current;
    if (!target) return;
    const observer = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      if (width > 0 && height > 0) setSize({ width, height });
    });
    observer.observe(target);
    return () => observer.disconnect();
  }, []);
  return { ref, ...size };
}

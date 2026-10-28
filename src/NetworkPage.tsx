import { memo, useEffect, useRef, useState } from "react";
import { ModelEditor, ObservationPanel } from "./Panels";
import {
  NetworkView,
  type EdgeMode,
  type ValueMode,
} from "./NetworkView";
import { exportSVG } from "./storage";
import { Drawer, Icon, useCompact, usePersisted } from "./ui";
import type { Lab } from "./useLab";
/** Network page: a large canvas with a collapsible inspector (a bottom sheet on narrow screens). */
export const NetworkPage = memo(function NetworkPage({
  lab: l,
  active,
}: {
  lab: Lab;
  active: boolean;
}) {
  const compact = useCompact(),
    [inspector, setInspector] = usePersisted("neuralcanvas-inspector", true),
    [sheet, setSheet] = useState(false),
    [edgeMode, setEdgeMode] = usePersisted<EdgeMode>("neuralcanvas-edges", "all"),
    [valueMode, setValueMode] = useState<ValueMode>("index"),
    opener = useRef<HTMLElement | null>(null);
  // On a narrow screen a chosen neuron or connection opens the sheet.
  useEffect(() => {
    if (compact && active && l.selection) setSheet(true);
  }, [compact, active, l.selection]);
  const panel = (
    <>
      <ModelEditor lab={l} />
      <section className="editor-section">
        <h3>입력 관찰</h3>
        <ObservationPanel lab={l} />
      </section>
    </>
  );
  const toggle = (
    <button
      className="tool"
      aria-label={compact ? "신경망 편집 열기" : inspector ? "Inspector 닫기" : "Inspector 열기"}
      aria-pressed={compact ? sheet : inspector}
      title="Inspector"
      onClick={() => {
        opener.current = document.activeElement as HTMLElement;
        if (compact) setSheet(true);
        else setInspector(!inspector);
      }}
    >
      <Icon name="panelRight" />
    </button>
  );
  const png = (
    <button
      className="tool"
      aria-label="신경망 PNG 내보내기"
      title="PNG 내보내기"
      onClick={() =>
        l.networkSVG.current &&
        exportSVG(l.networkSVG.current, "neuralcanvas-network.png")
      }
    >
      <Icon name="download" />
    </button>
  );
  return (
    <div className={`network-stage ${!compact && inspector ? "with-inspector" : ""}`}>
      <div className="network-main">
        <NetworkView
          key={l.task}
          exportRef={l.networkSVG}
          model={l.model}
          input={l.input}
          input2={l.input2}
          selection={l.selection}
          select={l.setSelection}
          gradient={l.gradient}
          playing={l.playing}
          phase={l.phase}
          edgeMode={edgeMode}
          setEdgeMode={setEdgeMode}
          valueMode={valueMode}
          setValueMode={setValueMode}
          extra={
            <>
              {png}
              {toggle}
            </>
          }
        />
      </div>
      {!compact && inspector && (
        <aside className="inspector-panel" aria-label="Inspector">
          {panel}
        </aside>
      )}
      {compact && sheet && (
        <Drawer
          title="신경망 편집"
          onClose={() => setSheet(false)}
          returnFocus={opener.current}
        >
          {panel}
        </Drawer>
      )}
    </div>
  );
});

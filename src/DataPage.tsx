import { memo, useCallback, useRef, useState } from "react";
import { DataEditor, DataFiles } from "./Panels";
import { Plot } from "./Plot";
import { Drawer, useCompact } from "./ui";
import type { Lab } from "./useLab";
/** Data editing: the same dataset as the lab on a large graph, with the editing tools beside it. */
export const DataPage = memo(function DataPage({ lab: l }: { lab: Lab }) {
  const compact = useCompact(),
    [sheet, setSheet] = useState(false),
    plotRef = useRef<SVGSVGElement | null>(null),
    opener = useRef<HTMLElement | null>(null);
  const observe = useCallback(
    (x: number, y: number) => {
      l.setInput(x);
      l.setInput2(y);
    },
    [l.setInput, l.setInput2],
  );
  const tools = (
    <>
      <DataEditor lab={l} />
      <DataFiles lab={l} />
    </>
  );
  return (
    <div className="data-stage">
      <div className="data-main">
        <Plot
          key={l.task}
          exportRef={plotRef}
          model={l.model}
          data={l.data}
          input={l.input}
          input2={l.input2}
          activeClass={l.activeClass}
          classDefinitions={l.classDefinitions}
          setActiveClass={l.setActiveClass}
          resolution={l.resolution}
          observe={observe}
          change={l.changeData}
          selected={l.point}
          select={l.setPoint}
          edit={
            compact
              ? () => {
                  opener.current = document.activeElement as HTMLElement;
                  setSheet(true);
                }
              : undefined
          }
          validationIndices={l.validationIndices}
        />
      </div>
      {!compact && (
        <aside className="data-panel" aria-label="데이터 편집 도구">
          {tools}
        </aside>
      )}
      {compact && sheet && (
        <Drawer
          title="데이터 편집"
          onClose={() => setSheet(false)}
          returnFocus={opener.current}
        >
          {tools}
        </Drawer>
      )}
    </div>
  );
});

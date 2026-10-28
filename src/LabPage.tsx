import { memo, useCallback } from "react";
import { DataEditor, DataFiles } from "./Panels";
import { Plot } from "./Plot";
import { TrainingToolbar } from "./Toolbar";
import { useCompact } from "./ui";
import type { Lab } from "./useLab";
/**
 * One graph serves both the learning environment and the data editor, so zoom, selection and
 * data are shared. The lab floats the training toolbar over it; the editor docks its tools beside it.
 */
export const LabPage = memo(function LabPage({
  page,
  lab: l,
  edit,
  onReset,
  onResults,
}: {
  page: "lab" | "data";
  lab: Lab;
  edit: () => void;
  onReset: () => void;
  onResults: () => void;
}) {
  const compact = useCompact(),
    editing = page === "data",
    docked = editing && !compact;
  const observe = useCallback(
    (x: number, y: number) => {
      l.setInput(x);
      l.setInput2(y);
    },
    [l.setInput, l.setInput2],
  );
  return (
    <div
      className={`lab-stage ${editing ? "editing" : ""} ${docked ? "docked" : ""}`}
    >
      <div className="lab-graph">
        <Plot
          key={l.task}
          exportRef={l.plotSVG}
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
          edit={docked ? undefined : edit}
          validationIndices={l.validationIndices}
        />
        {!editing && (
          <TrainingToolbar lab={l} onReset={onReset} onResults={onResults} />
        )}
      </div>
      {docked && (
        <aside className="data-panel" aria-label="데이터 편집 도구">
          <DataEditor lab={l} />
          <DataFiles lab={l} />
        </aside>
      )}
    </div>
  );
});

import { memo, useCallback } from "react";
import { Plot } from "./Plot";
import { TrainingToolbar } from "./Toolbar";
import type { Lab } from "./useLab";
/** Learning environment: the data graph fills the page and the training toolbar floats over it. */
export const LabPage = memo(function LabPage({
  lab: l,
  edit,
  onReset,
  onResults,
}: {
  lab: Lab;
  edit: () => void;
  onReset: () => void;
  onResults: () => void;
}) {
  const observe = useCallback(
    (x: number, y: number) => {
      l.setInput(x);
      l.setInput2(y);
    },
    [l.setInput, l.setInput2],
  );
  return (
    <div className="lab-stage">
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
        edit={edit}
        validationIndices={l.validationIndices}
      />
      <TrainingToolbar lab={l} onReset={onReset} onResults={onResults} />
    </div>
  );
});

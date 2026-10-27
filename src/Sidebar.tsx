import { useId, useRef, type ReactNode } from "react";
import { Analysis } from "./Analysis";
import { Network, type Selection } from "./Network";
import {
  FilesPanel,
  ModelEditor,
  ObservationPanel,
  TrainingSettings,
} from "./Panels";
import { Icon } from "./ui";
import type { Lab } from "./useLab";
export type SectionId =
  "network" | "training" | "analysis" | "observe" | "files";
export type SectionState = Record<SectionId, boolean>;
export const defaultSections: SectionState = {
  network: true,
  training: false,
  analysis: true,
  observe: true,
  files: false,
};
function Section({
  name,
  title,
  meta,
  open,
  toggle,
  keepMounted,
  children,
}: {
  name: SectionId;
  title: string;
  meta?: ReactNode;
  open: boolean;
  toggle: () => void;
  keepMounted?: boolean;
  children: ReactNode;
}) {
  const id = useId();
  return (
    <section className={`side-section ${open ? "open" : ""}`}>
      <h2>
        <button
          id={`${id}-header`}
          data-section={name}
          aria-expanded={open}
          aria-controls={`${id}-body`}
          onClick={toggle}
        >
          <Icon name="down" />
          <span>{title}</span>
          {meta !== undefined && <small>{meta}</small>}
        </button>
      </h2>
      <div
        id={`${id}-body`}
        role="region"
        aria-labelledby={`${id}-header`}
        className="side-body"
        inert={!open}
      >
        <div>
          <div className="side-content">
            {(open || keepMounted) && children}
          </div>
        </div>
      </div>
    </section>
  );
}
export function Sidebar({
  lab: l,
  visible,
  sections,
  toggleSection,
  select,
  networkExpanded,
  toggleExpanded,
  save,
}: {
  lab: Lab;
  visible: boolean;
  sections: SectionState;
  toggleSection: (id: SectionId) => void;
  select: (s: Selection) => void;
  networkExpanded: boolean;
  toggleExpanded: () => void;
  save: () => void;
}) {
  // Hidden panels keep their React state but stop re-rendering with every training update.
  const frozen = useRef({
    model: l.model,
    input: l.input,
    input2: l.input2,
    gradient: l.gradient,
    playing: l.playing,
    phase: l.phase,
  });
  if (
    (visible && sections.network) ||
    frozen.current.model.task !== l.model.task
  )
    frozen.current = {
      model: l.model,
      input: l.input,
      input2: l.input2,
      gradient: l.gradient,
      playing: l.playing,
      phase: l.phase,
    };
  const view = frozen.current;
  const shape = [
    l.task === "classification" ? 2 : 1,
    ...l.model.layers.map((layer) => layer.b.length),
  ].join("→");
  return (
    <aside
      id="sidebar"
      className="sidebar"
      aria-label="사이드바"
      inert={!visible}
    >
      <div className="sidebar-scroll">
        <Section
          name="network"
          title="신경망"
          meta={shape}
          open={sections.network}
          toggle={() => toggleSection("network")}
          keepMounted
        >
          <div className="network-slot">
            <div className={`network-box ${networkExpanded ? "expanded" : ""}`}>
              <Network
                key={l.task}
                exportRef={l.networkSVG}
                model={view.model}
                input={view.input}
                input2={view.input2}
                selection={l.selection}
                select={select}
                gradient={view.gradient}
                playing={view.playing}
                phase={view.phase}
                expanded={networkExpanded}
                onExpand={toggleExpanded}
              />
            </div>
          </div>
          <ModelEditor lab={l} />
        </Section>
        <Section
          name="training"
          title="학습 설정"
          meta={l.settings.optimizer === "adam" ? "Adam" : "SGD"}
          open={sections.training}
          toggle={() => toggleSection("training")}
        >
          <TrainingSettings lab={l} />
        </Section>
        <Section
          name="analysis"
          title="학습 분석"
          meta={l.step ? l.step.toLocaleString() : undefined}
          open={sections.analysis}
          toggle={() => toggleSection("analysis")}
        >
          {visible && <Analysis lab={l} />}
        </Section>
        <Section
          name="observe"
          title="입력 관찰"
          open={sections.observe}
          toggle={() => toggleSection("observe")}
        >
          <ObservationPanel lab={l} />
        </Section>
        <Section
          name="files"
          title="파일"
          open={sections.files}
          toggle={() => toggleSection("files")}
        >
          <FilesPanel lab={l} save={save} />
        </Section>
      </div>
    </aside>
  );
}

import { Runner, type Command, type Mode, type Outgoing } from "./runner";
import { Trainer } from "./training";
import type { Model, Point, Settings } from "./engine";
export type Request =
  | {
      type: "init";
      revision: number;
      model: Model;
      data: Point[];
      settings: Settings;
      epoch: number;
      step: number;
      mode: Mode;
    }
  | (Command & { revision: number });
let runner: Runner | undefined,
  revision = 0;
const clock = {
  now: () => performance.now(),
  after: (ms: number, fn: () => void) => setTimeout(fn, ms),
  cancel: (handle: unknown) =>
    clearTimeout(handle as ReturnType<typeof setTimeout>),
};
const out = (message: Outgoing) => postMessage({ ...message, revision });
onmessage = (event: MessageEvent<Request>) => {
  const r = event.data;
  if (r.type === "init") {
    runner?.dispose();
    revision = r.revision;
    const trainer = new Trainer(r.model, r.data, r.settings);
    trainer.epoch = r.epoch;
    trainer.step = r.step;
    runner = new Runner(trainer, out, clock, { mode: r.mode });
    runner.snapshot();
    return;
  }
  if (r.revision !== revision || !runner) return;
  runner.command(r);
};

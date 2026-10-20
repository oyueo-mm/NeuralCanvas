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
    }
  | { type: "run" | "pause" | "step" | "epoch"; revision: number };
let trainer: Trainer,
  revision = 0,
  running = false,
  timer: ReturnType<typeof setTimeout> | undefined;
function send() {
  postMessage({
    type: "snapshot",
    revision,
    model: trainer.model,
    epoch: trainer.epoch,
    step: trainer.step,
    gradient: trainer.lastGradient,
    running,
  });
}
function work(mode: "run" | "step" | "epoch", target = trainer.epoch + 1) {
  try {
    const start = performance.now();
    const records = [];
    do {
      records.push(trainer.batch());
      if (mode === "step") break;
      if (mode === "epoch" && trainer.epoch >= target) break;
    } while (
      performance.now() - start < 16 &&
      (mode === "epoch" || records.length < trainer.settings.speed) &&
      trainer.epoch < trainer.settings.epochs
    );
    if (trainer.epoch >= trainer.settings.epochs) running = false;
    postMessage({ type: "history", revision, records });
    send();
    if (running) timer = setTimeout(() => work("run"), 32);
    else if (mode === "epoch" && trainer.epoch < target)
      timer = setTimeout(() => work("epoch", target), 0);
  } catch (e) {
    running = false;
    postMessage({ type: "error", revision, message: String(e) });
    send();
  }
}
onmessage = (event: MessageEvent<Request>) => {
  const r = event.data;
  if (r.type === "init") {
    clearTimeout(timer);
    revision = r.revision;
    running = false;
    trainer = new Trainer(r.model, r.data, r.settings);
    trainer.epoch = r.epoch;
    trainer.step = r.step;
    send();
    return;
  }
  if (r.revision !== revision || !trainer) return;
  clearTimeout(timer);
  running = r.type === "run";
  if (r.type === "pause") send();
  else work(r.type);
};

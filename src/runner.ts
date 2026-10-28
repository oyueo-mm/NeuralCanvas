import type { Gradients, Model } from "./engine";
import { pace } from "./speed";
import type { RecordItem } from "./storage";
import type { Trainer } from "./training";
export type Mode = "normal" | "turbo";
export type Rate = { batchesPerSec: number; epochsPerSec: number };
export type Command =
  | { type: "run"; mode?: Mode; speed?: number }
  | { type: "pause" | "step" | "epoch" }
  | { type: "speed"; speed: number }
  | { type: "mode"; mode: Mode };
export type Outgoing =
  | {
      type: "snapshot";
      model: Model;
      epoch: number;
      step: number;
      gradient: Gradients | undefined;
      running: boolean;
      mode: Mode;
      rate: Rate;
    }
  | { type: "history"; records: RecordItem[] }
  | { type: "error"; message: string };
export type Clock = {
  now(): number;
  after(ms: number, fn: () => void): unknown;
  cancel(handle: unknown): void;
};
export type RunnerOptions = {
  mode?: Mode;
  speed?: number;
  /** Compute time of one turbo slice before control messages are served again. */
  turboSliceMs?: number;
  /** Minimum time between turbo snapshots posted to the page. */
  turboFlushMs?: number;
  /** Test hook: hard cap of updates per turbo slice. */
  turboBatchCap?: number;
};
type Job = { kind: "run" } | { kind: "epoch"; target: number };
const idle: Rate = { batchesPerSec: 0, epochsPerSec: 0 };
/**
 * Schedules a Trainer inside the training worker. Normal mode records every update
 * at the speed-slider pace; turbo mode runs the same Trainer.advance() back to back
 * and measures the loss only once per slice. Both modes share one Trainer, so
 * switching keeps the weights, the Adam moments and the batch order.
 */
export class Runner {
  mode: Mode;
  speed: number;
  private job: Job | null = null;
  private timer: unknown;
  private pending: RecordItem[] = [];
  private lastFlush: number;
  private window = { start: 0, batches: 0 };
  private rate: Rate = idle;
  constructor(
    readonly trainer: Trainer,
    private out: (message: Outgoing) => void,
    private clock: Clock,
    private options: RunnerOptions = {},
  ) {
    this.mode = options.mode ?? "normal";
    this.speed = options.speed ?? trainer.settings.speed;
    this.lastFlush = this.window.start = clock.now();
  }
  get running() {
    return this.job?.kind === "run";
  }
  command(c: Command) {
    if (c.type === "speed") {
      this.speed = c.speed;
      this.reschedule();
    } else if (c.type === "mode") {
      this.mode = c.mode;
      this.reschedule();
    } else if (c.type === "pause") {
      this.stopTimer();
      this.job = null;
      this.rate = idle;
      this.flush();
      this.snapshot();
    } else if (c.type === "step") {
      this.stopTimer();
      this.job = null;
      this.guard(() =>
        this.out({ type: "history", records: [this.trainer.batch()] }),
      );
      this.snapshot();
    } else {
      this.stopTimer();
      if (c.type === "run") {
        if (this.trainer.epoch >= this.trainer.settings.epochs) {
          this.snapshot();
          return;
        }
        if (c.mode) this.mode = c.mode;
        if (c.speed !== undefined) this.speed = c.speed;
        this.job = { kind: "run" };
      } else this.job = { kind: "epoch", target: this.trainer.epoch + 1 };
      this.window = { start: this.clock.now(), batches: 0 };
      this.tick();
    }
  }
  snapshot() {
    this.out({
      type: "snapshot",
      model: this.trainer.model,
      epoch: this.trainer.epoch,
      step: this.trainer.step,
      gradient: this.trainer.lastGradient,
      running: this.running,
      mode: this.mode,
      rate: this.rate,
    });
  }
  dispose() {
    this.stopTimer();
    this.job = null;
  }
  private stopTimer() {
    if (this.timer !== undefined) this.clock.cancel(this.timer);
    this.timer = undefined;
  }
  /** A speed or mode change must not wait for a long slow-speed interval. */
  private reschedule() {
    if (!this.running || this.timer === undefined) return;
    this.stopTimer();
    this.timer = this.clock.after(0, this.tick);
  }
  private guard(action: () => void) {
    try {
      action();
    } catch (e) {
      this.job = null;
      this.stopTimer();
      this.rate = idle;
      this.out({ type: "error", message: String(e) });
      this.snapshot();
    }
  }
  /** Updates the throughput once a window is long enough, or at the end of a short run. */
  private measure(batches: number, final = false) {
    this.window.batches += batches;
    const elapsed = this.clock.now() - this.window.start;
    if (elapsed < 500 && !(final && elapsed > 0)) return;
    const batchesPerSec = (this.window.batches * 1000) / elapsed,
      trainSize = Math.max(1, this.trainer.train.length);
    this.rate = {
      batchesPerSec,
      epochsPerSec: (batchesPerSec * this.trainer.settings.batch) / trainSize,
    };
    this.window = { start: this.clock.now(), batches: 0 };
  }
  private flush() {
    if (this.pending.length)
      this.out({ type: "history", records: this.pending });
    this.pending = [];
    this.lastFlush = this.clock.now();
  }
  private epochSlice(target: number) {
    const { trainer } = this,
      start = this.clock.now(),
      records: RecordItem[] = [];
    do records.push(trainer.batch());
    while (
      trainer.epoch < target &&
      this.clock.now() - start < 16 &&
      trainer.epoch < trainer.settings.epochs
    );
    this.out({ type: "history", records });
    this.snapshot();
    if (trainer.epoch < target && trainer.epoch < trainer.settings.epochs)
      this.timer = this.clock.after(0, this.tick);
    else this.job = null;
  }
  private turboSlice() {
    const { trainer } = this,
      limit = trainer.settings.epochs,
      sliceMs = this.options.turboSliceMs ?? 50,
      cap = this.options.turboBatchCap ?? Infinity,
      start = this.clock.now();
    let n = 0;
    do {
      trainer.advance();
      n++;
    } while (
      trainer.epoch < limit &&
      n < cap &&
      this.clock.now() - start < sliceMs
    );
    this.measure(n, trainer.epoch >= limit);
    this.pending.push(trainer.metrics());
    if (trainer.epoch >= limit) this.job = null;
    if (
      !this.running ||
      this.clock.now() - this.lastFlush >= (this.options.turboFlushMs ?? 200)
    ) {
      this.flush();
      this.snapshot();
    }
    if (this.running) this.timer = this.clock.after(0, this.tick);
  }
  private normalSlice() {
    const { trainer } = this,
      { intervalMs, batches } = pace(this.speed),
      start = this.clock.now(),
      records: RecordItem[] = [];
    do records.push(trainer.batch());
    while (
      this.clock.now() - start < 16 &&
      records.length < batches &&
      trainer.epoch < trainer.settings.epochs
    );
    this.measure(records.length);
    if (trainer.epoch >= trainer.settings.epochs) this.job = null;
    this.flush();
    this.out({ type: "history", records });
    this.snapshot();
    if (this.running) this.timer = this.clock.after(intervalMs, this.tick);
  }
  private tick = () => {
    this.timer = undefined;
    const job = this.job;
    if (!job) return;
    this.guard(() => {
      if (job.kind === "epoch") this.epochSlice(job.target);
      else if (this.mode === "turbo") this.turboSlice();
      else this.normalSlice();
    });
  };
}

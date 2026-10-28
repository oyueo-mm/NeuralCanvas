import { describe, expect, it } from "vitest";
import {
  createModel,
  dataset,
  defaults,
  classificationDataset,
} from "./engine";
import { Runner, type Clock, type Mode, type Outgoing } from "./runner";
import { formatRate, pace, speedLabel, targetRate } from "./speed";
import { Trainer } from "./training";
/** Deterministic clock: time only moves when a timer fires. */
function manualClock() {
  let time = 0,
    id = 0;
  const timers = new Map<number, { at: number; fn: () => void }>();
  const clock: Clock = {
    now: () => time,
    after: (ms, fn) => {
      timers.set(++id, { at: time + ms, fn });
      return id;
    },
    cancel: (handle) => void timers.delete(handle as number),
  };
  const next = () => {
    const first = [...timers.entries()].sort(
      (a, b) => a[1].at - b[1].at || a[0] - b[0],
    )[0];
    if (!first) return false;
    timers.delete(first[0]);
    time = Math.max(time, first[1].at);
    first[1].fn();
    return true;
  };
  return {
    clock,
    next,
    pending: () => timers.size,
    run(count = 1e6) {
      let n = 0;
      while (n < count && next()) n++;
      return n;
    },
  };
}
const settings = { ...defaults, epochs: 25, batch: 8, validation: 0.2 };
const trainer = (task: "regression" | "classification" = "regression") =>
  new Trainer(
    task === "classification"
      ? createModel([6, 6], "tanh", 7, "xavier", task)
      : createModel([6, 6], "tanh", 7),
    task === "classification"
      ? classificationDataset("Two moons", 60, 0.1, 3)
      : dataset("사인", 40, 0.2, 3),
    { ...settings },
  );
function baseline(task?: "regression" | "classification") {
  const t = trainer(task);
  while (t.epoch < t.settings.epochs) t.batch();
  return t;
}
function harness(mode: Mode, task?: "regression" | "classification") {
  const t = trainer(task),
    messages: Outgoing[] = [],
    c = manualClock(),
    runner = new Runner(t, (m) => messages.push(m), c.clock, {
      mode,
      turboBatchCap: 7,
    });
  return { t, runner, messages, ...c };
}
describe("training scheduler", () => {
  for (const task of ["regression", "classification"] as const)
    it(`normal and turbo runs reach identical ${task} weights`, () => {
      const expected = baseline(task);
      for (const mode of ["normal", "turbo"] as const) {
        const h = harness(mode, task);
        h.runner.command({ type: "run", speed: 100 });
        h.run();
        expect(h.runner.running).toBe(false);
        expect(h.t.step).toBe(expected.step);
        expect(h.t.epoch).toBe(expected.epoch);
        expect(h.t.model).toEqual(expected.model);
        expect(h.t.optimizer.t).toBe(expected.optimizer.t);
        expect(h.t.optimizer.mom).toEqual(expected.optimizer.mom);
      }
    });
  it("switching between normal and turbo mid-run keeps the exact trajectory", () => {
    const expected = baseline(),
      h = harness("normal");
    h.runner.command({ type: "run", speed: 100 });
    h.run(4);
    h.runner.command({ type: "mode", mode: "turbo" });
    h.run(6);
    h.runner.command({ type: "mode", mode: "normal" });
    h.run(3);
    h.runner.command({ type: "mode", mode: "turbo" });
    h.run();
    expect(h.t.model).toEqual(expected.model);
    expect(h.t.optimizer.mom).toEqual(expected.optimizer.mom);
  });
  it("speed changes and pause/resume never reset Adam or the batch order", () => {
    const expected = baseline(),
      h = harness("normal");
    h.runner.command({ type: "run", speed: 5 });
    h.run(3);
    const before = h.t.optimizer.t;
    h.runner.command({ type: "speed", speed: 30 });
    h.run(3);
    expect(h.t.optimizer.t).toBeGreaterThan(before);
    h.runner.command({ type: "pause" });
    expect(h.runner.running).toBe(false);
    h.run();
    const paused = h.t.step;
    h.runner.command({ type: "run", mode: "turbo" });
    h.run();
    expect(h.t.step).toBeGreaterThan(paused);
    expect(h.t.optimizer.t).toBe(h.t.step);
    expect(h.t.model).toEqual(expected.model);
  });
  it("a speed change replaces a long slow-speed wait instead of waiting it out", () => {
    const h = harness("normal");
    h.runner.command({ type: "run", speed: 1 });
    const first = h.t.step;
    expect(h.pending()).toBe(1);
    h.runner.command({ type: "speed", speed: 100 });
    h.next();
    expect(h.t.step).toBeGreaterThan(first);
  });
  it("turbo measures loss once per slice and reports throughput", () => {
    const h = harness("turbo");
    h.runner.command({ type: "run" });
    h.run();
    const records = h.messages.flatMap((m) =>
      m.type === "history" ? m.records : [],
    );
    expect(records.length).toBeGreaterThan(0);
    expect(records.length).toBeLessThan(h.t.step / 3);
    expect(records.at(-1)).toMatchObject({ step: h.t.step, epoch: 25 });
    const last = h.messages.filter((m) => m.type === "snapshot").at(-1)!;
    expect(last).toMatchObject({
      running: false,
      step: h.t.step,
      mode: "turbo",
    });
  });
  it("normal mode records every update", () => {
    const h = harness("normal");
    h.runner.command({ type: "run", speed: 100 });
    h.run();
    const records = h.messages.flatMap((m) =>
      m.type === "history" ? m.records : [],
    );
    expect(records.length).toBe(h.t.step);
  });
  it("step and epoch commands advance exactly one update or epoch", () => {
    const h = harness("turbo");
    h.runner.command({ type: "step" });
    expect(h.t.step).toBe(1);
    h.runner.command({ type: "epoch" });
    h.run();
    expect(h.t.epoch).toBe(1);
    expect(h.runner.running).toBe(false);
  });
  it("divergence stops turbo training and reports the error", () => {
    const h = harness("turbo");
    h.t.settings = { ...h.t.settings, lr: 1, optimizer: "sgd", clip: 0 };
    h.t.model.layers[0].w[0][0] = 1e8;
    h.runner.command({ type: "run" });
    h.run();
    expect(h.messages.some((m) => m.type === "error")).toBe(true);
    expect(h.runner.running).toBe(false);
  });
});
describe("training speed", () => {
  it("rises monotonically and stays within the slider range", () => {
    let previous = 0;
    for (let s = 1; s <= 100; s++) {
      expect(targetRate(s)).toBeGreaterThan(previous);
      previous = targetRate(s);
    }
    expect(targetRate(0)).toBe(targetRate(1));
    expect(targetRate(1)).toBeCloseTo(1);
    expect(targetRate(20)).toBeGreaterThan(300);
  });
  it("waits between single updates when slow and batches updates when fast", () => {
    expect(pace(1)).toEqual({ intervalMs: 1000, batches: 1 });
    expect(pace(100).batches).toBeGreaterThan(100);
    expect(pace(100).intervalMs).toBeLessThan(100);
  });
  it("labels the slider ranges", () => {
    expect([1, 20, 50, 100].map(speedLabel)).toEqual([
      "느림",
      "보통",
      "빠름",
      "매우 빠름",
    ]);
    expect(formatRate(1234)).toBe("1.2k");
    expect(formatRate(5.55)).toBe("5.5");
  });
});

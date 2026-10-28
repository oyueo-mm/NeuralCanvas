/** Training speed slider (1-100) shared by the toolbar, the worker scheduler and the tests. */
export const speedRange = { min: 1, max: 100 } as const;
const clamp = (speed: number) =>
  Math.max(speedRange.min, Math.min(speedRange.max, Math.round(speed)));
/** Target optimizer updates per second in normal mode; the device may be slower. */
export function targetRate(speed: number) {
  const s = clamp(speed);
  return s <= 20
    ? 10 ** (((s - 1) / 19) * 2.6)
    : 10 ** (2.6 + ((s - 20) / 80) * 1.7);
}
/** Slow speeds wait between single updates; fast speeds run several updates per tick. */
export function pace(speed: number) {
  const rate = targetRate(speed);
  return rate <= 25
    ? { intervalMs: 1000 / rate, batches: 1 }
    : { intervalMs: 32, batches: Math.max(1, Math.round(rate * 0.032)) };
}
export function speedLabel(speed: number) {
  const s = clamp(speed);
  return s < 15 ? "느림" : s < 40 ? "보통" : s < 75 ? "빠름" : "매우 빠름";
}
export function formatRate(rate: number) {
  return rate >= 1000
    ? `${(rate / 1000).toFixed(rate >= 10000 ? 0 : 1)}k`
    : rate >= 10
      ? rate.toFixed(0)
      : rate.toFixed(1);
}

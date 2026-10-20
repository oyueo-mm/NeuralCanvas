import { forward, type Model } from "./engine";
export type PlotRange = { cx: number; cy: number; span: number };
export type Boundary = {
  resolution: number;
  values: Float32Array;
  range: PlotRange;
  milliseconds: number;
};
export function sampleBoundary(
  model: Model,
  range: PlotRange,
  resolution: number,
): Boundary {
  if (
    model.task !== "classification" ||
    !Number.isInteger(resolution) ||
    resolution < 8 ||
    resolution > 128 ||
    !Number.isFinite(range.span) ||
    range.span <= 0 ||
    !Number.isFinite(range.cx) ||
    !Number.isFinite(range.cy)
  )
    throw Error("잘못된 결정 경계 요청입니다.");
  const start = performance.now(),
    values = new Float32Array((resolution + 1) ** 2);
  for (let j = 0; j <= resolution; j++)
    for (let i = 0; i <= resolution; i++) {
      values[j * (resolution + 1) + i] = forward(model, [
        range.cx - range.span / 2 + (range.span * i) / resolution,
        range.cy + range.span / 2 - (range.span * j) / resolution,
      ]).y;
    }
  return { resolution, values, range, milliseconds: performance.now() - start };
}
// Marching squares with a center-value decider for saddle cells, normalized to [0,1].
export function boundaryContour({ resolution: n, values }: Boundary) {
  const segments: number[][] = [];
  for (let j = 0; j < n; j++)
    for (let i = 0; i < n; i++) {
      const v = [
          values[j * (n + 1) + i],
          values[j * (n + 1) + i + 1],
          values[(j + 1) * (n + 1) + i + 1],
          values[(j + 1) * (n + 1) + i],
        ],
        corners = [
          [i, j],
          [i + 1, j],
          [i + 1, j + 1],
          [i, j + 1],
        ],
        hits: number[][] = [];
      for (let k = 0; k < 4; k++) {
        const next = (k + 1) % 4;
        if (v[k] >= 0.5 === v[next] >= 0.5) continue;
        const t = (0.5 - v[k]) / (v[next] - v[k]);
        hits.push([
          (corners[k][0] + t * (corners[next][0] - corners[k][0])) / n,
          (corners[k][1] + t * (corners[next][1] - corners[k][1])) / n,
        ]);
      }
      if (
        hits.length === 4 &&
        v.reduce((s, a) => s + a, 0) / 4 >= 0.5 !== v[0] >= 0.5
      )
        hits.push(hits.shift()!);
      for (let k = 0; k + 1 < hits.length; k += 2)
        segments.push([...hits[k], ...hits[k + 1]]);
    }
  return segments;
}

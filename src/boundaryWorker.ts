/// <reference lib="webworker" />
import { sampleBoundary } from "./boundary";
import type { Model } from "./engine";
import type { PlotRange } from "./boundary";
self.onmessage = (
  e: MessageEvent<{
    id: number;
    model: Model;
    range: PlotRange;
    resolution: number;
  }>,
) => {
  const { id, model, range, resolution } = e.data;
  const result = sampleBoundary(model, range, resolution);
  self.postMessage({ id, ...result }, { transfer: [result.values.buffer] });
};

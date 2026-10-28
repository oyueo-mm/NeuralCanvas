import { useEffect, useRef, useState } from "react";
import type { Model, ClassDefinition } from "./engine";
import { boundaryContour, type Boundary, type PlotRange } from "./boundary";
export function useBoundary(
  model: Model,
  range: PlotRange,
  resolution: number,
  enabled: boolean,
  classes: ClassDefinition[],
) {
  const [result, setResult] = useState<{
    image: string;
    contour: number[][];
    grid: Boundary;
    updates: number;
    paintMilliseconds: number;
  } | null>(null);
  const current = useRef({ model, range, resolution, classes });
  current.current = { model, range, resolution, classes };
  const schedule = useRef<() => void>(() => {});
  useEffect(() => {
    if (!enabled) return;
    let disposed = false,
      busy = false,
      dirty = false,
      id = 0,
      updates = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const worker = new Worker(new URL("./boundaryWorker.ts", import.meta.url), {
      type: "module",
    });
    const send = () => {
      timer = undefined;
      if (disposed || busy || !dirty) return;
      dirty = false;
      busy = true;
      worker.postMessage({ id: ++id, ...current.current });
    };
    const request = () => {
      dirty = true;
      if (!busy && timer === undefined) timer = setTimeout(send, 140);
    };
    schedule.current = request;
    worker.onmessage = (e: MessageEvent<Boundary & { id: number }>) => {
      if (disposed) return;
      busy = false;
      const grid = e.data,
        latest = current.current;
      // A stale viewport must never be stretched onto a new coordinate range.
      if (
        grid.resolution === latest.resolution &&
        grid.range.cx === latest.range.cx &&
        grid.range.cy === latest.range.cy &&
        grid.range.span === latest.range.span
      ) {
        const paintStart = performance.now();
        const n = grid.resolution,
          canvas = document.createElement("canvas");
        canvas.width = canvas.height = n;
        const ctx = canvas.getContext("2d")!,
          image = ctx.createImageData(n, n);
        const colors = latest.classes.map((c) =>
          [1, 3, 5].map(
            (k, i) =>
              [255, 255, 255][i] * 0.7 +
              parseInt(c.color.slice(k, k + 2), 16) * 0.3,
          ),
        );
        for (let j = 0; j < n; j++)
          for (let i = 0; i < n; i++) {
            const p =
              (grid.values[j * (n + 1) + i] +
                grid.values[j * (n + 1) + i + 1] +
                grid.values[(j + 1) * (n + 1) + i] +
                grid.values[(j + 1) * (n + 1) + i + 1]) /
              4;
            const k = (j * n + i) * 4;
            for (let c = 0; c < 3; c++)
              image.data[k + c] =
                colors[0][c] + (colors[1][c] - colors[0][c]) * p;
            image.data[k + 3] = 255;
          }
        ctx.putImageData(image, 0, 0);
        const contour = boundaryContour(grid),
          imageURL = canvas.toDataURL();
        setResult({
          image: imageURL,
          contour,
          grid,
          updates: ++updates,
          paintMilliseconds: performance.now() - paintStart,
        });
      }
      if (dirty) request();
    };
    worker.onerror = () => {
      busy = false; /* Existing boundary remains usable if worker is interrupted. */
    };
    request();
    return () => {
      disposed = true;
      clearTimeout(timer);
      worker.terminate();
      schedule.current = () => {};
    };
  }, [enabled]);
  useEffect(() => {
    if (enabled) schedule.current();
  }, [model, range, resolution, enabled, classes]);
  return result;
}

import type { RecordItem } from "./storage";
export const historyLimit = 1000;
/**
 * Appends records and keeps memory bounded. Instead of dropping the oldest records
 * the history is thinned to every other record, so a long run keeps the whole curve.
 * The newest record is never removed; epoch and step counters live outside the history.
 */
export function appendHistory(history: RecordItem[], records: RecordItem[]) {
  let next = records.length ? [...history, ...records] : history;
  while (next.length > historyLimit) {
    const last = next.length - 1;
    next = next.filter((_, i) => i % 2 === 0 || i === last);
  }
  return next;
}

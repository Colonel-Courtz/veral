// Merge an arbitrary number of AbortSignals into one. The merged
// signal aborts the moment ANY input signal aborts, preserving the
// first input's `reason`. Synchronously-already-aborted inputs are
// handled too — the returned signal aborts before the function
// returns in that case.
//
// Use case: an extractor agent wants its per-request timeout AND the
// orchestrator-level cancellation to BOTH be able to abort the
// underlying fetch. Browser's AbortSignal.any() would do this in v23+,
// but we still ship to runtimes pinned at Node 20.
export function mergeAbortSignals(...signals: ReadonlyArray<AbortSignal | undefined>): AbortSignal {
  const controller = new AbortController();
  for (const signal of signals) {
    if (!signal) continue;
    if (signal.aborted) {
      controller.abort(signal.reason);
      return controller.signal;
    }
    signal.addEventListener('abort', () => controller.abort(signal.reason), { once: true });
  }
  return controller.signal;
}

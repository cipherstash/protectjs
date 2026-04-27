/**
 * Microtask-coalescing batcher for codec encrypt/decrypt calls.
 *
 * Why this exists:
 *   ADR 204 dispatches per-row codec calls via `Promise.all` with no
 *   batching across cells. For ZeroKMS-backed codecs this would issue one
 *   network call per cell — operationally untenable. The batcher exploits
 *   the fact that `encodeParams` (and `decodeRow`) call `codec.encode(value)`
 *   synchronously for every cell before any of the resulting Promises get
 *   a chance to resolve. All `enqueue` calls land in a single microtask
 *   window; the first enqueue schedules a `queueMicrotask(drain)`, the
 *   rest piggy-back, and `drain` sees the entire batch.
 *
 * Failure semantics:
 *   `flush` is expected to return one result per input, in input order.
 *   If it throws or rejects, every queued promise rejects with the same
 *   error. If it returns a wrong-length result, every queued promise
 *   rejects with a clear shape error.
 */
export type Batcher<TIn, TOut> = {
  enqueue(value: TIn): Promise<TOut>
}

export type FlushFn<TIn, TOut> = (
  values: readonly TIn[],
) => Promise<readonly TOut[]>

type Pending<TIn, TOut> = {
  readonly value: TIn
  readonly resolve: (value: TOut) => void
  readonly reject: (reason: unknown) => void
}

export function createBatcher<TIn, TOut>(
  flush: FlushFn<TIn, TOut>,
): Batcher<TIn, TOut> {
  let pending: Array<Pending<TIn, TOut>> = []
  let scheduled = false

  const drain = async (): Promise<void> => {
    const batch = pending
    pending = []
    scheduled = false
    if (batch.length === 0) return
    try {
      const results = await flush(batch.map((entry) => entry.value))
      if (results.length !== batch.length) {
        const shapeError = new Error(
          `Batcher flush returned ${results.length} results for ${batch.length} inputs`,
        )
        for (const entry of batch) entry.reject(shapeError)
        return
      }
      for (let i = 0; i < batch.length; i++) {
        const entry = batch[i]
        const result = results[i]
        if (entry) entry.resolve(result as TOut)
      }
    } catch (error) {
      for (const entry of batch) entry.reject(error)
    }
  }

  return {
    enqueue(value: TIn): Promise<TOut> {
      return new Promise<TOut>((resolve, reject) => {
        pending.push({ value, resolve, reject })
        if (!scheduled) {
          scheduled = true
          queueMicrotask(() => {
            void drain()
          })
        }
      })
    },
  }
}

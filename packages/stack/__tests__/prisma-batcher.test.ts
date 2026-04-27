import { createBatcher } from '@/prisma/core/batcher'
import { describe, expect, it, vi } from 'vitest'

describe('createBatcher', () => {
  it('coalesces synchronous enqueues into a single flush call', async () => {
    const flush = vi.fn(async (values: readonly number[]) =>
      values.map((v) => v * 2),
    )
    const batcher = createBatcher<number, number>(flush)

    // This is the shape of `Promise.all(values.map(codec.encode))` —
    // every enqueue runs synchronously before the first microtask fires.
    const results = await Promise.all([
      batcher.enqueue(1),
      batcher.enqueue(2),
      batcher.enqueue(3),
      batcher.enqueue(4),
    ])

    expect(flush).toHaveBeenCalledTimes(1)
    expect(flush.mock.calls[0]?.[0]).toEqual([1, 2, 3, 4])
    expect(results).toEqual([2, 4, 6, 8])
  })

  it('starts a fresh batch after the previous drain resolves', async () => {
    const flush = vi.fn(async (values: readonly string[]) => values.slice())
    const batcher = createBatcher<string, string>(flush)

    await Promise.all([batcher.enqueue('a'), batcher.enqueue('b')])
    await Promise.all([batcher.enqueue('c'), batcher.enqueue('d')])

    expect(flush).toHaveBeenCalledTimes(2)
    expect(flush.mock.calls[0]?.[0]).toEqual(['a', 'b'])
    expect(flush.mock.calls[1]?.[0]).toEqual(['c', 'd'])
  })

  it('rejects every queued promise when the flush throws', async () => {
    const error = new Error('flush failure')
    const batcher = createBatcher<number, number>(async () => {
      throw error
    })

    const results = await Promise.allSettled([
      batcher.enqueue(1),
      batcher.enqueue(2),
    ])

    expect(results).toEqual([
      { status: 'rejected', reason: error },
      { status: 'rejected', reason: error },
    ])
  })

  it('rejects every queued promise when the flush returns the wrong number of results', async () => {
    const batcher = createBatcher<number, number>(async () => [99]) // length mismatch

    const results = await Promise.allSettled([
      batcher.enqueue(1),
      batcher.enqueue(2),
    ])

    expect(results.every((r) => r.status === 'rejected')).toBe(true)
  })

  it('preserves insertion order across all queued entries', async () => {
    const flush = vi.fn(async (values: readonly string[]) => values.slice())
    const batcher = createBatcher<string, string>(flush)

    const results = await Promise.all([
      batcher.enqueue('a'),
      batcher.enqueue('b'),
      batcher.enqueue('c'),
      batcher.enqueue('d'),
      batcher.enqueue('e'),
    ])

    expect(flush).toHaveBeenCalledTimes(1)
    expect(flush.mock.calls[0]?.[0]).toEqual(['a', 'b', 'c', 'd', 'e'])
    expect(results).toEqual(['a', 'b', 'c', 'd', 'e'])
  })
})

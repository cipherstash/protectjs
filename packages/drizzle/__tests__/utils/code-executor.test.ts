import { describe, expect, it } from 'vitest'
import { type ExecutionContext, executeCodeBlock } from './code-executor'

describe('executeCodeBlock', () => {
  // ExecutionContext is now a simple index signature: { [key: string]: unknown }
  // Tests can define any properties needed for their specific test cases
  const mockContext: ExecutionContext = {
    db: {},
    transactions: {},
  }

  it('executes simple code and returns result', async () => {
    const code = 'return 1 + 1'
    const result = await executeCodeBlock(code, mockContext)

    expect(result.success).toBe(true)
    expect(result.result).toBe(2)
  })

  it('provides context variables to code', async () => {
    const contextWithValue: ExecutionContext = { ...mockContext, testValue: 42 }
    const code = 'return testValue'
    const result = await executeCodeBlock(code, contextWithValue)

    expect(result.success).toBe(true)
    expect(result.result).toBe(42)
  })

  it('handles async code', async () => {
    const code = 'return await Promise.resolve("async result")'
    const result = await executeCodeBlock(code, mockContext)

    expect(result.success).toBe(true)
    expect(result.result).toBe('async result')
  })

  it('captures errors', async () => {
    const code = 'throw new Error("test error")'
    const result = await executeCodeBlock(code, mockContext)

    expect(result.success).toBe(false)
    expect(result.error).toContain('test error')
  })

  it('handles syntax errors', async () => {
    const code = 'return {' // Invalid syntax
    const result = await executeCodeBlock(code, mockContext)

    expect(result.success).toBe(false)
    expect(result.error).toBeDefined()
  })
})

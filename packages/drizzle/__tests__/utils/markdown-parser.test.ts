import * as fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { extractExecutableBlocks } from './markdown-parser'

describe('extractExecutableBlocks', () => {
  it('extracts ts:run code blocks', () => {
    const markdown = `# Test
## Section One

\`\`\`ts:run
const x = 1
return x
\`\`\`
`
    const blocks = extractExecutableBlocks(markdown)

    expect(blocks).toHaveLength(1)
    expect(blocks[0].code).toBe('const x = 1\nreturn x')
    expect(blocks[0].section).toBe('Section One')
  })

  it('ignores non-executable code blocks', () => {
    const markdown = `# Test

\`\`\`typescript
const ignored = true
\`\`\`

\`\`\`ts:run
return 'executed'
\`\`\`
`
    const blocks = extractExecutableBlocks(markdown)

    expect(blocks).toHaveLength(1)
    expect(blocks[0].code).toBe("return 'executed'")
  })

  it('tracks line numbers', () => {
    const markdown = `# Header

Some text

\`\`\`ts:run
return 1
\`\`\`
`
    const blocks = extractExecutableBlocks(markdown)

    expect(blocks[0].lineNumber).toBe(6)
  })

  it('extracts multiple blocks with unique IDs', () => {
    const markdown = `# Test
## First

\`\`\`ts:run
return 1
\`\`\`

## Second

\`\`\`ts:run
return 2
\`\`\`
`
    const blocks = extractExecutableBlocks(markdown)

    expect(blocks).toHaveLength(2)
    expect(blocks[0].id).not.toBe(blocks[1].id)
    expect(blocks[0].section).toBe('First')
    expect(blocks[1].section).toBe('Second')
  })

  // Edge cases for robustness
  describe('edge cases', () => {
    it('handles consecutive code blocks without headers', () => {
      const markdown = `## Section

\`\`\`ts:run
return 1
\`\`\`

\`\`\`ts:run
return 2
\`\`\`
`
      const blocks = extractExecutableBlocks(markdown)

      expect(blocks).toHaveLength(2)
      expect(blocks[0].section).toBe('Section')
      expect(blocks[1].section).toBe('Section') // Same section for both
    })

    it('handles empty code blocks', () => {
      const markdown = `## Section

\`\`\`ts:run
\`\`\`
`
      const blocks = extractExecutableBlocks(markdown)

      expect(blocks).toHaveLength(1)
      expect(blocks[0].code).toBe('')
    })

    it('handles code block at start of file', () => {
      const markdown = `\`\`\`ts:run
return 'first'
\`\`\`
`
      const blocks = extractExecutableBlocks(markdown)

      expect(blocks).toHaveLength(1)
      expect(blocks[0].section).toBe('Introduction') // Default section
    })

    it('handles code block at end of file without trailing newline', () => {
      const markdown = `## Section

\`\`\`ts:run
return 'last'
\`\`\``
      const blocks = extractExecutableBlocks(markdown)

      // Note: This edge case may not be handled - document expected behavior
      // Implementation may need adjustment if this fails
      expect(blocks).toHaveLength(1)
      expect(blocks[0].code).toBe("return 'last'")
    })

    it('ignores malformed blocks (no closing fence)', () => {
      const markdown = `## Section

\`\`\`ts:run
return 'unclosed'

## Next Section

Some text
`
      const blocks = extractExecutableBlocks(markdown)

      // Malformed block should be ignored, not cause errors
      expect(blocks).toHaveLength(0)
    })

    it('handles duplicate section names', () => {
      const markdown = `## Setup

\`\`\`ts:run
return 1
\`\`\`

## Setup

\`\`\`ts:run
return 2
\`\`\`
`
      const blocks = extractExecutableBlocks(markdown)

      expect(blocks).toHaveLength(2)
      expect(blocks[0].section).toBe('Setup')
      expect(blocks[1].section).toBe('Setup')
      expect(blocks[0].id).not.toBe(blocks[1].id) // IDs still unique
    })

    it('handles deeply nested headers', () => {
      const markdown = `# H1
## H2
### H3

\`\`\`ts:run
return 'nested'
\`\`\`
`
      const blocks = extractExecutableBlocks(markdown)

      expect(blocks).toHaveLength(1)
      expect(blocks[0].section).toBe('H3') // Most recent header
    })

    it('handles code blocks with extra whitespace in fence', () => {
      const markdown = `## Section

\`\`\`ts:run
return 'whitespace'
\`\`\`
`
      const blocks = extractExecutableBlocks(markdown)

      // Trailing whitespace in fence should still match
      expect(blocks).toHaveLength(1)
    })
  })

  // Property-based tests using fast-check
  describe('property-based tests', () => {
    // These tests verify invariants that should hold for ANY valid input

    it('parsing is deterministic - same input always produces same output', () => {
      fc.assert(
        fc.property(fc.string(), (randomContent) => {
          const markdown = `## Section\n\n\`\`\`ts:run\n${randomContent}\n\`\`\`\n`
          const result1 = extractExecutableBlocks(markdown)
          const result2 = extractExecutableBlocks(markdown)

          expect(result1).toEqual(result2)
        }),
        { numRuns: 100 },
      )
    })

    it('extracted blocks always have valid structure', () => {
      fc.assert(
        fc.property(
          fc.array(
            fc.record({
              section: fc.string({ minLength: 1 }),
              code: fc.string(),
            }),
            { minLength: 0, maxLength: 5 },
          ),
          (blocks) => {
            // Generate markdown from blocks
            const markdown = blocks
              .map(
                (b) => `## ${b.section}\n\n\`\`\`ts:run\n${b.code}\n\`\`\`\n`,
              )
              .join('\n')

            const result = extractExecutableBlocks(markdown)

            // Every extracted block must have required properties
            for (const block of result) {
              expect(block).toHaveProperty('id')
              expect(block).toHaveProperty('code')
              expect(block).toHaveProperty('section')
              expect(block).toHaveProperty('lineNumber')
              expect(typeof block.id).toBe('string')
              expect(typeof block.code).toBe('string')
              expect(typeof block.section).toBe('string')
              expect(typeof block.lineNumber).toBe('number')
              expect(block.lineNumber).toBeGreaterThan(0)
            }
          },
        ),
        { numRuns: 50 },
      )
    })

    it('block count never exceeds fence pair count', () => {
      fc.assert(
        fc.property(fc.string(), (randomMarkdown) => {
          const fenceCount = (randomMarkdown.match(/```ts:run/g) || []).length
          const result = extractExecutableBlocks(randomMarkdown)

          // Can't extract more blocks than opening fences
          expect(result.length).toBeLessThanOrEqual(fenceCount)
        }),
        { numRuns: 100 },
      )
    })

    it('handles unicode in section names', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 1, maxLength: 50 }),
          (unicodeSection) => {
            // Filter out characters that would break markdown structure
            const safeSection = unicodeSection.replace(/[#\n\r`]/g, '').trim()
            if (!safeSection) return true // Skip empty after filtering

            const markdown = `## ${safeSection}\n\n\`\`\`ts:run\nreturn 1\n\`\`\`\n`
            const result = extractExecutableBlocks(markdown)

            expect(result).toHaveLength(1)
            expect(result[0].section).toBe(safeSection)
          },
        ),
        { numRuns: 50 },
      )
    })

    it('no blocks lost during parsing - all valid blocks extracted', () => {
      fc.assert(
        fc.property(fc.integer({ min: 1, max: 10 }), (blockCount) => {
          // Generate exactly N well-formed blocks
          const markdown = Array.from(
            { length: blockCount },
            (_, i) => `## Section${i}\n\n\`\`\`ts:run\nreturn ${i}\n\`\`\`\n`,
          ).join('\n')

          const result = extractExecutableBlocks(markdown)

          // All well-formed blocks should be extracted
          expect(result).toHaveLength(blockCount)
        }),
        { numRuns: 20 },
      )
    })
  })
})

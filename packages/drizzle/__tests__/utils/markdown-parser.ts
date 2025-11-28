export interface CodeBlock {
  id: string
  code: string
  section: string
  lineNumber: number
}

/**
 * Extract executable code blocks from markdown.
 * Looks for ```ts:run fenced code blocks.
 */
export function extractExecutableBlocks(markdown: string): CodeBlock[] {
  const blocks: CodeBlock[] = []
  const lines = markdown.split('\n')

  let currentSection = 'Introduction'
  let inCodeBlock = false
  let currentCode: string[] = []
  let blockStartLine = 0
  let blockId = 0

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]

    // Track section headers (## or ### level)
    const headerMatch = line.match(/^#{1,3}\s+(.+)$/)
    if (headerMatch) {
      currentSection = headerMatch[1].trim()
    }

    // Start of executable code block
    if (line.match(/^```ts:run\s*$/)) {
      inCodeBlock = true
      currentCode = []
      blockStartLine = i + 2 // 1-indexed, next line is code start
      continue
    }

    // End of code block
    if (inCodeBlock && line === '```') {
      blocks.push({
        id: `block-${blockId++}`,
        code: currentCode.join('\n'),
        section: currentSection,
        lineNumber: blockStartLine,
      })
      inCodeBlock = false
      continue
    }

    // Accumulate code
    if (inCodeBlock) {
      currentCode.push(line)
    }
  }

  return blocks
}

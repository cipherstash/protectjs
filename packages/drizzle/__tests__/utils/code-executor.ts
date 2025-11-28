export interface ExecutionContext {
  [key: string]: unknown
}

export interface ExecutionResult {
  success: boolean
  result?: unknown
  error?: string
}

/**
 * Execute a documentation code block in a controlled context.
 *
 * ## Security Considerations
 *
 * This function uses the `Function()` constructor to execute arbitrary code.
 * This is equivalent to `eval()` and would normally be a serious security risk.
 *
 * **Why it's safe in this context:**
 * 1. **Trusted source:** Code comes only from our own documentation files in the
 *    repository, not from user input or external sources.
 * 2. **Code review:** All documentation code examples go through PR review before
 *    being merged, same as production code.
 * 3. **No network exposure:** Tests run in CI or local dev, never in production
 *    environments handling user requests.
 * 4. **Controlled context:** Executed code only has access to explicitly provided
 *    context variables (db, operators), not global scope or filesystem.
 *
 * **When this would NOT be safe:**
 * - If code came from user input (web forms, API requests)
 * - If code came from external/untrusted sources
 * - If executed in a production environment
 * - If the execution context included sensitive globals
 *
 * The eslint-disable comment below acknowledges we've considered the security
 * implications and determined this usage is appropriate for the use case.
 */
export async function executeCodeBlock(
  code: string,
  context: ExecutionContext,
): Promise<ExecutionResult> {
  try {
    // Create an async function with access to context variables
    const contextKeys = Object.keys(context)
    const contextValues = Object.values(context)

    // eslint-disable-next-line @typescript-eslint/no-implied-eval
    const asyncFn = new Function(
      ...contextKeys,
      `return (async () => { ${code} })()`,
    )

    const result = await asyncFn(...contextValues)

    return {
      success: true,
      result,
    }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    }
  }
}

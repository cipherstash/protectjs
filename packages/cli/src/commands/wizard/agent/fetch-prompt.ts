import auth from '@cipherstash/auth'
import { GATEWAY_URL } from '../lib/constants.js'
import type { GatheredContext } from '../lib/gather.js'
import { classifyHttpError, formatWizardError } from './errors.js'

const { AutoStrategy } = auth

const FETCH_TIMEOUT_MS = 30_000

export interface FetchedPrompt {
  prompt: string
  promptVersion: string
}

interface GatewayErrorBody {
  error?: { type?: string; message?: string }
}

export async function fetchIntegrationPrompt(
  ctx: GatheredContext,
  cliVersion: string,
): Promise<FetchedPrompt> {
  const strategy = AutoStrategy.detect()
  const { token } = await strategy.getToken()

  let res: Response
  try {
    res = await fetch(`${GATEWAY_URL}/v1/wizard/prompt`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${token}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        version: 'v1',
        clientVersion: cliVersion,
        integration: ctx.integration,
        context: {
          selectedColumns: ctx.selectedColumns,
          schemaFiles: ctx.schemaFiles,
          outputPath: ctx.outputPath,
        },
      }),
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    // Network failures, DNS errors, AbortSignal.timeout — classifyError
    // recognizes "fetch failed" / ECONNREFUSED and renders the gateway-status footer.
    throw new Error(
      formatWizardError('Could not reach the CipherStash AI gateway.', message),
    )
  }

  if (!res.ok) {
    let apiMessage = ''
    try {
      const body = (await res.json()) as GatewayErrorBody
      apiMessage = body.error?.message ?? ''
    } catch {
      // fall back to status code only
    }
    throw new Error(classifyHttpError(res.status, apiMessage))
  }

  const body = (await res.json()) as Partial<FetchedPrompt>
  if (
    typeof body.prompt !== 'string' ||
    typeof body.promptVersion !== 'string'
  ) {
    throw new Error(
      formatWizardError(
        'The wizard gateway returned an invalid prompt response.',
      ),
    )
  }

  return { prompt: body.prompt, promptVersion: body.promptVersion }
}

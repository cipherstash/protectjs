import type { Integration } from '../../commands/init/types.js'
import { loadCorePartial, loadIntegrationPartial } from '../partials.js'
import { RULEBOOK_VERSION } from '../version.js'

export interface GatewayPromptContext {
  integration: Integration
}

/**
 * Render the prompt body served by `POST /v1/wizard/prompt` on the gateway.
 *
 * The gateway and the CLI both consume this so the in-house wizard and any
 * external-agent handoff produce the same setup outcome. Format mirrors the
 * existing `apps/wizard/src/prompts.ts` shape: a header, the core rules, then
 * the integration-specific rules.
 */
export function renderGatewayPrompt(ctx: GatewayPromptContext): string {
  const core = loadCorePartial()
  const integration = loadIntegrationPartial(ctx.integration)
  return [
    '# CipherStash setup wizard',
    '',
    `Rulebook version: ${RULEBOOK_VERSION}`,
    `Integration: ${ctx.integration}`,
    '',
    core.trim(),
    '',
    integration.trim(),
    '',
  ].join('\n')
}

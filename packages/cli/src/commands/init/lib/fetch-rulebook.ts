import { renderClaudeSkill } from '../../../rulebook/index.js'
import { RULEBOOK_VERSION } from '../../../rulebook/index.js'
import type { Integration } from '../types.js'

const DEFAULT_GATEWAY_URL = 'https://wizard.getstash.sh/v1/wizard/rulebook'

/**
 * Resolve the gateway URL at call time so tests and local-dev can override it
 * via `CIPHERSTASH_WIZARD_URL` without rebuilding the CLI. The override is
 * always a full URL — accepting just a host complicates path handling and we
 * already control the path on both sides.
 */
function gatewayUrl(): string {
  return process.env.CIPHERSTASH_WIZARD_URL ?? DEFAULT_GATEWAY_URL
}

/**
 * Map the CLI's `Integration` enum (`postgresql` for "no recognised ORM") to
 * the gateway's enum (`generic` for the same case). The gateway and the
 * `@cipherstash/rulebook` package use the term `generic` to align with the
 * existing `/v1/wizard/prompt` integrations.
 */
function gatewayIntegration(integration: Integration): string {
  return integration === 'postgresql' ? 'generic' : integration
}

interface RulebookResponse {
  /** Server-rendered SKILL.md body. */
  skill: string
  /** Version string the gateway used to render — for drift logging. */
  rulebookVersion: string
}

interface FetchedRulebook {
  skill: string
  rulebookVersion: string
  source: 'gateway' | 'bundled'
}

/**
 * Fetch the latest rulebook from the gateway, with bundled fallback.
 *
 * Network and auth failures are non-fatal — we always have the bundled copy.
 * The gateway is the long-term source of truth for content updates between
 * CLI releases. Phase 1 keeps the call best-effort and short-timeout; we don't
 * want a flaky network turning init into a 60-second wait.
 */
export async function fetchRulebook({
  integration,
  clientVersion,
}: {
  integration: Integration
  clientVersion: string
}): Promise<FetchedRulebook> {
  const bundled = (): FetchedRulebook => ({
    skill: renderClaudeSkill({ integration }),
    rulebookVersion: RULEBOOK_VERSION,
    source: 'bundled',
  })

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 5_000)

  try {
    const res = await fetch(gatewayUrl(), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        agent: 'claude-code',
        integration: gatewayIntegration(integration),
        clientVersion,
        bundledVersion: RULEBOOK_VERSION,
      }),
      signal: controller.signal,
    })

    if (!res.ok) return bundled()

    const data = (await res.json()) as Partial<RulebookResponse>
    if (typeof data.skill !== 'string' || data.skill.length === 0) {
      return bundled()
    }
    return {
      skill: data.skill,
      rulebookVersion: data.rulebookVersion ?? RULEBOOK_VERSION,
      source: 'gateway',
    }
  } catch {
    return bundled()
  } finally {
    clearTimeout(timeout)
  }
}

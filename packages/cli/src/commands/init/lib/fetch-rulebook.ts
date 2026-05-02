import {
  RULEBOOK_VERSION,
  renderAgentsMd,
  renderClaudeSkill,
} from '../../../rulebook/index.js'
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

/** Agents we know how to render rulebook content for. */
export type RulebookAgent = 'claude-code' | 'codex'

interface RulebookResponse {
  /** Server-rendered artifact body (SKILL.md or AGENTS.md, depending on agent). */
  skill: string
  /** Version string the gateway used to render — for drift logging. */
  rulebookVersion: string
}

interface FetchedRulebook {
  /** Rendered artifact body. Field name is `body` rather than `skill` here so
   *  the in-process variable matches the artifact it represents. */
  body: string
  rulebookVersion: string
  source: 'gateway' | 'bundled'
}

/**
 * Render the bundled rulebook for an agent without going through the network.
 * Used as the fallback when the gateway is unreachable, and as the source of
 * truth when running offline.
 */
function bundledRulebook(
  integration: Integration,
  agent: RulebookAgent,
): FetchedRulebook {
  const body =
    agent === 'claude-code'
      ? renderClaudeSkill({ integration })
      : renderAgentsMd({ integration })
  return { body, rulebookVersion: RULEBOOK_VERSION, source: 'bundled' }
}

/**
 * Fetch the latest rulebook from the gateway, with bundled fallback.
 *
 * Network and auth failures are non-fatal — we always have the bundled copy.
 * The gateway is the long-term source of truth for content updates between
 * CLI releases. We keep the call best-effort with a 5s timeout so a flaky
 * network can't turn init into a 60-second wait.
 */
export async function fetchRulebook({
  integration,
  agent,
  clientVersion,
}: {
  integration: Integration
  agent: RulebookAgent
  clientVersion: string
}): Promise<FetchedRulebook> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 5_000)

  try {
    const res = await fetch(gatewayUrl(), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        agent,
        integration: gatewayIntegration(integration),
        clientVersion,
        bundledVersion: RULEBOOK_VERSION,
      }),
      signal: controller.signal,
    })

    if (!res.ok) return bundledRulebook(integration, agent)

    const data = (await res.json()) as Partial<RulebookResponse>
    if (typeof data.skill !== 'string' || data.skill.length === 0) {
      return bundledRulebook(integration, agent)
    }
    return {
      body: data.skill,
      rulebookVersion: data.rulebookVersion ?? RULEBOOK_VERSION,
      source: 'gateway',
    }
  } catch {
    return bundledRulebook(integration, agent)
  } finally {
    clearTimeout(timeout)
  }
}

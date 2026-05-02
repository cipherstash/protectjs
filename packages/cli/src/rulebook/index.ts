export { RULEBOOK_VERSION } from './version.js'
export { renderGatewayPrompt } from './renderers/gateway.js'
export type { GatewayPromptContext } from './renderers/gateway.js'
export {
  renderClaudeSkill,
  CLAUDE_SKILL_NAME,
} from './renderers/claude-skill.js'
export type { ClaudeSkillContext } from './renderers/claude-skill.js'
export { renderAgentsMd } from './renderers/agents-md.js'
export type { AgentsMdContext } from './renderers/agents-md.js'
export { renderSetupPrompt } from './renderers/setup-prompt.js'
export type { SetupPromptContext } from './renderers/setup-prompt.js'

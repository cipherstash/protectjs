import fs from 'node:fs'
import path from 'node:path'

/**
 * A lightweight function that parses a TOML-like string
 * and returns the `workspace_id` value found under `[auth]`.
 *
 * @param tomlString The contents of the TOML file as a string.
 * @returns The workspace_id if found, otherwise undefined.
 */
function getWorkspaceId(tomlString: string): string | undefined {
  let currentSection = ''
  let workspaceId: string | undefined

  // Split the file contents into individual lines
  const lines = tomlString.split(/\r?\n/)

  for (const line of lines) {
    const trimmedLine = line.trim()

    // Skip empty or comment lines
    if (!trimmedLine || trimmedLine.startsWith('#')) {
      continue
    }

    // Check if the line defines a section: e.g. [auth]
    const sectionMatch = trimmedLine.match(/^\[([^\]]+)\]$/)
    if (sectionMatch) {
      currentSection = sectionMatch[1]
      continue
    }

    // Check if the line defines a key-value pair: e.g. workspace_id = "ABC123"
    const kvMatch = trimmedLine.match(/^(\w+)\s*=\s*"([^"]+)"$/)
    if (kvMatch) {
      const [_, key, value] = kvMatch

      // We only care about `workspace_id` under `[auth]`
      if (currentSection === 'auth' && key === 'workspace_id') {
        workspaceId = value
        // We can stop searching once we find it
        break
      }
    }
  }

  return workspaceId
}

export function loadWorkSpaceId(): string {
  const configPath = path.join(process.cwd(), 'cipherstash.toml')

  if (!fs.existsSync(configPath) || !process.env.CS_WORKSPACE_ID) {
    throw new Error(
      'You have not defined a workspace ID in your config file, or the CS_WORKSPACE_ID environment variable.',
    )
  }

  // Environment variables take precedence over config files
  if (process.env.CS_WORKSPACE_ID) return process.env.CS_WORKSPACE_ID

  if (!fs.existsSync(configPath)) {
    throw new Error(
      'You have not defined a workspace ID in your config file, or the CS_WORKSPACE_ID environment variable.',
    )
  }

  const tomlString = fs.readFileSync(configPath, 'utf8')
  const workspaceId = getWorkspaceId(tomlString)

  if (!workspaceId) {
    throw new Error(
      'You have not defined a workspace ID in your config file, or the CS_WORKSPACE_ID environment variable.',
    )
  }

  return workspaceId
}

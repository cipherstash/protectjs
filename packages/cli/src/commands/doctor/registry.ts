import { authAuthenticated } from './checks/auth/authenticated.js'
import { authWorkspaceIdMatchesConfig } from './checks/auth/workspace-id-matches-config.js'
import { configDatabaseUrlSet } from './checks/config/database-url-set.js'
import { configEncryptionClientExists } from './checks/config/encryption-client-exists.js'
import { configEncryptionClientHasTables } from './checks/config/encryption-client-has-tables.js'
import { configEncryptionClientLoadable } from './checks/config/encryption-client-loadable.js'
import { configStashConfigPresent } from './checks/config/stash-config-present.js'
import { configStashConfigValid } from './checks/config/stash-config-valid.js'
import { databaseConnects } from './checks/database/connects.js'
import { databaseEqlInstalled } from './checks/database/eql-installed.js'
import { databaseEqlVersion } from './checks/database/eql-version.js'
import { databaseRolePermissions } from './checks/database/role-permissions.js'
import { envCsClientCredentials } from './checks/env/cs-client-credentials.js'
import { envCsWorkspaceCrn } from './checks/env/cs-workspace-crn.js'
import { envDatabaseUrl } from './checks/env/database-url.js'
import { envDotenvFiles } from './checks/env/dotenv-files.js'
import { integrationDrizzleKitInstalled } from './checks/integration/drizzle-kit-installed.js'
import { integrationDrizzleMigrationsDir } from './checks/integration/drizzle-migrations-dir.js'
import { integrationSupabaseGrants } from './checks/integration/supabase-grants.js'
import { projectCliInstalled } from './checks/project/cli-installed.js'
import { projectIntegrationDetected } from './checks/project/integration-detected.js'
import { projectNodeVersion } from './checks/project/node-version.js'
import { projectPackageJson } from './checks/project/package-json.js'
import { projectStackInstalled } from './checks/project/stack-installed.js'
import { projectTypescript } from './checks/project/typescript.js'
import type { Check } from './types.js'

/**
 * Ordered list of every check. Order matters because the runner processes
 * checks sequentially and a check with `dependsOn` needs its deps to run first.
 * When adding a check, insert it after its dependencies and keep the category
 * grouping intact — the human formatter groups by category but preserves order.
 */
export const CHECKS: ReadonlyArray<Check> = [
  // project
  projectPackageJson,
  projectStackInstalled,
  projectCliInstalled,
  projectTypescript,
  projectIntegrationDetected,
  projectNodeVersion,
  // config
  configStashConfigPresent,
  configStashConfigValid,
  configDatabaseUrlSet,
  configEncryptionClientExists,
  configEncryptionClientLoadable,
  configEncryptionClientHasTables,
  // auth
  authAuthenticated,
  authWorkspaceIdMatchesConfig,
  // env
  envDatabaseUrl,
  envCsWorkspaceCrn,
  envCsClientCredentials,
  envDotenvFiles,
  // database
  databaseConnects,
  databaseRolePermissions,
  databaseEqlInstalled,
  databaseEqlVersion,
  // integration
  integrationDrizzleKitInstalled,
  integrationDrizzleMigrationsDir,
  integrationSupabaseGrants,
]

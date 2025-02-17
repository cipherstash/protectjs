import * as fs from 'node:fs'
import * as path from 'node:path'

/**
 * Parse a SemVer string, bump the minor version, and reset the patch.
 * Example: 1.2.3 -> 1.3.0
 */
function bumpMinorVersion(currentVersion: string): string {
  const parts = currentVersion.split('.')
  if (parts.length < 3) {
    throw new Error(`Invalid version format: '${currentVersion}'`)
  }

  const major = parts[0]
  const minor = Number.parseInt(parts[1], 10) + 1 // increment minor
  const patch = 0 // reset patch to 0

  return `${major}.${minor}.${patch}`
}

/**
 * Bump the versions of all binary packages.
 * Returns a map of folderName -> newVersion for reference.
 */
function bumpPlatformPackages(): Record<string, string> {
  const updatedPackages: Record<string, string> = {}
  const platformsDir = path.join(__dirname, 'platforms')

  if (!fs.existsSync(platformsDir)) {
    console.warn(
      `No 'platforms' directory found at ${platformsDir}. Skipping package bumps.`,
    )
    return updatedPackages
  }

  const platformsFolders = fs.readdirSync(platformsDir)

  for (const folderName of platformsFolders) {
    const folderPath = path.join(platformsDir, folderName)

    // Only proceed if it’s a directory
    if (!fs.statSync(folderPath).isDirectory()) {
      continue
    }

    const packageJsonPath = path.join(folderPath, 'package.json')
    if (!fs.existsSync(packageJsonPath)) {
      console.warn(`Skipping '${folderName}' — No package.json found.`)
      continue
    }

    try {
      const packageJsonData = JSON.parse(
        fs.readFileSync(packageJsonPath, 'utf8'),
      )

      if (packageJsonData.version) {
        const oldVersion = packageJsonData.version
        const newVersion = bumpMinorVersion(oldVersion)

        packageJsonData.version = newVersion
        fs.writeFileSync(
          packageJsonPath,
          `${JSON.stringify(packageJsonData, null, 2)}\n`,
          'utf8',
        )

        updatedPackages[folderName] = newVersion
        console.log(`Bumped ${folderName} from ${oldVersion} to ${newVersion}`)
      } else {
        console.warn(
          `No "version" field in package.json for '${folderName}'. Skipping.`,
        )
      }
    } catch (err) {
      console.error(`Error bumping version for '${folderName}':`, err)
    }
  }

  return updatedPackages
}

/**
 * Bump all optional dependencies in the root project/package.json
 */
function bumpRootOptionalDependencies() {
  const rootPackageJsonPath = path.join(__dirname, 'package.json')

  if (!fs.existsSync(rootPackageJsonPath)) {
    console.warn(
      `No root package.json found at ${rootPackageJsonPath}. Skipping optional deps bump.`,
    )
    return
  }

  try {
    const rootPackageJsonData = JSON.parse(
      fs.readFileSync(rootPackageJsonPath, 'utf8'),
    )

    // If no optionalDependencies, nothing to do
    if (!rootPackageJsonData.optionalDependencies) {
      console.warn(
        `No "optionalDependencies" found in the root package.json. Skipping.`,
      )
      return
    }

    const { optionalDependencies } = rootPackageJsonData

    for (const depName of Object.keys(optionalDependencies)) {
      const currentVersion = optionalDependencies[depName]

      try {
        const newVersion = bumpMinorVersion(currentVersion)
        optionalDependencies[depName] = newVersion
        console.log(
          `Bumped optional dependency '${depName}' from ${currentVersion} to ${newVersion}`,
        )
      } catch (err) {
        console.warn(
          `Skipping optional dependency '${depName}' - invalid semver '${currentVersion}'`,
        )
      }
    }

    // Write back updated optionalDependencies
    fs.writeFileSync(
      rootPackageJsonPath,
      `${JSON.stringify(rootPackageJsonData, null, 2)}\n`,
      'utf8',
    )
  } catch (error) {
    console.error(
      `Error reading or updating the root package.json at ${rootPackageJsonPath}:`,
      error,
    )
  }
}

/**
 * Main entry point for the script
 */
async function main() {
  // 1. Bump versions in platforms/*
  bumpPlatformPackages()

  // 2. Bump optional dependencies in the root package.json
  bumpRootOptionalDependencies()
}

main().catch((err) => {
  console.error('Error in main:', err)
  process.exit(1)
})

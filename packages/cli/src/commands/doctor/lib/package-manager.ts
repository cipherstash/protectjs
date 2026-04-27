import { detectPackageManager } from '../../wizard/lib/detect.js'

export type PackageManagerName = 'npm' | 'pnpm' | 'yarn' | 'bun'

/**
 * Package manager for fix-hint rendering — falls back to `npm` so hints always
 * contain a concrete command.
 */
export function pmForHints(cwd: string): {
  name: PackageManagerName
  install: (pkg: string) => string
  installDev: (pkg: string) => string
} {
  const detected = detectPackageManager(cwd)
  const name = detected?.name ?? 'npm'
  const install = (pkg: string) => {
    switch (name) {
      case 'bun':
        return `bun add ${pkg}`
      case 'pnpm':
        return `pnpm add ${pkg}`
      case 'yarn':
        return `yarn add ${pkg}`
      default:
        return `npm install ${pkg}`
    }
  }
  const installDev = (pkg: string) => {
    switch (name) {
      case 'bun':
        return `bun add -D ${pkg}`
      case 'pnpm':
        return `pnpm add -D ${pkg}`
      case 'yarn':
        return `yarn add -D ${pkg}`
      default:
        return `npm install -D ${pkg}`
    }
  }
  return { name, install, installDev }
}

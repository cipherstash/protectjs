import type { PackageJson } from '../types.js'

export function hasDependency(
  pkg: PackageJson | undefined,
  name: string,
): boolean {
  if (!pkg) return false
  return !!(pkg.dependencies?.[name] || pkg.devDependencies?.[name])
}

export function hasDevDependency(
  pkg: PackageJson | undefined,
  name: string,
): boolean {
  if (!pkg) return false
  return !!pkg.devDependencies?.[name]
}

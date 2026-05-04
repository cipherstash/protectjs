export function f({ runner = 'npx' }: { runner?: string } = {}): string {
  return runner
}

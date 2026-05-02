/**
 * Single source of truth for the rulebook content version.
 *
 * Bump this whenever any partial under `src/rulebook/partials/` changes in a
 * way that should invalidate previously-installed project skills. The CLI
 * writes this value into `.cipherstash/context.json` and into the installed
 * skill body so future runs can detect drift.
 *
 * Format: `YYYY-MM-DD-<letter>` for easy human ordering. Letter resets per day.
 */
export const RULEBOOK_VERSION = '2026-05-01-a'

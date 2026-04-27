import { describe, expect, it } from 'vitest'
import { renderJson } from '../format/json.js'
import type { Report } from '../types.js'

const REPORT: Report = {
  cliVersion: '1.2.3',
  timestamp: '2026-04-24T14:02:11.482Z',
  summary: { error: 1, warn: 0, info: 0, pass: 1, skip: 0 },
  outcomes: [
    {
      check: {
        id: 'project.package-json',
        title: 'package.json present',
        category: 'project',
        severity: 'error',
        run: async () => ({ status: 'pass' }),
      },
      result: { status: 'pass' },
    },
    {
      check: {
        id: 'project.stack-installed',
        title: '@cipherstash/stack installed',
        category: 'project',
        severity: 'error',
        run: async () => ({ status: 'fail' }),
      },
      result: {
        status: 'fail',
        message: 'not installed',
        fixHint: 'Run: npm install @cipherstash/stack',
        details: { packageManager: 'npm' },
      },
    },
  ],
}

describe('renderJson', () => {
  it('emits the public shape', () => {
    const output = renderJson(REPORT)
    expect(JSON.parse(output)).toEqual({
      cliVersion: '1.2.3',
      timestamp: '2026-04-24T14:02:11.482Z',
      summary: { error: 1, warn: 0, info: 0, pass: 1, skip: 0 },
      checks: [
        {
          id: 'project.package-json',
          title: 'package.json present',
          category: 'project',
          severity: 'error',
          status: 'pass',
          message: undefined,
          fixHint: undefined,
          details: undefined,
        },
        {
          id: 'project.stack-installed',
          title: '@cipherstash/stack installed',
          category: 'project',
          severity: 'error',
          status: 'fail',
          message: 'not installed',
          fixHint: 'Run: npm install @cipherstash/stack',
          details: { packageManager: 'npm' },
        },
      ],
    })
  })

  it('is stable JSON (string snapshot)', () => {
    // This is the frozen shape — breaking it is a breaking change.
    expect(renderJson(REPORT)).toMatchInlineSnapshot(`
      "{
        "cliVersion": "1.2.3",
        "timestamp": "2026-04-24T14:02:11.482Z",
        "summary": {
          "error": 1,
          "warn": 0,
          "info": 0,
          "pass": 1,
          "skip": 0
        },
        "checks": [
          {
            "id": "project.package-json",
            "title": "package.json present",
            "category": "project",
            "severity": "error",
            "status": "pass"
          },
          {
            "id": "project.stack-installed",
            "title": "@cipherstash/stack installed",
            "category": "project",
            "severity": "error",
            "status": "fail",
            "message": "not installed",
            "fixHint": "Run: npm install @cipherstash/stack",
            "details": {
              "packageManager": "npm"
            }
          }
        ]
      }"
    `)
  })
})

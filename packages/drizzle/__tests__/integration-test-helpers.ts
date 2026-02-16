import type { ProtectClient } from '@cipherstash/protect/client'
import { expect } from 'vitest'

type Result<T> = {
  data?: T
  failure?: {
    message: string
  }
}

type UserProfile = {
  name: string
  bio: string
  level: number
}

export type DecryptedUser = {
  id: number
  email: string
  age: number
  score: number
  profile: UserProfile
}

export type PlaintextUser = Omit<DecryptedUser, 'id'>

export type EncryptedPayload = {
  c: string
} & Record<string, unknown>

export type EncryptedUserRow = {
  id: number
  email: EncryptedPayload
  age: EncryptedPayload
  score: EncryptedPayload
  profile: EncryptedPayload
}

function toComparableUser(user: PlaintextUser | DecryptedUser): PlaintextUser {
  return {
    email: user.email,
    age: user.age,
    score: user.score,
    profile: {
      name: user.profile.name,
      bio: user.profile.bio,
      level: user.profile.level,
    },
  }
}

function sortByEmail(users: PlaintextUser[]): PlaintextUser[] {
  return [...users].sort((left, right) => left.email.localeCompare(right.email))
}

function assertEncryptedPayload(
  value: unknown,
  columnName: string,
): asserts value is EncryptedPayload {
  expect(
    value,
    `${columnName} should be returned as encrypted payload before decrypt`,
  ).toEqual(expect.objectContaining({ c: expect.any(String) }))
}

export function unwrapResult<T>(result: Result<T>, operation: string): T {
  if (result.failure) {
    throw new Error(`${operation} failed: ${result.failure.message}`)
  }

  if (result.data === undefined) {
    throw new Error(`${operation} returned undefined data`)
  }

  return result.data
}

export function expectRowsToBeEncrypted(rows: EncryptedUserRow[]) {
  for (const row of rows) {
    expect(row.id).toEqual(expect.any(Number))
    assertEncryptedPayload(row.email, 'email')
    assertEncryptedPayload(row.age, 'age')
    assertEncryptedPayload(row.score, 'score')
    assertEncryptedPayload(row.profile, 'profile')
  }
}

export async function decryptUserRows(
  protectClient: ProtectClient,
  rows: EncryptedUserRow[],
): Promise<DecryptedUser[]> {
  const decrypted = await protectClient.bulkDecryptModels(rows)
  return unwrapResult(
    decrypted as Result<unknown>,
    'bulkDecryptModels',
  ) as DecryptedUser[]
}

export async function decryptUserRow(
  protectClient: ProtectClient,
  row: EncryptedUserRow,
): Promise<DecryptedUser> {
  const decrypted = await protectClient.decryptModel(row)
  return unwrapResult(
    decrypted as Result<unknown>,
    'decryptModel',
  ) as DecryptedUser
}

export function expectUserToMatchPlaintext(
  actual: DecryptedUser,
  expected: PlaintextUser,
) {
  expect(actual.id).toEqual(expect.any(Number))
  expect(toComparableUser(actual)).toEqual(toComparableUser(expected))
}

export function expectUsersToMatchPlaintext(
  actual: DecryptedUser[],
  expected: PlaintextUser[],
) {
  const normalizedActual = sortByEmail(
    actual.map((user) => toComparableUser(user)),
  )
  const normalizedExpected = sortByEmail(
    expected.map((user) => toComparableUser(user)),
  )

  expect(normalizedActual).toEqual(normalizedExpected)
}

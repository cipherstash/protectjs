import { encryptedToPgComposite } from '../src/helpers'
import { describe, expect, it } from 'vitest'

describe('helpers', () => {
  it('should convert encrypted payload to pg composite', () => {
    const encrypted = {
      v: 1,
      c: 'ciphertext',
      i: {
        c: 'iv',
        t: 't',
      },
      k: 'k',
      ob: ['a', 'b'],
      bf: [1, 2, 3],
      hm: 'hm',
    }

    const pgComposite = encryptedToPgComposite(encrypted)
    expect(pgComposite).toBe(
      '("{""v"":1,""c"":""ciphertext"",""i"":{""c"":""iv"",""t"":""t""},""k"":""k"",""ob"":[""a"",""b""],""bf"":[1,2,3],""hm"":""hm""}")',
    )
  })
})

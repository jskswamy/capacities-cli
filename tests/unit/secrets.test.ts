/**
 * Copyright (c) 2026 Krishnaswamy Subramanian
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in
 * all copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 * SOFTWARE.
 */

// tests/unit/secrets.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'

describe('secrets', () => {
  let tmpDir: string
  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cap-sec-'))
  })
  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true })
    delete process.env.CAPACITIES_AGE_KEY
    delete process.env.CAPACITIES_AGE_KEY_FILE
  })

  it('decryptSecrets throws CONFIG error when file missing', async () => {
    process.env.CAPACITIES_AGE_KEY = 'fake'
    const { CapacitiesError } = await import('../../src/errors.ts')
    const { decryptSecrets } = await import('../../src/secrets.ts')
    await expect(decryptSecrets('/no/such/file.age')).rejects.toBeInstanceOf(CapacitiesError)
  })

  it('encryptSecrets + decryptSecrets round-trip', async () => {
    const ageModule = await import('age-encryption')
    const age = await ageModule.default()
    const identity = age.generateIdentity()
    process.env.CAPACITIES_AGE_KEY = identity

    const { encryptSecrets, decryptSecrets } = await import('../../src/secrets.ts')
    const spaceFile = path.join(tmpDir, 'personal.age')
    const secrets = { auth_type: 'api_token' as const, api_token: 'cap-api-testtoken' }

    await encryptSecrets(spaceFile, secrets)
    expect(fs.existsSync(spaceFile)).toBe(true)

    const decrypted = await decryptSecrets(spaceFile)
    expect(decrypted.auth_type).toBe('api_token')
    expect(decrypted.api_token).toBe('cap-api-testtoken')
  })

  it('resolveIdentity throws CONFIG when no key configured', async () => {
    // Ensure no key sources are set
    delete process.env.CAPACITIES_AGE_KEY
    delete process.env.CAPACITIES_AGE_KEY_FILE
    process.env.CAPACITIES_AGE_KEY_FILE = '/no/such/key.txt'
    const { CapacitiesError } = await import('../../src/errors.ts')
    const { resolveIdentity } = await import('../../src/secrets.ts')
    expect(() => resolveIdentity()).toThrow(CapacitiesError)
  })
})

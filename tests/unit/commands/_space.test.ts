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

// tests/unit/commands/_space.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'

const mockDecryptSecrets = vi.fn()

vi.mock('../../../src/secrets.ts', () => ({
  decryptSecrets: mockDecryptSecrets,
}))

describe('resolveSpace', () => {
  let tmpDir: string

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cap-space-'))
    process.env.XDG_CONFIG_HOME = tmpDir
    fs.mkdirSync(path.join(tmpDir, 'capacities'), { recursive: true })
    fs.writeFileSync(
      path.join(tmpDir, 'capacities', 'config.toml'),
      'active_space = "personal"\n[spaces.personal]\nobjects_dir = "/tmp/objs"\n'
    )
    vi.spyOn(process.stderr, 'write').mockImplementation(() => true)
  })

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true })
    delete process.env.XDG_CONFIG_HOME
    delete process.env.CAPACITIES_TOKEN
    vi.restoreAllMocks()
    vi.clearAllMocks()
  })

  it('returns api_token space from CAPACITIES_TOKEN env var', async () => {
    process.env.CAPACITIES_TOKEN = 'cap-api-env-token'
    const { resolveSpace } = await import('../../../src/commands/_space.ts')
    const space = await resolveSpace()
    expect(space.authType).toBe('api_token')
    expect(space.apiToken).toBe('cap-api-env-token')
    expect(space.name).toBe('personal')
    expect(mockDecryptSecrets).not.toHaveBeenCalled()
  })

  it('decrypts secrets file when CAPACITIES_TOKEN is not set', async () => {
    delete process.env.CAPACITIES_TOKEN
    mockDecryptSecrets.mockResolvedValue({
      auth_type: 'api_token',
      api_token: 'cap-api-decrypted',
    })
    const { resolveSpace } = await import('../../../src/commands/_space.ts')
    const space = await resolveSpace()
    expect(mockDecryptSecrets).toHaveBeenCalled()
    expect(space.authType).toBe('api_token')
    expect(space.apiToken).toBe('cap-api-decrypted')
  })

  it('returns oauth space from decrypted secrets', async () => {
    delete process.env.CAPACITIES_TOKEN
    mockDecryptSecrets.mockResolvedValue({
      auth_type: 'oauth',
      client_id: 'client-123',
      access_token: 'tok-abc',
      refresh_token: 'ref-xyz',
      expires_at: 9999999999,
    })
    const { resolveSpace } = await import('../../../src/commands/_space.ts')
    const space = await resolveSpace()
    expect(space.authType).toBe('oauth')
    expect(space.clientId).toBe('client-123')
    expect(space.accessToken).toBe('tok-abc')
    expect(space.refreshToken).toBe('ref-xyz')
    expect(space.expiresAt).toBe(9999999999)
  })
})

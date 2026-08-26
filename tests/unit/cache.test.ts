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

// tests/unit/cache.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'

describe('cache', () => {
  let tmpDir: string
  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cap-cache-'))
    process.env.CAPACITIES_CACHE_DIR = tmpDir
  })
  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true })
    delete process.env.CAPACITIES_CACHE_DIR
  })

  it('returns null on miss', async () => {
    const { cacheGet, TTL } = await import('../../src/cache.ts')
    expect(cacheGet('personal', 'object/abc.json', TTL.OBJECT)).toBeNull()
  })

  it('returns data on hit', async () => {
    const { cacheGet, cacheSet, TTL } = await import('../../src/cache.ts')
    cacheSet('personal', 'object/abc.json', { id: 'abc' })
    expect(cacheGet('personal', 'object/abc.json', TTL.OBJECT)).toEqual({ id: 'abc' })
  })

  it('returns null when expired', async () => {
    const { cacheGet, cacheSet } = await import('../../src/cache.ts')
    cacheSet('personal', 'object/old.json', { id: 'old' })
    // Backdate the entry
    const file = path.join(tmpDir, 'personal', 'object', 'old.json')
    const entry = JSON.parse(fs.readFileSync(file, 'utf8'))
    entry.fetchedAt = new Date(Date.now() - 2 * 3_600_000).toISOString()
    fs.writeFileSync(file, JSON.stringify(entry))
    expect(cacheGet('personal', 'object/old.json', 3_600_000)).toBeNull()
  })

  it('cacheBust removes the file', async () => {
    const { cacheGet, cacheSet, cacheBust, TTL } = await import('../../src/cache.ts')
    cacheSet('personal', 'object/bust.json', { id: 'x' })
    cacheBust('personal', 'object/bust.json')
    expect(cacheGet('personal', 'object/bust.json', TTL.OBJECT)).toBeNull()
  })

  it('queryHash is stable and 16 chars', async () => {
    const { queryHash } = await import('../../src/cache.ts')
    const h1 = queryHash('stanford', 'Organization')
    const h2 = queryHash('stanford', 'Organization')
    expect(h1).toBe(h2)
    expect(h1).toHaveLength(16)
  })
})

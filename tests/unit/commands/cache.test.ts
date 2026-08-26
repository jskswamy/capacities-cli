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

// tests/unit/commands/cache.test.ts
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'

describe('clear-cache command', () => {
  let tmpDir: string

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cap-clear-cache-'))
    process.env.XDG_CONFIG_HOME = tmpDir
    process.env.XDG_CACHE_HOME = tmpDir
    process.env.CAPACITIES_SPACE = 'personal'
    vi.spyOn(process.stdout, 'write').mockImplementation(() => true)
    fs.mkdirSync(path.join(tmpDir, 'capacities'), { recursive: true })
    fs.writeFileSync(
      path.join(tmpDir, 'capacities', 'config.toml'),
      'active_space = "personal"\n[spaces.personal]\n'
    )
  })

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true })
    delete process.env.XDG_CONFIG_HOME
    delete process.env.XDG_CACHE_HOME
    delete process.env.CAPACITIES_SPACE
    vi.clearAllMocks()
  })

  it('deletes a stale structures cache so a renamed type is picked up again', async () => {
    const { cacheSet, cacheGet, TTL } = await import('../../../src/cache.ts')
    cacheSet('personal', 'structures.json', { structures: [{ id: 'x', title: 'Research' }] })
    expect(cacheGet('personal', 'structures.json', TTL.STRUCTURES)).not.toBeNull()

    const { runClearCache } = await import('../../../src/commands/cache.ts')
    runClearCache({})

    expect(cacheGet('personal', 'structures.json', TTL.STRUCTURES)).toBeNull()
  })

  it('clears every cached file for the space, not just structures', async () => {
    const { cacheSet, cacheGet, TTL } = await import('../../../src/cache.ts')
    cacheSet('personal', 'structures.json', { ok: true })
    cacheSet('personal', 'object/obj-1.json', { ok: true })

    const { runClearCache } = await import('../../../src/commands/cache.ts')
    runClearCache({})

    expect(cacheGet('personal', 'structures.json', TTL.STRUCTURES)).toBeNull()
    expect(cacheGet('personal', 'object/obj-1.json', TTL.OBJECT)).toBeNull()
  })

  it('respects an explicit --space override rather than the active space', async () => {
    fs.writeFileSync(
      path.join(tmpDir, 'capacities', 'config.toml'),
      'active_space = "personal"\n[spaces.personal]\n[spaces.work]\n'
    )
    const { cacheSet, cacheGet, TTL } = await import('../../../src/cache.ts')
    cacheSet('personal', 'structures.json', { ok: true })
    cacheSet('work', 'structures.json', { ok: true })

    const { runClearCache } = await import('../../../src/commands/cache.ts')
    runClearCache({ space: 'work' })

    expect(cacheGet('work', 'structures.json', TTL.STRUCTURES)).toBeNull()
    expect(cacheGet('personal', 'structures.json', TTL.STRUCTURES)).not.toBeNull()
  })
})

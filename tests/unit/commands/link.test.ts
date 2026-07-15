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

// tests/unit/commands/link.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'

const mockUpdate = vi.fn()
const mockMarkdownGet = vi.fn()

vi.mock('@capacities/api', () => ({
  CapacitiesClient: vi.fn().mockImplementation(() => ({
    object: {
      update: mockUpdate,
      markdown: { get: mockMarkdownGet },
    },
  })),
}))

describe('link command', () => {
  let tmpDir: string
  let outSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cap-link-'))
    process.env.XDG_CONFIG_HOME = tmpDir
    process.env.XDG_CACHE_HOME = tmpDir
    process.env.CAPACITIES_TOKEN = 'cap-api-test'
    process.env.CAPACITIES_SPACE = 'personal'
    process.env.CAPACITIES_OBJECTS_DIR = path.join(tmpDir, 'objects')
    outSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true)
    vi.spyOn(process.stderr, 'write').mockImplementation(() => true)
    fs.mkdirSync(path.join(tmpDir, 'capacities-cli'), { recursive: true })
    fs.writeFileSync(path.join(tmpDir, 'capacities-cli', 'config.toml'), 'active_space = "personal"\n[spaces.personal]\nobjects_dir = "' + path.join(tmpDir, 'objects') + '"\n')
  })

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true })
    delete process.env.XDG_CONFIG_HOME
    delete process.env.XDG_CACHE_HOME
    delete process.env.CAPACITIES_TOKEN
    delete process.env.CAPACITIES_SPACE
    delete process.env.CAPACITIES_OBJECTS_DIR
    vi.clearAllMocks()
  })

  it('sends entity array with all target IDs', async () => {
    mockUpdate.mockResolvedValue({ id: 'org-1', title: 'Stanford', objectType: 'Organization' })
    mockMarkdownGet.mockResolvedValue('---\ntype: Organization\ntitle: Stanford\n---\n')
    const { runLink } = await import('../../../src/commands/link.ts')
    await runLink('org-1', 'personalities', ['p1', 'p2', 'p3'], {})
    expect(mockUpdate).toHaveBeenCalledWith(expect.objectContaining({
      id: 'org-1',
      properties: {
        personalities: {
          type: 'entity',
          entity: [{ id: 'p1' }, { id: 'p2' }, { id: 'p3' }],
        },
      },
    }))
  })

  it('busts object cache on success', async () => {
    mockUpdate.mockResolvedValue({ id: 'org-1', title: 'Stanford', objectType: 'Organization' })
    mockMarkdownGet.mockResolvedValue('---\ntype: Organization\ntitle: Stanford\n---\n')
    const { cacheSet } = await import('../../../src/cache.ts')
    cacheSet('personal', 'object/org-1.json', { id: 'org-1' })
    const { runLink } = await import('../../../src/commands/link.ts')
    await runLink('org-1', 'personalities', ['p1'], {})
    const { cacheGet, TTL } = await import('../../../src/cache.ts')
    expect(cacheGet('personal', 'object/org-1.json', TTL.OBJECT)).toBeNull()
  })
})

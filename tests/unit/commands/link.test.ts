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
const mockFetchStructures = vi.fn()

vi.mock('../../../src/client.ts', () => ({
  createClient: vi.fn().mockImplementation(() => ({
    object: { update: mockUpdate, markdown: { get: mockMarkdownGet } },
  })),
}))

vi.mock('../../../src/commands/search.ts', async (importOriginal) => {
  const actual = (await importOriginal()) as object
  return { ...actual, fetchStructures: mockFetchStructures }
})

const STRUCTURES = {
  structures: [
    {
      id: 'org-struct',
      title: 'Organization',
      propertyDefinitions: [
        { id: 'f46c81ae-0001-0000-0000-000000000001', name: 'Personalities', type: 'entity' },
        { id: 'quadrant-uuid', name: 'Quadrant', type: 'label', labelSet: [{ id: 'tool-id', name: 'Tool' }] },
      ],
    },
  ],
}

describe('link command', () => {
  let tmpDir: string

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cap-link-'))
    process.env.XDG_CONFIG_HOME = tmpDir
    process.env.XDG_CACHE_HOME = tmpDir
    process.env.CAPACITIES_TOKEN = 'cap-api-test'
    process.env.CAPACITIES_SPACE = 'personal'
    process.env.CAPACITIES_OBJECTS_DIR = path.join(tmpDir, 'objects')
    vi.spyOn(process.stdout, 'write').mockImplementation(() => true)
    vi.spyOn(process.stderr, 'write').mockImplementation(() => true)
    fs.mkdirSync(path.join(tmpDir, 'capacities'), { recursive: true })
    fs.writeFileSync(
      path.join(tmpDir, 'capacities', 'config.toml'),
      `active_space = "personal"\n[spaces.personal]\nobjects_dir = "${path.join(tmpDir, 'objects')}"\n`
    )
    mockFetchStructures.mockResolvedValue(STRUCTURES)
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

  it('resolves property name to UUID and sends entity payload', async () => {
    mockUpdate.mockResolvedValue({})
    mockMarkdownGet.mockResolvedValue('---\ntype: Organization\ntitle: Stanford\n---\n')
    const { runLink } = await import('../../../src/commands/link.ts')
    await runLink('org-1', 'personalities', ['p1', 'p2'], {})
    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'org-1',
        properties: {
          'f46c81ae-0001-0000-0000-000000000001': {
            type: 'entity',
            entity: [{ id: 'p1' }, { id: 'p2' }],
          },
        },
      })
    )
  })

  it('throws CONFIG error when property is not an entity type', async () => {
    const { runLink } = await import('../../../src/commands/link.ts')
    await expect(runLink('org-1', 'quadrant', ['val'], {})).rejects.toThrow('use `cap update`')
  })

  it('busts object cache on success', async () => {
    mockUpdate.mockResolvedValue({})
    mockMarkdownGet.mockResolvedValue('---\ntype: Organization\ntitle: Stanford\n---\n')
    const { cacheSet } = await import('../../../src/cache.ts')
    cacheSet('personal', 'object/org-1.json', { id: 'org-1' })
    const { runLink } = await import('../../../src/commands/link.ts')
    await runLink('org-1', 'personalities', ['p1'], {})
    const { cacheGet, TTL } = await import('../../../src/cache.ts')
    expect(cacheGet('personal', 'object/org-1.json', TTL.OBJECT)).toBeNull()
  })
})

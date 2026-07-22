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

// tests/unit/commands/update.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'

const mockUpdate = vi.fn()
const mockMarkdownGet = vi.fn()
const mockPatchMarkdown = vi.fn()

vi.mock('../../../src/client.ts', () => ({
  createClient: vi.fn().mockImplementation(() => ({
    object: {
      update: mockUpdate,
      markdown: { get: mockMarkdownGet },
    },
  })),
  patchMarkdown: mockPatchMarkdown,
}))

describe('update command', () => {
  let tmpDir: string

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cap-update-'))
    process.env.XDG_CONFIG_HOME = tmpDir
    process.env.XDG_CACHE_HOME = tmpDir
    process.env.CAPACITIES_TOKEN = 'cap-api-test'
    process.env.CAPACITIES_SPACE = 'personal'
    vi.spyOn(process.stdout, 'write').mockImplementation(() => true)
    vi.spyOn(process.stderr, 'write').mockImplementation(() => true)
    fs.mkdirSync(path.join(tmpDir, 'capacities'), { recursive: true })
    fs.writeFileSync(path.join(tmpDir, 'capacities', 'config.toml'), 'active_space = "personal"\n[spaces.personal]\nobjects_dir = "' + path.join(tmpDir, 'objects') + '"\n')
  })

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true })
    delete process.env.XDG_CONFIG_HOME
    delete process.env.XDG_CACHE_HOME
    delete process.env.CAPACITIES_TOKEN
    delete process.env.CAPACITIES_SPACE
    vi.clearAllMocks()
  })

  it('sends scalar property patch', async () => {
    mockUpdate.mockResolvedValue({})
    mockMarkdownGet.mockResolvedValue('---\ntype: Personality\ntitle: Updated\n---\n')
    const { runUpdate } = await import('../../../src/commands/update.ts')
    await runUpdate('obj-1', 'description', 'New desc', {})
    expect(mockUpdate).toHaveBeenCalledWith(expect.objectContaining({
      id: 'obj-1',
      properties: { description: { type: 'text', text: { value: 'New desc' } } },
    }))
  })

  it('calls patchMarkdown when --markdown flag is set with a file', async () => {
    mockPatchMarkdown.mockResolvedValue(undefined)
    mockMarkdownGet.mockResolvedValue('---\ntype: Blip\ntitle: Grafana\n---\n')
    const mdPath = path.join(tmpDir, 'grafana.md')
    fs.writeFileSync(mdPath, '---\nquadrant: Tool\nring: Adopt\n---\n')
    const { runUpdate } = await import('../../../src/commands/update.ts')
    await runUpdate('obj-2', undefined, undefined, { markdown: mdPath })
    expect(mockPatchMarkdown).toHaveBeenCalledWith(
      expect.objectContaining({ authType: 'api_token' }),
      'obj-2',
      '---\nquadrant: Tool\nring: Adopt\n---\n'
    )
    expect(mockUpdate).not.toHaveBeenCalled()
  })

  it('throws CONFIG error when neither --markdown nor propertyKey provided', async () => {
    const { runUpdate } = await import('../../../src/commands/update.ts')
    await expect(runUpdate('obj-3', undefined, undefined, {})).rejects.toThrow('Either --markdown or <propertyKey> <value> is required')
  })

  it('busts cache after update', async () => {
    mockUpdate.mockResolvedValue({})
    mockMarkdownGet.mockResolvedValue('---\ntype: Personality\ntitle: T\n---\n')
    const { cacheSet } = await import('../../../src/cache.ts')
    cacheSet('personal', 'object/obj-1.json', { stale: true })
    const { runUpdate } = await import('../../../src/commands/update.ts')
    await runUpdate('obj-1', 'description', 'x', {})
    const { cacheGet, TTL } = await import('../../../src/cache.ts')
    expect(cacheGet('personal', 'object/obj-1.json', TTL.OBJECT)).toBeNull()
  })
})

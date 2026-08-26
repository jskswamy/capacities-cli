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

// tests/unit/commands/search.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'

const mockSearch = vi.fn()
const mockStructures = vi.fn()

vi.mock('@capacities/api', () => ({
  CapacitiesClient: vi.fn().mockImplementation(() => ({
    objects: { search: mockSearch },
    space: { structures: mockStructures },
  })),
}))

describe('search command', () => {
  let tmpDir: string
  let outSpy: ReturnType<typeof vi.spyOn>
  let errSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cap-search-'))
    process.env.XDG_CONFIG_HOME = tmpDir
    process.env.XDG_CACHE_HOME = tmpDir
    process.env.CAPACITIES_TOKEN = 'cap-api-test'
    outSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true)
    errSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true)

    // Write minimal config
    fs.mkdirSync(path.join(tmpDir, 'capacities'), { recursive: true })
    fs.writeFileSync(
      path.join(tmpDir, 'capacities', 'config.toml'),
      'active_space = "personal"\n[spaces.personal]\nobjects_dir = "/tmp/objs"\n'
    )
  })

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true })
    delete process.env.XDG_CONFIG_HOME
    delete process.env.XDG_CACHE_HOME
    delete process.env.CAPACITIES_TOKEN
    outSpy.mockRestore()
    errSpy.mockRestore()
    vi.clearAllMocks()
  })

  it('calls objects.search with the query', async () => {
    mockStructures.mockResolvedValue({ structures: [] })
    mockSearch.mockResolvedValue({ results: [{ id: 'abc', structureId: 'RootPage', title: 'Stanford' }] })
    const { runSearch } = await import('../../../src/commands/search.ts')
    await runSearch('Stanford', undefined, {})
    expect(mockSearch).toHaveBeenCalledWith(expect.objectContaining({ query: 'Stanford' }))
  })

  it('caches search results', async () => {
    mockStructures.mockResolvedValue({ structures: [] })
    mockSearch.mockResolvedValueOnce({ results: [] })
    const { runSearch } = await import('../../../src/commands/search.ts')
    await runSearch('test', undefined, {})
    await runSearch('test', undefined, {})
    expect(mockSearch).toHaveBeenCalledTimes(1) // second call is cache hit
  })

  it('resolves structure id when --type is provided', async () => {
    mockStructures.mockResolvedValue({
      structures: [{ id: 'st-1', title: 'Page' }],
    })
    mockSearch.mockResolvedValue({ results: [] })
    const { runSearch } = await import('../../../src/commands/search.ts')
    await runSearch('hello', 'Page', {})
    expect(mockStructures).toHaveBeenCalled()
    expect(mockSearch).toHaveBeenCalledWith(expect.objectContaining({ query: 'hello' }))
  })

  it('throws NOT_FOUND when type is unknown', async () => {
    mockStructures.mockResolvedValue({ structures: [{ id: 'st-1', title: 'Page' }] })
    const { runSearch } = await import('../../../src/commands/search.ts')
    await expect(runSearch('hello', 'Unknown', {})).rejects.toThrow('Unknown type')
  })

  it('formats built-in structureId as readable type name', async () => {
    mockStructures.mockResolvedValue({ structures: [] })
    mockSearch.mockResolvedValue({ results: [{ id: 'x', structureId: 'RootPage', title: 'My Page' }] })
    const { runSearch } = await import('../../../src/commands/search.ts')
    await runSearch('q', undefined, {})
    const written = outSpy.mock.calls.map((c) => c[0]).join('')
    expect(written).toContain('Page')
  })

  it('resolves custom structureId to title via structures lookup', async () => {
    mockStructures.mockResolvedValue({ structures: [{ id: 'custom-uuid-123', title: 'Book' }] })
    mockSearch.mockResolvedValue({ results: [{ id: 'x', structureId: 'custom-uuid-123', title: 'Dune' }] })
    const { runSearch } = await import('../../../src/commands/search.ts')
    await runSearch('q', undefined, {})
    const written = outSpy.mock.calls.map((c) => c[0]).join('')
    expect(written).toContain('Book')
  })

  it('prints json when json option is set', async () => {
    const data = { results: [{ id: 'x', structureId: 'RootPage', title: 'T' }] }
    mockSearch.mockResolvedValue(data)
    const { runSearch } = await import('../../../src/commands/search.ts')
    await runSearch('q', undefined, { json: true })
    const written = outSpy.mock.calls.map((c) => c[0]).join('')
    expect(JSON.parse(written)).toMatchObject(data)
  })
})

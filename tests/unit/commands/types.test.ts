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

// tests/unit/commands/types.test.ts
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const mockFetchStructures = vi.fn()

vi.mock('../../../src/commands/search.ts', async (importOriginal) => {
  const actual = (await importOriginal()) as object
  return { ...actual, fetchStructures: mockFetchStructures }
})

const MEDIA_PDF = {
  id: 'MediaPDF',
  title: 'MediaPDF',
  propertyDefinitions: [
    { id: 'title', name: 'title', type: 'title' },
    { id: 'media_pdfPageCount', name: 'page count', type: 'number' },
  ],
}

const DATES = {
  id: 'task-struct',
  title: 'Task',
  propertyDefinitions: [
    { id: 'due', name: 'due', type: 'date', supportsReminders: true },
    { id: 'done', name: 'done', type: 'date' },
    { id: 'nested', name: 'nested', type: 'date', constraints: { supportsReminders: true } },
  ],
}

describe('types command', () => {
  let tmpDir: string
  let stdoutOutput: string[]

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cap-types-'))
    process.env.XDG_CONFIG_HOME = tmpDir
    process.env.XDG_CACHE_HOME = tmpDir
    process.env.CAPACITIES_TOKEN = 'cap-api-test'
    process.env.CAPACITIES_SPACE = 'personal'
    fs.mkdirSync(path.join(tmpDir, 'capacities'), { recursive: true })
    fs.writeFileSync(path.join(tmpDir, 'capacities', 'config.toml'), 'active_space = "personal"\n[spaces.personal]\n')
    stdoutOutput = []
    vi.spyOn(process.stdout, 'write').mockImplementation((chunk: unknown) => {
      stdoutOutput.push(String(chunk))
      return true
    })
    vi.spyOn(process.stderr, 'write').mockImplementation(() => true)
  })

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true })
    delete process.env.XDG_CONFIG_HOME
    delete process.env.XDG_CACHE_HOME
    delete process.env.CAPACITIES_TOKEN
    delete process.env.CAPACITIES_SPACE
    vi.clearAllMocks()
    vi.restoreAllMocks()
  })

  it('honors normalized writable flags on non-constrained types', async () => {
    mockFetchStructures.mockResolvedValue({
      structures: [
        {
          id: 'RootPage',
          title: 'Page',
          propertyDefinitions: [
            { id: 'lastUpdatedAt', name: 'updated', type: 'lastUpdatedAt', writable: false },
            { id: 'title', name: 'title', type: 'title', writable: true },
          ],
        },
      ],
    })
    const { runTypes } = await import('../../../src/commands/types.ts')
    await runTypes('Page', undefined, { json: true })
    expect(JSON.parse(stdoutOutput.join('')).fields.map((f: { writable: string }) => f.writable)).toEqual(['no', 'yes'])
  })

  it('shows writable yes or no for MediaPDF detail', async () => {
    mockFetchStructures.mockResolvedValue({ structures: [MEDIA_PDF] })
    const { runTypes } = await import('../../../src/commands/types.ts')
    await runTypes('MediaPDF', undefined, {})
    const out = stdoutOutput.join('')
    const header = out.split('\n').find((line) => line.includes('writable'))
    expect(header).toBeTruthy()
    expect(header).not.toContain('reminders')
    expect(out).toMatch(/title\s+title\s+yes/)
    expect(out).toMatch(/page count\s+number\s+no/)
  })

  it('includes writable on MediaPDF json detail', async () => {
    mockFetchStructures.mockResolvedValue({ structures: [MEDIA_PDF] })
    const { runTypes } = await import('../../../src/commands/types.ts')
    await runTypes('MediaPDF', undefined, { json: true })
    const parsed = JSON.parse(stdoutOutput.join(''))
    expect(parsed.fields.find((f: { name: string }) => f.name === 'title').writable).toBe('yes')
    expect(parsed.fields.find((f: { name: string }) => f.name === 'page count').writable).toBe('no')
  })

  it('appends reminders to a date row that supports them and not to one that does not', async () => {
    mockFetchStructures.mockResolvedValue({ structures: [DATES] })
    const { runTypes } = await import('../../../src/commands/types.ts')
    await runTypes('Task', undefined, {})
    const out = stdoutOutput.join('')
    const lines = out.split('\n')
    const header = lines.find((line) => line.includes('field') && line.includes('writable'))
    expect(header).toBeTruthy()
    expect(header).not.toContain('reminders')
    const due = lines.find((line) => line.startsWith('due'))
    const done = lines.find((line) => line.startsWith('done'))
    const nested = lines.find((line) => line.startsWith('nested'))
    expect(due).toContain('reminders')
    expect(done).not.toContain('reminders')
    expect(nested).toContain('reminders')
  })

  it('does not add an empty reminders column in json when the flag is absent', async () => {
    mockFetchStructures.mockResolvedValue({ structures: [DATES] })
    const { runTypes } = await import('../../../src/commands/types.ts')
    await runTypes('Task', undefined, { json: true })
    const parsed = JSON.parse(stdoutOutput.join(''))
    const due = parsed.fields.find((f: { name: string }) => f.name === 'due')
    const done = parsed.fields.find((f: { name: string }) => f.name === 'done')
    const nested = parsed.fields.find((f: { name: string }) => f.name === 'nested')
    expect(due.values).toEqual(['reminders'])
    expect(done.values).toEqual([])
    expect(nested.values).toEqual(['reminders'])
    expect(due).not.toHaveProperty('reminders')
    expect(done).not.toHaveProperty('reminders')
    expect(Object.keys(due)).not.toContain('reminders')
  })
})

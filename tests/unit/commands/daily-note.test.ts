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

// tests/unit/commands/daily-note.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'

const mockAppend = vi.fn()

vi.mock('@capacities/api', () => ({
  CapacitiesClient: vi.fn().mockImplementation(() => ({
    blocks: {
      dailyNote: { append: mockAppend },
    },
  })),
}))

describe('daily-note command', () => {
  let tmpDir: string

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cap-daily-'))
    process.env.XDG_CONFIG_HOME = tmpDir
    process.env.XDG_CACHE_HOME = tmpDir
    process.env.CAPACITIES_TOKEN = 'cap-api-test'
    process.env.CAPACITIES_SPACE = 'personal'
    vi.spyOn(process.stdout, 'write').mockImplementation(() => true)
    vi.spyOn(process.stderr, 'write').mockImplementation(() => true)
    fs.mkdirSync(path.join(tmpDir, 'capacities'), { recursive: true })
    fs.writeFileSync(
      path.join(tmpDir, 'capacities', 'config.toml'),
      'active_space = "personal"\n[spaces.personal]\n'
    )
    mockAppend.mockResolvedValue({})
  })

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true })
    delete process.env.XDG_CONFIG_HOME
    delete process.env.XDG_CACHE_HOME
    delete process.env.CAPACITIES_TOKEN
    delete process.env.CAPACITIES_SPACE
    vi.clearAllMocks()
  })

  it('passes inline markdown to SDK append', async () => {
    const { runDailyNote } = await import('../../../src/commands/daily-note.ts')
    await runDailyNote('Shipped v0.2.', { timestamp: true })
    expect(mockAppend).toHaveBeenCalledWith(
      expect.objectContaining({ markdown: 'Shipped v0.2.' })
    )
  })

  it('reads from stdin when argument is "-"', async () => {
    const { Readable } = await import('stream')
    const stdinContent = 'Content from pipe'
    vi.spyOn(process, 'stdin', 'get').mockReturnValue(
      Readable.from([Buffer.from(stdinContent)]) as any
    )
    const { runDailyNote } = await import('../../../src/commands/daily-note.ts')
    await runDailyNote('-', { timestamp: true })
    expect(mockAppend).toHaveBeenCalledWith(
      expect.objectContaining({ markdown: stdinContent })
    )
  })

  it('wires --date to SDK body', async () => {
    const { runDailyNote } = await import('../../../src/commands/daily-note.ts')
    await runDailyNote('Late entry.', { date: '2026-07-15', timestamp: true })
    expect(mockAppend).toHaveBeenCalledWith(
      expect.objectContaining({ date: '2026-07-15' })
    )
  })

  it('sets noTimeStamp: true when --no-timestamp is passed', async () => {
    const { runDailyNote } = await import('../../../src/commands/daily-note.ts')
    await runDailyNote('Raw entry.', { timestamp: false })
    expect(mockAppend).toHaveBeenCalledWith(
      expect.objectContaining({ noTimeStamp: true })
    )
  })

  it('does not include noTimeStamp when timestamp is true', async () => {
    const { runDailyNote } = await import('../../../src/commands/daily-note.ts')
    await runDailyNote('Normal entry.', { timestamp: true })
    const call = mockAppend.mock.calls[0][0]
    expect(call).not.toHaveProperty('noTimeStamp')
  })
})

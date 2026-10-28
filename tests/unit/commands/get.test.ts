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

// tests/unit/commands/get.test.ts
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import { Readable } from 'stream'
import { Command } from 'commander'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { CapacitiesError, ExitCode } from '../../../src/errors.ts'

const mockMarkdownGet = vi.fn()
let stdinSpy: ReturnType<typeof vi.spyOn> | undefined
vi.mock('@capacities/api', () => ({
  CapacitiesClient: vi.fn().mockImplementation(() => ({
    object: { markdown: { get: mockMarkdownGet } },
  })),
}))

describe('get command', () => {
  let tmpDir: string
  let outSpy: ReturnType<typeof vi.spyOn>
  let errSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cap-get-'))
    process.env.XDG_CONFIG_HOME = tmpDir
    process.env.XDG_CACHE_HOME = tmpDir
    process.env.CAPACITIES_TOKEN = 'cap-api-test'
    process.env.CAPACITIES_SPACE = 'personal'
    outSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true)
    errSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true)
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
    delete process.env.CAPACITIES_SPACE
    outSpy.mockRestore()
    errSpy.mockRestore()
    vi.clearAllMocks()
    stdinSpy?.mockRestore()
    stdinSpy = undefined
  })

  it('fetches markdown and writes to stdout', async () => {
    mockMarkdownGet.mockResolvedValue('# Title\nsome content')
    const { runGet } = await import('../../../src/commands/get.ts')
    await runGet('abc-123', {})
    expect(outSpy).toHaveBeenCalledWith('# Title\nsome content\n')
  })

  it('serves from cache on second call', async () => {
    mockMarkdownGet.mockResolvedValue('# Cached')
    const { runGet } = await import('../../../src/commands/get.ts')
    await runGet('cache-id', {})
    await runGet('cache-id', {})
    expect(mockMarkdownGet).toHaveBeenCalledTimes(1)
  })

  it('registers an optional object id', async () => {
    const { registerGet } = await import('../../../src/commands/get.ts')
    const program = new Command()
    registerGet(program)
    expect(program.commands.find((c) => c.name() === 'get')?.registeredArguments[0]?.required).toBe(false)
  })

  it('uses the first field of one piped line', async () => {
    mockMarkdownGet.mockResolvedValue('# ok')
    mockStdin('abc\tAlpha\n')
    const { runGet } = await import('../../../src/commands/get.ts')
    await runGet(undefined, {})
    expect(mockMarkdownGet).toHaveBeenCalledWith({ id: 'abc' })
  })

  it.each(['abc\ndef\n', '', ' \t\n\n'])('rejects invalid piped input %j', async (input) => {
    mockStdin(input)
    const { runGet } = await import('../../../src/commands/get.ts')
    await expect(runGet(undefined, {})).rejects.toMatchObject({
      code: ExitCode.CONFIG,
      message: expect.stringMatching(/pick one/),
    })
    expect(mockMarkdownGet).not.toHaveBeenCalled()
    expect(outSpy).not.toHaveBeenCalled()
  })

  it('does not read stdin when the argument is present', async () => {
    mockMarkdownGet.mockResolvedValue('# ok')
    const stdinSpy = vi.spyOn(process, 'stdin', 'get')
    try {
      const { runGet } = await import('../../../src/commands/get.ts')
      await runGet('from-arg', {})
      expect(mockMarkdownGet).toHaveBeenCalledWith({ id: 'from-arg' })
      expect(stdinSpy).not.toHaveBeenCalled()
    } finally {
      stdinSpy.mockRestore()
    }
  })

  it('rejects a missing id when stdin is a TTY', async () => {
    const previous = process.stdin.isTTY
    Object.defineProperty(process.stdin, 'isTTY', { value: true, configurable: true })
    try {
      const { runGet } = await import('../../../src/commands/get.ts')
      const err = await runGet(undefined, {}).catch((e: unknown) => e)
      expect(err).toBeInstanceOf(CapacitiesError)
      expect((err as CapacitiesError).code).toBe(ExitCode.CONFIG)
      expect((err as Error).message).toMatch(/missing/)
      expect(mockMarkdownGet).not.toHaveBeenCalled()
    } finally {
      Object.defineProperty(process.stdin, 'isTTY', { value: previous, configurable: true })
    }
  })

  it('uses the piped id in JSON output and shares its cache with argument lookup', async () => {
    mockMarkdownGet.mockResolvedValue({ id: 'piped-id', structureId: 'notes', markdown: '# ok' })
    mockStdin('piped-id\tTitle\n')
    const { runGet } = await import('../../../src/commands/get.ts')
    await runGet(undefined, { json: true })
    expect(outSpy).toHaveBeenCalledWith(JSON.stringify({ objectId: 'piped-id', markdown: '# ok' }, null, 2) + '\n')
    await runGet('piped-id', {})
    expect(mockMarkdownGet).toHaveBeenCalledTimes(1)
    expect(outSpy).toHaveBeenLastCalledWith('# ok\n')
  })
})

function mockStdin(input: string): void {
  const stream = Readable.from([Buffer.from(input)])
  Object.defineProperty(stream, 'isTTY', { value: false, configurable: true })
  stdinSpy = vi.spyOn(process, 'stdin', 'get').mockReturnValue(stream as NodeJS.ReadStream)
}

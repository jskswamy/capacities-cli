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

// tests/unit/commands/open.test.ts
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import { Readable } from 'stream'
import { Command } from 'commander'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { CapacitiesError, ExitCode } from '../../../src/errors.ts'

const SPACE_ID = 'space-111'
const mockSpaceGet = vi.fn()
const mockExecFileSync = vi.fn()
let stdinSpy: ReturnType<typeof vi.spyOn> | undefined

vi.mock('@capacities/api', () => ({
  CapacitiesClient: vi.fn().mockImplementation(() => ({
    space: { get: mockSpaceGet },
  })),
}))

vi.mock('child_process', () => ({
  execFileSync: (...args: unknown[]) => mockExecFileSync(...args),
}))

describe('open command', () => {
  let tmpDir: string
  let stdoutOutput: string[]
  let outSpy: ReturnType<typeof vi.spyOn>
  let errSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cap-open-'))
    process.env.XDG_CONFIG_HOME = tmpDir
    process.env.XDG_CACHE_HOME = tmpDir
    process.env.CAPACITIES_TOKEN = 'cap-api-test'
    process.env.CAPACITIES_SPACE = 'personal'
    stdoutOutput = []
    outSpy = vi.spyOn(process.stdout, 'write').mockImplementation((chunk: unknown) => {
      stdoutOutput.push(String(chunk))
      return true
    })
    errSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true)
    fs.mkdirSync(path.join(tmpDir, 'capacities'), { recursive: true })
    fs.writeFileSync(
      path.join(tmpDir, 'capacities', 'config.toml'),
      'active_space = "personal"\n[spaces.personal]\nobjects_dir = "/tmp/objs"\n'
    )
    mockSpaceGet.mockResolvedValue({ id: SPACE_ID, title: 'Personal' })
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

  function stdout(): string {
    return stdoutOutput.join('')
  }

  it('registers an optional object id', async () => {
    const { registerOpen } = await import('../../../src/commands/open.ts')
    const program = new Command()
    registerOpen(program)
    expect(program.commands.find((c) => c.name() === 'open')?.registeredArguments[0]?.required).toBe(false)
  })

  it('uses the first field of one piped line', async () => {
    mockStdin('abc\tAlpha\n')
    const { runOpen } = await import('../../../src/commands/open.ts')
    await runOpen(undefined, { print: true })
    expect(stdout()).toBe(`https://app.capacities.io/${SPACE_ID}/abc\n`)
    expect(mockExecFileSync).not.toHaveBeenCalled()
  })

  it.each(['abc\ndef\n', '', ' \t\n\n'])('rejects invalid piped input %j', async (input) => {
    mockStdin(input)
    const { runOpen } = await import('../../../src/commands/open.ts')
    await expect(runOpen(undefined, { print: true })).rejects.toMatchObject({
      code: ExitCode.CONFIG,
      message: expect.stringMatching(/pick one/),
    })
    expect(mockExecFileSync).not.toHaveBeenCalled()
    expect(mockSpaceGet).not.toHaveBeenCalled()
    expect(stdout()).not.toContain('https://app.capacities.io')
  })

  it('does not read stdin when the argument is present', async () => {
    const stdinSpy = vi.spyOn(process, 'stdin', 'get')
    try {
      const { runOpen } = await import('../../../src/commands/open.ts')
      await runOpen('from-arg', { print: true })
      expect(stdout()).toBe(`https://app.capacities.io/${SPACE_ID}/from-arg\n`)
      expect(stdout()).not.toContain('/abc')
      expect(stdinSpy).not.toHaveBeenCalled()
    } finally {
      stdinSpy.mockRestore()
    }
  })

  it('rejects a missing id when stdin is a TTY', async () => {
    const previous = process.stdin.isTTY
    Object.defineProperty(process.stdin, 'isTTY', { value: true, configurable: true })
    try {
      const { runOpen } = await import('../../../src/commands/open.ts')
      const err = await runOpen(undefined, { print: true }).catch((e: unknown) => e)
      expect(err).toBeInstanceOf(CapacitiesError)
      expect((err as CapacitiesError).code).toBe(ExitCode.CONFIG)
      expect((err as Error).message).toMatch(/missing/)
      expect(mockExecFileSync).not.toHaveBeenCalled()
      expect(mockSpaceGet).not.toHaveBeenCalled()
      expect(stdout()).not.toContain('https://')
    } finally {
      Object.defineProperty(process.stdin, 'isTTY', { value: previous, configurable: true })
    }
  })

  it('reads one id from a non-TTY stdin when the argument is absent', async () => {
    const stream = Readable.from([Buffer.from('piped-id\tTitle\n')])
    Object.defineProperty(stream, 'isTTY', { value: false, configurable: true })
    const stdinSpy = vi.spyOn(process, 'stdin', 'get').mockReturnValue(stream as NodeJS.ReadStream)
    try {
      const { runOpen } = await import('../../../src/commands/open.ts')
      await runOpen(undefined, { print: true })
      expect(stdout()).toBe(`https://app.capacities.io/${SPACE_ID}/piped-id\n`)
      expect(mockExecFileSync).not.toHaveBeenCalled()
    } finally {
      stdinSpy.mockRestore()
    }
  })
})

function mockStdin(input: string): void {
  const stream = Readable.from([Buffer.from(input)])
  Object.defineProperty(stream, 'isTTY', { value: false, configurable: true })
  stdinSpy = vi.spyOn(process, 'stdin', 'get').mockReturnValue(stream as NodeJS.ReadStream)
}

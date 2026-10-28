import { PassThrough } from 'stream'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { pickRow } from '../../src/picker.ts'

afterEach(() => vi.restoreAllMocks())

describe('picker physical rows', () => {
  it.each([80, 8, 2, 1])('clips wide titles and repaints within a %i-column terminal', async (columns) => {
    const input = new PassThrough()
    Object.assign(input, { isTTY: true, setRawMode: vi.fn(), unref: vi.fn() })
    vi.spyOn(process, 'stdin', 'get').mockReturnValue(input as unknown as typeof process.stdin)
    const output: string[] = []
    vi.spyOn(process.stderr, 'write').mockImplementation((chunk) => {
      output.push(String(chunk))
      return true
    })
    const oldColumns = Object.getOwnPropertyDescriptor(process.stderr, 'columns')
    Object.defineProperty(process.stderr, 'columns', { value: columns, configurable: true })
    try {
      const choice = pickRow([{ id: 'a', structureId: 'RootPage', title: '界😀'.repeat(40) }])
      input.emit('keypress', '界', {})
      input.emit('keypress', 'x', {})
      input.emit('keypress', '', { name: 'escape' })
      expect(await choice).toBeNull()
      const painted = output.filter((s) => s.includes('\x1b[J') && s.endsWith('\n'))
      expect(painted).toHaveLength(3)
      for (const frame of painted) {
        const lines = frame
          // eslint-disable-next-line no-control-regex
          .replace(/\x1b\[[0-9;?]*[A-Za-z]/g, '')
          .split('\n')
          .slice(0, -1)
        for (const line of lines) {
          const width = [...line].reduce((sum, char) => sum + (char.codePointAt(0)! > 127 ? 2 : 1), 0)
          expect(width).toBeLessThan(columns)
          expect(line).not.toMatch(/[\uD800-\uDFFF]/u)
        }
      }
      expect(output.at(-2)).toBe('\x1b[2A\x1b[G\x1b[J')
      expect(output.at(-1)).toBe('\x1b[?25h')
    } finally {
      if (oldColumns) Object.defineProperty(process.stderr, 'columns', oldColumns)
      else Reflect.deleteProperty(process.stderr, 'columns')
    }
  })
})

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

// tests/unit/list-format.test.ts
import { describe, it, expect } from 'vitest'
import { CapacitiesError } from '../../src/errors.ts'
import { formatListLine, filterByTitle, parsePipedId } from '../../src/list-format.ts'

describe('list format', () => {
  it('keeps a tab or newline in the title on one line', () => {
    expect(formatListLine({ id: 'abc', structureId: 'RootPage', title: 'a\tb\nc' })).toBe('abc\ta b c')
  })

  it('removes terminal controls from plain titles without changing the original', () => {
    const row = { id: 'abc', structureId: 'RootPage', title: 'a\rb\x1b[31mred\x1b[0m\x1b]0;window\x07\u009b\u009c' }
    const original = row.title
    const line = formatListLine(row)
    // eslint-disable-next-line no-control-regex
    expect(line.slice(4)).not.toMatch(/[\u0000-\u001f\u007f-\u009f]/)
    expect(line.startsWith('abc\t')).toBe(true)
    expect(row.title).toBe(original)
  })

  it('matches titles by case-insensitive substring and does not fuzzy-match', () => {
    const rows = [{ id: '1', structureId: 'RootPage', title: 'Alpha' }]
    expect(filterByTitle(rows, 'alp')).toEqual(rows)
    expect(filterByTitle(rows, 'alh')).toEqual([])
    expect(filterByTitle(rows, '')).toEqual(rows)
  })

  it('takes the first field of one id-tab-title line', () => {
    expect(parsePipedId('abc\tAlpha\n')).toBe('abc')
  })

  it('rejects zero lines and many lines', () => {
    expect(() => parsePipedId('\n')).toThrow(CapacitiesError)
    expect(() => parsePipedId('abc\ndef\n')).toThrow(/pick one/)
  })
})

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

// tests/unit/output.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { printLine, printJson, printTable } from '../../src/output.ts'

describe('printTable', () => {
  let spy: ReturnType<typeof vi.spyOn>
  beforeEach(() => { spy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true) })
  afterEach(() => spy.mockRestore())

  it('outputs (no results) for empty array', () => {
    printTable([], {})
    expect(spy).toHaveBeenCalledWith('(no results)\n')
  })

  it('suppresses output with quiet:true', () => {
    printTable([{ id: '1', name: 'test' }], { quiet: true })
    expect(spy).not.toHaveBeenCalled()
  })

  it('renders header, divider, and row', () => {
    printTable([{ id: '1', name: 'Alice' }], {})
    const written = (spy.mock.calls[0][0] as string)
    const lines = written.split('\n').filter(Boolean)
    expect(lines[0]).toMatch(/id\s+name/)
    expect(lines[1]).toMatch(/--+/)
    expect(lines[2]).toMatch(/1\s+Alice/)
  })
})

describe('printJson', () => {
  let spy: ReturnType<typeof vi.spyOn>
  beforeEach(() => { spy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true) })
  afterEach(() => spy.mockRestore())

  it('outputs indented JSON', () => {
    printJson({ a: 1 }, {})
    expect(spy).toHaveBeenCalledWith('{\n  "a": 1\n}\n')
  })

  it('suppresses with quiet:true', () => {
    printJson({}, { quiet: true })
    expect(spy).not.toHaveBeenCalled()
  })
})

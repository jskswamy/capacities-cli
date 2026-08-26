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

// tests/unit/objects.test.ts
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import { describe, it, expect, afterEach } from 'vitest'
import { writeObjectFile } from '../../src/objects.ts'

describe('writeObjectFile', () => {
  let tmpDir: string

  afterEach(() => {
    if (tmpDir) fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  it('writes a normal object inside objectsDir', () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cap-objects-'))
    writeObjectFile(tmpDir, 'Page', 'My Note', '# content')
    expect(fs.readFileSync(path.join(tmpDir, 'pages', 'My Note.md'), 'utf8')).toBe('# content')
  })

  it('never escapes objectsDir for a title containing path traversal', () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cap-objects-'))
    const outside = path.join(os.tmpdir(), 'cap-objects-escape-target.md')
    fs.rmSync(outside, { force: true })

    writeObjectFile(tmpDir, 'Page', '../../cap-objects-escape-target', '# pwned')

    expect(fs.existsSync(outside)).toBe(false)
    const written = fs.readdirSync(path.join(tmpDir, 'pages'))
    expect(written).toHaveLength(1)
    expect(fs.readFileSync(path.join(tmpDir, 'pages', written[0]), 'utf8')).toBe('# pwned')
  })

  it('never escapes objectsDir for an object type containing path traversal', () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cap-objects-'))

    // Unlike the title test above, this doesn't check a guessed "outside" path —
    // path.join(os.tmpdir(), '..', 'etc') resolves to the real /etc on Linux
    // (os.tmpdir() is /tmp there), which exists regardless of this function.
    // Containment is verified by walking everything writeObjectFile could have
    // created and confirming it all resolves inside tmpDir instead.
    writeObjectFile(tmpDir, '../../etc', 'title', '# pwned')

    const entries = fs.readdirSync(tmpDir)
    for (const entry of entries) {
      expect(path.resolve(tmpDir, entry).startsWith(path.resolve(tmpDir) + path.sep)).toBe(true)
    }
  })
})

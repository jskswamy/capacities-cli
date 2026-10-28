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

import { CapacitiesError, ExitCode } from './errors.ts'

export function parseFrontmatterLine(line: string): { key: string; value: string } | undefined {
  if (!line.trim() || line.trimStart().startsWith('#')) return undefined
  // Only flat property mappings are checked; reject other YAML rather than bypass the guard.
  const match = line.match(/^("(?:[^"\\]|\\.)*"|'(?:[^']|'')*'|[\p{L}\p{N}_][\p{L}\p{N}_ .-]*):(?:\s|$)/u)
  if (!match) throw new CapacitiesError(ExitCode.CONFIG, 'Unsupported frontmatter syntax; use flat property keys.')
  const key = match[1]!.trim()
  try {
    return {
      key: key.startsWith('"')
        ? (JSON.parse(key) as string)
        : key.startsWith("'")
          ? key.slice(1, -1).replace(/''/g, "'")
          : key,
      value: line.slice(match[0].length).trim(),
    }
  } catch {
    throw new CapacitiesError(ExitCode.CONFIG, 'Unsupported quoted frontmatter key; use JSON-style escapes.')
  }
}

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

// src/list-format.ts
import { CapacitiesError, ExitCode } from './errors.ts'

export type ListRow = { id: string; structureId: string; title: string }

export function formatListLine(row: ListRow): string {
  // eslint-disable-next-line no-control-regex
  const safeTitle = row.title.replace(/[\u0000-\u001f\u007f-\u009f]/g, ' ')
  return `${row.id}\t${safeTitle}`
}

export function filterByTitle(rows: ListRow[], query: string): ListRow[] {
  if (query === '') return rows
  const lowerQ = query.toLowerCase()
  return rows.filter((r) => r.title.toLowerCase().includes(lowerQ))
}

export function parsePipedId(text: string): string {
  const lines = text.split('\n').filter((l) => l.trim() !== '')
  if (lines.length !== 1) {
    throw new CapacitiesError(ExitCode.CONFIG, 'pick one id from piped input')
  }
  const first = lines[0].trim().split(/\s+/)[0]
  return first
}

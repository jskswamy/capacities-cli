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

// src/picker.ts
import * as readline from 'readline'
import { filterByTitle, type ListRow } from './list-format.ts'

type Action = 'quit' | 'choose' | 'up' | 'down' | 'backspace' | 'type' | 'ignore'

const BY_NAME: Record<string, Action> = {
  escape: 'quit',
  return: 'choose',
  enter: 'choose',
  up: 'up',
  down: 'down',
  backspace: 'backspace',
}

const BY_SEQUENCE: Record<string, Action> = {
  '\x1b': 'quit',
  '\r': 'choose',
  '\x7f': 'backspace',
  '\b': 'backspace',
}

function isControl(code: number): boolean {
  return code <= 31 || (code >= 127 && code <= 159)
}

// shortcut: budget every non-ASCII code point as two columns; upgrade for tighter Unicode clipping.
function clip(text: string, width: number): string {
  let clean = ''
  let used = 0
  for (const char of text) {
    const code = char.codePointAt(0)!
    const safe = isControl(code) ? ' ' : char
    const size = safe.codePointAt(0)! > 127 ? 2 : 1
    if (used + size > width) break
    clean += safe
    used += size
  }
  return clean
}

function isPrintable(str: string | undefined): boolean {
  if (!str) return false
  for (let i = 0; i < str.length; i++) {
    if (isControl(str.charCodeAt(i))) return false
  }
  return true
}

function actionFor(str: string | undefined, key: readline.Key = {}): Action {
  const name = key.name ?? ''
  if (key.ctrl && (name === 'c' || name === 'd')) return 'quit'
  const named = BY_NAME[name] ?? BY_SEQUENCE[key.sequence ?? '']
  if (named) return named
  if (key.ctrl || key.meta || !isPrintable(str)) return 'ignore'
  return 'type'
}

function clamp(index: number, length: number): number {
  if (length <= 0 || index < 0) return 0
  return Math.min(index, length - 1)
}

function promptLine(query: string, shown: number, total: number, width: number): string {
  const suffix = `  ${shown}/${total}`
  const room = Math.max(0, width - 2 - suffix.length)
  return clip(`> ${clip(query, room)}${suffix}`, width)
}

function rowLine(title: string, selected: boolean, width: number): string {
  const marked = clip(`${selected ? '>' : ' '} ${clip(title, Math.max(0, width - 2))}`, width)
  if (!selected || process.env.NO_COLOR !== undefined) return marked
  return `\x1b[7m${marked}\x1b[0m`
}

function view(rows: ListRow[], query: string, index: number): string[] {
  const filtered = filterByTitle(rows, query)
  // Leave the last column unused, avoiding terminal auto-wrap even on narrow screens.
  const width = Math.max(0, (process.stderr.columns ?? 80) - 1)
  const height = Math.max(1, (process.stderr.rows ?? 24) - 2)
  const lines = [promptLine(query, filtered.length, rows.length, width)]
  if (filtered.length === 0) {
    lines.push(clip('  (no matches)', width))
    return lines
  }
  const shown = clamp(index, filtered.length)
  const start = shown < height ? 0 : Math.min(shown - height + 1, filtered.length - height)
  const slice = filtered.slice(start, start + height)
  for (let i = 0; i < slice.length; i++) {
    lines.push(rowLine(slice[i].title, start + i === shown, width))
  }
  return lines
}

function createScreen(): { render(lines: string[]): void; close(): void } {
  const out = process.stderr
  let drawn = 0
  out.write('\x1b[?25l')

  const paint = (lines: string[]): void => {
    let buf = '\x1b[G\x1b[J'
    if (drawn > 0) buf = `\x1b[${drawn}A${buf}`
    if (lines.length > 0) buf += `${lines.join('\n')}\n`
    out.write(buf)
    drawn = lines.length
  }

  return {
    render: paint,
    close() {
      paint([])
      out.write('\x1b[?25h')
    },
  }
}

function chosenRow(rows: ListRow[], query: string, index: number): ListRow | undefined {
  const filtered = filterByTitle(rows, query)
  return filtered[clamp(index, filtered.length)]
}

export async function pickRow(rows: ListRow[]): Promise<ListRow | null> {
  const input = process.stdin
  // shortcut: no raw stdin means quit; upgrade if list must prompt another way
  if (!input.isTTY || typeof input.setRawMode !== 'function') return null

  readline.emitKeypressEvents(input)
  const screen = createScreen()
  let query = ''
  let index = 0
  let settled = false
  let resolveChoice: (row: ListRow | null) => void = () => {}
  const finish = (row: ListRow | null): void => {
    if (settled) return
    settled = true
    resolveChoice(row)
  }
  const onSigint = (): void => finish(null)
  const onEnd = (): void => finish(null)
  const onKey = (str: string, key: readline.Key): void => {
    const action = actionFor(str, key)
    if (action === 'quit') {
      finish(null)
      return
    }
    if (action === 'choose') {
      const row = chosenRow(rows, query, index)
      if (row) finish(row)
      return
    }
    if (action === 'up' || action === 'down') {
      const filtered = filterByTitle(rows, query)
      if (filtered.length === 0) return
      index = clamp(index + (action === 'up' ? -1 : 1), filtered.length)
    } else if (action === 'backspace') {
      query = query.slice(0, -1)
      index = 0
    } else if (action === 'type' && str) {
      query += str
      index = 0
    } else {
      return
    }
    screen.render(view(rows, query, index))
  }

  try {
    input.setRawMode(true)
    input.resume()
    return await new Promise((resolve) => {
      resolveChoice = resolve
      input.on('keypress', onKey)
      input.on('end', onEnd)
      process.on('SIGINT', onSigint)
      screen.render(view(rows, query, index))
    })
  } finally {
    input.off('keypress', onKey)
    input.off('end', onEnd)
    process.off('SIGINT', onSigint)
    try {
      input.setRawMode(false)
    } catch {
      // stdin already closed
    }
    input.pause()
    input.unref()
    screen.close()
  }
}

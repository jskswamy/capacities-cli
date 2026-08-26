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

// src/output.ts
export type OutputOptions = { json?: boolean; quiet?: boolean }
export type CommandOptions = OutputOptions & { space?: string }

export function printLine(msg: string, opts: OutputOptions): void {
  if (opts.quiet) return
  process.stdout.write(msg + '\n')
}

export function printJson(data: unknown, opts: OutputOptions): void {
  if (opts.quiet) return
  process.stdout.write(JSON.stringify(data, null, 2) + '\n')
}

export function printTable(rows: Record<string, string>[], opts: OutputOptions): void {
  if (opts.quiet) return
  if (rows.length === 0) {
    process.stdout.write('(no results)\n')
    return
  }
  const keys = Object.keys(rows[0])
  const widths = keys.map((k) => Math.max(k.length, ...rows.map((r) => String(r[k] ?? '').length)))
  const fmt = (vals: string[]) => vals.map((v, i) => v.padEnd(widths[i])).join('  ')
  const lines = [
    fmt(keys),
    widths.map((w) => '-'.repeat(w)).join('  '),
    ...rows.map((r) => fmt(keys.map((k) => String(r[k] ?? '')))),
  ]
  process.stdout.write(lines.join('\n') + '\n')
}

export async function readStdin(): Promise<string> {
  const chunks: Buffer[] = []
  for await (const chunk of process.stdin) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
  }
  return Buffer.concat(chunks).toString('utf8')
}

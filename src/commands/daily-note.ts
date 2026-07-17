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

// src/commands/daily-note.ts
import { Command } from 'commander'
import { resolveSpace } from './_space.ts'
import { createClient } from '../client.ts'
import { handleApiError } from '../errors.ts'
import { readStdin, type CommandOptions } from '../output.ts'

export async function runDailyNote(
  markdownArg: string,
  opts: CommandOptions & { date?: string; timestamp: boolean }
): Promise<void> {
  const space = await resolveSpace(opts.space)
  const client = createClient(space)

  const markdown = markdownArg === '-' ? await readStdin() : markdownArg

  const body: Record<string, unknown> = { markdown }
  if (opts.date) body.date = opts.date
  if (!opts.timestamp) body.noTimeStamp = true

  await (client.blocks as any).dailyNote.append(body)
}

export function registerDailyNote(program: Command): void {
  program
    .command('daily-note')
    .description('Append markdown to the daily note')
    .argument('<markdown>', 'markdown content, or "-" to read from stdin')
    .option('--date <YYYY-MM-DD>', "append to a specific date's note")
    .option('--no-timestamp', 'suppress automatic timestamp')
    .action(async (markdownArg: string, cmdOpts: { date?: string; timestamp: boolean }) => {
      const globalOpts = program.opts()
      await runDailyNote(markdownArg, { ...globalOpts, ...cmdOpts }).catch(handleApiError)
    })
}

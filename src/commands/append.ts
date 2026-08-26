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

// src/commands/append.ts
import * as fs from 'fs'
import { Command } from 'commander'
import { resolveSpace } from './_space.ts'
import { createClient } from '../client.ts'
import { cacheBust } from '../cache.ts'
import { handleApiError, CapacitiesError, ExitCode } from '../errors.ts'
import { printLine, readStdin, type CommandOptions } from '../output.ts'

export async function runAppend(
  objectId: string,
  contentArg: string | undefined,
  opts: CommandOptions & { markdown?: string; position?: 'end' | 'start' }
): Promise<void> {
  const space = await resolveSpace(opts.space)
  const client = createClient(space)

  let markdown: string
  if (opts.markdown) {
    markdown = opts.markdown === '-' ? await readStdin() : fs.readFileSync(opts.markdown, 'utf8')
  } else if (contentArg) {
    markdown = contentArg === '-' ? await readStdin() : contentArg
  } else {
    throw new CapacitiesError(ExitCode.CONFIG, 'Provide content as an argument or via --markdown <file>')
  }

  const position = opts.position ?? 'end'
  await (client.blocks as any).append({ id: objectId, markdown, position: { type: position } })

  cacheBust(space.name, `object/${objectId}.json`)

  printLine(`Appended content to ${objectId}`, opts)
}

export function registerAppend(program: Command): void {
  program
    .command('append <objectId> [content]')
    .summary('Append markdown content to the body of an existing object')
    .description(
      'Append markdown content to the body of an existing object.\n\n' +
        'Converts markdown to blocks and inserts them at the specified position\n' +
        '(default: end of body). Use this to add sections, notes, or structured\n' +
        'content to an existing object without affecting its properties.\n\n' +
        'Content sources (pick one):\n\n' +
        '  cap append <objectId> "## New Section\\nContent here"\n' +
        '    Pass content inline as the second argument.\n\n' +
        '  cap append <objectId> --markdown <file>\n' +
        '    Read content from a file. Use "-" to read from stdin.\n\n' +
        '  cat notes.md | cap append <objectId> --markdown -\n' +
        '    Pipe content via stdin.\n\n' +
        'NOTE: This appends — it does not replace existing body content.\n' +
        'To replace the body instead, use `cap update <objectId> --body <file>`.\n' +
        'To update frontmatter properties (title, ring, quadrant, etc.),\n' +
        'use `cap update <objectId> --props <file>` or\n' +
        '`cap update <objectId> <propertyKey> <value>`.'
    )
    .option(
      '--markdown <path>',
      'read content from file (or "-" for stdin); takes precedence over inline content argument'
    )
    .option('--position <pos>', 'insert position: end (default) or start', 'end')
    .action(
      async (
        objectId: string,
        contentArg: string | undefined,
        cmdOpts: { markdown?: string; position?: 'end' | 'start' }
      ) => {
        const opts = { ...program.opts(), ...cmdOpts }
        await runAppend(objectId, contentArg, opts).catch(handleApiError)
      }
    )
}

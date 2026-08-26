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

// src/commands/save.ts
import * as fs from 'fs'
import { Command } from 'commander'
import { resolveSpace } from './_space.ts'
import { createClient, uploadMedia } from '../client.ts'
import { handleApiError, CapacitiesError, ExitCode } from '../errors.ts'
import { printLine, type CommandOptions } from '../output.ts'

export async function runSaveUrl(
  url: string,
  opts: CommandOptions & { title?: string; desc?: string; markdown?: string }
): Promise<void> {
  const space = await resolveSpace(opts.space)
  const client = createClient(space)
  const result = await client.object.createFromUrl({
    url,
    ...(opts.markdown && { markdown: opts.markdown }),
    ...((opts.title || opts.desc) && {
      properties: {
        ...(opts.title && { title: { type: 'title' as const, title: { value: opts.title } } }),
        ...(opts.desc && { description: { type: 'text' as const, text: { value: opts.desc } } }),
      },
    }),
  })
  printLine(result.id, opts)
}

export async function runSaveFile(
  filePath: string,
  opts: CommandOptions & { title?: string; collections?: string }
): Promise<void> {
  if (!fs.existsSync(filePath)) {
    throw new CapacitiesError(ExitCode.CONFIG, `File not found: ${filePath}`)
  }
  const space = await resolveSpace(opts.space)
  const collections = opts.collections
    ?.split(',')
    .map((s) => s.trim())
    .filter(Boolean)
  const id = await uploadMedia(space, filePath, { title: opts.title, collections })
  printLine(id, opts)
}

export function registerSave(program: Command): void {
  const save = program.command('save').description('Save a URL or local file to Capacities')

  save
    .command('url <url>')
    .description('Save a URL as a weblink or media object (type auto-detected by Capacities)')
    .option('--title <title>', 'override the object title')
    .option('-d, --desc <description>', 'set description')
    .option('--markdown <notes>', 'inline markdown notes attached to the object')
    .action(async (url: string, cmdOpts: { title?: string; desc?: string; markdown?: string }) => {
      await runSaveUrl(url, { ...program.opts(), ...cmdOpts }).catch(handleApiError)
    })

  save
    .command('file <path>')
    .description('Upload a local file as a media object (type inferred from extension)')
    .option('--title <title>', 'object title (defaults to filename)')
    .option('--collections <ids>', 'comma-separated collection UUIDs')
    .action(async (filePath: string, cmdOpts: { title?: string; collections?: string }) => {
      await runSaveFile(filePath, { ...program.opts(), ...cmdOpts }).catch(handleApiError)
    })
}

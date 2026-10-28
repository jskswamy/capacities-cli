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

// src/commands/get.ts
import { Command } from 'commander'
import { fetchWithCache, TTL } from '../cache.ts'
import { createClient } from '../client.ts'
import { CapacitiesError, ExitCode, handleApiError } from '../errors.ts'
import { parsePipedId } from '../list-format.ts'
import { printLine, printJson, readStdin, type CommandOptions } from '../output.ts'
import { resolveSpace } from './_space.ts'

async function resolveObjectId(objectId: string | undefined): Promise<string> {
  if (objectId !== undefined) return objectId
  if (process.stdin.isTTY) {
    throw new CapacitiesError(ExitCode.CONFIG, 'object id is missing')
  }
  return parsePipedId(await readStdin())
}

export async function runGet(objectId: string | undefined, opts: CommandOptions): Promise<void> {
  const id = await resolveObjectId(objectId)
  const space = await resolveSpace(opts.space)
  const result = await fetchWithCache(space.name, `object/${id}.json`, TTL.OBJECT, () => {
    const client = createClient(space)
    return client.object.markdown.get({ id })
  })
  // SDK returns { id, structureId, markdown } — unit tests may mock a plain string
  const markdown =
    typeof result === 'string' ? result : ((result as { markdown?: string }).markdown ?? JSON.stringify(result))
  if (opts.json) {
    printJson({ objectId: id, markdown }, opts)
    return
  }
  printLine(markdown, opts)
}

export function registerGet(program: Command): void {
  program
    .command('get [objectId]')
    .description('Get object content as markdown. Omit the id to read one piped list line.')
    .action(async (objectId: string | undefined) => {
      await runGet(objectId, program.opts()).catch(handleApiError)
    })
}

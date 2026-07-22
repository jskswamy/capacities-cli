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

// src/commands/update.ts
import * as fs from 'fs'
import { Command } from 'commander'
import { resolveSpace } from './_space.ts'
import { createClient, patchMarkdown } from '../client.ts'
import { cacheBust } from '../cache.ts'
import { fetchAndPersist } from '../objects.ts'
import { fetchStructures } from './search.ts'
import { resolvePropertyDef, buildPropertyPayload } from '../properties.ts'
import { handleApiError, formatError, CapacitiesError, ExitCode } from '../errors.ts'
import { printLine, readStdin, type CommandOptions } from '../output.ts'
import { logger } from '../logger.ts'

export async function runUpdate(
  objectId: string,
  propertyKey: string | undefined,
  value: string | undefined,
  opts: CommandOptions & { markdown?: string }
): Promise<void> {
  const space = await resolveSpace(opts.space)
  const client = createClient(space)

  if (opts.markdown) {
    const markdown = opts.markdown === '-' ? await readStdin() : fs.readFileSync(opts.markdown, 'utf8')
    await patchMarkdown(space, objectId, markdown)
  } else {
    if (!propertyKey || value === undefined) {
      throw new CapacitiesError(ExitCode.CONFIG, 'Either --markdown or <propertyKey> <value> is required')
    }
    const structures = await fetchStructures(space)
    const def = resolvePropertyDef(structures, propertyKey)
    if (def.type === 'entity') {
      throw new CapacitiesError(ExitCode.CONFIG, `"${propertyKey}" is an entity field — use \`cap link\` <id> ${propertyKey} <target-ids>`)
    }
    await client.object.update({
      id: objectId,
      properties: { [def.id]: buildPropertyPayload(def, [value]) },
    } as any)
  }

  cacheBust(space.name, `object/${objectId}.json`)

  if (space.objectsDir) {
    try {
      await fetchAndPersist(client, space.objectsDir, objectId)
    } catch (e) {
      logger.warn(`objectsDir rewrite failed: ${formatError(e)}`)
    }
  }

  printLine(`Updated ${opts.markdown ? 'markdown' : propertyKey} on ${objectId}`, opts)
}

export function registerUpdate(program: Command): void {
  program
    .command('update <objectId> [propertyKey] [value]')
    .description('Update a scalar property or full markdown on an object')
    .option('--markdown <path>', 'read full frontmatter+body from file path, or "-" for stdin')
    .action(async (objectId: string, propertyKey: string | undefined, value: string | undefined, cmdOpts: { markdown?: string }) => {
      const opts = { ...program.opts(), ...cmdOpts }
      await runUpdate(objectId, propertyKey, value, opts).catch(handleApiError)
    })
}

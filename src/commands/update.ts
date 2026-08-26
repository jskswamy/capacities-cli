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
import { createClient, patchMarkdown, replaceBody } from '../client.ts'
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
  opts: CommandOptions & { props?: string; body?: string }
): Promise<void> {
  const space = await resolveSpace(opts.space)
  const client = createClient(space)

  if (opts.body) {
    const markdown = opts.body === '-' ? await readStdin() : fs.readFileSync(opts.body, 'utf8')
    await replaceBody(client, objectId, markdown)
  } else if (opts.props) {
    const markdown = opts.props === '-' ? await readStdin() : fs.readFileSync(opts.props, 'utf8')
    await patchMarkdown(space, objectId, markdown)
  } else {
    if (!propertyKey || value === undefined) {
      throw new CapacitiesError(ExitCode.CONFIG, 'Either --body, --props, or <propertyKey> <value> is required')
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

  const mode = opts.body ? 'body' : opts.props ? 'properties' : propertyKey
  printLine(`Updated ${mode} on ${objectId}`, opts)
}

export function registerUpdate(program: Command): void {
  program
    .command('update <objectId> [propertyKey] [value]')
    .summary('Update a scalar property, frontmatter properties, or the body of an object')
    .description(
      'Update a scalar property, frontmatter properties, or the body of an object.\n\n' +
      'Three modes:\n\n' +
      '  cap update <objectId> <propertyKey> <value>\n' +
      '    Update a single named property (e.g. description, ring, quadrant).\n' +
      '    Resolves property names and label values from the space structures.\n' +
      '    Use `cap types` to list available types and their property names.\n\n' +
      '  cap update <objectId> --props <file>\n' +
      '    Read YAML frontmatter from <file> and apply each key as a property\n' +
      '    update via PATCH /object/markdown. Only frontmatter keys are applied;\n' +
      '    body content after the closing --- is ignored by the API.\n' +
      '    Pass "-" to read from stdin.\n\n' +
      '  cap update <objectId> --body <file>\n' +
      '    Replace the object body with <file>. The API has no replace endpoint,\n' +
      '    so this appends the new content first and only then deletes the old\n' +
      '    blocks — a failure partway through leaves duplicate content, never\n' +
      '    lost content, and the error lists which old blocks still need removing.\n' +
      '    Pass "-" to read from stdin.\n\n' +
      'To append content without replacing, use `cap append <objectId>` instead.'
    )
    .option(
      '--props <path>',
      'read YAML frontmatter from file (or "-" for stdin) and apply as property updates; body content is ignored by the API'
    )
    .option(
      '--body <path>',
      'replace body content from file (or "-" for stdin); appends new content then removes old blocks (not atomic — see description)'
    )
    .action(async (objectId: string, propertyKey: string | undefined, value: string | undefined, cmdOpts: { props?: string; body?: string }) => {
      const opts = { ...program.opts(), ...cmdOpts }
      await runUpdate(objectId, propertyKey, value, opts).catch(handleApiError)
    })
}

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
import { cacheBust, cacheGet, TTL } from '../cache.ts'
import { createClient, replaceBody } from '../client.ts'
import { handleApiError, formatError, CapacitiesError, ExitCode } from '../errors.ts'
import { parseFrontmatterLine } from '../frontmatter.ts'
import { logger } from '../logger.ts'
import { fetchAndPersist } from '../objects.ts'
import { printLine, readStdin, type CommandOptions } from '../output.ts'
import { assertPatchable, buildPropertyPayload, resolvePropertyDef } from '../properties.ts'
import { resolveSpace } from './_space.ts'
import { fetchStructures } from './search.ts'

type ObjectReader = { object: { get(params: { id: string }): Promise<{ structureId?: string }> } }

function cachedStructureId(spaceName: string, objectId: string): string | undefined {
  const cached = cacheGet<unknown>(spaceName, `object/${objectId}.json`, TTL.OBJECT)
  if (!cached || typeof cached !== 'object' || !('structureId' in cached)) return undefined
  const structureId = (cached as { structureId?: unknown }).structureId
  return typeof structureId === 'string' && structureId ? structureId : undefined
}

async function resolveStructureId(spaceName: string, client: ObjectReader, objectId: string): Promise<string> {
  const cached = cachedStructureId(spaceName, objectId)
  if (cached) return cached
  const got = await client.object.get({ id: objectId })
  if (!got?.structureId) {
    throw new CapacitiesError(ExitCode.NOT_FOUND, `Object ${objectId} has no structure id`)
  }
  return got.structureId
}

function frontmatterKeys(raw: string): string[] {
  const lines = raw.split('\n')
  if (lines[0]?.trim() !== '---') return []
  const keys: string[] = []
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i]!
    if (line.trim() === '---') return keys
    const field = parseFrontmatterLine(line)
    if (field) keys.push(field.key)
  }
  throw new CapacitiesError(ExitCode.CONFIG, 'Unterminated frontmatter; expected closing --- delimiter.')
}

type PatchDef = { id: string; name: string; writable?: boolean }

function defForField(defs: PatchDef[], key: string): PatchDef | undefined {
  const byId = defs.find((d) => d.id === key)
  if (byId) return byId
  const lower = key.toLowerCase()
  return defs.find((d) => d.name.toLowerCase() === lower)
}

function assertPropsPatchable(
  structureId: string,
  structures: { structures: { id?: string; propertyDefinitions?: PatchDef[] }[] },
  markdown: string
): void {
  const defs = structures.structures.find((s) => s.id === structureId)?.propertyDefinitions ?? []
  for (const key of frontmatterKeys(markdown)) {
    const def = defForField(defs, key)
    if (!def) continue
    assertPatchable(structureId, def.id, key, def.writable)
  }
}

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
    const structureId = await resolveStructureId(space.name, client, objectId)
    assertPropsPatchable(structureId, await fetchStructures(space), markdown)
    await client.object.markdown.update({ id: objectId, markdown })
  } else {
    if (!propertyKey || value === undefined) {
      throw new CapacitiesError(ExitCode.CONFIG, 'Either --body, --props, or <propertyKey> <value> is required')
    }
    const structures = await fetchStructures(space)
    const def = resolvePropertyDef(structures, propertyKey)
    if (def.type === 'entity') {
      throw new CapacitiesError(
        ExitCode.CONFIG,
        `"${propertyKey}" is an entity field — use \`cap link\` <id> ${propertyKey} <target-ids>`
      )
    }
    const structureId = await resolveStructureId(space.name, client, objectId)
    assertPatchable(structureId, def.id, def.name || propertyKey, def.writable)
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
    .action(
      async (
        objectId: string,
        propertyKey: string | undefined,
        value: string | undefined,
        cmdOpts: { props?: string; body?: string }
      ) => {
        const opts = { ...program.opts(), ...cmdOpts }
        await runUpdate(objectId, propertyKey, value, opts).catch(handleApiError)
      }
    )
}

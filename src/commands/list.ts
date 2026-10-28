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

// src/commands/list.ts
import { Command } from 'commander'
import { fetchWithCache, TTL } from '../cache.ts'
import { createClient } from '../client.ts'
import { CapacitiesError, ExitCode, ExitError, handleApiError } from '../errors.ts'
import { formatListLine, type ListRow } from '../list-format.ts'
import { printJson, type CommandOptions } from '../output.ts'
import { pickRow } from '../picker.ts'
import { resolveSpace } from './_space.ts'
import { fetchStructures } from './search.ts'
import type { ResolvedSpace } from '../config.ts'

export type ListPage = { results: ListRow[]; nextCursor: string | null; hasMore: boolean }

export type ListClient = {
  objects: {
    structure(params: { structureId: string; cursor?: string }): Promise<ListPage>
    tag(params: { tagId: string; cursor?: string }): Promise<ListPage>
    collection(params: { collectionId: string; cursor?: string }): Promise<ListPage>
  }
}

type ListKind = 'type' | 'tag' | 'collection'
type ListOpts = CommandOptions & { type?: string; tag?: string; collection?: string }

// Enum values on ListObjectsByStructureParams.structureId (SDK 1.1.3). Not UUIDs.
const BUILTIN_STRUCTURE_IDS = new Set([
  'MediaAudio',
  'MediaFile',
  'MediaImage',
  'MediaPDF',
  'MediaTweet',
  'MediaVideo',
  'MediaWebResource',
  'RootAIChat',
  'RootBlocksTemplate',
  'RootDailyNote',
  'RootDatabase',
  'RootEntity',
  'RootPage',
  'RootQuery',
  'RootSimpleTable',
  'RootSpace',
  'RootStructure',
  'RootTag',
  'RootTask',
  'User',
  'UserPersonal',
  'UtilDate',
])

function withCursor<T extends Record<string, string>>(base: T, cursor?: string): T & { cursor?: string } {
  return cursor ? { ...base, cursor } : base
}

async function fetchPage(client: ListClient, kind: ListKind, id: string, cursor?: string): Promise<ListPage> {
  if (kind === 'tag') return client.objects.tag(withCursor({ tagId: id }, cursor))
  if (kind === 'collection') return client.objects.collection(withCursor({ collectionId: id }, cursor))
  return client.objects.structure(withCursor({ structureId: id }, cursor))
}

export async function walkList(client: ListClient, kind: ListKind, id: string): Promise<ListRow[]> {
  const rows: ListRow[] = []
  const cursors = new Set<string>()
  let cursor: string | undefined
  for (;;) {
    const page = await fetchPage(client, kind, id, cursor)
    rows.push(...page.results)
    if (!page.hasMore) return rows
    if (!page.nextCursor || cursors.has(page.nextCursor)) {
      throw new CapacitiesError(
        ExitCode.API,
        'Invalid list pagination cursor (missing or repeated). Retry the list command.'
      )
    }
    cursors.add(page.nextCursor)
    cursor = page.nextCursor
  }
}

function requireSelector(opts: ListOpts): { kind: ListKind; rawId: string } {
  const selected = [
    opts.type ? { kind: 'type' as const, rawId: opts.type } : undefined,
    opts.tag ? { kind: 'tag' as const, rawId: opts.tag } : undefined,
    opts.collection ? { kind: 'collection' as const, rawId: opts.collection } : undefined,
  ].filter((item): item is { kind: ListKind; rawId: string } => item !== undefined)
  if (selected.length !== 1) {
    throw new CapacitiesError(ExitCode.CONFIG, 'Specify exactly one of --type, --tag, or --collection')
  }
  return selected[0]
}

async function resolveTypeId(space: ResolvedSpace, name: string): Promise<string> {
  const { structures } = await fetchStructures(space)
  const byTitle = structures.find((s) => s.title === name)
  if (byTitle) return byTitle.id
  const byId = structures.find((s) => s.id === name)
  if (byId) return byId.id
  if (BUILTIN_STRUCTURE_IDS.has(name)) return name
  throw new CapacitiesError(ExitCode.NOT_FOUND, `Unknown type "${name}". Check: capacities types`)
}

function asListClient(space: ResolvedSpace): ListClient {
  const client = createClient(space)
  return {
    objects: {
      structure: (params) => client.objects.structure(params),
      tag: (params) => client.objects.tag(params),
      collection: (params) => client.objects.collection(params),
    },
  }
}

async function writeList(rows: ListRow[], opts: ListOpts): Promise<void> {
  if (opts.quiet) return
  if (opts.json) {
    printJson({ results: rows }, opts)
    return
  }
  if (!process.stdout.isTTY) {
    for (const row of rows) process.stdout.write(formatListLine(row) + '\n')
    return
  }
  const row = await pickRow(rows)
  if (row === null) throw new ExitError(1)
  process.stdout.write(row.id + '\n')
}

export async function runList(opts: ListOpts): Promise<void> {
  const { kind, rawId } = requireSelector(opts)
  const space = await resolveSpace(opts.space)
  const id = kind === 'type' ? await resolveTypeId(space, rawId) : rawId
  const rows = await fetchWithCache<ListRow[]>(space.name, `list/${kind}/${id}.json`, TTL.SEARCH, () =>
    walkList(asListClient(space), kind, id)
  )
  if (rows.length === 0) throw new CapacitiesError(ExitCode.NOT_FOUND, '(no results)')
  await writeList(rows, opts)
}

export function registerList(program: Command): void {
  program
    .command('list')
    .description('List objects by type, tag, or collection')
    .option('-t, --type <type>', 'object type title, structure id, or built-in id')
    .option('--tag <id>', 'tag id')
    .option('--collection <id>', 'collection id')
    .action(async (cmdOpts: { type?: string; tag?: string; collection?: string }) => {
      const globalOpts = program.opts() as CommandOptions
      await runList({ ...globalOpts, ...cmdOpts }).catch(handleApiError)
    })
}

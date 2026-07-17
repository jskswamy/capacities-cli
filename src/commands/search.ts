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

// src/commands/search.ts
import { Command } from 'commander'
import { type ResolvedSpace } from '../config.ts'
import { resolveSpace } from './_space.ts'
import { createClient } from '../client.ts'
import { fetchWithCache, queryHash, TTL } from '../cache.ts'
import { handleApiError, CapacitiesError, ExitCode } from '../errors.ts'
import { printTable, printJson, type CommandOptions } from '../output.ts'

type StructureItem = { id: string; title: string }
type StructuresResp = { structures: StructureItem[] }
type SearchItem = { id: string; structureId?: string; title?: string }
type SearchResp = { results?: SearchItem[] }

export async function fetchStructures(space: ResolvedSpace): Promise<StructuresResp> {
  return fetchWithCache<StructuresResp>(space.name, 'structures.json', TTL.STRUCTURES, () => {
    const client = createClient(space)
    return client.space.structures() as Promise<StructuresResp>
  })
}

async function resolveStructureId(space: ResolvedSpace, typeName: string): Promise<string | undefined> {
  const resp = await fetchStructures(space)
  const found = resp.structures.find(s => s.title === typeName)
  if (!found) throw new CapacitiesError(ExitCode.NOT_FOUND, `Unknown type "${typeName}". Check: capacities search --type help`)
  return found.id
}

function formatType(structureId: string, lookup: Map<string, string>): string {
  if (lookup.has(structureId)) return lookup.get(structureId)!
  // Built-in types: strip Root/Media/Util prefix
  for (const prefix of ['Root', 'Media', 'Util', 'User']) {
    if (structureId.startsWith(prefix)) return structureId.slice(prefix.length)
  }
  return structureId
}

export async function runSearch(query: string, typeName: string | undefined, opts: CommandOptions): Promise<void> {
  const space = await resolveSpace(opts.space)
  const structureId = typeName ? await resolveStructureId(space, typeName) : undefined
  const cacheKey = `search/${queryHash(query, typeName)}.json`
  const data = await fetchWithCache<SearchResp>(space.name, cacheKey, TTL.SEARCH, () => {
    const client = createClient(space)
    return client.objects.search({ query, ...(structureId ? { structureIds: [structureId] } : {}) }) as Promise<SearchResp>
  })

  if (opts.json) { printJson(data, opts); return }

  // Build a structureId → title lookup from cached structures (no extra API call if already cached)
  const structures = await fetchStructures(space)
  const lookup = new Map(structures.structures.map(s => [s.id, s.title]))

  const rows = (data.results ?? []).map(r => ({
    id: r.id ?? '',
    type: r.structureId ? formatType(r.structureId, lookup) : '',
    title: r.title ?? '',
  }))
  printTable(rows, opts)
}

export function registerSearch(program: Command): void {
  program
    .command('search [query]')
    .description('Search objects')
    .option('-t, --type <type>', 'filter by object type')
    .action(async (query: string = '*', cmdOpts: { type?: string }) => {
      const globalOpts = program.opts()
      await runSearch(query, cmdOpts.type, globalOpts).catch(handleApiError)
    })
}

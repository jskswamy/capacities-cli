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

type StructureItem = { id: string; title: string; objectTypeId?: string; objectType?: string }
type StructuresResp = { structures: StructureItem[] }
type SearchItem = { id?: string; title?: string; objectTypeId?: string; objectType?: string; objectTypeTitle?: string; snippet?: string }
type SearchResp = { results?: SearchItem[] }

async function resolveStructureId(space: ResolvedSpace, typeName: string): Promise<string | undefined> {
  if (!typeName) return undefined
  const resp = await fetchWithCache<StructuresResp>(space.name, 'structures.json', TTL.STRUCTURES, () => {
    const client = createClient(space)
    return client.space.structures() as Promise<StructuresResp>
  })
  const found = resp.structures.find(s => s.title === typeName || s.objectType === typeName)
  if (!found) throw new CapacitiesError(ExitCode.NOT_FOUND, `Unknown type "${typeName}". Check: capacities search --type help`)
  return found.objectTypeId ?? found.id
}

export async function runSearch(query: string, typeName: string | undefined, opts: CommandOptions): Promise<void> {
  const space = await resolveSpace(opts.space)
  const structureId = typeName ? await resolveStructureId(space, typeName) : undefined
  const cacheKey = `search/${queryHash(query, typeName)}.json`
  const data = await fetchWithCache<SearchResp>(space.name, cacheKey, TTL.SEARCH, () => {
    const client = createClient(space)
    return client.objects.search({ query, ...(structureId ? { structureId } : {}) }) as Promise<SearchResp>
  })

  if (opts.json) { printJson(data, opts); return }

  const rows = (data.results ?? []).map(r => ({
    id: r.id ?? '',
    type: r.objectTypeTitle ?? r.objectType ?? '',
    title: r.title ?? '',
    snippet: (r.snippet ?? '').slice(0, 60),
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

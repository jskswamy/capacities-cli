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
import { readConfig, getActiveSpaceName, getSpaceFile, type ResolvedSpace } from '../config.ts'
import { decryptSecrets } from '../secrets.ts'
import { createClient } from '../client.ts'
import { cacheGet, cacheSet, queryHash, TTL } from '../cache.ts'
import { handleApiError, CapacitiesError, ExitCode } from '../errors.ts'
import { printTable, printJson, type OutputOptions } from '../output.ts'

async function resolveSpace(flagSpace?: string): Promise<ResolvedSpace> {
  const name = getActiveSpaceName(flagSpace)
  const config = readConfig()
  const spaceConfig = config.spaces?.[name] ?? {}
  const token = process.env.CAPACITIES_TOKEN
  if (token) {
    return { name, objectsDir: spaceConfig.objects_dir ?? '', authType: 'api_token', apiToken: token }
  }
  const secrets = await decryptSecrets(getSpaceFile(name))
  return {
    name,
    objectsDir: spaceConfig.objects_dir ?? '',
    authType: secrets.auth_type,
    apiToken: secrets.api_token,
    clientId: secrets.client_id,
    accessToken: secrets.access_token,
    refreshToken: secrets.refresh_token,
    expiresAt: secrets.expires_at,
  }
}

async function resolveStructureId(space: ResolvedSpace, typeName: string): Promise<string | undefined> {
  if (!typeName) return undefined
  const cacheKey = 'structures.json'
  // ponytail: cache stores the full SDK response object, extract .structures for lookup
  const cached = cacheGet<{ structures: Array<{ id: string; title: string }> }>(space.name, cacheKey, TTL.STRUCTURES)
  const list: Array<{ id: string; title: string }> = cached
    ? cached.structures
    : await (async () => {
        const client = createClient(space)
        const resp = await client.space.structures()
        cacheSet(space.name, cacheKey, resp)
        return resp.structures
      })()
  const found = list.find((s) => s.title === typeName || (s as Record<string, unknown>)['objectType'] === typeName)
  if (!found) throw new CapacitiesError(ExitCode.NOT_FOUND, `Unknown type "${typeName}". Check: capacities search --type help`)
  return (found as Record<string, unknown>)['objectTypeId'] as string ?? found.id
}

export async function runSearch(query: string, typeName: string | undefined, opts: OutputOptions & { space?: string }): Promise<void> {
  const space = await resolveSpace(opts.space)
  const structureId = typeName ? await resolveStructureId(space, typeName) : undefined
  const cacheKey = `search/${queryHash(query, typeName)}.json`
  const cached = cacheGet<any>(space.name, cacheKey, TTL.SEARCH)

  const data = cached ?? await (async () => {
    const client = createClient(space)
    const result = await client.objects.search({ query, ...(structureId ? { structureId } : {}) })
    cacheSet(space.name, cacheKey, result)
    return result
  })()

  if (opts.json) { printJson(data, opts); return }

  const rows = (data.results ?? []).map((r: any) => ({
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

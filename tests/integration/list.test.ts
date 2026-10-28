import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import OpenAPIBackend from 'openapi-backend'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { server, runCLI, http, HttpResponse } from './helpers.ts'

const spec = JSON.parse(fs.readFileSync(new URL('../fixtures/openapi.json', import.meta.url), 'utf8'))
// Validate these routes strictly without the fixture's unrelated pre-existing block schema errors.
const api = new OpenAPIBackend({
  strict: true,
  customizeAjv: (ajv) => {
    ajv.addFormat('uuid', /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i)
    return ajv
  },
  definition: {
    openapi: spec.openapi,
    info: spec.info,
    paths: Object.fromEntries(
      ['structure', 'tag', 'collection'].map((kind) => [`/objects/${kind}`, spec.paths[`/objects/${kind}`]])
    ),
    components: { parameters: spec.components.parameters, responses: spec.components.responses },
  },
})

const ID = '5cd11f44-88f9-448b-9875-af8ff1a5b2b9'
const CURSOR = '7d2e7f8a-4c3b-4e1d-9f0a-123456789abc'
const ROWS = [
  { id: ID, structureId: 'RootPage', title: 'Alpha\r\x1b[31m\u009b' },
  { id: CURSOR, structureId: 'RootPage', title: '界 Beta\nsecond line' },
]
let tmpDir: string

beforeAll(async () => {
  await api.init()
  server.listen({ onUnhandledRequest: 'error' })
})
beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cap-list-integration-'))
})
afterEach(() => {
  server.resetHandlers()
  fs.rmSync(tmpDir, { recursive: true, force: true })
})
afterAll(() => server.close())

describe('list through the real SDK (offline)', () => {
  it.each(['type', 'tag', 'collection'])('walks two %s pages then serves cached JSON and pipe lines', async (kind) => {
    const route = `/objects/${kind === 'type' ? 'structure' : kind}`
    const selector = kind === 'type' ? 'RootPage' : ID
    const requests: URL[] = []
    server.use(
      http.get('https://api.capacities.io/space/structures', () => HttpResponse.json({ structures: [] })),
      http.get(`https://api.capacities.io${route}`, ({ request }) => {
        const url = new URL(request.url)
        requests.push(url)
        return HttpResponse.json(
          url.searchParams.has('cursor')
            ? { results: [ROWS[1]], nextCursor: null, hasMore: false }
            : { results: [ROWS[0]], nextCursor: CURSOR, hasMore: true }
        )
      })
    )
    const env = {
      CAPACITIES_TOKEN: 'cap-api-test',
      CAPACITIES_SPACE: 'personal',
      CAPACITIES_CONFIG: path.join(tmpDir, 'config.toml'),
      CAPACITIES_CACHE_DIR: tmpDir,
    }
    const args = ['list', `--${kind}`, selector]
    const first = await runCLI([...args, '--json'], env)
    expect(first.exitCode).toBe(0)
    expect(JSON.parse(first.stdout)).toEqual({ results: ROWS })
    expect(requests).toHaveLength(2)
    for (const url of requests) {
      expect(Object.fromEntries(url.searchParams)).toMatchObject({ id: selector, pageSize: '100' })
      expect(url.searchParams.has(`${kind}Id`)).toBe(false)
      expect(
        api.validateRequest({ method: 'GET', path: route, query: Object.fromEntries(url.searchParams) }).valid
      ).toBe(true)
    }
    expect(requests[0].searchParams.has('cursor')).toBe(false)
    expect(requests[1].searchParams.get('cursor')).toBe(CURSOR)
    expect(await runCLI([...args, '--json'], env)).toMatchObject({ exitCode: 0, stdout: first.stdout })
    const piped = await runCLI(args, env)
    expect(piped.exitCode).toBe(0)
    expect(piped.stdout).toBe(`${ID}\tAlpha  [31m \n${CURSOR}\t界 Beta second line\n`)
    expect(requests).toHaveLength(2)
  })
})

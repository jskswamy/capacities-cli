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

// tests/integration/search.test.ts
import { describe, it, expect, beforeAll, afterEach, afterAll } from 'vitest'
import { server, runCLI, http, HttpResponse } from './helpers.ts'
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'

const SEARCH_FIXTURE = {
  results: [{ id: 'abc-123', structureId: 'RootPage', title: 'Stanford University' }],
}

const STRUCTURES_FIXTURE = { structures: [] }

let tmpDir: string

beforeAll(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cap-search-integ-'))
  server.listen({ onUnhandledRequest: 'bypass' })
})
afterEach(() => server.resetHandlers())
afterAll(() => {
  server.close()
  fs.rmSync(tmpDir, { recursive: true })
})

describe('capacities search', () => {
  it('calls POST /objects/search with spec-compliant body and renders table', async () => {
    let capturedBody: unknown
    server.use(
      http.get('https://api.capacities.io/space/structures', () => HttpResponse.json(STRUCTURES_FIXTURE)),
      http.post('https://api.capacities.io/objects/search', async ({ request }) => {
        capturedBody = await request.json()
        return HttpResponse.json(SEARCH_FIXTURE)
      })
    )

    const { exitCode, stdout } = await runCLI(['search', 'Stanford'], {
      CAPACITIES_TOKEN: 'cap-api-test',
      CAPACITIES_CONFIG: '/tmp/cap-integ-config.toml',
      CAPACITIES_SPACE: 'personal',
      CAPACITIES_CACHE_DIR: tmpDir,
    })
    expect(exitCode).toBe(0)
    expect(stdout).toContain('Stanford University')
    // validate CLI sends a spec-compliant POST body (query is required per openapi spec)
    expect(capturedBody).toMatchObject({ query: 'Stanford' })
  })

  it('exits 5 on 429', async () => {
    server.use(
      http.post(
        'https://api.capacities.io/objects/search',
        () => new HttpResponse(null, { status: 429, headers: { 'Retry-After': '30' } })
      )
    )
    const { exitCode, stderr } = await runCLI(['search', 'test'], {
      CAPACITIES_TOKEN: 'cap-api-test',
      CAPACITIES_CONFIG: '/tmp/cap-integ-config.toml',
      CAPACITIES_SPACE: 'personal',
      CAPACITIES_CACHE_DIR: tmpDir,
    })
    expect(exitCode).toBe(5)
    expect(stderr).toContain('Rate limit')
  })
})

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

// tests/integration/link.test.ts
import { describe, it, expect, beforeAll, afterEach, afterAll } from 'vitest'
import { server, runCLI, http, HttpResponse } from './helpers.ts'
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'

const OBJECT_FIXTURE = { id: 'org-1', title: 'Stanford', objectType: 'Organization' }
const MARKDOWN_FIXTURE = {
  id: 'org-1',
  structureId: 'RootEntity',
  markdown: '---\ntype: Organization\ntitle: Stanford\n---\n',
}
const STRUCTURES_FIXTURE = {
  structures: [
    {
      id: 'org-struct',
      title: 'Organization',
      propertyDefinitions: [{ id: 'f46c81ae-0001-0000-0000-000000000001', name: 'Personalities', type: 'entity' }],
    },
  ],
}

let tmpDir: string

beforeAll(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cap-link-integ-'))
  server.listen({ onUnhandledRequest: 'bypass' })
})
afterEach(() => server.resetHandlers())
afterAll(() => {
  server.close()
  fs.rmSync(tmpDir, { recursive: true })
})

describe('capacities link', () => {
  it('PATCH /object sends entity payload with resolved UUID key', async () => {
    let capturedBody: unknown
    server.use(
      http.get('https://api.capacities.io/space/structures', () => HttpResponse.json(STRUCTURES_FIXTURE)),
      http.patch('https://api.capacities.io/object', async ({ request }) => {
        capturedBody = await request.json()
        return HttpResponse.json(OBJECT_FIXTURE)
      }),
      http.get('https://api.capacities.io/object/markdown', () => HttpResponse.json(MARKDOWN_FIXTURE))
    )

    const { exitCode, stdout } = await runCLI(['link', 'org-1', 'personalities', 'p1', 'p2'], {
      CAPACITIES_TOKEN: 'cap-api-test',
      CAPACITIES_CONFIG: '/tmp/cap-link-test.toml',
      CAPACITIES_SPACE: 'personal',
      CAPACITIES_CACHE_DIR: tmpDir,
    })
    expect(exitCode).toBe(0)
    expect(stdout).toContain('Linked 2 target(s)')
    expect(capturedBody).toMatchObject({
      id: 'org-1',
      properties: {
        'f46c81ae-0001-0000-0000-000000000001': {
          type: 'entity',
          entity: [{ id: 'p1' }, { id: 'p2' }],
        },
      },
    })
  })

  it('exits 5 on 429', async () => {
    server.use(
      http.get('https://api.capacities.io/space/structures', () => HttpResponse.json(STRUCTURES_FIXTURE)),
      http.patch(
        'https://api.capacities.io/object',
        () => new HttpResponse(null, { status: 429, headers: { 'Retry-After': '60' } })
      )
    )
    const { exitCode, stderr } = await runCLI(['link', 'org-1', 'personalities', 'p1'], {
      CAPACITIES_TOKEN: 'cap-api-test',
      CAPACITIES_CONFIG: '/tmp/cap-link-test.toml',
      CAPACITIES_SPACE: 'personal',
      CAPACITIES_CACHE_DIR: tmpDir,
    })
    expect(exitCode).toBe(5)
    expect(stderr).toContain('Rate limit')
  })
})

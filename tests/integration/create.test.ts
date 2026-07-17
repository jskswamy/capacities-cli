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

// tests/integration/create.test.ts
import { describe, it, expect, beforeAll, afterEach, afterAll } from 'vitest'
import * as fs from 'fs'
import { server, runCLI, http, HttpResponse } from './helpers.ts'

const OBJECT_FIXTURE = { id: 'new-org-id', structureId: '4ba6e5c6-3f31-45f2-93a0-27a8b2d91551', markdown: '---\ntype: Organization\ntitle: Bell Labs\n---\n\n# Bell Labs\n' }
const MARKDOWN_FIXTURE = '---\ntype: Organization\ntitle: Bell Labs\n---\n\n# Bell Labs\n'

// A valid structureId UUID for the integration test (custom structure)
const STRUCT_ID = '4ba6e5c6-3f31-45f2-93a0-27a8b2d91551'

beforeAll(() => server.listen({ onUnhandledRequest: 'bypass' }))
afterEach(() => server.resetHandlers())
afterAll(() => server.close())

describe('capacities create', () => {
  it('creates an object and prints the new ID', async () => {
    server.use(
      http.post('https://api.capacities.io/object/markdown', async () => {
        return HttpResponse.json(OBJECT_FIXTURE)
      }),
      http.patch('https://api.capacities.io/object/markdown', async () => {
        return HttpResponse.json({})
      }),
      http.get('https://api.capacities.io/object/markdown', () =>
        HttpResponse.text(MARKDOWN_FIXTURE)
      )
    )

    const { exitCode, stdout } = await runCLI(['create', '--type', STRUCT_ID, '--title', 'Bell Labs'], {
      CAPACITIES_TOKEN: 'cap-api-test',
      CAPACITIES_CONFIG: '/tmp/cap-create-test.toml',
      CAPACITIES_SPACE: 'personal',
    })
    expect(exitCode).toBe(0)
    expect(stdout).toContain('new-org-id')
  })

  it('exits 5 on 429', async () => {
    server.use(
      http.post('https://api.capacities.io/object/markdown', () =>
        new HttpResponse(null, { status: 429, headers: { 'Retry-After': '30' } })
      )
    )
    // Use a valid built-in structureId (RootPage) so SDK validation passes
    const { exitCode, stderr } = await runCLI(['create', '--type', 'RootPage', '--title', 'Test'], {
      CAPACITIES_TOKEN: 'cap-api-test',
      CAPACITIES_CONFIG: '/tmp/cap-create-test.toml',
      CAPACITIES_SPACE: 'personal',
    })
    expect(exitCode).toBe(5)
    expect(stderr).toContain('Rate limit')
  })

  it('--markdown <file> sends file content to API', async () => {
    const tmpFile = '/tmp/cap-create-md-test.md'
    const mdContent = '---\ntitle: From File\n---\nContent here'
    fs.writeFileSync(tmpFile, mdContent)
    server.use(
      http.post('https://api.capacities.io/object/markdown', async () => {
        return HttpResponse.json({ id: 'file-md-id', structureId: 'RootPage', markdown: mdContent })
      }),
      http.get('https://api.capacities.io/object/markdown', () =>
        HttpResponse.text(mdContent)
      )
    )
    const { exitCode, stdout } = await runCLI(
      ['create', '--type', 'RootPage', '--markdown', tmpFile],
      { CAPACITIES_TOKEN: 'cap-api-test', CAPACITIES_CONFIG: '/tmp/cap-create-test.toml', CAPACITIES_SPACE: 'personal' }
    )
    fs.unlinkSync(tmpFile)
    expect(exitCode).toBe(0)
    expect(stdout).toContain('file-md-id')
  })

  it('exits 2 when neither --title nor --markdown is provided', async () => {
    const { exitCode } = await runCLI(
      ['create', '--type', 'RootPage'],
      { CAPACITIES_TOKEN: 'cap-api-test', CAPACITIES_CONFIG: '/tmp/cap-create-test.toml', CAPACITIES_SPACE: 'personal' }
    )
    expect(exitCode).toBe(2)
  })
})

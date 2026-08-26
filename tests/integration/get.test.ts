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

// tests/integration/get.test.ts
import { describe, it, expect, beforeAll, afterEach, afterAll } from 'vitest'
import { server, runCLI, http, HttpResponse } from './helpers.ts'

const OBJ_ID = '7d2e7f8a-4c3b-4e1d-9f0a-123456789abc'
const OBJ_ID_404 = 'ffffffff-ffff-4fff-bfff-ffffffffffff'
const MARKDOWN_CONTENT = '---\ntype: Personality\ntitle: Ralph Merkle\n---\n\n# Ralph Merkle\n'
const MARKDOWN_FIXTURE = {
  id: OBJ_ID,
  structureId: '4ba6e5c6-3f31-45f2-93a0-27a8b2d91551',
  markdown: MARKDOWN_CONTENT,
}

beforeAll(() => server.listen({ onUnhandledRequest: 'bypass' }))
afterEach(() => server.resetHandlers())
afterAll(() => server.close())

describe('capacities get', () => {
  it('outputs markdown to stdout', async () => {
    server.use(http.get('https://api.capacities.io/object/markdown', () => HttpResponse.json(MARKDOWN_FIXTURE)))
    const { exitCode, stdout } = await runCLI(['get', OBJ_ID], {
      CAPACITIES_TOKEN: 'cap-api-test',
      CAPACITIES_CONFIG: '/tmp/cap-integ-get.toml',
      CAPACITIES_SPACE: 'personal',
    })
    expect(exitCode).toBe(0)
    expect(stdout).toContain('Ralph Merkle')
  })

  it('exits 4 on 404', async () => {
    server.use(http.get('https://api.capacities.io/object/markdown', () => new HttpResponse(null, { status: 404 })))
    const { exitCode } = await runCLI(['get', OBJ_ID_404], {
      CAPACITIES_TOKEN: 'cap-api-test',
      CAPACITIES_CONFIG: '/tmp/cap-integ-get.toml',
      CAPACITIES_SPACE: 'personal',
    })
    expect(exitCode).toBe(4)
  })
})

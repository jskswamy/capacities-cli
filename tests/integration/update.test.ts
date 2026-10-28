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

// tests/integration/update.test.ts
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import { describe, it, expect, beforeAll, afterEach, afterAll } from 'vitest'
import { server, runCLI, http, HttpResponse } from './helpers.ts'

const MARKDOWN_FIXTURE = {
  id: '7d2e7f8a-4c3b-4e1d-9f0a-123456789abc',
  structureId: 'RootEntity',
  markdown: '---\ntype: Personality\ntitle: Updated Name\n---\n\n# Updated Name\n',
}
const OBJECT_FIXTURE = { id: '7d2e7f8a-4c3b-4e1d-9f0a-123456789abc', structureId: 'blip-struct' }
const STRUCTURES_FIXTURE = {
  structures: [
    {
      id: 'blip-struct',
      title: 'Blip',
      propertyDefinitions: [
        { id: 'description', name: 'description', type: 'text' },
        { id: 'q-uuid-001', name: 'Quadrant', type: 'label', labelSet: [{ id: 'tool-id', name: 'Tool' }] },
      ],
    },
  ],
}

let tmpDir: string

beforeAll(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cap-update-integ-'))
  server.listen({ onUnhandledRequest: 'bypass' })
})
afterEach(() => server.resetHandlers())
afterAll(() => {
  server.close()
  fs.rmSync(tmpDir, { recursive: true })
})

describe('capacities update', () => {
  it('PATCH /object sends built-in property with text payload', async () => {
    let capturedBody: unknown
    server.use(
      http.get('https://api.capacities.io/space/structures', () => HttpResponse.json(STRUCTURES_FIXTURE)),
      http.get('https://api.capacities.io/object', () => HttpResponse.json(OBJECT_FIXTURE)),
      http.patch('https://api.capacities.io/object', async ({ request }) => {
        capturedBody = await request.json()
        return HttpResponse.json({})
      }),
      http.get('https://api.capacities.io/object/markdown', () => HttpResponse.json(MARKDOWN_FIXTURE))
    )

    const { exitCode, stdout } = await runCLI(
      ['update', '7d2e7f8a-4c3b-4e1d-9f0a-123456789abc', 'description', 'New desc'],
      {
        CAPACITIES_TOKEN: 'cap-api-test',
        CAPACITIES_CONFIG: '/tmp/cap-update-test.toml',
        CAPACITIES_SPACE: 'personal',
        CAPACITIES_CACHE_DIR: tmpDir,
      }
    )
    expect(exitCode).toBe(0)
    expect(stdout).toContain('Updated description on 7d2e7f8a-4c3b-4e1d-9f0a-123456789abc')
    expect(capturedBody).toMatchObject({
      id: '7d2e7f8a-4c3b-4e1d-9f0a-123456789abc',
      properties: { description: { type: 'text', text: { value: 'New desc' } } },
    })
  })

  it('PATCH /object sends label property with UUID key', async () => {
    let capturedBody: unknown
    server.use(
      http.get('https://api.capacities.io/space/structures', () => HttpResponse.json(STRUCTURES_FIXTURE)),
      http.get('https://api.capacities.io/object', () => HttpResponse.json(OBJECT_FIXTURE)),
      http.patch('https://api.capacities.io/object', async ({ request }) => {
        capturedBody = await request.json()
        return HttpResponse.json({})
      }),
      http.get('https://api.capacities.io/object/markdown', () => HttpResponse.json(MARKDOWN_FIXTURE))
    )

    const { exitCode } = await runCLI(['update', '7d2e7f8a-4c3b-4e1d-9f0a-123456789abc', 'quadrant', 'Tool'], {
      CAPACITIES_TOKEN: 'cap-api-test',
      CAPACITIES_CONFIG: '/tmp/cap-update-test.toml',
      CAPACITIES_SPACE: 'personal',
      CAPACITIES_CACHE_DIR: tmpDir,
    })
    expect(exitCode).toBe(0)
    expect(capturedBody).toMatchObject({
      id: '7d2e7f8a-4c3b-4e1d-9f0a-123456789abc',
      properties: { 'q-uuid-001': { type: 'label', label: [{ id: 'tool-id', name: 'Tool' }] } },
    })
  })

  it('PATCH /object/markdown sends frontmatter via --props', async () => {
    let capturedBody: unknown
    server.use(
      http.get('https://api.capacities.io/space/structures', () => HttpResponse.json(STRUCTURES_FIXTURE)),
      http.get('https://api.capacities.io/object', () => HttpResponse.json(OBJECT_FIXTURE)),
      http.patch('https://api.capacities.io/object/markdown', async ({ request }) => {
        capturedBody = await request.json()
        return HttpResponse.json({})
      }),
      http.get('https://api.capacities.io/object/markdown', () => HttpResponse.json(MARKDOWN_FIXTURE))
    )

    const mdContent = '---\nquadrant: Tool\nring: Adopt\n---\n'
    const tmpFile = '/tmp/cap-update-props-test.md'
    fs.writeFileSync(tmpFile, mdContent)
    const { exitCode, stdout } = await runCLI(['update', '7d2e7f8a-4c3b-4e1d-9f0a-123456789abc', '--props', tmpFile], {
      CAPACITIES_TOKEN: 'cap-api-test',
      CAPACITIES_CONFIG: '/tmp/cap-update-test.toml',
      CAPACITIES_SPACE: 'personal',
      CAPACITIES_CACHE_DIR: tmpDir,
    })
    fs.unlinkSync(tmpFile)
    expect(exitCode).toBe(0)
    expect(stdout).toContain('Updated properties on 7d2e7f8a-4c3b-4e1d-9f0a-123456789abc')
    expect(capturedBody).toMatchObject({ id: '7d2e7f8a-4c3b-4e1d-9f0a-123456789abc', markdown: mdContent })
  })

  it('exits 5 on 429', async () => {
    server.use(
      http.get('https://api.capacities.io/space/structures', () => HttpResponse.json(STRUCTURES_FIXTURE)),
      http.get('https://api.capacities.io/object', () => HttpResponse.json(OBJECT_FIXTURE)),
      http.patch(
        'https://api.capacities.io/object',
        () => new HttpResponse(null, { status: 429, headers: { 'Retry-After': '30' } })
      )
    )
    const { exitCode, stderr } = await runCLI(['update', '7d2e7f8a-4c3b-4e1d-9f0a-123456789abc', 'description', 'x'], {
      CAPACITIES_TOKEN: 'cap-api-test',
      CAPACITIES_CONFIG: '/tmp/cap-update-test.toml',
      CAPACITIES_SPACE: 'personal',
      CAPACITIES_CACHE_DIR: tmpDir,
    })
    expect(exitCode).toBe(5)
    expect(stderr).toContain('Rate limit')
  })
})

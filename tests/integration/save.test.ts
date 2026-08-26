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

// tests/integration/save.test.ts
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import { describe, it, expect, beforeAll, afterEach, afterAll } from 'vitest'
import { server, runCLI, http, HttpResponse } from './helpers.ts'

const ENV = {
  CAPACITIES_TOKEN: 'cap-api-test',
  CAPACITIES_CONFIG: '/tmp/cap-save-integration-test.toml',
  CAPACITIES_SPACE: 'personal',
}

beforeAll(() => server.listen({ onUnhandledRequest: 'bypass' }))
afterEach(() => server.resetHandlers())
afterAll(() => server.close())

describe('capacities save url', () => {
  it('saves a URL and prints the object ID', async () => {
    server.use(
      http.post('https://api.capacities.io/object/url', () =>
        HttpResponse.json({ id: 'saved-url-id', structureId: 'MediaWebResource', markdown: '' })
      )
    )
    const { exitCode, stdout } = await runCLI(['save', 'url', 'https://example.com'], ENV)
    expect(exitCode).toBe(0)
    expect(stdout).toContain('saved-url-id')
  })

  it('exits 5 on rate limit (429)', async () => {
    server.use(
      http.post(
        'https://api.capacities.io/object/url',
        () => new HttpResponse(null, { status: 429, headers: { 'Retry-After': '30' } })
      )
    )
    const { exitCode, stderr } = await runCLI(['save', 'url', 'https://example.com'], ENV)
    expect(exitCode).toBe(5)
    expect(stderr).toContain('Rate limit')
  })
})

describe('capacities save file', () => {
  let tmpFile: string

  beforeAll(() => {
    tmpFile = path.join(os.tmpdir(), 'cap-save-integration-test.pdf')
    fs.writeFileSync(tmpFile, 'PDF content for upload test')
  })

  afterAll(() => {
    fs.unlinkSync(tmpFile)
  })

  it('uploads a file through init→PUT→complete and prints the ID', async () => {
    server.use(
      http.post('https://api.capacities.io/object/media/upload', () => HttpResponse.json({ id: 'upload-session-id' })),
      http.put('https://api.capacities.io/object/media/upload/part', () => new HttpResponse(null, { status: 200 })),
      http.post('https://api.capacities.io/object/media/upload/complete', () =>
        HttpResponse.json({ id: 'media-obj-id' })
      )
    )
    const { exitCode, stdout } = await runCLI(['save', 'file', tmpFile], ENV)
    expect(exitCode).toBe(0)
    expect(stdout).toContain('media-obj-id')
  })

  it('exits 2 for a non-existent file path', async () => {
    const { exitCode, stderr } = await runCLI(['save', 'file', '/nonexistent/file.pdf'], ENV)
    expect(exitCode).toBe(2)
    expect(stderr).toContain('File not found')
  })
})

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

// tests/integration/append.test.ts
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import { describe, it, expect, beforeAll, afterEach, afterAll } from 'vitest'
import { server, runCLI, http, HttpResponse } from './helpers.ts'

const OBJECT_ID = '2c76fdbf-6820-4a77-ab6c-d7fcb505186c'

let tmpDir: string

beforeAll(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cap-append-integ-'))
  server.listen({ onUnhandledRequest: 'bypass' })
})
afterEach(() => server.resetHandlers())
afterAll(() => {
  server.close()
  fs.rmSync(tmpDir, { recursive: true })
})

describe('capacities append', () => {
  it('POST /blocks/append sends markdown with position end by default', async () => {
    let capturedBody: unknown
    server.use(
      http.post('https://api.capacities.io/blocks/append', async ({ request }) => {
        capturedBody = await request.json()
        return HttpResponse.json({ id: OBJECT_ID })
      })
    )

    const { exitCode, stdout } = await runCLI(['append', OBJECT_ID, '## New Section\nContent here'], {
      CAPACITIES_TOKEN: 'cap-api-test',
      CAPACITIES_CONFIG: '/tmp/cap-append-test.toml',
      CAPACITIES_SPACE: 'personal',
    })
    expect(exitCode).toBe(0)
    expect(stdout).toContain(`Appended content to ${OBJECT_ID}`)
    expect(capturedBody).toMatchObject({
      id: OBJECT_ID,
      markdown: '## New Section\nContent here',
      position: { type: 'end' },
    })
  })

  it('POST /blocks/append reads content from --markdown file', async () => {
    let capturedBody: unknown
    server.use(
      http.post('https://api.capacities.io/blocks/append', async ({ request }) => {
        capturedBody = await request.json()
        return HttpResponse.json({ id: OBJECT_ID })
      })
    )

    const mdContent = '## From File\nFile content here.'
    const tmpFile = path.join(tmpDir, 'section.md')
    fs.writeFileSync(tmpFile, mdContent)

    const { exitCode } = await runCLI(['append', OBJECT_ID, '--markdown', tmpFile], {
      CAPACITIES_TOKEN: 'cap-api-test',
      CAPACITIES_CONFIG: '/tmp/cap-append-test.toml',
      CAPACITIES_SPACE: 'personal',
    })
    expect(exitCode).toBe(0)
    expect(capturedBody).toMatchObject({ id: OBJECT_ID, markdown: mdContent })
  })

  it('POST /blocks/append respects --position start', async () => {
    let capturedBody: unknown
    server.use(
      http.post('https://api.capacities.io/blocks/append', async ({ request }) => {
        capturedBody = await request.json()
        return HttpResponse.json({ id: OBJECT_ID })
      })
    )

    const { exitCode } = await runCLI(['append', OBJECT_ID, 'Prepended content', '--position', 'start'], {
      CAPACITIES_TOKEN: 'cap-api-test',
      CAPACITIES_CONFIG: '/tmp/cap-append-test.toml',
      CAPACITIES_SPACE: 'personal',
    })
    expect(exitCode).toBe(0)
    expect(capturedBody).toMatchObject({ position: { type: 'start' } })
  })

  it('exits 2 when neither content argument nor --markdown is provided', async () => {
    const { exitCode } = await runCLI(['append', OBJECT_ID], {
      CAPACITIES_TOKEN: 'cap-api-test',
      CAPACITIES_CONFIG: '/tmp/cap-append-test.toml',
      CAPACITIES_SPACE: 'personal',
    })
    expect(exitCode).toBe(2)
  })

  it('exits 5 on 429', async () => {
    server.use(
      http.post(
        'https://api.capacities.io/blocks/append',
        () => new HttpResponse(null, { status: 429, headers: { 'Retry-After': '30' } })
      )
    )
    const { exitCode, stderr } = await runCLI(['append', OBJECT_ID, 'content'], {
      CAPACITIES_TOKEN: 'cap-api-test',
      CAPACITIES_CONFIG: '/tmp/cap-append-test.toml',
      CAPACITIES_SPACE: 'personal',
    })
    expect(exitCode).toBe(5)
    expect(stderr).toContain('Rate limit')
  })
})

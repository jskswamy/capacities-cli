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

// tests/integration/validate.test.ts
import { describe, it, expect, beforeAll, beforeEach, afterEach, afterAll, vi } from 'vitest'
import { server, runCLI, http, HttpResponse, withStdin } from './helpers.ts'
import { cacheBust } from '../../src/cache.ts'

const BLIP_STRUCTURE_RESPONSE = [
  {
    title: 'Blip',
    propertyDefinitions: [
      { name: 'ring', type: 'label', labelSet: [{ name: 'Adopt' }, { name: 'Trial' }] },
      { name: 'quadrant', type: 'label', labelSet: [{ name: 'Tool' }, { name: 'Technique' }] },
    ],
  },
]

// Confirmed from openapi.json: GET /space/structures
const STRUCTURES_ENDPOINT = 'https://api.capacities.io/space/structures'

const ENV = {
  CAPACITIES_TOKEN: 'cap-api-test',
  CAPACITIES_CONFIG: '/tmp/cap-validate-test.toml',
  CAPACITIES_SPACE: 'personal',
}

beforeAll(() => server.listen({ onUnhandledRequest: 'bypass' }))
// Bust the 24h structures cache so each test hits the mocked endpoint fresh.
beforeEach(() => cacheBust('personal', 'structures.json'))
afterEach(() => {
  server.resetHandlers()
  vi.restoreAllMocks()
})
afterAll(() => server.close())

describe('capacities validate', () => {
  it('exits 0 and outputs corrected frontmatter for valid input', async () => {
    server.use(http.get(STRUCTURES_ENDPOINT, () => HttpResponse.json({ structures: BLIP_STRUCTURE_RESPONSE })))
    withStdin('---\ntitle: uv\nring: trial\n---\n')
    const { exitCode, stdout } = await runCLI(['validate', '--type', 'Blip'], ENV)
    expect(exitCode).toBe(0)
    expect(stdout).toContain('ring: Trial')
  })

  it('exits 1 when title is missing', async () => {
    server.use(http.get(STRUCTURES_ENDPOINT, () => HttpResponse.json({ structures: BLIP_STRUCTURE_RESPONSE })))
    withStdin('---\nring: Trial\n---\n')
    const { exitCode, stderr } = await runCLI(['validate', '--type', 'Blip'], ENV)
    expect(exitCode).toBe(1)
    expect(stderr).toContain('title')
  })

  it('exits 4 for unknown type', async () => {
    server.use(http.get(STRUCTURES_ENDPOINT, () => HttpResponse.json({ structures: BLIP_STRUCTURE_RESPONSE })))
    withStdin('---\ntitle: T\n---\n')
    const { exitCode } = await runCLI(['validate', '--type', 'GhostType'], ENV)
    expect(exitCode).toBe(4)
  })

  it('--json outputs parseable JSON with valid key', async () => {
    server.use(http.get(STRUCTURES_ENDPOINT, () => HttpResponse.json({ structures: BLIP_STRUCTURE_RESPONSE })))
    withStdin('---\ntitle: uv\nring: Trial\n---\n')
    const { exitCode, stdout } = await runCLI(['validate', '--type', 'Blip', '--json'], ENV)
    expect(exitCode).toBe(0)
    const parsed = JSON.parse(stdout)
    expect(parsed.valid).toBe(true)
    expect(typeof parsed.corrected).toBe('string')
  })

  it('does not inject iframeUrl on non-Weblink types with a link field', async () => {
    server.use(http.get(STRUCTURES_ENDPOINT, () => HttpResponse.json({ structures: BLIP_STRUCTURE_RESPONSE })))
    withStdin('---\ntitle: uv\nlink: https://example.com\n---\n')
    const { exitCode, stdout } = await runCLI(['validate', '--type', 'Blip', '--json'], ENV)
    expect(exitCode).toBe(0)
    const parsed = JSON.parse(stdout)
    expect(parsed.corrected).not.toContain('iframeUrl')
  })

  it('corrects Title Case field names to lowercase', async () => {
    server.use(http.get(STRUCTURES_ENDPOINT, () => HttpResponse.json({ structures: BLIP_STRUCTURE_RESPONSE })))
    withStdin('---\ntitle: uv\nRing: trial\n---\n')
    const { exitCode, stdout } = await runCLI(['validate', '--type', 'Blip', '--json'], ENV)
    expect(exitCode).toBe(0)
    const parsed = JSON.parse(stdout)
    expect(parsed.corrected).toContain('ring: Trial')
    expect(parsed.corrected).not.toContain('Ring:')
  })
})

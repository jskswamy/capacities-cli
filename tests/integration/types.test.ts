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

// tests/integration/types.test.ts
import { describe, it, expect, beforeAll, beforeEach, afterEach, afterAll } from 'vitest'
import { server, runCLI, http, HttpResponse } from './helpers.ts'
import { cacheBust } from '../../src/cache.ts'
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'

const STRUCTURES_ENDPOINT = 'https://api.capacities.io/space/structures'

const STRUCTURES_FIXTURE = {
  structures: [
    {
      id: 'bc0b170d-c1a1-46ac-bd8e-95cff1da3009',
      title: 'Blip',
      propertyDefinitions: [
        { name: 'ring',     type: 'label', labelSet: [{ name: 'Adopt' }, { name: 'Trial' }] },
        { name: 'quadrant', type: 'label', labelSet: [{ name: 'Tool' }, { name: 'Technique' }] },
        { name: 'link',     type: 'text' },
      ],
    },
    {
      id: 'de1c281e-d2b2-57bd-ce9f-a6df554721ba',
      title: 'Page',
      propertyDefinitions: [],
    },
  ],
}

let tmpDir: string

const getENV = () => ({
  CAPACITIES_TOKEN: 'cap-api-test',
  CAPACITIES_CONFIG: '/tmp/cap-types-test.toml',
  CAPACITIES_SPACE: 'personal',
  CAPACITIES_CACHE_DIR: tmpDir,
})

beforeAll(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cap-types-integ-'))
  process.env.CAPACITIES_CACHE_DIR = tmpDir
  server.listen({ onUnhandledRequest: 'bypass' })
})
beforeEach(() => cacheBust('personal', 'structures.json'))
afterEach(() => server.resetHandlers())
afterAll(() => {
  server.close()
  delete process.env.CAPACITIES_CACHE_DIR
  fs.rmSync(tmpDir, { recursive: true })
})

describe('capacities types', () => {
  it('lists all types as a table', async () => {
    server.use(http.get(STRUCTURES_ENDPOINT, () => HttpResponse.json(STRUCTURES_FIXTURE)))
    const { exitCode, stdout } = await runCLI(['types'], getENV())
    expect(exitCode).toBe(0)
    expect(stdout).toContain('Blip')
    expect(stdout).toContain('bc0b170d-c1a1-46ac-bd8e-95cff1da3009')
    expect(stdout).toContain('Page')
  })

  it('positional name shows structureId header and field table', async () => {
    server.use(http.get(STRUCTURES_ENDPOINT, () => HttpResponse.json(STRUCTURES_FIXTURE)))
    const { exitCode, stdout } = await runCLI(['types', 'Blip'], getENV())
    expect(exitCode).toBe(0)
    expect(stdout).toContain('Blip')
    expect(stdout).toContain('bc0b170d-c1a1-46ac-bd8e-95cff1da3009')
    expect(stdout).toContain('ring')
    expect(stdout).toContain('label')
    expect(stdout).toContain('Adopt')
  })

  it('positional name --json returns full field array', async () => {
    server.use(http.get(STRUCTURES_ENDPOINT, () => HttpResponse.json(STRUCTURES_FIXTURE)))
    const { exitCode, stdout } = await runCLI(['types', 'Blip', '--json'], getENV())
    expect(exitCode).toBe(0)
    const parsed = JSON.parse(stdout)
    expect(parsed.name).toBe('Blip')
    expect(parsed.structureId).toBe('bc0b170d-c1a1-46ac-bd8e-95cff1da3009')
    expect(Array.isArray(parsed.fields)).toBe(true)
    expect(parsed.fields[0]).toMatchObject({ name: 'ring', type: 'label', values: ['Adopt', 'Trial'] })
    expect(parsed.fields[2]).toMatchObject({ name: 'link', type: 'text', values: [] })
  })

  it('--name flag prints bare structureId', async () => {
    server.use(http.get(STRUCTURES_ENDPOINT, () => HttpResponse.json(STRUCTURES_FIXTURE)))
    const { exitCode, stdout } = await runCLI(['types', '--name', 'Blip'], getENV())
    expect(exitCode).toBe(0)
    expect(stdout.trim()).toBe('bc0b170d-c1a1-46ac-bd8e-95cff1da3009')
  })

  it('--name Unknown exits 4', async () => {
    server.use(http.get(STRUCTURES_ENDPOINT, () => HttpResponse.json(STRUCTURES_FIXTURE)))
    const { exitCode } = await runCLI(['types', '--name', 'Unknown'], getENV())
    expect(exitCode).toBe(4)
  })

  it('unknown positional name exits 4', async () => {
    server.use(http.get(STRUCTURES_ENDPOINT, () => HttpResponse.json(STRUCTURES_FIXTURE)))
    const { exitCode } = await runCLI(['types', 'Unknown'], getENV())
    expect(exitCode).toBe(4)
  })
})

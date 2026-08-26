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

// tests/integration/errors.test.ts
// Validates exit code mapping end-to-end from the real binary entry point (via runCLI).
import { describe, it, expect, beforeAll, afterEach, afterAll } from 'vitest'
import { server, runCLI, http, HttpResponse } from './helpers.ts'

beforeAll(() => server.listen({ onUnhandledRequest: 'bypass' }))
afterEach(() => server.resetHandlers())
afterAll(() => server.close())

const BASE_ENV = {
  CAPACITIES_TOKEN: 'cap-api-test',
  CAPACITIES_CONFIG: '/tmp/cap-errors-test.toml',
  CAPACITIES_SPACE: 'personal',
}

describe('exit code routing', () => {
  it('exits 5 (rate-limit) on 429', async () => {
    server.use(
      http.post(
        'https://api.capacities.io/objects/search',
        () => new HttpResponse(null, { status: 429, headers: { 'Retry-After': '30' } })
      )
    )
    const { exitCode, stderr } = await runCLI(['search', 'x'], BASE_ENV)
    expect(exitCode).toBe(5)
    expect(stderr).toContain('Rate limit')
  })

  it('exits 2 (config) on 401', async () => {
    server.use(http.post('https://api.capacities.io/objects/search', () => new HttpResponse(null, { status: 401 })))
    const { exitCode } = await runCLI(['search', 'x'], BASE_ENV)
    expect(exitCode).toBe(2)
  })

  it('exits 4 (not-found) on 404', async () => {
    server.use(http.post('https://api.capacities.io/objects/search', () => new HttpResponse(null, { status: 404 })))
    const { exitCode } = await runCLI(['search', 'x'], BASE_ENV)
    expect(exitCode).toBe(4)
  })

  it('exits 3 (API error) on 500', async () => {
    server.use(http.post('https://api.capacities.io/objects/search', () => new HttpResponse(null, { status: 500 })))
    const { exitCode } = await runCLI(['search', 'x'], BASE_ENV)
    expect(exitCode).toBe(3)
  })

  it('exits 2 (config) when no space is configured', async () => {
    const { exitCode, stderr } = await runCLI(['search', 'x'], {
      CAPACITIES_TOKEN: 'cap-api-test',
      CAPACITIES_CONFIG: '/tmp/cap-no-space-config.toml',
      // no CAPACITIES_SPACE — no config file exists either
    })
    expect(exitCode).toBe(2)
    expect(stderr).toContain('No active space')
  })
})

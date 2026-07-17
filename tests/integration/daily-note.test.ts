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

// tests/integration/daily-note.test.ts
import { describe, it, expect, beforeAll, afterEach, afterAll, vi } from 'vitest'
import { server, runCLI, http, HttpResponse } from './helpers.ts'

// Confirmed from openapi.json: POST /blocks/daily-note/append
const DAILY_NOTE_ENDPOINT = 'https://api.capacities.io/blocks/daily-note/append'

beforeAll(() => server.listen({ onUnhandledRequest: 'bypass' }))
afterEach(() => { server.resetHandlers(); vi.restoreAllMocks() })
afterAll(() => server.close())

describe('capacities daily-note', () => {
  it('appends inline markdown and exits 0', async () => {
    let requestBody: unknown
    server.use(
      http.post(DAILY_NOTE_ENDPOINT, async ({ request }) => {
        requestBody = await request.json()
        return HttpResponse.json({})
      })
    )
    const { exitCode } = await runCLI(
      ['daily-note', 'Shipped v0.2.'],
      { CAPACITIES_TOKEN: 'cap-api-test', CAPACITIES_CONFIG: '/tmp/cap-daily-test.toml', CAPACITIES_SPACE: 'personal' }
    )
    expect(exitCode).toBe(0)
    expect((requestBody as any)?.markdown).toBe('Shipped v0.2.')
  })

  it('passes --date to request body', async () => {
    let requestBody: unknown
    server.use(
      http.post(DAILY_NOTE_ENDPOINT, async ({ request }) => {
        requestBody = await request.json()
        return HttpResponse.json({})
      })
    )
    const { exitCode } = await runCLI(
      ['daily-note', '--date', '2026-07-15', 'Late entry.'],
      { CAPACITIES_TOKEN: 'cap-api-test', CAPACITIES_CONFIG: '/tmp/cap-daily-test.toml', CAPACITIES_SPACE: 'personal' }
    )
    expect(exitCode).toBe(0)
    expect((requestBody as any)?.date).toBe('2026-07-15')
  })

  it('exits 3 on API error', async () => {
    server.use(
      http.post(DAILY_NOTE_ENDPOINT, () =>
        new HttpResponse(null, { status: 500 })
      )
    )
    const { exitCode } = await runCLI(
      ['daily-note', 'Test'],
      { CAPACITIES_TOKEN: 'cap-api-test', CAPACITIES_CONFIG: '/tmp/cap-daily-test.toml', CAPACITIES_SPACE: 'personal' }
    )
    expect(exitCode).toBe(3)
  })
})

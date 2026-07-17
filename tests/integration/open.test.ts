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

// tests/integration/open.test.ts
import { describe, it, expect, beforeAll, beforeEach, afterEach, afterAll } from 'vitest'
import { server, runCLI, http, HttpResponse } from './helpers.ts'
import { cacheBust } from '../../src/cache.ts'
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'

const SPACE_ENDPOINT = 'https://api.capacities.io/space'
const SPACE_FIXTURE = { id: 'ace1bb70-d2c3-48ef-9f1a-234567890abc', title: 'My Space' }
const OBJ_ID = '7d2e7f8a-4c3b-4e1d-9f0a-123456789abc'

let tmpDir: string

const getENV = () => ({
  CAPACITIES_TOKEN: 'cap-api-test',
  CAPACITIES_CONFIG: '/tmp/cap-open-test.toml',
  CAPACITIES_SPACE: 'personal',
  CAPACITIES_CACHE_DIR: tmpDir,
})

beforeAll(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cap-open-integ-'))
  process.env.CAPACITIES_CACHE_DIR = tmpDir
  server.listen({ onUnhandledRequest: 'bypass' })
})
beforeEach(() => cacheBust('personal', 'space.json'))
afterEach(() => server.resetHandlers())
afterAll(() => {
  server.close()
  delete process.env.CAPACITIES_CACHE_DIR
  fs.rmSync(tmpDir, { recursive: true })
})

describe('capacities open', () => {
  it('--print outputs the web URL', async () => {
    server.use(http.get(SPACE_ENDPOINT, () => HttpResponse.json(SPACE_FIXTURE)))
    const { exitCode, stdout } = await runCLI(['open', OBJ_ID, '--print'], getENV())
    expect(exitCode).toBe(0)
    expect(stdout.trim()).toBe(
      `https://app.capacities.io/${SPACE_FIXTURE.id}/${OBJ_ID}`
    )
  })

  it('headless mode (isTTY=false) prints URL without launching browser', async () => {
    // runCLI pipes stdout, so process.stdout.isTTY is undefined/false — headless path
    server.use(http.get(SPACE_ENDPOINT, () => HttpResponse.json(SPACE_FIXTURE)))
    const { exitCode, stdout } = await runCLI(['open', OBJ_ID], getENV())
    expect(exitCode).toBe(0)
    expect(stdout).toContain(`https://app.capacities.io/${SPACE_FIXTURE.id}/${OBJ_ID}`)
  })

  it('--quiet suppresses output in --print mode', async () => {
    server.use(http.get(SPACE_ENDPOINT, () => HttpResponse.json(SPACE_FIXTURE)))
    const { exitCode, stdout } = await runCLI(['open', OBJ_ID, '--print', '--quiet'], getENV())
    expect(exitCode).toBe(0)
    expect(stdout).toBe('')
  })
})

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

// tests/unit/commands/create.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'

const mockCreate = vi.fn()
const mockMarkdownUpdate = vi.fn()
const mockMarkdownGet = vi.fn()

vi.mock('@capacities/api', () => ({
  CapacitiesClient: vi.fn().mockImplementation(() => ({
    object: {
      markdown: { create: mockCreate, update: mockMarkdownUpdate, get: mockMarkdownGet },
    },
  })),
}))

describe('create command', () => {
  let tmpDir: string

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cap-create-'))
    process.env.XDG_CONFIG_HOME = tmpDir
    process.env.XDG_CACHE_HOME = tmpDir
    process.env.CAPACITIES_TOKEN = 'cap-api-test'
    process.env.CAPACITIES_SPACE = 'personal'
    vi.spyOn(process.stdout, 'write').mockImplementation(() => true)
    vi.spyOn(process.stderr, 'write').mockImplementation(() => true)
    fs.mkdirSync(path.join(tmpDir, 'capacities-cli'), { recursive: true })
    fs.writeFileSync(path.join(tmpDir, 'capacities-cli', 'config.toml'), 'active_space = "personal"\n[spaces.personal]\nobjects_dir = "' + path.join(tmpDir, 'objects') + '"\n')
  })

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true })
    delete process.env.XDG_CONFIG_HOME
    delete process.env.XDG_CACHE_HOME
    delete process.env.CAPACITIES_TOKEN
    delete process.env.CAPACITIES_SPACE
    vi.clearAllMocks()
  })

  it('sends bare-YAML title update for Organization type', async () => {
    mockCreate.mockResolvedValue({ id: 'new-org' })
    mockMarkdownUpdate.mockResolvedValue({})
    mockMarkdownGet.mockResolvedValue('---\ntype: Organization\ntitle: Bell Labs\n---\n')
    const { runCreate } = await import('../../../src/commands/create.ts')
    await runCreate('Organization', 'Bell Labs', {})
    expect(mockMarkdownUpdate).toHaveBeenCalledWith(expect.objectContaining({
      id: 'new-org',
      markdown: 'title: Bell Labs',
    }))
  })

  it('does NOT send bare-YAML patch for types that support title in createViaMD', async () => {
    mockCreate.mockResolvedValue({ id: 'new-page' })
    mockMarkdownGet.mockResolvedValue('---\ntype: Page\ntitle: My Page\n---\n')
    const { runCreate } = await import('../../../src/commands/create.ts')
    await runCreate('Page', 'My Page', {})
    expect(mockMarkdownUpdate).not.toHaveBeenCalled()
  })

  it('prints the new object ID', async () => {
    const outSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true)
    mockCreate.mockResolvedValue({ id: 'id-xyz' })
    mockMarkdownGet.mockResolvedValue('---\ntype: Page\ntitle: T\n---\n')
    const { runCreate } = await import('../../../src/commands/create.ts')
    await runCreate('Page', 'T', {})
    expect(outSpy).toHaveBeenCalledWith(expect.stringContaining('id-xyz'))
  })
})

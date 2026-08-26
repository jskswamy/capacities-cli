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
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const mockCreate = vi.fn()
const mockMarkdownGet = vi.fn()
const mockPatchMarkdown = vi.fn()

vi.mock('@capacities/api', () => ({
  CapacitiesClient: vi.fn().mockImplementation(() => ({
    object: {
      markdown: { create: mockCreate, get: mockMarkdownGet },
    },
  })),
}))

vi.mock('../../../src/client.ts', async (importOriginal) => {
  const mod = await importOriginal<typeof import('../../../src/client.ts')>()
  return { ...mod, patchMarkdown: mockPatchMarkdown }
})

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
    fs.mkdirSync(path.join(tmpDir, 'capacities'), { recursive: true })
    fs.writeFileSync(
      path.join(tmpDir, 'capacities', 'config.toml'),
      'active_space = "personal"\n[spaces.personal]\nobjects_dir = "' + path.join(tmpDir, 'objects') + '"\n'
    )
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
    mockPatchMarkdown.mockResolvedValue(undefined)
    mockMarkdownGet.mockResolvedValue('---\ntype: Organization\ntitle: Bell Labs\n---\n')
    const { runCreate } = await import('../../../src/commands/create.ts')
    await runCreate('Organization', 'Bell Labs', {})
    expect(mockPatchMarkdown).toHaveBeenCalledWith(
      expect.anything(),
      'new-org',
      expect.stringContaining('title: Bell Labs')
    )
  })

  it('does NOT send bare-YAML patch for types that support title in createViaMD', async () => {
    mockCreate.mockResolvedValue({ id: 'new-page' })
    mockMarkdownGet.mockResolvedValue('---\ntype: Page\ntitle: My Page\n---\n')
    const { runCreate } = await import('../../../src/commands/create.ts')
    await runCreate('Page', 'My Page', {})
    expect(mockPatchMarkdown).not.toHaveBeenCalled()
  })

  it('prints the new object ID', async () => {
    const outSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true)
    mockCreate.mockResolvedValue({ id: 'id-xyz' })
    mockMarkdownGet.mockResolvedValue('---\ntype: Page\ntitle: T\n---\n')
    const { runCreate } = await import('../../../src/commands/create.ts')
    await runCreate('Page', 'T', {})
    expect(outSpy).toHaveBeenCalledWith(expect.stringContaining('id-xyz'))
  })

  it('injects --field values as frontmatter lines', async () => {
    mockCreate.mockResolvedValue({ id: 'field-obj' })
    mockMarkdownGet.mockResolvedValue('---\ntype: Page\ntitle: T\n---\n')
    const { runCreate } = await import('../../../src/commands/create.ts')
    await runCreate('Page', 'T', { field: ['ring=Trial', 'quadrant=Tool'] })
    const markdown: string = mockCreate.mock.calls[0][0].markdown
    expect(markdown).toContain('ring: Trial')
    expect(markdown).toContain('quadrant: Tool')
  })

  it('sends --markdown file content verbatim without EMPTY_TITLE fix', async () => {
    mockCreate.mockResolvedValue({ id: 'md-obj' })
    mockMarkdownGet.mockResolvedValue('---\ntitle: From File\n---\n')
    const tmpFile = path.join(tmpDir, 'input.md')
    fs.writeFileSync(tmpFile, '---\ntitle: From File\n---\nBody here')
    const { runCreate } = await import('../../../src/commands/create.ts')
    await runCreate('Page', undefined, { markdown: tmpFile })
    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        markdown: '---\ntitle: From File\n---\nBody here',
      })
    )
    expect(mockPatchMarkdown).not.toHaveBeenCalled()
  })

  it('--markdown - reads from stdin', async () => {
    mockCreate.mockResolvedValue({ id: 'stdin-obj' })
    mockMarkdownGet.mockResolvedValue('---\ntitle: From Stdin\n---\n')
    const { Readable } = await import('stream')
    const stdinContent = '---\ntitle: From Stdin\n---\nStdin body'
    vi.spyOn(process, 'stdin', 'get').mockReturnValue(Readable.from([Buffer.from(stdinContent)]) as any)
    const { runCreate } = await import('../../../src/commands/create.ts')
    await runCreate('Page', undefined, { markdown: '-' })
    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        markdown: stdinContent,
      })
    )
  })

  it('throws CONFIG error when neither --title nor --markdown is set', async () => {
    const { runCreate } = await import('../../../src/commands/create.ts')
    const { ExitCode } = await import('../../../src/errors.ts')
    await expect(runCreate('Page', undefined, {})).rejects.toMatchObject({
      code: ExitCode.CONFIG,
    })
  })

  it('--field is ignored when --markdown is set', async () => {
    mockCreate.mockResolvedValue({ id: 'md-field-obj' })
    mockMarkdownGet.mockResolvedValue('---\ntitle: T\n---\n')
    const tmpFile = path.join(tmpDir, 'md.md')
    fs.writeFileSync(tmpFile, '---\ntitle: T\n---\n')
    const { runCreate } = await import('../../../src/commands/create.ts')
    await runCreate('Page', undefined, { markdown: tmpFile, field: ['ring=Trial'] })
    const markdown: string = mockCreate.mock.calls[0][0].markdown
    expect(markdown).not.toContain('ring:')
  })
})

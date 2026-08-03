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

// tests/unit/commands/save.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'

const mockCreateFromUrl = vi.fn()

vi.mock('@capacities/api', () => ({
  CapacitiesClient: vi.fn().mockImplementation(() => ({
    object: { createFromUrl: mockCreateFromUrl },
  })),
}))

const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)

function makeEnv(tmpDir: string) {
  process.env.XDG_CONFIG_HOME = tmpDir
  process.env.XDG_CACHE_HOME = tmpDir
  process.env.CAPACITIES_TOKEN = 'cap-api-test'
  process.env.CAPACITIES_SPACE = 'personal'
  fs.mkdirSync(path.join(tmpDir, 'capacities'), { recursive: true })
  fs.writeFileSync(
    path.join(tmpDir, 'capacities', 'config.toml'),
    'active_space = "personal"\n[spaces.personal]\n'
  )
}

function cleanEnv() {
  delete process.env.XDG_CONFIG_HOME
  delete process.env.XDG_CACHE_HOME
  delete process.env.CAPACITIES_TOKEN
  delete process.env.CAPACITIES_SPACE
}

describe('runSaveUrl', () => {
  let tmpDir: string

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cap-save-url-'))
    makeEnv(tmpDir)
    vi.spyOn(process.stdout, 'write').mockImplementation(() => true)
    vi.spyOn(process.stderr, 'write').mockImplementation(() => true)
  })

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true })
    cleanEnv()
    vi.clearAllMocks()
  })

  it('calls createFromUrl with the URL and prints the ID', async () => {
    mockCreateFromUrl.mockResolvedValue({ id: 'url-obj-id' })
    const outSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true)
    const { runSaveUrl } = await import('../../../src/commands/save.ts')
    await runSaveUrl('https://example.com', {})
    expect(mockCreateFromUrl).toHaveBeenCalledWith(expect.objectContaining({ url: 'https://example.com' }))
    expect(outSpy).toHaveBeenCalledWith(expect.stringContaining('url-obj-id'))
  })

  it('passes title and desc as structured properties', async () => {
    mockCreateFromUrl.mockResolvedValue({ id: 'url-obj-id' })
    const { runSaveUrl } = await import('../../../src/commands/save.ts')
    await runSaveUrl('https://example.com', { title: 'My Link', desc: 'A summary' })
    expect(mockCreateFromUrl).toHaveBeenCalledWith(expect.objectContaining({
      properties: expect.objectContaining({
        title: { type: 'title', title: { value: 'My Link' } },
        description: { type: 'text', text: { value: 'A summary' } },
      }),
    }))
  })

  it('passes --markdown as inline notes', async () => {
    mockCreateFromUrl.mockResolvedValue({ id: 'url-obj-id' })
    const { runSaveUrl } = await import('../../../src/commands/save.ts')
    await runSaveUrl('https://example.com', { markdown: '# Notes\nSome text' })
    expect(mockCreateFromUrl).toHaveBeenCalledWith(expect.objectContaining({ markdown: '# Notes\nSome text' }))
  })
})

describe('runSaveFile', () => {
  let tmpDir: string
  let testFile: string

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cap-save-file-'))
    makeEnv(tmpDir)
    testFile = path.join(tmpDir, 'test.pdf')
    fs.writeFileSync(testFile, 'PDF content')
    vi.spyOn(process.stdout, 'write').mockImplementation(() => true)
    vi.spyOn(process.stderr, 'write').mockImplementation(() => true)
  })

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true })
    cleanEnv()
    vi.clearAllMocks()
  })

  it('calls init → PUT → complete in order and prints the ID', async () => {
    mockFetch
      .mockResolvedValueOnce({ ok: true, json: async () => ({ id: 'upload-id' }) })  // init
      .mockResolvedValueOnce({ ok: true })                                              // PUT
      .mockResolvedValueOnce({ ok: true, json: async () => ({ id: 'media-obj-id' }) }) // complete
    const outSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true)
    const { runSaveFile } = await import('../../../src/commands/save.ts')
    await runSaveFile(testFile, {})
    expect(mockFetch).toHaveBeenCalledTimes(3)
    expect(mockFetch.mock.calls[0][0]).toContain('/object/media/upload')
    expect(mockFetch.mock.calls[1][0]).toContain('/object/media/upload/part')
    expect(mockFetch.mock.calls[2][0]).toContain('/object/media/upload/complete')
    expect(outSpy).toHaveBeenCalledWith(expect.stringContaining('media-obj-id'))
  })

  it('calls abort when PUT fails', async () => {
    mockFetch
      .mockResolvedValueOnce({ ok: true, json: async () => ({ id: 'upload-id' }) }) // init
      .mockResolvedValueOnce({ ok: false, status: 500 })                             // PUT fails
      .mockResolvedValueOnce({ ok: true })                                            // abort
    const { runSaveFile } = await import('../../../src/commands/save.ts')
    await expect(runSaveFile(testFile, {})).rejects.toThrow()
    expect(mockFetch.mock.calls[2][0]).toContain('/object/media/upload/abort')
  })

  it('throws CONFIG error for non-existent path before any fetch', async () => {
    const { runSaveFile } = await import('../../../src/commands/save.ts')
    const { ExitCode } = await import('../../../src/errors.ts')
    await expect(runSaveFile('/nonexistent/file.pdf', {})).rejects.toMatchObject({ code: ExitCode.CONFIG })
    expect(mockFetch).not.toHaveBeenCalled()
  })
})

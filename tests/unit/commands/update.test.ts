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

// tests/unit/commands/update.test.ts
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const mockUpdate = vi.fn()
const mockObjectGet = vi.fn()
const mockMarkdownGet = vi.fn()
const mockMarkdownUpdate = vi.fn()
const mockReplaceBody = vi.fn()
const mockFetchStructures = vi.fn()
const mockFetch = vi.fn()

vi.stubGlobal('fetch', mockFetch)

vi.mock('../../../src/client.ts', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../src/client.ts')>()
  return {
    ...actual,
    createClient: vi.fn().mockImplementation(() => ({
      object: {
        get: mockObjectGet,
        update: mockUpdate,
        markdown: { get: mockMarkdownGet, update: mockMarkdownUpdate },
      },
    })),
    replaceBody: mockReplaceBody,
  }
})

vi.mock('../../../src/commands/search.ts', async (importOriginal) => {
  const actual = (await importOriginal()) as object
  return { ...actual, fetchStructures: mockFetchStructures }
})

const STRUCTURES = {
  structures: [
    {
      id: 'blip-struct',
      title: 'Blip',
      propertyDefinitions: [
        { id: 'description', name: 'description', type: 'text' },
        { id: 'q-uuid-001', name: 'Quadrant', type: 'label', labelSet: [{ id: 'tool-id', name: 'Tool' }] },
        { id: 'p-uuid-002', name: 'Personalities', type: 'entity' },
      ],
    },
  ],
}

describe('update command', () => {
  let tmpDir: string

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cap-update-'))
    process.env.XDG_CONFIG_HOME = tmpDir
    process.env.XDG_CACHE_HOME = tmpDir
    process.env.CAPACITIES_TOKEN = 'cap-api-test'
    process.env.CAPACITIES_SPACE = 'personal'
    vi.spyOn(process.stdout, 'write').mockImplementation(() => true)
    vi.spyOn(process.stderr, 'write').mockImplementation(() => true)
    fs.mkdirSync(path.join(tmpDir, 'capacities'), { recursive: true })
    fs.writeFileSync(
      path.join(tmpDir, 'capacities', 'config.toml'),
      `active_space = "personal"\n[spaces.personal]\nobjects_dir = "${path.join(tmpDir, 'objects')}"\n`
    )
    mockFetchStructures.mockResolvedValue(STRUCTURES)
    mockObjectGet.mockResolvedValue({ id: 'obj-1', structureId: 'blip-struct' })
    vi.stubGlobal('fetch', mockFetch)
    mockFetch.mockResolvedValue({ ok: true, status: 200, text: async () => '' })
  })

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true })
    delete process.env.XDG_CONFIG_HOME
    delete process.env.XDG_CACHE_HOME
    delete process.env.CAPACITIES_TOKEN
    delete process.env.CAPACITIES_SPACE
    vi.clearAllMocks()
    vi.unstubAllGlobals()
  })

  it('resolves built-in property id and sends text payload', async () => {
    mockUpdate.mockResolvedValue({})
    mockMarkdownGet.mockResolvedValue('---\ntype: Personality\ntitle: Updated\n---\n')
    const { runUpdate } = await import('../../../src/commands/update.ts')
    await runUpdate('obj-1', 'description', 'New desc', {})
    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'obj-1',
        properties: { description: { type: 'text', text: { value: 'New desc' } } },
      })
    )
  })

  it('resolves label property name to UUID and sends label payload', async () => {
    mockUpdate.mockResolvedValue({})
    mockMarkdownGet.mockResolvedValue('---\ntype: Blip\ntitle: Grafana\n---\n')
    const { runUpdate } = await import('../../../src/commands/update.ts')
    await runUpdate('obj-1', 'quadrant', 'Tool', {})
    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'obj-1',
        properties: { 'q-uuid-001': { type: 'label', label: [{ id: 'tool-id', name: 'Tool' }] } },
      })
    )
  })

  it('throws CONFIG error when property is an entity type', async () => {
    const { runUpdate } = await import('../../../src/commands/update.ts')
    await expect(runUpdate('obj-1', 'personalities', 'p1', {})).rejects.toThrow('use `cap link`')
  })

  it('sends --props through object.markdown.update', async () => {
    mockMarkdownUpdate.mockResolvedValue({ id: 'obj-1' })
    mockMarkdownGet.mockResolvedValue('---\ntype: Blip\ntitle: Grafana\n---\n')
    const propsFile = path.join(tmpDir, 'props.md')
    fs.writeFileSync(propsFile, '---\ndescription: Updated description\n---\n')
    const { runUpdate } = await import('../../../src/commands/update.ts')
    await runUpdate('obj-1', undefined, undefined, { props: propsFile })
    expect(mockMarkdownUpdate).toHaveBeenCalledWith({ id: 'obj-1', markdown: expect.stringContaining('description:') })
    expect(mockFetch).not.toHaveBeenCalled()
  })

  it('calls replaceBody when --body flag is set', async () => {
    mockReplaceBody.mockResolvedValue(undefined)
    mockMarkdownGet.mockResolvedValue('---\ntype: Blip\ntitle: Grafana\n---\n')
    const mdPath = path.join(tmpDir, 'body.md')
    fs.writeFileSync(mdPath, '# New body\n\nReplacement content.\n')
    const { runUpdate } = await import('../../../src/commands/update.ts')
    await runUpdate('obj-4', undefined, undefined, { body: mdPath })
    expect(mockReplaceBody).toHaveBeenCalledWith(expect.anything(), 'obj-4', '# New body\n\nReplacement content.\n')
    expect(mockUpdate).not.toHaveBeenCalled()
    expect(mockMarkdownUpdate).not.toHaveBeenCalled()
  })

  it('propagates the partial-failure error from replaceBody without masking it', async () => {
    mockReplaceBody.mockRejectedValue(
      new Error('New content appended, but 1 old block(s) could not be removed — remaining block ids: block-1')
    )
    mockMarkdownGet.mockResolvedValue('---\ntype: Blip\ntitle: Grafana\n---\n')
    const mdPath = path.join(tmpDir, 'body.md')
    fs.writeFileSync(mdPath, '# New body\n')
    const { runUpdate } = await import('../../../src/commands/update.ts')
    await expect(runUpdate('obj-5', undefined, undefined, { body: mdPath })).rejects.toThrow('block-1')
  })

  it('throws CONFIG error when neither --props nor propertyKey provided', async () => {
    const { runUpdate } = await import('../../../src/commands/update.ts')
    await expect(runUpdate('obj-3', undefined, undefined, {})).rejects.toThrow(
      'Either --body, --props, or <propertyKey> <value> is required'
    )
  })

  it('does not PATCH when the field is not upsertable', async () => {
    mockObjectGet.mockResolvedValue({ id: 'obj-1', structureId: 'MediaPDF' })
    mockFetchStructures.mockResolvedValue({
      structures: [
        {
          id: 'MediaPDF',
          title: 'MediaPDF',
          propertyDefinitions: [{ id: 'media_pdfPageCount', name: 'page count', type: 'number' }],
        },
      ],
    })
    const { runUpdate } = await import('../../../src/commands/update.ts')
    await expect(runUpdate('obj-1', 'page count', '12', {})).rejects.toThrow(/page count/)
    expect(mockUpdate).not.toHaveBeenCalled()
    expect(mockMarkdownUpdate).not.toHaveBeenCalled()
  })

  it('uses a cached structureId and does not call object.get before refusing', async () => {
    const { cacheSet } = await import('../../../src/cache.ts')
    cacheSet('personal', 'object/obj-pdf.json', { id: 'obj-pdf', structureId: 'MediaPDF' })
    mockFetchStructures.mockResolvedValue({
      structures: [
        {
          id: 'MediaPDF',
          title: 'MediaPDF',
          propertyDefinitions: [{ id: 'media_pdfPageCount', name: 'page count', type: 'number' }],
        },
      ],
    })
    const { runUpdate } = await import('../../../src/commands/update.ts')
    await expect(runUpdate('obj-pdf', 'page count', '12', {})).rejects.toThrow(/MediaPDF/)
    expect(mockObjectGet).not.toHaveBeenCalled()
    expect(mockUpdate).not.toHaveBeenCalled()
  })

  it('fails on the first illegal --props key and does not call markdown.update', async () => {
    mockObjectGet.mockResolvedValue({ id: 'obj-1', structureId: 'MediaPDF' })
    mockFetchStructures.mockResolvedValue({
      structures: [
        {
          id: 'MediaPDF',
          title: 'MediaPDF',
          propertyDefinitions: [
            { id: 'title', name: 'title', type: 'title' },
            { id: 'media_pdfPageCount', name: 'page count', type: 'number' },
            { id: 'media_pdfFileSize', name: 'file size', type: 'number' },
          ],
        },
      ],
    })
    const propsFile = path.join(tmpDir, 'illegal-props.md')
    fs.writeFileSync(propsFile, '---\ntitle: Doc\npage count: 12\nfile size: 9\n---\nignored body\n')
    const { runUpdate } = await import('../../../src/commands/update.ts')
    await expect(runUpdate('obj-1', undefined, undefined, { props: propsFile })).rejects.toThrow(/page count/)
    expect(mockMarkdownUpdate).not.toHaveBeenCalled()
    expect(mockUpdate).not.toHaveBeenCalled()
  })

  it.each(['scalar', 'props'])('refuses normalized read-only fields before %s writes', async (mode) => {
    mockObjectGet.mockResolvedValue({ structureId: 'RootPage' })
    mockFetchStructures.mockResolvedValue({
      structures: [
        {
          id: 'RootPage',
          title: 'Page',
          propertyDefinitions: [{ id: 'lastUpdatedAt', name: 'updated', type: 'lastUpdatedAt', writable: false }],
        },
      ],
    })
    const propsFile = path.join(tmpDir, 'readonly.md')
    fs.writeFileSync(propsFile, '---\nupdated: yesterday\n---\n')
    const { runUpdate } = await import('../../../src/commands/update.ts')
    await expect(
      mode === 'scalar'
        ? runUpdate('obj-1', 'updated', 'yesterday', {})
        : runUpdate('obj-1', undefined, undefined, { props: propsFile })
    ).rejects.toThrow(/updated.*RootPage/)
    expect(mockUpdate).not.toHaveBeenCalled()
    expect(mockMarkdownUpdate).not.toHaveBeenCalled()
  })

  it.each(['"page count"', "'page count'", '"page\\u0020count"'])(
    'refuses quoted YAML key %s before markdown writes',
    async (key) => {
      mockObjectGet.mockResolvedValue({ structureId: 'MediaPDF' })
      mockFetchStructures.mockResolvedValue({
        structures: [
          {
            id: 'MediaPDF',
            title: 'PDF',
            propertyDefinitions: [{ id: 'media_pdfPageCount', name: 'page count', type: 'number' }],
          },
        ],
      })
      const propsFile = path.join(tmpDir, 'quoted.md')
      fs.writeFileSync(propsFile, `---\n${key}: 12\n---\n`)
      const { runUpdate } = await import('../../../src/commands/update.ts')
      await expect(runUpdate('obj-1', undefined, undefined, { props: propsFile })).rejects.toThrow(
        /page count|Unsupported/
      )
      expect(mockMarkdownUpdate).not.toHaveBeenCalled()
    }
  )

  it.each(['? page count\n: 12', '<<: *defaults', '{page count: 12}', 'title: Doc'])(
    'fails unsupported or unterminated frontmatter closed: %s',
    async (content) => {
      const propsFile = path.join(tmpDir, 'unsupported.md')
      fs.writeFileSync(propsFile, `---\n${content}\n${content === 'title: Doc' ? '' : '---\n'}`)
      const { runUpdate } = await import('../../../src/commands/update.ts')
      await expect(runUpdate('obj-1', undefined, undefined, { props: propsFile })).rejects.toThrow(
        /frontmatter|Unsupported/
      )
      expect(mockMarkdownUpdate).not.toHaveBeenCalled()
    }
  )

  it('allows quoted writable and unknown flat keys unchanged', async () => {
    const propsFile = path.join(tmpDir, 'allowed.md')
    const markdown = '---\n"description": Updated\n\'editor\'\'s field\': extra\n"unknown: field": extra\n---\n'
    fs.writeFileSync(propsFile, markdown)
    const { runUpdate } = await import('../../../src/commands/update.ts')
    await runUpdate('obj-1', undefined, undefined, { props: propsFile })
    expect(mockMarkdownUpdate).toHaveBeenCalledWith({ id: 'obj-1', markdown })
  })

  it('busts cache after update', async () => {
    mockUpdate.mockResolvedValue({})
    mockMarkdownGet.mockResolvedValue('---\ntype: Personality\ntitle: T\n---\n')
    const { cacheSet } = await import('../../../src/cache.ts')
    cacheSet('personal', 'object/obj-1.json', { stale: true })
    const { runUpdate } = await import('../../../src/commands/update.ts')
    await runUpdate('obj-1', 'description', 'x', {})
    const { cacheGet, TTL } = await import('../../../src/cache.ts')
    expect(cacheGet('personal', 'object/obj-1.json', TTL.OBJECT)).toBeNull()
  })
})

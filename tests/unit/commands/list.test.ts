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

// tests/unit/commands/list.test.ts
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import { fileURLToPath } from 'url'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { walkList, runList } from '../../../src/commands/list.ts'
import { CapacitiesError, ExitCode, ExitError } from '../../../src/errors.ts'
import { createCLI } from '../../../src/index.ts'
import { pickRow } from '../../../src/picker.ts'
import type { ListRow } from '../../../src/list-format.ts'

const mockedPick = vi.mocked(pickRow)
const mockStructure = vi.fn()
const mockTag = vi.fn()
const mockCollection = vi.fn()
const mockStructures = vi.fn()

vi.mock('../../../src/picker.ts', () => ({
  pickRow: vi.fn(async () => {
    throw new Error('pickRow should not be called')
  }),
}))

vi.mock('@capacities/api', () => ({
  CapacitiesClient: vi.fn().mockImplementation(() => ({
    objects: {
      structure: mockStructure,
      tag: mockTag,
      collection: mockCollection,
    },
    space: { structures: mockStructures },
  })),
}))

const BUILTIN_STRUCTURE_IDS = [
  'MediaImage',
  'MediaPDF',
  'MediaAudio',
  'MediaVideo',
  'MediaFile',
  'MediaWebResource',
  'MediaTweet',
  'RootDatabase',
  'RootStructure',
  'RootSpace',
  'User',
  'UserPersonal',
  'RootQuery',
  'RootPage',
  'RootEntity',
  'RootBlocksTemplate',
  'RootDailyNote',
  'RootTag',
  'RootAIChat',
  'RootSimpleTable',
  'UtilDate',
  'RootTask',
] as const

const ROW_A: ListRow = { id: 'obj-a', structureId: 'st-1', title: 'Alpha' }
const ROW_B: ListRow = { id: 'obj-b', structureId: 'st-1', title: 'Beta' }

function stdout(): string {
  return outSpy.mock.calls.map((c) => String(c[0])).join('')
}

function setTTY(value: boolean): void {
  Object.defineProperty(process.stdout, 'isTTY', { value, configurable: true })
}

function cacheFile(kind: 'type' | 'tag' | 'collection', id: string): string {
  return path.join(tmpDir, 'capacities', 'personal', 'list', kind, `${id}.json`)
}

function page(results: ListRow[], nextCursor: string | null, hasMore: boolean) {
  return { results, nextCursor, hasMore }
}

let tmpDir: string
let outSpy: ReturnType<typeof vi.spyOn>
let errSpy: ReturnType<typeof vi.spyOn>
let originalIsTTY: boolean | undefined

describe('list command', () => {
  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cap-list-'))
    process.env.XDG_CONFIG_HOME = tmpDir
    process.env.XDG_CACHE_HOME = tmpDir
    process.env.CAPACITIES_TOKEN = 'cap-api-test'
    originalIsTTY = process.stdout.isTTY
    setTTY(false)
    outSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true)
    errSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true)
    fs.mkdirSync(path.join(tmpDir, 'capacities'), { recursive: true })
    fs.writeFileSync(
      path.join(tmpDir, 'capacities', 'config.toml'),
      'active_space = "personal"\n[spaces.personal]\nobjects_dir = "/tmp/objs"\n'
    )
    vi.mocked(pickRow).mockImplementation(async () => {
      throw new Error('pickRow should not be called')
    })
  })

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true })
    delete process.env.XDG_CONFIG_HOME
    delete process.env.XDG_CACHE_HOME
    delete process.env.CAPACITIES_TOKEN
    setTTY(originalIsTTY ?? false)
    if (originalIsTTY === undefined) {
      Object.defineProperty(process.stdout, 'isTTY', { value: undefined, configurable: true })
    }
    outSpy.mockRestore()
    errSpy.mockRestore()
    vi.clearAllMocks()
  })

  it('walks type pages by cursor until hasMore is false and does not pass pageSize', async () => {
    const structure = vi
      .fn()
      .mockResolvedValueOnce(page([ROW_A], 'cur-1', true))
      .mockResolvedValueOnce(page([ROW_B], 'cur-2', true))
      .mockResolvedValueOnce(page([{ id: 'obj-c', structureId: 'st-1', title: 'Gamma' }], null, false))
    const tag = vi.fn()
    const collection = vi.fn()

    const rows = await walkList({ objects: { structure, tag, collection } }, 'type', 'st-1')

    expect(rows).toEqual([ROW_A, ROW_B, { id: 'obj-c', structureId: 'st-1', title: 'Gamma' }])
    expect(structure).toHaveBeenNthCalledWith(1, { structureId: 'st-1' })
    expect(structure).toHaveBeenNthCalledWith(2, { structureId: 'st-1', cursor: 'cur-1' })
    expect(structure).toHaveBeenNthCalledWith(3, { structureId: 'st-1', cursor: 'cur-2' })
    expect(structure).toHaveBeenCalledTimes(3)
    for (const [params] of structure.mock.calls) {
      expect(params).not.toHaveProperty('pageSize')
    }
    expect(tag).not.toHaveBeenCalled()
    expect(collection).not.toHaveBeenCalled()
  })

  it('caches a finished type walk at list/type/<structureId>.json and skips the client on the second run', async () => {
    mockStructures.mockResolvedValue({ structures: [{ id: 'st-1', title: 'Page' }] })
    mockStructure.mockResolvedValue(page([ROW_A, ROW_B], null, false))

    await runList({ type: 'Page' })
    await runList({ type: 'Page' })

    expect(mockStructure).toHaveBeenCalledTimes(1)
    expect(mockStructure).toHaveBeenCalledWith({ structureId: 'st-1' })
    expect(mockStructure.mock.calls[0][0]).not.toHaveProperty('pageSize')
    expect(mockStructures).toHaveBeenCalledTimes(1)
    const file = cacheFile('type', 'st-1')
    expect(fs.existsSync(file)).toBe(true)
    expect(fs.existsSync(cacheFile('type', 'Page'))).toBe(false)
    expect(JSON.parse(fs.readFileSync(file, 'utf8')).data).toEqual([ROW_A, ROW_B])
  })

  it('refetches a type list once the cache is older than 10 minutes and keeps a 9-minute entry', async () => {
    mockStructures.mockResolvedValue({ structures: [{ id: 'st-1', title: 'Page' }] })
    mockStructure.mockResolvedValue(page([ROW_A], null, false))
    await runList({ type: 'Page' })

    const file = cacheFile('type', 'st-1')
    const entry = JSON.parse(fs.readFileSync(file, 'utf8'))
    entry.fetchedAt = new Date(Date.now() - 9 * 60 * 1000).toISOString()
    fs.writeFileSync(file, JSON.stringify(entry))
    await runList({ type: 'Page' })
    expect(mockStructure).toHaveBeenCalledTimes(1)

    entry.fetchedAt = new Date(Date.now() - 11 * 60 * 1000).toISOString()
    fs.writeFileSync(file, JSON.stringify(entry))
    await runList({ type: 'Page' })
    expect(mockStructure).toHaveBeenCalledTimes(2)
  })

  it('throws when the second page rejects and does not write a list cache file', async () => {
    mockStructures.mockResolvedValue({ structures: [{ id: 'st-1', title: 'Page' }] })
    mockStructure.mockResolvedValueOnce(page([ROW_A], 'cur-1', true)).mockRejectedValueOnce(new Error('page failed'))

    const err = await runList({ type: 'Page' }).catch((e) => e)
    expect(err).toBeInstanceOf(Error)
    expect(err.message).toBe('page failed')
    expect(mockStructure).toHaveBeenNthCalledWith(2, { structureId: 'st-1', cursor: 'cur-1' })
    expect(fs.existsSync(path.join(tmpDir, 'capacities', 'personal', 'list'))).toBe(false)
  })

  it.each(['missing', 'repeated'])('rejects a %s pagination cursor without caching or output', async (kind) => {
    mockTag.mockReset()
    mockTag
      .mockResolvedValueOnce(page([ROW_A], kind === 'missing' ? null : 'cur-1', true))
      .mockResolvedValueOnce(page([ROW_B], 'cur-1', true))
      .mockRejectedValueOnce(new Error('unexpected third request'))
    await expect(runList({ tag: 'tag-bad' })).rejects.toThrow(/pagination.*cursor/i)
    expect(mockTag.mock.calls.length).toBe(kind === 'missing' ? 1 : 2)
    expect(fs.existsSync(cacheFile('tag', 'tag-bad'))).toBe(false)
    expect(stdout()).toBe('')
    expect(pickRow).not.toHaveBeenCalled()
    mockTag.mockReset()
  })

  it('throws CONFIG when no selector or more than one selector is set', async () => {
    const none = await runList({}).catch((e) => e)
    expect(none).toBeInstanceOf(CapacitiesError)
    expect(none.code).toBe(ExitCode.CONFIG)

    const two = await runList({ type: 'Page', collection: 'col-1' }).catch((e) => e)
    expect(two).toBeInstanceOf(CapacitiesError)
    expect(two.code).toBe(ExitCode.CONFIG)

    const three = await runList({ type: 'Page', tag: 'tag-1', collection: 'col-1' }).catch((e) => e)
    expect(three).toBeInstanceOf(CapacitiesError)
    expect(three.code).toBe(ExitCode.CONFIG)
    expect(mockStructure).not.toHaveBeenCalled()
    expect(mockTag).not.toHaveBeenCalled()
    expect(mockCollection).not.toHaveBeenCalled()
    expect(mockStructures).not.toHaveBeenCalled()
  })

  it('resolves --type by exact title, then structure id, then a built-in id', async () => {
    mockStructure.mockResolvedValue(page([ROW_A], null, false))
    mockStructures.mockResolvedValue({
      structures: [
        { id: 'st-1', title: 'Page' },
        { id: '4ba6e5c6-3f31-45f2-93a0-27a8b2d91551', title: 'Blip' },
        { id: 'custom-root', title: 'RootPage' },
      ],
    })

    await runList({ type: 'Page' })
    expect(mockStructure).toHaveBeenLastCalledWith({ structureId: 'st-1' })

    const wrongCase = await runList({ type: 'page' }).catch((e) => e)
    expect(wrongCase).toBeInstanceOf(CapacitiesError)
    expect(wrongCase.code).toBe(ExitCode.NOT_FOUND)
    expect(wrongCase.message).toBe('Unknown type "page". Check: capacities types')

    await runList({ type: '4ba6e5c6-3f31-45f2-93a0-27a8b2d91551' })
    expect(mockStructure).toHaveBeenLastCalledWith({ structureId: '4ba6e5c6-3f31-45f2-93a0-27a8b2d91551' })

    await runList({ type: 'RootPage' })
    expect(mockStructure).toHaveBeenLastCalledWith({ structureId: 'custom-root' })

    const unknown = await runList({ type: 'Nope' }).catch((e) => e)
    expect(unknown).toBeInstanceOf(CapacitiesError)
    expect(unknown.code).toBe(ExitCode.NOT_FOUND)
    expect(unknown.message).toBe('Unknown type "Nope". Check: capacities types')

    const unknownId = await runList({ type: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee' }).catch((e) => e)
    expect(unknownId).toBeInstanceOf(CapacitiesError)
    expect(unknownId.code).toBe(ExitCode.NOT_FOUND)
    expect(unknownId.message).toBe('Unknown type "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee". Check: capacities types')
  })

  it('uses a built-in structure id when it is not a title', async () => {
    mockStructures.mockResolvedValue({ structures: [{ id: 'st-1', title: 'Page' }] })
    mockStructure.mockResolvedValue(page([ROW_A], null, false))

    for (const id of BUILTIN_STRUCTURE_IDS) {
      await runList({ type: id })
      expect(mockStructure).toHaveBeenLastCalledWith({ structureId: id })
    }
  })

  it('lists a tag id into list/tag/<id>.json and does not call objects.structure', async () => {
    mockTag.mockResolvedValue(page([ROW_A], null, false))

    await runList({ tag: 'tag-1' })

    expect(mockTag).toHaveBeenCalledWith({ tagId: 'tag-1' })
    expect(mockTag.mock.calls[0][0]).not.toHaveProperty('pageSize')
    expect(mockStructure).not.toHaveBeenCalled()
    expect(fs.existsSync(cacheFile('tag', 'tag-1'))).toBe(true)
    expect(JSON.parse(fs.readFileSync(cacheFile('tag', 'tag-1'), 'utf8')).data).toEqual([ROW_A])
  })

  it('lists a collection id into list/collection/<id>.json and does not call objects.structure', async () => {
    mockCollection.mockResolvedValue(page([ROW_B], null, false))

    await runList({ collection: 'col-1' })

    expect(mockCollection).toHaveBeenCalledWith({ collectionId: 'col-1' })
    expect(mockCollection.mock.calls[0][0]).not.toHaveProperty('pageSize')
    expect(mockStructure).not.toHaveBeenCalled()
    expect(fs.existsSync(cacheFile('collection', 'col-1'))).toBe(true)
    expect(JSON.parse(fs.readFileSync(cacheFile('collection', 'col-1'), 'utf8')).data).toEqual([ROW_B])
  })

  it('prints results JSON and does not call pickRow when stdout is a TTY', async () => {
    setTTY(true)
    mockStructures.mockResolvedValue({ structures: [{ id: 'st-1', title: 'Page' }] })
    mockStructure.mockResolvedValue(page([ROW_A, ROW_B], null, false))

    await runList({ type: 'Page', json: true })

    expect(pickRow).not.toHaveBeenCalled()
    expect(JSON.parse(stdout())).toEqual({ results: [ROW_A, ROW_B] })
  })

  it('writes id-tab-title lines when stdout is not a TTY and does not call pickRow', async () => {
    setTTY(false)
    mockStructures.mockResolvedValue({ structures: [{ id: 'st-1', title: 'Page' }] })
    const rows: ListRow[] = [
      { id: 'obj-a', structureId: 'st-1', title: 'A\tB\nC' },
      { id: 'obj-b', structureId: 'st-1', title: 'Beta' },
    ]
    mockStructure.mockResolvedValue(page(rows, null, false))

    await runList({ type: 'Page' })

    expect(pickRow).not.toHaveBeenCalled()
    expect(stdout()).toBe('obj-a\tA B C\nobj-b\tBeta\n')
  })

  it('writes nothing when quiet for JSON, for lines, and for a TTY chosen id', async () => {
    mockStructures.mockResolvedValue({ structures: [{ id: 'st-1', title: 'Page' }] })
    mockStructure.mockResolvedValue(page([ROW_A], null, false))

    setTTY(true)
    await runList({ type: 'Page', json: true, quiet: true })
    expect(stdout()).toBe('')
    expect(pickRow).not.toHaveBeenCalled()

    outSpy.mockClear()
    setTTY(false)
    await runList({ type: 'Page', quiet: true })
    expect(stdout()).toBe('')
    expect(pickRow).not.toHaveBeenCalled()

    outSpy.mockClear()
    setTTY(true)
    await runList({ type: 'Page', quiet: true })
    expect(stdout()).toBe('')
    expect(pickRow).not.toHaveBeenCalled()
  })

  it('throws NOT_FOUND for an empty walk, writes nothing, and does not call pickRow', async () => {
    setTTY(true)
    mockStructures.mockResolvedValue({ structures: [{ id: 'st-1', title: 'Page' }] })
    mockStructure.mockResolvedValue(page([], null, false))

    const err = await runList({ type: 'Page' }).catch((e) => e)

    expect(err).toBeInstanceOf(CapacitiesError)
    expect(err.code).toBe(ExitCode.NOT_FOUND)
    expect(err.message).toBe('(no results)')
    expect(stdout()).toBe('')
    expect(pickRow).not.toHaveBeenCalled()
  })

  it('does not bust list cache keys from create, update, or append', () => {
    const commandsDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../src/commands')
    for (const file of ['create.ts', 'update.ts', 'append.ts']) {
      const src = fs.readFileSync(path.join(commandsDir, file), 'utf8')
      expect(src).not.toMatch(/list\/(type|tag|collection)/)
    }
  })

  it('prints only the chosen id when the picker returns a row', async () => {
    mockStructures.mockResolvedValue({ structures: [{ id: 'st-1', title: 'Page' }] })
    mockStructure.mockResolvedValue(page([ROW_A, ROW_B], null, false))
    mockedPick.mockResolvedValue({ id: 'abc', structureId: 'RootPage', title: 'Alpha' })
    vi.spyOn(process.stdout, 'isTTY', 'get').mockReturnValue(true)
    await runList({ type: 'Page' })
    expect(mockedPick).toHaveBeenCalledWith([ROW_A, ROW_B])
    expect(stdout()).toBe('abc\n')
  })

  it('prints nothing and exits non-zero when the picker returns null', async () => {
    mockStructures.mockResolvedValue({ structures: [{ id: 'st-1', title: 'Page' }] })
    mockStructure.mockResolvedValue(page([ROW_A], null, false))
    mockedPick.mockResolvedValue(null)
    vi.spyOn(process.stdout, 'isTTY', 'get').mockReturnValue(true)
    const err = await runList({ type: 'Page' }).catch((e: unknown) => e)
    expect(err).toBeInstanceOf(ExitError)
    expect((err as ExitError).code).toBe(1)
    expect(stdout()).toBe('')
  })

  it('registers list with --type, --tag, and --collection', () => {
    const program = createCLI()
    const cmd = program.commands.find((c) => c.name() === 'list')
    expect(cmd).toBeDefined()
    const longs = cmd!.options.map((o) => o.long)
    expect(longs).toEqual(expect.arrayContaining(['--type', '--tag', '--collection']))
  })
})

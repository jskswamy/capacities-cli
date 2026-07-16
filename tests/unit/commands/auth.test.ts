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

// tests/unit/commands/auth.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'

// spawnSync mock: write valid TOML into the file arg so "editor" produces valid content
const spawnSyncMock = vi.fn().mockImplementation((_editor: string, args: string[]) => {
  const file = args[0]
  if (file && fs.existsSync(file)) {
    fs.writeFileSync(file, 'auth_type = "api_token"\napi_token = "cap-api-validtoken"\n')
  }
  return { error: undefined }
})

vi.mock('child_process', () => ({ spawnSync: spawnSyncMock }))

// readline mock: promptLine resolves immediately with empty string (uses default)
vi.mock('readline', () => ({
  createInterface: vi.fn().mockReturnValue({
    question: (_q: string, cb: (a: string) => void) => cb(''),
    close: vi.fn(),
  }),
}))

const mockEncryptSecrets = vi.fn().mockResolvedValue(undefined)
const mockDecryptSecrets = vi.fn()
const mockGenerateAgeKeypair = vi.fn()

vi.mock('../../../src/secrets.ts', () => ({
  encryptSecrets: mockEncryptSecrets,
  decryptSecrets: mockDecryptSecrets,
  generateAgeKeypair: mockGenerateAgeKeypair,
  serializeSecrets: vi.fn((s: Record<string, unknown>) => `auth_type = "${s.auth_type}"\n`),
}))

vi.mock('@capacities/api', () => ({
  CapacitiesClient: vi.fn().mockImplementation(() => ({
    space: { get: vi.fn().mockResolvedValue({ id: 'space-123', name: 'My Space' }) },
  })),
}))

// --- helpers ---
function makeConfig(tmpDir: string, content = 'active_space = "personal"\n[spaces.personal]\nobjects_dir = "/tmp/objs"\n') {
  fs.mkdirSync(path.join(tmpDir, 'capacities'), { recursive: true })
  fs.writeFileSync(path.join(tmpDir, 'capacities', 'config.toml'), content)
}

// ponytail: restore only explicit spies, not vi.restoreAllMocks() which resets vi.fn() impls
function restoreSpies(...spies: Array<ReturnType<typeof vi.spyOn>>) {
  spies.forEach(s => s.mockRestore())
}

describe('auth list', () => {
  let tmpDir: string
  let outSpy: ReturnType<typeof vi.spyOn>
  let errSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cap-auth-'))
    process.env.XDG_CONFIG_HOME = tmpDir
    outSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true)
    errSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true)
  })
  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true })
    delete process.env.XDG_CONFIG_HOME
    restoreSpies(outSpy, errSpy)
  })

  it('shows "no spaces" when config is empty', async () => {
    const { listSpaces } = await import('../../../src/commands/auth.ts')
    listSpaces({})
    expect(outSpy).toHaveBeenCalledWith(expect.stringContaining('no spaces'))
  })

  it('lists spaces with active marker when spaces exist', async () => {
    makeConfig(tmpDir)
    const { listSpaces } = await import('../../../src/commands/auth.ts')
    listSpaces({})
    const written = outSpy.mock.calls.map(c => c[0]).join('')
    expect(written).toContain('personal')
  })
})

describe('auth useSpace', () => {
  let tmpDir: string
  let outSpy: ReturnType<typeof vi.spyOn>
  let errSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cap-auth-use-'))
    process.env.XDG_CONFIG_HOME = tmpDir
    outSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true)
    errSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true)
    makeConfig(tmpDir, 'active_space = "personal"\n[spaces.personal]\n[spaces.work]\n')
  })
  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true })
    delete process.env.XDG_CONFIG_HOME
    restoreSpies(outSpy, errSpy)
  })

  it('sets active space and prints confirmation', async () => {
    const { useSpace } = await import('../../../src/commands/auth.ts')
    useSpace('work', {})
    expect(outSpy).toHaveBeenCalledWith(expect.stringContaining('work'))
  })

  it('throws when space does not exist', async () => {
    const { useSpace } = await import('../../../src/commands/auth.ts')
    const { CapacitiesError } = await import('../../../src/errors.ts')
    expect(() => useSpace('nonexistent', {})).toThrow(CapacitiesError)
  })
})

describe('auth removeSpace', () => {
  let tmpDir: string
  let outSpy: ReturnType<typeof vi.spyOn>
  let errSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cap-auth-rm-'))
    process.env.XDG_CONFIG_HOME = tmpDir
    process.env.XDG_CACHE_HOME = tmpDir
    outSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true)
    errSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true)
    fs.mkdirSync(path.join(tmpDir, 'capacities', 'spaces'), { recursive: true })
    makeConfig(tmpDir)
  })
  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true })
    delete process.env.XDG_CONFIG_HOME
    delete process.env.XDG_CACHE_HOME
    restoreSpies(outSpy, errSpy)
  })

  it('removes the space from config and prints confirmation', async () => {
    const { removeSpace } = await import('../../../src/commands/auth.ts')
    removeSpace('personal', {})
    expect(outSpy).toHaveBeenCalledWith(expect.stringContaining('personal'))
  })

  it('removes space file if it exists', async () => {
    const spaceFile = path.join(tmpDir, 'capacities', 'spaces', 'personal.age')
    fs.writeFileSync(spaceFile, 'dummy')
    const { removeSpace } = await import('../../../src/commands/auth.ts')
    removeSpace('personal', {})
    expect(fs.existsSync(spaceFile)).toBe(false)
  })
})

describe('auth keygenCommand', () => {
  let tmpDir: string
  let homeDir: string
  let outSpy: ReturnType<typeof vi.spyOn>
  let errSpy: ReturnType<typeof vi.spyOn>
  const origHome = process.env.HOME

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cap-auth-kg-'))
    homeDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cap-auth-home-'))
    process.env.XDG_CONFIG_HOME = tmpDir
    process.env.HOME = homeDir
    outSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true)
    errSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true)
    mockGenerateAgeKeypair.mockResolvedValue({ identity: 'AGE-SECRET-KEY-1abc', recipient: 'age1xyz' })
  })
  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true })
    fs.rmSync(homeDir, { recursive: true })
    delete process.env.XDG_CONFIG_HOME
    process.env.HOME = origHome
    restoreSpies(outSpy, errSpy)
    mockGenerateAgeKeypair.mockReset()
  })

  it('generates keypair and writes key file', async () => {
    const { keygenCommand } = await import('../../../src/commands/auth.ts')
    await keygenCommand({})
    expect(mockGenerateAgeKeypair).toHaveBeenCalled()
    const keyFile = path.join(tmpDir, 'age', 'capacities.txt')
    expect(fs.existsSync(keyFile)).toBe(true)
    expect(outSpy).toHaveBeenCalledWith(expect.stringContaining('age1xyz'))
  })

  it('throws if key file already exists', async () => {
    const keyFile = path.join(tmpDir, 'age', 'capacities.txt')
    fs.mkdirSync(path.dirname(keyFile), { recursive: true })
    fs.writeFileSync(keyFile, 'existing')
    const { keygenCommand } = await import('../../../src/commands/auth.ts')
    const { CapacitiesError } = await import('../../../src/errors.ts')
    await expect(keygenCommand({})).rejects.toBeInstanceOf(CapacitiesError)
  })
})

describe('auth addSpace', () => {
  let tmpDir: string
  let outSpy: ReturnType<typeof vi.spyOn>
  let errSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cap-auth-add-'))
    process.env.XDG_CONFIG_HOME = tmpDir
    process.env.XDG_DATA_HOME = tmpDir
    outSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true)
    errSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true)
    fs.mkdirSync(path.join(tmpDir, 'capacities'), { recursive: true })
    spawnSyncMock.mockImplementation((_editor: string, args: string[]) => {
      const file = args[0]
      if (file && fs.existsSync(file)) {
        fs.writeFileSync(file, 'auth_type = "api_token"\napi_token = "cap-api-validtoken"\n')
      }
      return { error: undefined }
    })
    mockEncryptSecrets.mockResolvedValue(undefined)
  })
  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true })
    delete process.env.XDG_CONFIG_HOME
    delete process.env.XDG_DATA_HOME
    restoreSpies(outSpy, errSpy)
    mockEncryptSecrets.mockReset().mockResolvedValue(undefined)
  })

  it('adds space after editor provides valid token', async () => {
    const { addSpace } = await import('../../../src/commands/auth.ts')
    await addSpace('newspace', {})
    expect(mockEncryptSecrets).toHaveBeenCalled()
    expect(outSpy).toHaveBeenCalledWith(expect.stringContaining('newspace'))
  })

  it('calls exit when editor leaves token empty', async () => {
    spawnSyncMock.mockImplementationOnce(() => ({ error: undefined }))
    const { addSpace } = await import('../../../src/commands/auth.ts')
    await expect(addSpace('emptyspace', {})).rejects.toThrow()
  })
})

describe('auth editSpace', () => {
  let tmpDir: string
  let outSpy: ReturnType<typeof vi.spyOn>
  let errSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cap-auth-edit-'))
    process.env.XDG_CONFIG_HOME = tmpDir
    outSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true)
    errSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true)
    fs.mkdirSync(path.join(tmpDir, 'capacities', 'spaces'), { recursive: true })
    makeConfig(tmpDir)
    mockDecryptSecrets.mockResolvedValue({ auth_type: 'api_token', api_token: 'cap-api-old' })
    mockEncryptSecrets.mockResolvedValue(undefined)
  })
  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true })
    delete process.env.XDG_CONFIG_HOME
    restoreSpies(outSpy, errSpy)
    mockDecryptSecrets.mockReset()
    mockEncryptSecrets.mockReset().mockResolvedValue(undefined)
  })

  it('prints "No changes" when editor leaves content unchanged', async () => {
    spawnSyncMock.mockImplementationOnce(() => ({ error: undefined }))
    const { editSpace } = await import('../../../src/commands/auth.ts')
    await editSpace('personal', {})
    expect(outSpy).toHaveBeenCalledWith(expect.stringContaining('No changes'))
  })

  it('saves updated secrets when editor changes content', async () => {
    spawnSyncMock.mockImplementationOnce((_editor: string, args: string[]) => {
      const file = args[0]
      if (file && fs.existsSync(file)) {
        fs.writeFileSync(file, 'auth_type = "api_token"\napi_token = "cap-api-new"\n')
      }
      return { error: undefined }
    })
    const { editSpace } = await import('../../../src/commands/auth.ts')
    await editSpace('personal', {})
    expect(mockEncryptSecrets).toHaveBeenCalled()
    expect(outSpy).toHaveBeenCalledWith(expect.stringContaining('updated'))
  })
})

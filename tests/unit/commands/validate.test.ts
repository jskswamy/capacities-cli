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

// tests/unit/commands/validate.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import { Readable } from 'stream'

const WEBLINK_STRUCTURE = { title: 'Weblink', propertyDefinitions: [] }

// Fixture: a Blip structure with ring (label) and quadrant (label) properties
const BLIP_STRUCTURE = {
  title: 'Blip',
  propertyDefinitions: [
    {
      name: 'ring',
      type: 'label',
      labelSet: [{ name: 'Adopt' }, { name: 'Trial' }, { name: 'Assess' }, { name: 'Hold' }],
    },
    {
      name: 'quadrant',
      type: 'label',
      labelSet: [{ name: 'Tool' }, { name: 'Technique' }, { name: 'Platform' }, { name: 'Languages & Frameworks' }],
    },
  ],
}

const mockStructures = vi.fn()

// Plain function (not vi.fn) so vi.restoreAllMocks() in afterEach cannot strip
// the implementation between tests — otherwise only the first test would see a
// client with a `.space` and the rest would get `undefined`.
vi.mock('@capacities/api', () => ({
  CapacitiesClient: function () {
    return { space: { structures: mockStructures } }
  },
}))

// Helper: create a mock stdin from a string
function mockStdin(content: string): void {
  vi.spyOn(process, 'stdin', 'get').mockReturnValue(Readable.from([Buffer.from(content)]) as any)
}

describe('validate command', () => {
  let tmpDir: string
  let stdoutOutput: string[]
  let stderrOutput: string[]

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cap-validate-'))
    process.env.XDG_CONFIG_HOME = tmpDir
    process.env.XDG_CACHE_HOME = tmpDir
    process.env.CAPACITIES_TOKEN = 'cap-api-test'
    process.env.CAPACITIES_SPACE = 'personal'
    fs.mkdirSync(path.join(tmpDir, 'capacities'), { recursive: true })
    fs.writeFileSync(path.join(tmpDir, 'capacities', 'config.toml'), 'active_space = "personal"\n[spaces.personal]\n')
    stdoutOutput = []
    stderrOutput = []
    vi.spyOn(process.stdout, 'write').mockImplementation((chunk: unknown) => {
      stdoutOutput.push(String(chunk))
      return true
    })
    vi.spyOn(process.stderr, 'write').mockImplementation((chunk: unknown) => {
      stderrOutput.push(String(chunk))
      return true
    })
    mockStructures.mockResolvedValue([BLIP_STRUCTURE])
  })

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true })
    delete process.env.XDG_CONFIG_HOME
    delete process.env.XDG_CACHE_HOME
    delete process.env.CAPACITIES_TOKEN
    delete process.env.CAPACITIES_SPACE
    vi.clearAllMocks()
    vi.restoreAllMocks()
  })

  it('fuzzy-normalizes label value: quadrant: tools → Tool', async () => {
    mockStdin('---\ntitle: uv\nquadrant: tools\n---\n')
    const { runValidate } = await import('../../../src/commands/validate.ts')
    await runValidate('Blip', {})
    const out = stdoutOutput.join('')
    expect(out).toContain('quadrant: Tool')
    expect(out).not.toContain('quadrant: tools')
    const warn = stderrOutput.join('')
    expect(warn).toMatch(/NORMALIZED|normalized/)
  })

  it('normalizes label value casing: ring: trial → ring: Trial', async () => {
    mockStdin('---\ntitle: uv\nring: trial\n---\n')
    const { runValidate } = await import('../../../src/commands/validate.ts')
    await runValidate('Blip', {})
    const out = stdoutOutput.join('')
    expect(out).toContain('ring: Trial')
    expect(out).not.toContain('ring: trial')
  })

  it('corrects field-name casing: Ring: trial → ring: Trial', async () => {
    mockStdin('---\ntitle: uv\nRing: trial\n---\n')
    const { runValidate } = await import('../../../src/commands/validate.ts')
    await runValidate('Blip', {})
    const out = stdoutOutput.join('')
    expect(out).toContain('ring: Trial')
    expect(out).not.toContain('Ring:')
    const warn = stderrOutput.join('')
    expect(warn).toMatch(/FIELD_CASE|should be/)
  })

  it('fuzzy-corrects field name: quqdrant → quadrant', async () => {
    mockStdin('---\ntitle: uv\nquqdrant: Tool\n---\n')
    const { runValidate } = await import('../../../src/commands/validate.ts')
    await runValidate('Blip', {})
    const out = stdoutOutput.join('')
    expect(out).toContain('quadrant: Tool')
    expect(out).not.toContain('quqdrant:')
    const warn = stderrOutput.join('')
    expect(warn).toMatch(/FIELD_FUZZY|did you mean/)
  })

  it('does not inject iframeUrl on non-Weblink types with a link field', async () => {
    mockStdin('---\ntitle: uv\nlink: https://example.com\n---\n')
    const { runValidate } = await import('../../../src/commands/validate.ts')
    await runValidate('Blip', {})
    const out = stdoutOutput.join('')
    expect(out).not.toContain('iframeUrl')
  })

  it('copies iframeUrl from link on Weblink type', async () => {
    mockStructures.mockResolvedValue({ structures: [WEBLINK_STRUCTURE] })
    mockStdin('---\ntitle: My Link\nlink: https://example.com\n---\n')
    const { runValidate } = await import('../../../src/commands/validate.ts')
    await runValidate('Weblink', {})
    const out = stdoutOutput.join('')
    expect(out).toContain('iframeUrl: https://example.com')
    const warn = stderrOutput.join('')
    expect(warn).toMatch(/COPIED_FROM_LINK|iframeUrl/)
  })

  it('fails with exit 1 when title is missing', async () => {
    mockStdin('---\nring: Trial\n---\n')
    const { runValidate } = await import('../../../src/commands/validate.ts')
    const { ExitCode } = await import('../../../src/errors.ts')
    await expect(runValidate('Blip', {})).rejects.toMatchObject({ code: ExitCode.UNEXPECTED })
    const warn = stderrOutput.join('')
    expect(warn).toMatch(/title/)
  })

  it('fails with exit 4 when type is not in structures', async () => {
    mockStdin('---\ntitle: T\n---\n')
    const { runValidate } = await import('../../../src/commands/validate.ts')
    const { ExitCode } = await import('../../../src/errors.ts')
    await expect(runValidate('NonExistentType', {})).rejects.toMatchObject({ code: ExitCode.NOT_FOUND })
  })

  it('--json outputs valid JSON with all required keys', async () => {
    mockStdin('---\ntitle: uv\nring: trial\n---\n')
    const { runValidate } = await import('../../../src/commands/validate.ts')
    await runValidate('Blip', { json: true })
    const out = stdoutOutput.join('')
    const parsed = JSON.parse(out)
    expect(parsed).toHaveProperty('valid')
    expect(parsed).toHaveProperty('corrected')
    expect(parsed).toHaveProperty('errors')
    expect(parsed).toHaveProperty('warnings')
    expect(parsed).toHaveProperty('filled')
  })

  it('unknown field with no fuzzy match passes through exit 0', async () => {
    mockStdin('---\ntitle: uv\ntotallymadeupfield: val\n---\n')
    const { runValidate } = await import('../../../src/commands/validate.ts')
    await expect(runValidate('Blip', {})).resolves.toBeUndefined()
    const out = stdoutOutput.join('')
    expect(out).toContain('totallymadeupfield: val')
  })

  it('strips surrounding quotes from tags', async () => {
    mockStdin("---\ntitle: uv\ntags: 'PythonTools'\n---\n")
    const { runValidate } = await import('../../../src/commands/validate.ts')
    await runValidate('Blip', {})
    const out = stdoutOutput.join('')
    expect(out).toContain('tags: PythonTools')
    expect(out).not.toContain("'PythonTools'")
  })
})

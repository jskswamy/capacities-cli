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

import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import { describe, it, expect, beforeEach, afterEach } from 'vitest'

describe('config', () => {
  let tmpDir: string
  let savedEnv: Record<string, string | undefined>

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cap-config-'))
    savedEnv = {
      XDG_CONFIG_HOME: process.env.XDG_CONFIG_HOME,
      XDG_CACHE_HOME: process.env.XDG_CACHE_HOME,
      XDG_DATA_HOME: process.env.XDG_DATA_HOME,
      CAPACITIES_CONFIG: process.env.CAPACITIES_CONFIG,
      CAPACITIES_SPACE: process.env.CAPACITIES_SPACE,
    }
    process.env.XDG_CONFIG_HOME = tmpDir
    process.env.XDG_CACHE_HOME = tmpDir
    process.env.XDG_DATA_HOME = tmpDir
  })

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true })
    for (const [k, v] of Object.entries(savedEnv)) {
      if (v === undefined) delete process.env[k]
      else process.env[k] = v
    }
  })

  it('getConfigPath uses XDG_CONFIG_HOME', async () => {
    const { getConfigPath } = await import('../../src/config.ts')
    expect(getConfigPath()).toBe(path.join(tmpDir, 'capacities', 'config.toml'))
  })

  it('CAPACITIES_CONFIG overrides config path', async () => {
    process.env.CAPACITIES_CONFIG = '/tmp/custom.toml'
    const { getConfigPath } = await import('../../src/config.ts')
    expect(getConfigPath()).toBe('/tmp/custom.toml')
    delete process.env.CAPACITIES_CONFIG
  })

  it('readConfig returns empty object when file missing', async () => {
    const { readConfig } = await import('../../src/config.ts')
    expect(readConfig()).toEqual({})
  })

  it('writeConfig and readConfig round-trip', async () => {
    const { writeConfig, readConfig } = await import('../../src/config.ts')
    writeConfig({ active_space: 'personal', spaces: { personal: { objects_dir: '/tmp/objs' } } })
    const cfg = readConfig()
    expect(cfg.active_space).toBe('personal')
    expect(cfg.spaces?.personal?.objects_dir).toBe('/tmp/objs')
  })

  it('getActiveSpaceName returns flag override', async () => {
    const { getActiveSpaceName } = await import('../../src/config.ts')
    expect(getActiveSpaceName('work')).toBe('work')
  })

  it('getActiveSpaceName reads CAPACITIES_SPACE env', async () => {
    process.env.CAPACITIES_SPACE = 'staging'
    const { getActiveSpaceName } = await import('../../src/config.ts')
    expect(getActiveSpaceName()).toBe('staging')
    delete process.env.CAPACITIES_SPACE
  })
})

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
import * as smolToml from 'smol-toml'
import { CapacitiesError, ExitCode } from './errors.ts'

export type SpaceConfig = { objects_dir?: string }
export type Config = { active_space?: string; spaces?: Record<string, SpaceConfig> }

export type ResolvedSpace = {
  name: string
  objectsDir: string
  authType: 'api_token' | 'oauth'
  apiToken?: string
  clientId?: string
  accessToken?: string
  refreshToken?: string
  expiresAt?: number
}

function configHome(): string { return process.env.XDG_CONFIG_HOME ?? path.join(os.homedir(), '.config') }
function cacheHome(): string  { return process.env.XDG_CACHE_HOME  ?? path.join(os.homedir(), '.cache') }
function getDataHome(): string { return process.env.XDG_DATA_HOME ?? path.join(os.homedir(), '.local', 'share') }

export function getConfigPath(): string {
  return process.env.CAPACITIES_CONFIG ?? path.join(configHome(), 'capacities', 'config.toml')
}
function getSpacesDir(): string { return path.join(configHome(), 'capacities', 'spaces') }
export function getSpaceFile(name: string): string { return path.join(getSpacesDir(), `${name}.age`) }
export function getAgeKeyFile(): string {
  return process.env.CAPACITIES_AGE_KEY_FILE ?? path.join(configHome(), 'age', 'capacities.txt')
}
export function getCacheDir(spaceName: string): string {
  const base = process.env.CAPACITIES_CACHE_DIR ?? path.join(cacheHome(), 'capacities')
  return path.join(base, spaceName)
}
export function getDefaultObjectsDir(spaceName: string): string {
  return process.env.CAPACITIES_OBJECTS_DIR
    ?? path.join(getDataHome(), 'capacities', spaceName, 'objects')
}

export function readConfig(): Config {
  const p = getConfigPath()
  if (!fs.existsSync(p)) return {}
  return smolToml.parse(fs.readFileSync(p, 'utf8')) as Config
}

export function writeConfig(config: Config): void {
  const p = getConfigPath()
  fs.mkdirSync(path.dirname(p), { recursive: true })
  fs.writeFileSync(p, serializeConfig(config), 'utf8')
}

function serializeConfig(config: Config): string {
  const lines: string[] = []
  if (config.active_space) lines.push(`active_space = ${JSON.stringify(config.active_space)}`, '')
  for (const [name, space] of Object.entries(config.spaces ?? {})) {
    lines.push(`[spaces.${name}]`)
    if (space.objects_dir) lines.push(`objects_dir = ${JSON.stringify(space.objects_dir)}`)
    lines.push('')
  }
  return lines.join('\n').trimEnd() + '\n'
}

export function getActiveSpaceName(flagOverride?: string): string {
  if (flagOverride) return flagOverride
  if (process.env.CAPACITIES_SPACE) return process.env.CAPACITIES_SPACE
  const config = readConfig()
  if (config.active_space) return config.active_space
  const spaces = Object.keys(config.spaces ?? {})
  if (spaces.length === 1) return spaces[0]
  throw new CapacitiesError(ExitCode.CONFIG, 'No active space. Run: capacities auth use <name>')
}

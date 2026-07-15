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

// src/commands/auth.ts
import { Command } from 'commander'
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import * as readline from 'readline'
import { spawnSync } from 'child_process'
import {
  readConfig, writeConfig, getSpaceFile, getDefaultObjectsDir,
  type ResolvedSpace,
} from '../config.ts'
import { decryptSecrets, encryptSecrets, generateAgeKeypair } from '../secrets.ts'
import { createClient } from '../client.ts'
import { cacheDeleteSpace } from '../cache.ts'
import { CapacitiesError, ExitCode, exit, handleApiError } from '../errors.ts'
import { printLine, printTable, type OutputOptions } from '../output.ts'

export function listSpaces(opts: OutputOptions): void {
  const config = readConfig()
  const spaces = Object.entries(config.spaces ?? {})
  if (spaces.length === 0) {
    printLine('no spaces configured. Run: capacities auth add <name>', opts)
    return
  }
  const active = config.active_space
  printTable(
    spaces.map(([name, sp]) => ({
      ' ': name === active ? '*' : ' ',
      name,
      objects_dir: sp.objects_dir ?? '(default)',
    })),
    opts
  )
}

function resolveEditor(): string {
  return process.env.VISUAL ?? process.env.EDITOR ?? 'vi'
}

function openEditor(file: string): void {
  const editor = resolveEditor()
  const result = spawnSync(editor, [file], { stdio: 'inherit' })
  if (result.error) throw new CapacitiesError(ExitCode.UNEXPECTED, `Editor failed: ${result.error.message}`)
}

function promptLine(question: string, defaultVal: string): Promise<string> {
  return new Promise(resolve => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
    rl.question(`${question} [${defaultVal}]: `, (answer) => {
      rl.close()
      resolve(answer.trim() || defaultVal)
    })
  })
}

export async function addSpace(name: string, opts: OutputOptions): Promise<void> {
  const defaultObjDir = getDefaultObjectsDir(name)
  const objectsDir = await promptLine('Objects directory', defaultObjDir)

  const template = [
    `# Space: ${name}`,
    `# Paste your Capacities API token below.`,
    `# Get it from: Capacities Settings → Capacities API → New Token`,
    `# Or set auth_type = "oauth" and run: capacities auth oauth ${name}`,
    ``,
    `auth_type = "api_token"`,
    `api_token = ""`,
  ].join('\n')

  const tmpFile = path.join(os.tmpdir(), `cap-auth-${name}-${process.pid}.toml`)
  fs.writeFileSync(tmpFile, template, { mode: 0o600 })

  try {
    openEditor(tmpFile)
    const content = fs.readFileSync(tmpFile, 'utf8')

    if (content === template || content.includes(`api_token = ""`)) {
      exit(ExitCode.CONFIG)
    }

    // Validate TOML
    const { parse } = await import('smol-toml')
    const parsed = parse(content) as { auth_type: string; api_token?: string }

    if (parsed.auth_type === 'api_token') {
      if (!parsed.api_token?.startsWith('cap-api-')) {
        throw new CapacitiesError(ExitCode.CONFIG, `Invalid token format. Expected "cap-api-..." prefix.`)
      }
      // Verify token is live
      const client = createClient({ name, objectsDir, authType: 'api_token', apiToken: parsed.api_token } as ResolvedSpace)
      try {
        await client.space.get()
      } catch (err) {
        throw new CapacitiesError(ExitCode.CONFIG, `Token verification failed. Check the token is valid.`, err)
      }
    }

    await encryptSecrets(getSpaceFile(name), parsed as Parameters<typeof encryptSecrets>[1])

    const config = readConfig()
    config.spaces ??= {}
    config.spaces[name] ??= {}
    config.spaces[name].objects_dir = objectsDir
    if (!config.active_space) config.active_space = name
    writeConfig(config)

    printLine(`Space "${name}" added.`, opts)
  } finally {
    if (fs.existsSync(tmpFile)) fs.unlinkSync(tmpFile)
  }
}

export async function editSpace(name: string, opts: OutputOptions): Promise<void> {
  const spaceFile = getSpaceFile(name)
  const secrets = await decryptSecrets(spaceFile)

  const serializeSecrets = (s: typeof secrets) => {
    const lines = [`auth_type = "${s.auth_type}"`]
    if (s.api_token) lines.push(`api_token = "${s.api_token}"`)
    if (s.client_id) lines.push(`client_id = "${s.client_id}"`)
    if (s.access_token) lines.push(`access_token = "${s.access_token}"`)
    if (s.refresh_token) lines.push(`refresh_token = "${s.refresh_token}"`)
    if (s.expires_at) lines.push(`expires_at = ${s.expires_at}`)
    return lines.join('\n') + '\n'
  }

  const original = serializeSecrets(secrets)
  const tmpFile = path.join(os.tmpdir(), `cap-edit-${name}-${process.pid}.toml`)
  fs.writeFileSync(tmpFile, original, { mode: 0o600 })

  try {
    openEditor(tmpFile)
    const updated = fs.readFileSync(tmpFile, 'utf8')
    if (updated === original) { printLine('No changes.', opts); return }

    const { parse } = await import('smol-toml')
    const parsed = parse(updated) as Parameters<typeof encryptSecrets>[1]
    await encryptSecrets(spaceFile, parsed)
    printLine(`Space "${name}" updated.`, opts)
  } finally {
    if (fs.existsSync(tmpFile)) fs.unlinkSync(tmpFile)
  }
}

export function useSpace(name: string, opts: OutputOptions): void {
  const config = readConfig()
  if (!config.spaces?.[name]) {
    throw new CapacitiesError(ExitCode.CONFIG, `Space "${name}" not found. Run: capacities auth list`)
  }
  config.active_space = name
  writeConfig(config)
  printLine(`Active space set to "${name}".`, opts)
}

export function removeSpace(name: string, opts: OutputOptions): void {
  const config = readConfig()
  if (config.spaces?.[name]) delete config.spaces[name]
  if (config.active_space === name) delete config.active_space
  writeConfig(config)

  const spaceFile = getSpaceFile(name)
  if (fs.existsSync(spaceFile)) fs.unlinkSync(spaceFile)

  cacheDeleteSpace(name)
  printLine(`Space "${name}" removed.`, opts)
}

export async function keygenCommand(opts: OutputOptions): Promise<void> {
  const keyFile = path.join(os.homedir(), '.age', 'key.txt')
  if (fs.existsSync(keyFile)) {
    throw new CapacitiesError(ExitCode.CONFIG, `Key file already exists: ${keyFile}. Delete it first to regenerate.`)
  }
  const { identity, recipient } = await generateAgeKeypair()
  fs.mkdirSync(path.dirname(keyFile), { recursive: true })
  fs.writeFileSync(keyFile, `# created by capacities auth keygen\n# public key: ${recipient}\n${identity}\n`, { mode: 0o600 })
  printLine(`Age key generated: ${keyFile}`, opts)
  printLine(`Public recipient:  ${recipient}`, opts)
}

export function registerAuth(program: Command): void {
  const auth = program.command('auth').description('Manage space credentials')

  auth.command('add <name>').description('Add a new space').action(async (name: string) => {
    const opts = program.opts()
    await addSpace(name, opts).catch(handleApiError)
  })

  auth.command('edit <name>').description('Edit secrets for a space').action(async (name: string) => {
    const opts = program.opts()
    await editSpace(name, opts).catch(handleApiError)
  })

  auth.command('use <name>').description('Set active space').action((name: string) => {
    useSpace(name, program.opts())
  })

  auth.command('list').description('List configured spaces').action(() => {
    listSpaces(program.opts())
  })

  auth.command('remove <name>').description('Remove a space').action((name: string) => {
    removeSpace(name, program.opts())
  })

  auth.command('keygen').description('Generate age keypair').action(async () => {
    await keygenCommand(program.opts())
  })
}

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
  readConfig, writeConfig, getSpaceFile, getDefaultObjectsDir, getAgeKeyFile,
  type ResolvedSpace,
} from '../config.ts'
import { decryptSecrets, encryptSecrets, generateAgeKeypair, serializeSecrets } from '../secrets.ts'
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

async function editWithTempFile(
  prefix: string,
  initial: string,
  onSave: (content: string) => Promise<void>
): Promise<void> {
  const tmpFile = path.join(os.tmpdir(), `${prefix}-${process.pid}.toml`)
  fs.writeFileSync(tmpFile, initial, { mode: 0o600 })
  try {
    openEditor(tmpFile)
    await onSave(fs.readFileSync(tmpFile, 'utf8'))
  } finally {
    if (fs.existsSync(tmpFile)) fs.unlinkSync(tmpFile)
  }
}

async function saveSpace(
  name: string,
  objectsDir: string,
  token: string,
  opts: OutputOptions
): Promise<void> {
  if (!token.startsWith('cap-api-')) {
    throw new CapacitiesError(ExitCode.CONFIG, `Invalid token format. Expected "cap-api-..." prefix.`)
  }
  const client = createClient({ name, objectsDir, authType: 'api_token', apiToken: token } as ResolvedSpace)
  try {
    await client.space.get()
  } catch (err) {
    throw new CapacitiesError(ExitCode.CONFIG, `Token verification failed. Check the token is valid.`, err)
  }
  await encryptSecrets(getSpaceFile(name), { auth_type: 'api_token', api_token: token })
  const config = readConfig()
  config.spaces ??= {}
  config.spaces[name] ??= {}
  config.spaces[name].objects_dir = objectsDir
  if (!config.active_space) config.active_space = name
  writeConfig(config)
  printLine(`Space "${name}" added.`, opts)
}

export async function addSpace(
  name: string,
  opts: OutputOptions,
  token?: string
): Promise<void> {
  const defaultObjDir = getDefaultObjectsDir(name)
  const objectsDir = await promptLine('Objects directory', defaultObjDir)

  if (token) {
    await saveSpace(name, objectsDir, token, opts)
    return
  }

  const template = [
    `# Space: ${name}`,
    `# Paste your Capacities API token below.`,
    `# Get it from: Capacities Settings → Capacities API → New Token`,
    ``,
    `auth_type = "api_token"`,
    `api_token = ""`,
  ].join('\n')

  await editWithTempFile(`cap-auth-${name}`, template, async (content) => {
    if (content === template || content.includes(`api_token = ""`)) {
      throw new CapacitiesError(ExitCode.CONFIG, `No token entered. Re-run with --token cap-api-... to skip the editor.`)
    }
    const { parse } = await import('smol-toml')
    const parsed = parse(content) as { auth_type: string; api_token?: string }
    if (parsed.auth_type === 'api_token') {
      await saveSpace(name, objectsDir, parsed.api_token ?? '', opts)
    }
  })
}

export async function editSpace(name: string, opts: OutputOptions): Promise<void> {
  const spaceFile = getSpaceFile(name)
  const secrets = await decryptSecrets(spaceFile)

  const original = serializeSecrets(secrets)

  await editWithTempFile(`cap-edit-${name}`, original, async (updated) => {
    if (updated === original) { printLine('No changes.', opts); return }

    const { parse } = await import('smol-toml')
    const parsed = parse(updated) as Parameters<typeof encryptSecrets>[1]
    await encryptSecrets(spaceFile, parsed)
    printLine(`Space "${name}" updated.`, opts)
  })
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
  const keyFile = getAgeKeyFile()
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

  auth.command('add <name>').description('Add a new space')
    .option('--token <token>', 'API token (skips editor)')
    .action(async (name: string, cmdOpts: { token?: string }) => {
      const opts = program.opts()
      await addSpace(name, opts, cmdOpts.token).catch(handleApiError)
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

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

// src/commands/open.ts
import { execFileSync } from 'child_process'
import { Command } from 'commander'
import { type ResolvedSpace } from '../config.ts'
import { resolveSpace } from './_space.ts'
import { createClient } from '../client.ts'
import { fetchWithCache, TTL } from '../cache.ts'
import { handleApiError, CapacitiesError, ExitCode } from '../errors.ts'
import { printLine, type CommandOptions } from '../output.ts'

const WEB_BASE = 'https://app.capacities.io'

async function fetchSpaceId(space: ResolvedSpace): Promise<string> {
  const resp = await fetchWithCache<{ id: string; title: string }>(
    space.name,
    'space.json',
    TTL.STRUCTURES,
    () => createClient(space).space.get() as Promise<{ id: string; title: string }>
  )
  return resp.id
}

function isHeadless(): boolean {
  return !process.stdout.isTTY || !!process.env.CI
}

function launchUrl(url: string): void {
  try {
    if (process.platform === 'darwin') execFileSync('open', [url])
    else if (process.platform === 'win32') execFileSync('cmd', ['/c', 'start', '', url])
    else execFileSync('xdg-open', [url])
  } catch (e) {
    throw new CapacitiesError(ExitCode.UNEXPECTED, `Could not open browser: ${(e as Error).message}`)
  }
}

export async function runOpen(objectId: string, opts: CommandOptions & { print?: boolean }): Promise<void> {
  const space = await resolveSpace(opts.space)
  const spaceId = await fetchSpaceId(space)
  const url = `${WEB_BASE}/${spaceId}/${objectId}`

  if (opts.print || isHeadless()) {
    printLine(url, opts)
    return
  }
  launchUrl(url)
}

export function registerOpen(program: Command): void {
  program
    .command('open <objectId>')
    .description('Open an object in the Capacities web app')
    .option('--print', 'print URL instead of opening')
    .action(async (objectId: string, cmdOpts: { print?: boolean }) => {
      const globalOpts = program.opts() as CommandOptions
      await runOpen(objectId, { ...globalOpts, print: cmdOpts.print }).catch(handleApiError)
    })
}

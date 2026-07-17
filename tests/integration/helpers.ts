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

// tests/integration/helpers.ts
import { http, HttpResponse } from 'msw'
import { setupServer } from 'msw/node'
import OpenAPIBackend from 'openapi-backend'
import { readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import { ExitError, CapacitiesError, toExitCode, formatError } from '../../src/errors.ts'
import { CommanderError } from 'commander'
import { Readable } from 'stream'
import { vi } from 'vitest'

const __dirname = dirname(fileURLToPath(import.meta.url))
const spec = JSON.parse(readFileSync(join(__dirname, '../fixtures/openapi.json'), 'utf8'))

export const api = new OpenAPIBackend({ definition: spec, validate: true })
await api.init()

export const server = setupServer()

export type CLIResult = { exitCode: number; stdout: string; stderr: string }

export async function runCLI(args: string[], env: Record<string, string> = {}): Promise<CLIResult> {
  const stdoutChunks: string[] = []
  const stderrChunks: string[] = []

  const origStdoutWrite = process.stdout.write.bind(process.stdout)
  const origStderrWrite = process.stderr.write.bind(process.stderr)
  const origEnv = { ...process.env }

  process.stdout.write = ((chunk: string) => { stdoutChunks.push(chunk); return true }) as typeof process.stdout.write
  process.stderr.write = ((chunk: string) => { stderrChunks.push(chunk); return true }) as typeof process.stderr.write
  Object.assign(process.env, env)

  let exitCode = 0
  try {
    const { createCLI } = await import('../../src/index.ts')
    const program = createCLI()
    await program.parseAsync(['node', 'capacities', ...args])
  } catch (err) {
    if (err instanceof ExitError) exitCode = err.code
    else if (err instanceof CommanderError) exitCode = err.exitCode
    else if (err instanceof CapacitiesError) { process.stderr.write(formatError(err) + '\n'); exitCode = toExitCode(err) }
    else exitCode = 1
  } finally {
    process.stdout.write = origStdoutWrite
    process.stderr.write = origStderrWrite
    // Restore env
    for (const key of Object.keys(process.env)) {
      if (!(key in origEnv)) delete process.env[key]
    }
    Object.assign(process.env, origEnv)
  }

  return { exitCode, stdout: stdoutChunks.join(''), stderr: stderrChunks.join('') }
}

export function withStdin(content: string): void {
  vi.spyOn(process, 'stdin', 'get').mockReturnValue(
    Readable.from([Buffer.from(content)]) as any
  )
}

export { http, HttpResponse }

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

// src/index.ts
import { realpathSync } from 'fs'
import { Command, CommanderError } from 'commander'
import { ExitError, ExitCode, CapacitiesError, toExitCode, formatError } from './errors.ts'
import { logger } from './logger.ts'
import { registerAuth } from './commands/auth.ts'
import { registerSearch } from './commands/search.ts'
import { registerGet } from './commands/get.ts'
import { registerLink } from './commands/link.ts'
import { registerCreate } from './commands/create.ts'
import { registerUpdate } from './commands/update.ts'
import { registerDailyNote } from './commands/daily-note.ts'
import { registerValidate } from './commands/validate.ts'
import { registerTypes } from './commands/types.ts'
import { registerOpen } from './commands/open.ts'
import { registerSave } from './commands/save.ts'

export function createCLI(): Command {
  const program = new Command('capacities')
  program
    .version('0.1.0')
    .exitOverride()
    .option('-s, --space <name>', 'override active space')
    .option('--json', 'output raw JSON')
    .option('-q, --quiet', 'suppress output')
    .option('--no-color', 'disable ANSI colors', false)
    .option('--debug', 'set log level to debug for this invocation', false)
    .hook('preAction', (thisCommand) => {
      const opts = thisCommand.opts()
      if (opts.debug) process.env.CAPACITIES_LOG_LEVEL = 'debug'
      if (opts.noColor || opts.color === false) process.env.NO_COLOR = '1'
    })

  registerAuth(program)
  registerSearch(program)
  registerGet(program)
  registerLink(program)
  registerCreate(program)
  registerUpdate(program)
  registerDailyNote(program)
  registerValidate(program)
  registerTypes(program)
  registerOpen(program)
  registerSave(program)

  return program
}

// Entry point when executed directly — resolve symlinks so `capacities` → dist/index.js works
const isMain = (() => {
  try {
    const real = realpathSync(process.argv[1] ?? '')
    return real.endsWith('index.js') || real.endsWith('index.ts')
  } catch { return false }
})()
if (isMain) {
  const program = createCLI()
  program.parseAsync(process.argv).catch((err: unknown) => {
    if (err instanceof ExitError) process.exit(err.code)
    if (err instanceof CommanderError) process.exit(err.exitCode)
    if (err instanceof CapacitiesError) { logger.error(formatError(err)); process.exit(toExitCode(err)) }
    logger.error(formatError(err))
    process.exit(ExitCode.UNEXPECTED)
  })
}

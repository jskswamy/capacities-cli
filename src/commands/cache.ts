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

// src/commands/cache.ts
import { Command } from 'commander'
import { getActiveSpaceName, getCacheDir } from '../config.ts'
import { cacheDeleteSpace } from '../cache.ts'
import { printLine, type CommandOptions } from '../output.ts'

export function runClearCache(opts: CommandOptions): void {
  const name = getActiveSpaceName(opts.space)
  cacheDeleteSpace(name)
  printLine(`Cleared cache for space "${name}" (${getCacheDir(name)}).`, opts)
}

export function registerClearCache(program: Command): void {
  program
    .command('clear-cache')
    .summary('Delete the local cache for a space')
    .description(
      'Delete the local cache for a space (structures, cached objects, search results).\n\n' +
        'Structures are cached for 24h with no automatic invalidation, so a type or\n' +
        'property renamed in the Capacities app (e.g. Research -> Evergreen Note)\n' +
        'stays stale locally until this is run or the cache expires on its own.'
    )
    .action(() => {
      runClearCache(program.opts())
    })
}

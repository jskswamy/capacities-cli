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

// src/commands/update.ts
import { Command } from 'commander'
import { resolveSpace } from './_space.ts'
import { createClient } from '../client.ts'
import { cacheBust } from '../cache.ts'
import { writeObjectFile } from '../objects.ts'
import { handleApiError } from '../errors.ts'
import { printLine, type OutputOptions } from '../output.ts'
import { logger } from '../logger.ts'

export async function runUpdate(
  objectId: string,
  propertyKey: string,
  value: string,
  opts: OutputOptions & { space?: string }
): Promise<void> {
  const space = await resolveSpace(opts.space)
  const client = createClient(space)

  await client.object.update({
    id: objectId,
    properties: {
      [propertyKey]: { type: 'text', text: { value } },
    },
  } as any)

  cacheBust(space.name, `object/${objectId}.json`)

  // Write-through: fetch fresh markdown and rewrite objectsDir
  if (space.objectsDir) {
    try {
      const markdown = await client.object.markdown.get({ objectId })
      const typeMatch = markdown.match(/^type:\s*(.+)$/m)
      const titleMatch = markdown.match(/^title:\s*(.+)$/m)
      if (typeMatch && titleMatch) {
        writeObjectFile(space.objectsDir, typeMatch[1].trim(), titleMatch[1].trim(), markdown)
      }
    } catch (e) {
      logger.warn(`objectsDir rewrite failed: ${e instanceof Error ? e.message : String(e)}`)
    }
  }

  printLine(`Updated ${propertyKey} on ${objectId}`, opts)
}

export function registerUpdate(program: Command): void {
  program
    .command('update <objectId> <propertyKey> <value>')
    .description('Update a scalar property on an object')
    .action(async (objectId: string, propertyKey: string, value: string) => {
      await runUpdate(objectId, propertyKey, value, program.opts()).catch(handleApiError)
    })
}

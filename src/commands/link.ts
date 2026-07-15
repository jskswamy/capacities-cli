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

// src/commands/link.ts
import { Command } from 'commander'
import { resolveSpace } from './_space.ts'
import { createClient } from '../client.ts'
import { cacheBust } from '../cache.ts'
import { writeObjectFile } from '../objects.ts'
import { handleApiError } from '../errors.ts'
import { printLine, type OutputOptions } from '../output.ts'
import { logger } from '../logger.ts'

export async function runLink(
  objectId: string,
  propertyKey: string,
  targetIds: string[],
  opts: OutputOptions & { space?: string }
): Promise<void> {
  const space = await resolveSpace(opts.space)
  const client = createClient(space)

  await client.object.update({
    id: objectId,
    properties: {
      [propertyKey]: {
        type: 'entity',
        entity: targetIds.map(id => ({ id })),
      },
    },
  } as any)

  cacheBust(space.name, `object/${objectId}.json`)
  logger.debug(`cache busted object/${objectId}.json after link`)

  // Write-through: fetch updated markdown and persist to objectsDir
  if (space.objectsDir) {
    try {
      const markdown = await client.object.markdown.get({ objectId })
      // Parse type and title from markdown frontmatter for file path
      const typeMatch = (typeof markdown === 'string' ? markdown : '').match(/^type:\s*(.+)$/m)
      const titleMatch = (typeof markdown === 'string' ? markdown : '').match(/^title:\s*(.+)$/m)
      if (typeMatch && titleMatch) {
        writeObjectFile(space.objectsDir, typeMatch[1].trim(), titleMatch[1].trim(), typeof markdown === 'string' ? markdown : '')
      }
    } catch (e) {
      logger.warn(`objectsDir write failed: ${e instanceof Error ? e.message : String(e)}`)
    }
  }

  printLine(`Linked ${targetIds.length} target(s) to ${propertyKey} on ${objectId}`, opts)
}

export function registerLink(program: Command): void {
  program
    .command('link <objectId> <propertyKey> <targetIds...>')
    .description('Set entity property (replaces current value)')
    .action(async (objectId: string, propertyKey: string, targetIds: string[]) => {
      await runLink(objectId, propertyKey, targetIds, program.opts()).catch(handleApiError)
    })
}

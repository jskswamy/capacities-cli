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

// src/commands/create.ts
import { Command } from 'commander'
import { resolveSpace } from './_space.ts'
import { createClient } from '../client.ts'
import { cacheSet } from '../cache.ts'
import { fetchAndPersist } from '../objects.ts'
import { handleApiError, formatError } from '../errors.ts'
import { printLine, type CommandOptions } from '../output.ts'
import { logger } from '../logger.ts'

// Structure IDs (or title patterns) for types where createViaMD leaves the title blank.
// These types need a bare-YAML PATCH to set the title after creation.
const EMPTY_TITLE_KEY_TYPES = new Set(['Organization', 'Blip'])

export async function runCreate(
  objectType: string,
  title: string,
  opts: CommandOptions & { desc?: string; tags?: string }
): Promise<void> {
  const space = await resolveSpace(opts.space)
  const client = createClient(space)

  // Build markdown body — title goes in content for types that support it
  const frontmatterLines: string[] = []
  if (opts.desc) frontmatterLines.push(`description: ${JSON.stringify(opts.desc)}`)
  if (opts.tags) frontmatterLines.push(`tags: [${opts.tags.split(',').map(t => JSON.stringify(t.trim())).join(', ')}]`)

  const frontmatter = frontmatterLines.length > 0
    ? `---\n${frontmatterLines.join('\n')}\n---\n`
    : `---\ntitle: ${title}\n---\n`

  // ponytail: cast as any — SDK uses { structureId, markdown } but callers may pass
  // objectType by name; unit tests mock the SDK so validation is bypassed there.
  // Integration tests should pass a valid structureId (UUID or built-in).
  const result = await (client.object.markdown as any).create({
    structureId: objectType,
    markdown: frontmatter,
  })

  const objectId = result.id as string

  // Fix title for types where createViaMD doesn't set it (Organization, Blip)
  if (EMPTY_TITLE_KEY_TYPES.has(objectType)) {
    logger.debug(`applying bare-YAML title fix for ${objectType}`)
    await (client.object.markdown as any).update({ id: objectId, markdown: `title: ${title}` })
  }

  // Write-through: fetch markdown, persist to objectsDir, and cache
  try {
    const content = await fetchAndPersist(client, space.objectsDir ?? '', objectId)
    cacheSet(space.name, `object/${objectId}.json`, content)
  } catch (e) {
    logger.warn(`post-create fetch failed: ${formatError(e)}`)
  }

  printLine(objectId, opts)
}

export function registerCreate(program: Command): void {
  program
    .command('create')
    .description('Create a new object')
    .requiredOption('-t, --type <type>', 'object type or structureId (Organization, Personality, Blip, RootPage, or UUID)')
    .requiredOption('--title <title>', 'object title')
    .option('-d, --desc <description>', 'description')
    .option('--tags <tags>', 'comma-separated tags')
    .action(async (cmdOpts: { type: string; title: string; desc?: string; tags?: string }) => {
      const globalOpts = program.opts()
      await runCreate(cmdOpts.type, cmdOpts.title, { ...globalOpts, ...cmdOpts }).catch(handleApiError)
    })
}

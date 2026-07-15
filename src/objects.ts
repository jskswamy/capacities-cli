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

// src/objects.ts
import * as fs from 'fs'
import * as path from 'path'
import { logger } from './logger.ts'

const TYPE_FOLDER: Record<string, string> = {
  Personality: 'personalities',
  Organization: 'organizations',
  Blip: 'blips',
  Tag: 'tags',
  Task: 'tasks',
  Page: 'pages',
}

function typeFolder(objectType: string): string {
  return TYPE_FOLDER[objectType] ?? objectType.toLowerCase() + 's'
}

export function writeObjectFile(
  objectsDir: string,
  objectType: string,
  title: string,
  markdownContent: string
): void {
  const dir = path.join(objectsDir, typeFolder(objectType))
  const file = path.join(dir, `${title}.md`)
  fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(file, markdownContent, 'utf8')
  logger.debug(`wrote objectsDir ${file}`)
}

type MarkdownClient = { object: { markdown: { get(p: { id: string }): Promise<unknown> } } }

export async function fetchAndPersist(
  client: MarkdownClient,
  objectsDir: string,
  objectId: string
): Promise<string> {
  const resp = await client.object.markdown.get({ id: objectId })
  const markdown = typeof resp === 'string' ? resp : (resp as { markdown?: string }).markdown ?? ''
  if (objectsDir && markdown) {
    const typeMatch = markdown.match(/^type:\s*(.+)$/m)
    const titleMatch = markdown.match(/^title:\s*(.+)$/m)
    if (typeMatch && titleMatch) {
      writeObjectFile(objectsDir, typeMatch[1].trim(), titleMatch[1].trim(), markdown)
    }
  }
  return markdown
}

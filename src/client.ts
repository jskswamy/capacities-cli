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

// src/client.ts
import { CapacitiesClient } from '@capacities/api'
import { getSpaceFile } from './config.ts'
import { CapacitiesError, ExitCode } from './errors.ts'
import { encryptSecrets } from './secrets.ts'
import type { ResolvedSpace } from './config.ts'
import type { OAuthTokens } from '@capacities/api'

// The API has no "replace body" endpoint — only create, append, and a frontmatter-only
// PATCH. Body replacement is simulated here as append-then-delete-old (never delete-then-append),
// so a failure anywhere in this sequence leaves duplicate content, never lost content.
export async function replaceBody(client: CapacitiesClient, objectId: string, markdown: string): Promise<void> {
  const before = (await client.object.get({ id: objectId })) as unknown as { blocks?: Record<string, { id: string }[]> }
  // blocks is keyed by the structure's content property id, which varies per structure —
  // flatten across all keys rather than assuming a fixed key like "content"
  const oldBlockIds = Object.values(before.blocks ?? {})
    .flat()
    .map((b) => b.id)

  await (client.blocks as any).append({ id: objectId, markdown, position: { type: 'end' } })

  const remaining: string[] = []
  for (const blockId of oldBlockIds) {
    try {
      await (client.blocks as any).block.delete({ objectId, blockId })
    } catch {
      remaining.push(blockId)
    }
  }
  if (remaining.length > 0) {
    throw new CapacitiesError(
      ExitCode.API,
      `New content appended, but ${remaining.length} old block(s) could not be removed — ` +
        `object now has duplicate content. Remaining block ids: ${remaining.join(', ')}`
    )
  }
}

export function createClient(space: ResolvedSpace): CapacitiesClient {
  if (space.authType === 'api_token') {
    return new CapacitiesClient({ apiToken: space.apiToken! })
  }

  const tokens: OAuthTokens = {
    accessToken: space.accessToken!,
    refreshToken: space.refreshToken!,
    expiresAt: space.expiresAt,
  }

  return new CapacitiesClient({
    oauth: {
      tokens,
      clientId: space.clientId!,
      onTokenRefreshed: async (newTokens) => {
        await encryptSecrets(getSpaceFile(space.name), {
          auth_type: 'oauth',
          client_id: space.clientId!,
          access_token: newTokens.accessToken,
          refresh_token: newTokens.refreshToken,
          expires_at: newTokens.expiresAt,
        })
      },
    },
  })
}

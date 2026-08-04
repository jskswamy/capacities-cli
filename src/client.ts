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
import type { OAuthTokens } from '@capacities/api'
import type { ResolvedSpace } from './config.ts'
import { encryptSecrets } from './secrets.ts'
import { getSpaceFile } from './config.ts'
import * as fs from 'fs'
import * as path from 'path'

const API_BASE = 'https://api.capacities.io'

function dbg(msg: string): void {
  if (process.env.CAPACITIES_LOG_LEVEL === 'debug') process.stderr.write(`[capacities:debug] ${msg}\n`)
}

// ponytail: raw fetch — SDK doesn't expose PATCH /object/markdown
export async function patchMarkdown(space: ResolvedSpace, id: string, markdown: string): Promise<void> {
  const token = space.authType === 'api_token' ? space.apiToken : space.accessToken
  dbg(`patchMarkdown → PATCH /object/markdown id=${id} bytes=${markdown.length}`)
  const res = await fetch(`${API_BASE}/object/markdown`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      'x-capacities-api-version': '1.0.0',
    },
    body: JSON.stringify({ id, markdown }),
  })
  const body = await res.text()
  dbg(`patchMarkdown ← ${res.status} body=${body.slice(0, 300)}`)
  if (!res.ok) {
    throw Object.assign(new Error(String(res.status)), { status: res.status })
  }
}

// ponytail: covers common media types; extend when a new type is needed
const MIME_MAP: Record<string, string> = {
  pdf: 'application/pdf',
  jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', gif: 'image/gif', webp: 'image/webp',
  mp3: 'audio/mpeg', m4a: 'audio/mp4', wav: 'audio/wav',
  mp4: 'video/mp4', mov: 'video/quicktime', mkv: 'video/x-matroska',
}

export async function uploadMedia(
  space: ResolvedSpace,
  filePath: string,
  opts: { title?: string; collections?: string[] } = {}
): Promise<string> {
  const buf = fs.readFileSync(filePath)
  const fileName = path.basename(filePath)
  const ext = path.extname(fileName).slice(1).toLowerCase()
  const fileType = MIME_MAP[ext]
  const token = space.authType === 'api_token' ? space.apiToken : space.accessToken
  const authHeader = { Authorization: `Bearer ${token}` }
  const jsonHeaders = { ...authHeader, 'Content-Type': 'application/json' }

  const initRes = await fetch(`${API_BASE}/object/media/upload`, {
    method: 'POST',
    headers: jsonHeaders,
    body: JSON.stringify({
      fileName,
      fileSize: buf.length,
      ...(fileType && { fileType }),
      ...(opts.title && { title: opts.title }),
      ...(opts.collections?.length && { collections: opts.collections }),
    }),
  })
  if (!initRes.ok) throw Object.assign(new Error(String(initRes.status)), { status: initRes.status })
  const { id } = await initRes.json() as { id: string }

  try {
    const putRes = await fetch(`${API_BASE}/object/media/upload/part?id=${id}&partNumber=1`, {
      method: 'PUT',
      headers: { ...authHeader, 'Content-Type': 'application/octet-stream' },
      body: buf,
    })
    if (!putRes.ok) throw Object.assign(new Error(String(putRes.status)), { status: putRes.status })

    const completeRes = await fetch(`${API_BASE}/object/media/upload/complete`, {
      method: 'POST',
      headers: jsonHeaders,
      body: JSON.stringify({ id }),
    })
    if (!completeRes.ok) throw Object.assign(new Error(String(completeRes.status)), { status: completeRes.status })
    const result = await completeRes.json() as { id: string }
    return result.id
  } catch (e) {
    await fetch(`${API_BASE}/object/media/upload/abort`, {
      method: 'POST',
      headers: jsonHeaders,
      body: JSON.stringify({ id }),
    }).catch(() => {})
    throw e
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

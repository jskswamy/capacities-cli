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

// src/cache.ts
import * as crypto from 'crypto'
import * as fs from 'fs'
import * as path from 'path'
import { getCacheDir } from './config.ts'
import { logger } from './logger.ts'

export const TTL = {
  SEARCH: 10 * 60 * 1000,
  OBJECT: 60 * 60 * 1000,
  STRUCTURES: 24 * 60 * 60 * 1000,
} as const

type CacheEntry<T> = { fetchedAt: string; data: T }

function cacheFile(spaceName: string, key: string): string {
  // spaceName/key come from this process's own CLI args and config, not a remote
  // or API-supplied source — no trust boundary is crossed here.
  return path.join(getCacheDir(spaceName), key) // nosemgrep: javascript.lang.security.audit.path-traversal.path-join-resolve-traversal.path-join-resolve-traversal
}

export function cacheGet<T>(spaceName: string, key: string, ttlMs: number): T | null {
  const file = cacheFile(spaceName, key)
  if (!fs.existsSync(file)) {
    logger.debug(`cache miss ${key}`)
    return null
  }
  const entry: CacheEntry<T> = JSON.parse(fs.readFileSync(file, 'utf8'))
  if (Date.now() - new Date(entry.fetchedAt).getTime() > ttlMs) {
    logger.debug(`cache expired ${key}`)
    return null
  }
  logger.debug(`cache hit ${key}`)
  return entry.data
}

export function cacheSet<T>(spaceName: string, key: string, data: T): void {
  const file = cacheFile(spaceName, key)
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, JSON.stringify({ fetchedAt: new Date().toISOString(), data }))
}

export function cacheBust(spaceName: string, key: string): void {
  const file = cacheFile(spaceName, key)
  if (fs.existsSync(file)) fs.unlinkSync(file)
  logger.debug(`cache busted ${key}`)
}

export function cacheDeleteSpace(spaceName: string): void {
  const dir = getCacheDir(spaceName)
  if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true })
}

export function queryHash(query: string, type?: string): string {
  return crypto
    .createHash('sha256')
    .update(`${query}:${type ?? ''}`)
    .digest('hex')
    .slice(0, 16)
}

export async function fetchWithCache<T>(
  spaceName: string,
  key: string,
  ttlMs: number,
  fetch: () => Promise<T>
): Promise<T> {
  const cached = cacheGet<T>(spaceName, key, ttlMs)
  if (cached !== null) return cached
  const data = await fetch()
  cacheSet(spaceName, key, data)
  return data
}

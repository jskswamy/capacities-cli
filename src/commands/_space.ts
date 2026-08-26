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

// src/commands/_space.ts
import { readConfig, getActiveSpaceName, getSpaceFile, type ResolvedSpace } from '../config.ts'
import { decryptSecrets } from '../secrets.ts'

export async function resolveSpace(flagSpace?: string): Promise<ResolvedSpace> {
  const name = getActiveSpaceName(flagSpace)
  const config = readConfig()
  const spaceConfig = config.spaces?.[name] ?? {}
  const objectsDir = spaceConfig.objects_dir ?? ''

  if (process.env.CAPACITIES_TOKEN) {
    return { name, objectsDir, authType: 'api_token', apiToken: process.env.CAPACITIES_TOKEN }
  }

  const secrets = await decryptSecrets(getSpaceFile(name))
  return {
    name,
    objectsDir,
    authType: secrets.auth_type,
    apiToken: secrets.api_token,
    clientId: secrets.client_id,
    accessToken: secrets.access_token,
    refreshToken: secrets.refresh_token,
    expiresAt: secrets.expires_at,
  }
}

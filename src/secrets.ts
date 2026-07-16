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

// src/secrets.ts
import init from 'age-encryption'
import * as fs from 'fs'
import * as path from 'path'
import * as smolToml from 'smol-toml'
import { getAgeKeyFile } from './config.ts'
import { CapacitiesError, ExitCode } from './errors.ts'

// age-encryption 0.1.x exports a default init() that returns the age API object
async function age() { return init() }

export type SecretsToml = {
  auth_type: 'api_token' | 'oauth'
  api_token?: string
  client_id?: string
  access_token?: string
  refresh_token?: string
  expires_at?: number
}

function extractKeyLine(content: string, source: string): string {
  const keyLine = content.split('\n').find(l => l.startsWith('AGE-SECRET-KEY-'))
  if (!keyLine) throw new CapacitiesError(ExitCode.CONFIG, `No AGE-SECRET-KEY-1... line found in ${source}`)
  return keyLine.trim()
}

export function resolveIdentity(): string {
  if (process.env.CAPACITIES_AGE_KEY) {
    const val = process.env.CAPACITIES_AGE_KEY.trim()
    // Accept both a bare key and multi-line key file contents pasted into the env var
    return val.startsWith('AGE-SECRET-KEY-') ? val : extractKeyLine(val, 'CAPACITIES_AGE_KEY')
  }
  const keyFile = getAgeKeyFile()
  if (!fs.existsSync(keyFile)) {
    throw new CapacitiesError(ExitCode.CONFIG, `Age key not found. Run: capacities auth keygen  or set CAPACITIES_AGE_KEY`)
  }
  return extractKeyLine(fs.readFileSync(keyFile, 'utf8'), keyFile)
}

export async function decryptSecrets(spaceFile: string): Promise<SecretsToml> {
  if (!fs.existsSync(spaceFile)) {
    throw new CapacitiesError(ExitCode.CONFIG, `No secrets file. Run: capacities auth add <name>`)
  }
  const identity = resolveIdentity()
  const ciphertext = fs.readFileSync(spaceFile)
  const a = await age()
  const d = new a.Decrypter()
  d.addIdentity(identity)
  try {
    const plaintext = d.decrypt(ciphertext, 'text')
    return smolToml.parse(plaintext) as SecretsToml
  } catch (e) {
    throw new CapacitiesError(ExitCode.CONFIG, `Failed to decrypt secrets: ${e instanceof Error ? e.message : String(e)}`)
  }
}

export async function encryptSecrets(spaceFile: string, secrets: SecretsToml): Promise<void> {
  const identity = resolveIdentity()
  const a = await age()
  let recipient: string
  try {
    recipient = a.identityToRecipient(identity)
  } catch (e) {
    throw new CapacitiesError(ExitCode.CONFIG, `Invalid age identity. CAPACITIES_AGE_KEY must start with AGE-SECRET-KEY-1...`)
  }
  const e = new a.Encrypter()
  e.addRecipient(recipient)
  const ciphertext = e.encrypt(serializeSecrets(secrets))
  fs.mkdirSync(path.dirname(spaceFile), { recursive: true })
  const tmp = spaceFile + '.tmp'
  fs.writeFileSync(tmp, Buffer.from(ciphertext))
  fs.renameSync(tmp, spaceFile)
}

export function serializeSecrets(s: SecretsToml): string {
  const lines = [`auth_type = "${s.auth_type}"`]
  if (s.api_token)    lines.push(`api_token = "${s.api_token}"`)
  if (s.client_id)    lines.push(`client_id = "${s.client_id}"`)
  if (s.access_token) lines.push(`access_token = "${s.access_token}"`)
  if (s.refresh_token) lines.push(`refresh_token = "${s.refresh_token}"`)
  if (s.expires_at !== undefined) lines.push(`expires_at = ${s.expires_at}`)
  return lines.join('\n') + '\n'
}

export async function generateAgeKeypair(): Promise<{ identity: string; recipient: string }> {
  const a = await age()
  const identity = a.generateIdentity()
  const recipient = a.identityToRecipient(identity)
  return { identity, recipient }
}

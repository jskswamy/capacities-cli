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

// src/commands/validate.ts
import { Command } from 'commander'
import { resolveSpace } from './_space.ts'
import { fetchWithCache, TTL } from '../cache.ts'
import { createClient } from '../client.ts'
import { CapacitiesError, ExitCode, exit, handleApiError } from '../errors.ts'
import { readStdin, type CommandOptions } from '../output.ts'

type ValidationResult = {
  valid: boolean
  corrected: string
  errors: { field: string; code: string; message: string }[]
  warnings: { field: string; code: string; from?: string; to?: string; message: string }[]
  filled: string[]
}

// O(m*n) single-row Levenshtein — adequate for short property name strings
function levenshtein(a: string, b: string): number {
  const m = a.length,
    n = b.length
  const row = Array.from({ length: n + 1 }, (_, i) => i)
  for (let i = 1; i <= m; i++) {
    let prev = row[0]!
    row[0] = i
    for (let j = 1; j <= n; j++) {
      const temp = row[j]!
      row[j] = a[i - 1] === b[j - 1] ? prev : 1 + Math.min(prev, row[j - 1]!, row[j]!)
      prev = temp
    }
  }
  return row[n]!
}

// Fields handled explicitly downstream (universals + Weblink fills) — never
// fuzzy-corrected, since e.g. levenshtein("link","ring")===2 would misfire.
const UNIVERSAL_FIELDS = new Set(['type', 'title', 'tags', 'description', 'link', 'iframeurl', 'category'])
const WEBLINK_TYPES = new Set(['Weblink', 'MediaWebResource'])

function parseFrontmatter(raw: string): { fields: Record<string, string>; body: string } {
  const fields: Record<string, string> = {}
  const lines = raw.split('\n')
  if (lines[0]?.trim() !== '---') return { fields, body: raw }
  let i = 1
  while (i < lines.length && lines[i]?.trim() !== '---') {
    const colon = lines[i]!.indexOf(':')
    if (colon > 0) {
      fields[lines[i]!.slice(0, colon).trim()] = lines[i]!.slice(colon + 1).trim()
    }
    i++
  }
  return { fields, body: lines.slice(i + 1).join('\n') }
}

function tryHostname(url: string): string {
  try {
    return new URL(url).hostname
  } catch {
    return ''
  }
}

// 177-line frontmatter validator with a branch per field type; genuinely over the
// complexity:15 limit, needs a real split into per-field validators, not a
// drive-by fix. Tracked separately rather than raising the threshold repo-wide
// for one function.
// eslint-disable-next-line complexity
export async function runValidate(typeName: string, opts: CommandOptions): Promise<void> {
  const space = await resolveSpace(opts.space)
  const client = createClient(space)

  // Phase 0: fetch live type structure
  const resp = (await fetchWithCache(space.name, 'structures.json', TTL.STRUCTURES, () =>
    (client.space as any).structures()
  )) as any
  const structures: any[] = Array.isArray(resp) ? resp : (resp?.structures ?? [])

  const struct = structures.find((s: any) => s.title === typeName)
  if (!struct) throw new CapacitiesError(ExitCode.NOT_FOUND, `Unknown type: ${typeName}`)

  const propDefs: any[] = struct.propertyDefinitions ?? []
  // lower-cased name → property definition
  const knownFields = new Map<string, any>(propDefs.map((p: any) => [p.name.toLowerCase(), p]))
  // lower-cased name → array of valid label strings
  const labelFields = new Map<string, string[]>(
    propDefs
      .filter((p: any) => p.type === 'label' && Array.isArray(p.labelSet))
      .map((p: any) => [p.name.toLowerCase(), (p.labelSet as any[]).map((l: any) => l.name as string)])
  )

  // Phase 1: parse stdin
  const raw = await readStdin()
  const { fields, body } = parseFrontmatter(raw)

  const result: ValidationResult = { valid: true, corrected: '', errors: [], warnings: [], filled: [] }
  const filled: Record<string, string> = { ...fields }

  // Phase 2a: inject type if missing
  if (!filled.type) {
    filled.type = typeName
    result.filled.push('type')
  }

  // Phase 2b: fuzzy field-name correction
  for (const key of Object.keys(filled)) {
    const lk = key.toLowerCase()
    if (UNIVERSAL_FIELDS.has(lk)) continue
    if (!knownFields.has(lk)) {
      let bestDist = Infinity,
        bestKey = ''
      for (const k of knownFields.keys()) {
        const d = levenshtein(lk, k)
        if (d < bestDist) {
          bestDist = d
          bestKey = k
        }
      }
      if (bestDist <= 2 && bestKey) {
        // bestKey is already lowercase (from knownFields.keys())
        result.warnings.push({
          field: key,
          code: 'FIELD_FUZZY',
          from: key,
          to: bestKey,
          message: `Unknown field "${key}", did you mean "${bestKey}"?`,
        })
        filled[bestKey] = filled[key]!
        delete filled[key]
      }
      // unknown with no close match → keep as-is, no warning
    } else if (key !== lk) {
      // Frontmatter keys are always lowercase; Title Case from API name is display-only
      result.warnings.push({
        field: key,
        code: 'FIELD_CASE',
        from: key,
        to: lk,
        message: `Field "${key}" should be "${lk}"`,
      })
      filled[lk] = filled[key]!
      delete filled[key]
    }
  }

  // Phase 2c: label value normalization (exact case-insensitive, then fuzzy ≤2)
  for (const [lk, labels] of labelFields) {
    const val = filled[lk] // key is always lowercase after Phase 2b
    if (!val) continue
    const vl = val.toLowerCase()
    const exact = labels.find((l: string) => l.toLowerCase() === vl)
    if (exact && exact !== val) {
      result.warnings.push({
        field: lk,
        code: 'NORMALIZED',
        from: val,
        to: exact,
        message: `Value "${val}" normalized to "${exact}"`,
      })
      filled[lk] = exact
    } else if (!exact) {
      let bestDist = Infinity,
        bestLabel = ''
      for (const l of labels) {
        const d = levenshtein(vl, l.toLowerCase())
        if (d < bestDist) {
          bestDist = d
          bestLabel = l
        }
      }
      if (bestDist <= 2 && bestLabel) {
        result.warnings.push({
          field: lk,
          code: 'NORMALIZED',
          from: val,
          to: bestLabel,
          message: `Value "${val}" normalized to "${bestLabel}"`,
        })
        filled[lk] = bestLabel
      } else {
        result.warnings.push({ field: lk, code: 'UNKNOWN_VALUE', message: `Unknown value "${val}" for field "${lk}"` })
      }
    }
  }

  // Phase 2d: Weblink fills — only for types that have iframeUrl semantics
  if (WEBLINK_TYPES.has(typeName) && !filled.iframeUrl && filled.link) {
    filled.iframeUrl = filled.link
    result.filled.push('iframeUrl')
    result.warnings.push({ field: 'iframeUrl', code: 'COPIED_FROM_LINK', message: 'iframeUrl copied from link' })
  }
  if (WEBLINK_TYPES.has(typeName) && !filled.category && filled.iframeUrl) {
    const host = tryHostname(filled.iframeUrl)
    const isVideo = ['youtube.com', 'youtu.be', 'vimeo.com'].some((h) => host.includes(h))
    filled.category = isVideo ? 'Video' : 'Article'
    result.filled.push('category')
    result.warnings.push({ field: 'category', code: 'INFERRED', message: `category inferred as "${filled.category}"` })
  }

  // Phase 2e: tag quote-stripping
  if (filled.tags) {
    const stripped = filled.tags.replace(/^['"]|['"]$/g, '')
    if (stripped !== filled.tags) {
      result.warnings.push({
        field: 'tags',
        code: 'TAG_FORMAT',
        from: filled.tags,
        to: stripped,
        message: 'Removed surrounding quotes from tags',
      })
      filled.tags = stripped
    }
  }

  // Phase 3: check required fields
  if (!filled.title?.trim()) {
    result.valid = false
    result.errors.push({ field: 'title', code: 'REQUIRED', message: 'title is required' })
  }
  if (WEBLINK_TYPES.has(typeName) && !filled.iframeUrl) {
    result.valid = false
    result.errors.push({
      field: 'iframeUrl',
      code: 'REQUIRED',
      message: 'iframeUrl is required for Weblink / MediaWebResource',
    })
  }

  // Assemble corrected frontmatter
  result.corrected = `---\n${Object.entries(filled)
    .map(([k, v]) => `${k}: ${v}`)
    .join('\n')}\n---\n${body}`

  // Output
  if (opts.json) {
    process.stdout.write(JSON.stringify(result) + '\n')
  } else {
    process.stdout.write(result.corrected)
    for (const w of result.warnings) process.stderr.write(`⚠ [${w.code}] ${w.message}\n`)
    for (const f of result.filled) process.stderr.write(`✓ ${f} filled automatically\n`)
    for (const e of result.errors) process.stderr.write(`✗ ${e.message}\n`)
  }

  if (!result.valid) exit(ExitCode.UNEXPECTED)
}

export function registerValidate(program: Command): void {
  program
    .command('validate')
    .description('Validate frontmatter from stdin against a Capacities type')
    .requiredOption('--type <type>', 'object type name (e.g. Blip, Weblink)')
    .action(async (cmdOpts: { type: string }) => {
      const globalOpts = program.opts() as CommandOptions
      await runValidate(cmdOpts.type, globalOpts).catch(handleApiError)
    })
}

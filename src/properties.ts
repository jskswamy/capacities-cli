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

// src/properties.ts
import { CapacitiesError, ExitCode } from './errors.ts'

export type PropertyDef = {
  id: string
  name: string
  type: string
  writable?: boolean
  labelSet?: Array<{ id: string; name: string }>
}

type StructureEntry = { id?: string; title?: string; propertyDefinitions?: PropertyDef[] }
type StructuresResp = { structures: StructureEntry[] }

export function resolvePropertyDef(structures: StructuresResp, propName: string): PropertyDef {
  const allDefs = structures.structures.flatMap((s) => s.propertyDefinitions ?? [])

  // 1. Exact id match (built-ins like "description", UUID passthrough)
  const byId = allDefs.find((d) => d.id === propName)
  if (byId) return byId

  // 2. Case-insensitive name match
  const lower = propName.toLowerCase()
  const byName = allDefs.filter((d) => d.name.toLowerCase() === lower)
  if (byName.length === 1) return byName[0]
  if (byName.length > 1) {
    const list = byName.map((d) => `${d.name} (${d.id})`).join(', ')
    throw new CapacitiesError(
      ExitCode.API,
      `Ambiguous property "${propName}" — found: ${list}. Pass the UUID directly.`
    )
  }

  const available = [...new Set(allDefs.map((d) => d.name))].join(', ')
  throw new CapacitiesError(ExitCode.NOT_FOUND, `Unknown property "${propName}". Available: ${available}`)
}

export function buildPropertyPayload(def: PropertyDef, values: string[]): object {
  switch (def.type) {
    case 'entity':
      return { type: 'entity', entity: values.map((id) => ({ id })) }
    case 'label':
      return { type: 'label', label: resolveOptions(def, values) }
    case 'richText':
      return { type: 'richText', richText: { value: [{ type: 'TextToken', text: values[0], style: {} }] } }
    case 'text':
      return { type: 'text', text: { value: values[0] } }
    case 'url':
      return { type: 'url', url: { value: values[0] } }
    case 'number': {
      const n = Number(values[0])
      if (isNaN(n)) throw new CapacitiesError(ExitCode.CONFIG, `"${values[0]}" is not a valid number`)
      return { type: 'number', number: { value: n } }
    }
    case 'boolean':
      return { type: 'boolean', boolean: { value: values[0] === 'true' } }
    default:
      return { type: 'text', text: { value: values[0] } }
  }
}

function resolveOptions(def: PropertyDef, names: string[]): Array<{ id: string; name: string }> {
  const labelSet = def.labelSet ?? []
  return names.map((name) => {
    const lower = name.toLowerCase()
    const opt = labelSet.find((o) => o.name.toLowerCase() === lower)
    if (!opt) {
      const valid = labelSet.map((o) => o.name).join(', ')
      throw new CapacitiesError(
        ExitCode.NOT_FOUND,
        `Unknown option "${name}" for "${def.name}". Valid options: ${valid}`
      )
    }
    return opt
  })
}

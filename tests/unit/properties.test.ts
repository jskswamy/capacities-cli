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

// tests/unit/properties.test.ts
import { describe, it, expect } from 'vitest'
import { resolvePropertyDef, buildPropertyPayload } from '../../src/properties.ts'

const STRUCTURES = {
  structures: [
    {
      id: 'org-struct',
      title: 'Organization',
      propertyDefinitions: [
        { id: 'f46c81ae-0001-0000-0000-000000000001', name: 'Personalities', type: 'entity' },
        {
          id: 'q-uuid-0002',
          name: 'Quadrant',
          type: 'label',
          labelSet: [
            { id: 'tool-id', name: 'Tool' },
            { id: 'tech-id', name: 'Technique' },
          ],
        },
        { id: 'link-uuid-0003', name: 'Link', type: 'richText' },
        { id: 'score-uuid-0004', name: 'Score', type: 'number' },
        { id: 'active-uuid-0005', name: 'Active', type: 'boolean' },
        { id: 'website-uuid-0006', name: 'Website', type: 'url' },
      ],
    },
    {
      id: 'blip-struct',
      title: 'Blip',
      propertyDefinitions: [
        { id: 'description', name: 'description', type: 'text' },
        { id: 'tags', name: 'tags', type: 'label', labelSet: [] },
      ],
    },
  ],
}

describe('resolvePropertyDef', () => {
  it('resolves by exact id match (built-in)', () => {
    const def = resolvePropertyDef(STRUCTURES, 'description')
    expect(def.id).toBe('description')
  })

  it('resolves by name case-insensitively', () => {
    const def = resolvePropertyDef(STRUCTURES, 'personalities')
    expect(def.id).toBe('f46c81ae-0001-0000-0000-000000000001')
  })

  it('resolves by exact UUID passthrough', () => {
    const def = resolvePropertyDef(STRUCTURES, 'f46c81ae-0001-0000-0000-000000000001')
    expect(def.id).toBe('f46c81ae-0001-0000-0000-000000000001')
  })

  it('throws NOT_FOUND for unknown property', () => {
    expect(() => resolvePropertyDef(STRUCTURES, 'nonexistent')).toThrow('Unknown property')
  })

  it('throws API error for ambiguous name', () => {
    const ambiguous = {
      structures: [
        { id: 's1', title: 'A', propertyDefinitions: [{ id: 'uuid-1', name: 'Status', type: 'text' }] },
        { id: 's2', title: 'B', propertyDefinitions: [{ id: 'uuid-2', name: 'Status', type: 'label', labelSet: [] }] },
      ],
    }
    expect(() => resolvePropertyDef(ambiguous, 'status')).toThrow('Ambiguous property')
  })
})

describe('buildPropertyPayload', () => {
  it('builds entity payload', () => {
    const def = { id: 'f46c81ae', name: 'Personalities', type: 'entity' }
    expect(buildPropertyPayload(def, ['id-1', 'id-2'])).toEqual({
      type: 'entity',
      entity: [{ id: 'id-1' }, { id: 'id-2' }],
    })
  })

  it('builds label payload with resolved options', () => {
    const def = { id: 'q-uuid', name: 'Quadrant', type: 'label', labelSet: [{ id: 'tool-id', name: 'Tool' }] }
    expect(buildPropertyPayload(def, ['tool'])).toEqual({
      type: 'label',
      label: [{ id: 'tool-id', name: 'Tool' }],
    })
  })

  it('throws NOT_FOUND for unknown label option', () => {
    const def = { id: 'q-uuid', name: 'Quadrant', type: 'label', labelSet: [{ id: 'tool-id', name: 'Tool' }] }
    expect(() => buildPropertyPayload(def, ['Adopt'])).toThrow('Unknown option')
  })

  it('builds richText payload', () => {
    const def = { id: 'link-uuid', name: 'Link', type: 'richText' }
    expect(buildPropertyPayload(def, ['https://example.com'])).toEqual({
      type: 'richText',
      richText: { value: [{ type: 'TextToken', text: 'https://example.com', style: {} }] },
    })
  })

  it('builds text payload', () => {
    const def = { id: 'description', name: 'description', type: 'text' }
    expect(buildPropertyPayload(def, ['New desc'])).toEqual({
      type: 'text',
      text: { value: 'New desc' },
    })
  })

  it('builds url payload', () => {
    const def = { id: 'website-uuid', name: 'Website', type: 'url' }
    expect(buildPropertyPayload(def, ['https://grafana.com'])).toEqual({
      type: 'url',
      url: { value: 'https://grafana.com' },
    })
  })

  it('builds number payload', () => {
    const def = { id: 'score-uuid', name: 'Score', type: 'number' }
    expect(buildPropertyPayload(def, ['42'])).toEqual({
      type: 'number',
      number: { value: 42 },
    })
  })

  it('throws CONFIG error for non-numeric value on number field', () => {
    const def = { id: 'score-uuid', name: 'Score', type: 'number' }
    expect(() => buildPropertyPayload(def, ['abc'])).toThrow('"abc" is not a valid number')
  })

  it('builds boolean payload', () => {
    const def = { id: 'active-uuid', name: 'Active', type: 'boolean' }
    expect(buildPropertyPayload(def, ['true'])).toEqual({
      type: 'boolean',
      boolean: { value: true },
    })
  })

  it('builds date payload for a single day (start=end)', () => {
    const def = { id: 'timeframe-uuid', name: 'Time frame', type: 'date' }
    expect(buildPropertyPayload(def, ['2026-08-31'])).toEqual({
      type: 'date',
      date: {
        dateResolution: 'day',
        start: new Date('2026-08-31').toISOString(),
        end: new Date('2026-08-31').toISOString(),
      },
    })
  })

  it('builds date payload for a range when a second value is given', () => {
    const def = { id: 'timeframe-uuid', name: 'Time frame', type: 'date' }
    expect(buildPropertyPayload(def, ['2026-08-31', '2027-02-12'])).toEqual({
      type: 'date',
      date: {
        dateResolution: 'day',
        start: new Date('2026-08-31').toISOString(),
        end: new Date('2027-02-12').toISOString(),
      },
    })
  })

  it('throws CONFIG error for invalid date', () => {
    const def = { id: 'timeframe-uuid', name: 'Time frame', type: 'date' }
    expect(() => buildPropertyPayload(def, ['not-a-date'])).toThrow('is not a valid date')
  })

  it('builds title payload', () => {
    const def = { id: 'title', name: 'title', type: 'title' }
    expect(buildPropertyPayload(def, ['New Title'])).toEqual({
      type: 'title',
      title: { value: 'New Title' },
    })
  })
})

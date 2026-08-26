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

// tests/unit/errors.test.ts
import { describe, it, expect } from 'vitest'
import {
  CapacitiesError,
  ExitCode,
  ExitError,
  exit,
  handleApiError,
  toExitCode,
  formatError,
} from '../../src/errors.ts'

describe('CapacitiesError', () => {
  it('stores code and message', () => {
    const e = new CapacitiesError(ExitCode.RATE_LIMIT, 'too fast')
    expect(e.code).toBe(5)
    expect(e.message).toBe('too fast')
    expect(e.name).toBe('CapacitiesError')
  })
})

describe('toExitCode', () => {
  it('returns code for CapacitiesError', () => {
    expect(toExitCode(new CapacitiesError(ExitCode.API, 'x'))).toBe(3)
  })
  it('returns 1 for unknown errors', () => {
    expect(toExitCode(new Error('boom'))).toBe(1)
  })
  it('returns 1 for non-Error values', () => {
    expect(toExitCode('string error')).toBe(1)
  })
})

describe('formatError', () => {
  it('returns message for CapacitiesError', () => {
    expect(formatError(new CapacitiesError(ExitCode.API, 'bad'))).toBe('bad')
  })
  it('returns message for Error', () => {
    expect(formatError(new Error('plain'))).toBe('plain')
  })
  it('stringifies non-Error values', () => {
    expect(formatError('oops')).toBe('oops')
  })
})

describe('ExitError', () => {
  it('stores exit code', () => {
    const e = new ExitError(2)
    expect(e.code).toBe(2)
    expect(e.name).toBe('ExitError')
  })
})

describe('exit', () => {
  it('throws ExitError with given code', () => {
    expect(() => exit(2)).toThrow(ExitError)
    expect(() => exit(2)).toThrow('EXIT:2')
  })
})

describe('handleApiError', () => {
  it('wraps non-Error as UNEXPECTED', () => {
    expect(() => handleApiError('string')).toThrow(CapacitiesError)
    try {
      handleApiError('string')
    } catch (e) {
      expect((e as CapacitiesError).code).toBe(ExitCode.UNEXPECTED)
    }
  })
  it('throws RATE_LIMIT on 429', () => {
    try {
      handleApiError(new Error('429 Too Many Requests'))
    } catch (e) {
      expect((e as CapacitiesError).code).toBe(ExitCode.RATE_LIMIT)
      expect((e as CapacitiesError).message).toContain('Rate limit')
    }
  })
  it('includes Retry-After seconds when present', () => {
    try {
      handleApiError(new Error('429 Retry-After: 30'))
    } catch (e) {
      expect((e as CapacitiesError).message).toContain('30s')
    }
  })
  it('throws CONFIG on 401', () => {
    try {
      handleApiError(new Error('401 Unauthorized'))
    } catch (e) {
      expect((e as CapacitiesError).code).toBe(ExitCode.CONFIG)
    }
  })
  it('throws CONFIG on 403', () => {
    try {
      handleApiError(new Error('403 Forbidden'))
    } catch (e) {
      expect((e as CapacitiesError).code).toBe(ExitCode.CONFIG)
    }
  })
  it('throws NOT_FOUND on 404', () => {
    try {
      handleApiError(new Error('404 Not Found'))
    } catch (e) {
      expect((e as CapacitiesError).code).toBe(ExitCode.NOT_FOUND)
    }
  })
  it('throws API for generic errors', () => {
    try {
      handleApiError(new Error('500 Internal Server Error'))
    } catch (e) {
      expect((e as CapacitiesError).code).toBe(ExitCode.API)
      expect((e as CapacitiesError).message).toContain('API error')
    }
  })
})

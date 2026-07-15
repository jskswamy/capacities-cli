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

// tests/unit/logger.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

describe('logger', () => {
  let spy: ReturnType<typeof vi.spyOn>
  beforeEach(() => { spy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true) })
  afterEach(() => { spy.mockRestore(); delete process.env.NO_COLOR; delete process.env.CAPACITIES_LOG_LEVEL })

  it('writes warn to stderr with NO_COLOR prefix', async () => {
    process.env.NO_COLOR = '1'
    process.env.CAPACITIES_LOG_LEVEL = 'warn'
    const { logger } = await import('../../src/logger.ts')
    logger.warn('test')
    expect(spy).toHaveBeenCalledWith('[capacities:warn] test\n')
  })

  it('suppresses debug when level is warn', async () => {
    process.env.CAPACITIES_LOG_LEVEL = 'warn'
    const { logger } = await import('../../src/logger.ts')
    logger.debug('hidden')
    expect(spy).not.toHaveBeenCalled()
  })

  it('shows debug when level is debug', async () => {
    process.env.NO_COLOR = '1'
    process.env.CAPACITIES_LOG_LEVEL = 'debug'
    const { logger } = await import('../../src/logger.ts')
    logger.debug('visible')
    expect(spy).toHaveBeenCalledWith('[capacities:debug] visible\n')
  })
})

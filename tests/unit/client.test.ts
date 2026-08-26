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

// tests/unit/client.test.ts
import { describe, it, expect, vi } from 'vitest'
import { replaceBody } from '../../src/client.ts'

function fakeClient(
  oldBlockIds: string[],
  deleteImpl: (blockId: string) => Promise<void>,
  // blocks is keyed by the structure's content property id (e.g. a UUID), not the
  // literal string "content" — see regression test below
  blocksKey = 'cdde4a50-df94-40f3-944a-d0b7034f13d5'
) {
  const calls: string[] = []
  return {
    client: {
      object: { get: vi.fn().mockResolvedValue({ blocks: { [blocksKey]: oldBlockIds.map((id) => ({ id })) } }) },
      blocks: {
        append: vi.fn().mockImplementation(async () => {
          calls.push('append')
          return {}
        }),
        block: {
          delete: vi.fn().mockImplementation(async ({ blockId }: { blockId: string }) => {
            calls.push(`delete:${blockId}`)
            await deleteImpl(blockId)
          }),
        },
      },
    } as any,
    calls,
  }
}

describe('replaceBody', () => {
  it('appends new content before deleting any old block', async () => {
    const { client, calls } = fakeClient(['b1', 'b2'], async () => {})
    await replaceBody(client, 'obj-1', '# New body')
    expect(calls).toEqual(['append', 'delete:b1', 'delete:b2'])
  })

  it('leaves the object untouched and propagates the error when append fails', async () => {
    const { client } = fakeClient(['b1'], async () => {})
    client.blocks.append.mockRejectedValue(new Error('network error'))
    await expect(replaceBody(client, 'obj-1', '# New body')).rejects.toThrow('network error')
    expect(client.blocks.block.delete).not.toHaveBeenCalled()
  })

  it('reports exactly the old blocks that failed to delete, without losing content', async () => {
    const { client } = fakeClient(['b1', 'b2', 'b3'], async (blockId) => {
      if (blockId === 'b2') throw new Error('boom')
    })
    await expect(replaceBody(client, 'obj-1', '# New body')).rejects.toThrow('b2')
    // all three deletes were attempted — one failure doesn't abort the cleanup of the others
    expect(client.blocks.block.delete).toHaveBeenCalledTimes(3)
  })

  it('does nothing to delete when the object had no existing blocks', async () => {
    const { client } = fakeClient([], async () => {})
    await replaceBody(client, 'obj-1', '# New body')
    expect(client.blocks.block.delete).not.toHaveBeenCalled()
  })

  // Regression test: blocks come back keyed by the structure's content property id
  // (a UUID that varies per structure), not the literal string "content" as the API
  // docs example implies. An earlier implementation read `blocks.content` directly,
  // silently found nothing, and appended without ever deleting the old blocks.
  it('deletes old blocks regardless of which property key they are grouped under', async () => {
    const client = {
      object: {
        get: vi.fn().mockResolvedValue({
          blocks: {
            'cdde4a50-df94-40f3-944a-d0b7034f13d5': [{ id: 'b1' }, { id: 'b2' }],
          },
        }),
      },
      blocks: {
        append: vi.fn().mockResolvedValue({}),
        block: { delete: vi.fn().mockResolvedValue({}) },
      },
    } as any
    await replaceBody(client, 'obj-1', '# New body')
    expect(client.blocks.block.delete).toHaveBeenCalledWith({ objectId: 'obj-1', blockId: 'b1' })
    expect(client.blocks.block.delete).toHaveBeenCalledWith({ objectId: 'obj-1', blockId: 'b2' })
  })
})

import { describe, it, expect } from 'vitest'
import {
  createOptimizedBatchChunks,
  splitBatchChunk,
  isRequestSizeOrTokenError,
  type BatchChunk,
} from './aiBatchPlanner'
import type { BatchTranslationItem } from './aiBatchTranslation'

describe('aiBatchPlanner', () => {
  function createSampleItem(id: number, targetLang = 'ru', sourceLang = 'en', targetFile = 'ru.json'): BatchTranslationItem {
    return {
      id: `${targetFile}::KEY_${id}`,
      targetFile,
      targetLanguage: targetLang,
      sourceFile: `${sourceLang}.json`,
      sourceLanguage: sourceLang,
      key: `KEY_${id}`,
      sourceValue: `Source text value ${id}`,
      isMissing: true,
      isEmpty: false,
      proposedTranslation: '',
      status: 'pending',
    }
  }

  it('groups items by language pair and partitions into chunks respecting maxItemsPerChunk', () => {
    const items: BatchTranslationItem[] = []
    for (let i = 1; i <= 125; i++) {
      items.push(createSampleItem(i))
    }

    const chunks = createOptimizedBatchChunks(items, { maxItemsPerChunk: 50, maxCharsPerChunk: 10000 })
    expect(chunks).toHaveLength(3) // 50 + 50 + 25
    expect(chunks[0].items).toHaveLength(50)
    expect(chunks[1].items).toHaveLength(50)
    expect(chunks[2].items).toHaveLength(25)
  })

  it('partitions chunks when character limit is reached before item count', () => {
    const items: BatchTranslationItem[] = [
      { ...createSampleItem(1), sourceValue: 'A'.repeat(500) },
      { ...createSampleItem(2), sourceValue: 'B'.repeat(600) },
      { ...createSampleItem(3), sourceValue: 'C'.repeat(700) },
    ]

    const chunks = createOptimizedBatchChunks(items, { maxItemsPerChunk: 50, maxCharsPerChunk: 1000 })
    expect(chunks.length).toBeGreaterThan(1)
  })

  it('separates different target languages into distinct chunks', () => {
    const items = [
      createSampleItem(1, 'ru', 'en', 'ru.json'),
      createSampleItem(2, 'de', 'en', 'de.json'),
      createSampleItem(3, 'ru', 'en', 'ru.json'),
      createSampleItem(4, 'de', 'en', 'de.json'),
    ]

    const chunks = createOptimizedBatchChunks(items)
    expect(chunks).toHaveLength(2)

    const ruChunk = chunks.find((c) => c.targetLanguage === 'ru')
    const deChunk = chunks.find((c) => c.targetLanguage === 'de')

    expect(ruChunk?.items).toHaveLength(2)
    expect(deChunk?.items).toHaveLength(2)
  })

  it('splits a batch chunk into two smaller sub-chunks recursively until size 1', () => {
    const chunk: BatchChunk = {
      id: 'chunk-1',
      targetFile: 'ru.json',
      targetLanguage: 'ru',
      sourceFile: 'en.json',
      sourceLanguage: 'en',
      items: [
        createSampleItem(1),
        createSampleItem(2),
        createSampleItem(3),
        createSampleItem(4),
      ],
      totalChars: 200,
    }

    const split = splitBatchChunk(chunk)
    expect(split).toHaveLength(2)
    expect(split[0].items).toHaveLength(2)
    expect(split[1].items).toHaveLength(2)

    const singleItemChunk: BatchChunk = {
      ...chunk,
      items: [createSampleItem(1)],
    }
    const cannotSplit = splitBatchChunk(singleItemChunk)
    expect(cannotSplit).toHaveLength(1)
    expect(cannotSplit[0].items).toHaveLength(1)
  })

  it('detects token limit and payload size error messages', () => {
    expect(isRequestSizeOrTokenError({ status: 413 })).toBe(true)
    expect(isRequestSizeOrTokenError({ message: 'Payload Too Large' })).toBe(true)
    expect(isRequestSizeOrTokenError({ message: 'Maximum context length exceeded: 4096 tokens' })).toBe(true)
    expect(isRequestSizeOrTokenError({ message: 'Rate limit exceeded (HTTP 429)' })).toBe(false)
    expect(isRequestSizeOrTokenError(new Error('Unauthorized (401)'))).toBe(false)
  })
})

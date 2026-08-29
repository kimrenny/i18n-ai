import type { BatchTranslationItem } from './aiBatchTranslation'

export interface BatchChunk {
  id: string
  targetFile: string
  targetLanguage: string
  sourceFile: string
  sourceLanguage: string
  items: BatchTranslationItem[]
  totalChars: number
}

export interface BatchPlanningOptions {
  maxItemsPerChunk?: number
  maxCharsPerChunk?: number
}

export const DEFAULT_BATCH_PLANNING_OPTIONS: Required<BatchPlanningOptions> = {
  maxItemsPerChunk: 50,
  maxCharsPerChunk: 4000,
}

/**
 * Groups translation items by targetLanguage and sourceLanguage and partitions
 * them into optimized batch chunks respecting item and character limits.
 */
export function createOptimizedBatchChunks(
  items: readonly BatchTranslationItem[],
  options?: BatchPlanningOptions
): BatchChunk[] {
  const opts = { ...DEFAULT_BATCH_PLANNING_OPTIONS, ...options }
  const chunks: BatchChunk[] = []

  // Filter pending items
  const pendingItems = items.filter(
    (item) => item.status === 'pending' && item.sourceValue !== ''
  )

  if (pendingItems.length === 0) {
    return []
  }

  // Group by (targetLanguage, sourceLanguage, targetFile)
  const groupMap = new Map<string, BatchTranslationItem[]>()
  for (const item of pendingItems) {
    const key = `${item.targetLanguage}::${item.sourceLanguage}::${item.targetFile}`
    const list = groupMap.get(key) || []
    list.push(item)
    groupMap.set(key, list)
  }

  let chunkCounter = 1

  for (const [groupKey, groupItems] of groupMap.entries()) {
    const [targetLanguage, sourceLanguage, targetFile] = groupKey.split('::')

    let currentChunkItems: BatchTranslationItem[] = []
    let currentChunkChars = 0

    for (const item of groupItems) {
      const itemChars = (item.key?.length || 0) + (item.sourceValue?.length || 0) + 20

      const wouldExceedItems = currentChunkItems.length >= opts.maxItemsPerChunk
      const wouldExceedChars =
        currentChunkItems.length > 0 &&
        currentChunkChars + itemChars > opts.maxCharsPerChunk

      if (wouldExceedItems || wouldExceedChars) {
        // Flush current chunk
        chunks.push({
          id: `chunk-${chunkCounter++}`,
          targetFile,
          targetLanguage,
          sourceFile: currentChunkItems[0]?.sourceFile || '',
          sourceLanguage,
          items: currentChunkItems,
          totalChars: currentChunkChars,
        })
        currentChunkItems = []
        currentChunkChars = 0
      }

      currentChunkItems.push(item)
      currentChunkChars += itemChars
    }

    if (currentChunkItems.length > 0) {
      chunks.push({
        id: `chunk-${chunkCounter++}`,
        targetFile,
        targetLanguage,
        sourceFile: currentChunkItems[0]?.sourceFile || '',
        sourceLanguage,
        items: currentChunkItems,
        totalChars: currentChunkChars,
      })
    }
  }

  return chunks
}

/**
 * Splits a batch chunk into two smaller half-sized chunks.
 * Used when a provider rejects a batch due to token or request size limits.
 */
export function splitBatchChunk(chunk: BatchChunk): BatchChunk[] {
  if (chunk.items.length <= 1) {
    return [chunk]
  }

  const midpoint = Math.floor(chunk.items.length / 2)
  const leftItems = chunk.items.slice(0, midpoint)
  const rightItems = chunk.items.slice(midpoint)

  const leftChars = leftItems.reduce(
    (acc, it) => acc + (it.key.length + it.sourceValue.length + 20),
    0
  )
  const rightChars = rightItems.reduce(
    (acc, it) => acc + (it.key.length + it.sourceValue.length + 20),
    0
  )

  return [
    {
      id: `${chunk.id}-1`,
      targetFile: chunk.targetFile,
      targetLanguage: chunk.targetLanguage,
      sourceFile: chunk.sourceFile,
      sourceLanguage: chunk.sourceLanguage,
      items: leftItems,
      totalChars: leftChars,
    },
    {
      id: `${chunk.id}-2`,
      targetFile: chunk.targetFile,
      targetLanguage: chunk.targetLanguage,
      sourceFile: chunk.sourceFile,
      sourceLanguage: chunk.sourceLanguage,
      items: rightItems,
      totalChars: rightChars,
    },
  ]
}

/**
 * Detects whether an error was caused by request size or token limit exceedance.
 */
export function isRequestSizeOrTokenError(error: unknown): boolean {
  if (!error) return false

  if (typeof error === 'object' && error !== null) {
    const e = error as Record<string, unknown>
    if (e.status === 413) return true

    if (typeof e.message === 'string') {
      const msg = e.message.toLowerCase()
      if (
        msg.includes('payload too large') ||
        msg.includes('request too large') ||
        msg.includes('token limit') ||
        msg.includes('maximum context length') ||
        msg.includes('context_length_exceeded') ||
        msg.includes('prompt is too long') ||
        msg.includes('too many tokens') ||
        msg.includes('max_tokens') ||
        msg.includes('string too long')
      ) {
        return true
      }
    }
  }

  return false
}

import type {
  ParsedLocalizationFile,
  LocalizationComparisonResult,
  JsonValue,
} from '../types/localization'
import type { AiTranslationSettings } from '../types/settings'
import {
  findSourceReference,
  resolveLanguageFromFilename,
  executeBatchAiTranslation,
  isRetryableError,
  getRetryAfterMs,
} from './aiTranslation'
import {
  createOptimizedBatchChunks,
  splitBatchChunk,
  isRequestSizeOrTokenError,
  type BatchChunk,
  type BatchPlanningOptions,
} from './aiBatchPlanner'

export interface BatchTranslationItem {
  id: string
  targetFile: string
  targetLanguage: string
  key: string
  sourceFile: string
  sourceLanguage: string
  sourceValue: string
  isMissing: boolean
  isEmpty: boolean
  proposedTranslation: string
  status: 'pending' | 'translating' | 'translated' | 'error' | 'skipped'
  errorMessage?: string
}

export interface BatchTranslationPlan {
  items: BatchTranslationItem[]
  totalCount: number
  filesAffected: string[]
  unresolvableCount: number
}

export interface BatchProgress {
  current: number
  total: number
  currentBatch: number
  totalBatches: number
  keysInBatch: number
  currentKey?: string
  targetFile: string
  successCount: number
  errorCount: number
  statusMessage?: string
  isRetrying?: boolean
  retryAttempt?: number
  maxRetries?: number
  retryDelayRemainingMs?: number
}

export interface BatchTranslationOptions extends BatchPlanningOptions {
  concurrency?: number
  maxRetries?: number
  baseDelayMs?: number
  maxDelayMs?: number
  jitter?: boolean
}

const DEFAULT_OPTIONS: Required<BatchTranslationOptions> = {
  concurrency: 1,
  maxRetries: 4,
  baseDelayMs: 1000,
  maxDelayMs: 15000,
  jitter: true,
  maxItemsPerChunk: 50,
  maxCharsPerChunk: 4000,
}

/**
 * Creates a promise that resolves after delayMs, but rejects immediately if abortSignal fires.
 */
export function waitWithAbort(
  delayMs: number,
  abortSignal?: AbortSignal
): Promise<void> {
  return new Promise((resolve, reject) => {
    if (abortSignal?.aborted) {
      return reject(new Error('Operation cancelled by user.'))
    }

    const onAbort = () => {
      clearTimeout(timer)
      abortSignal?.removeEventListener('abort', onAbort)
      reject(new Error('Operation cancelled by user.'))
    }

    const timer = setTimeout(() => {
      abortSignal?.removeEventListener('abort', onAbort)
      resolve()
    }, delayMs)

    abortSignal?.addEventListener('abort', onAbort)
  })
}

/**
 * Creates an in-memory batch translation plan for all untranslated entries
 * (physically missing keys and keys whose value is strictly "").
 */
export function createBatchTranslationPlan(
  files: readonly ParsedLocalizationFile[],
  comparisonResult: LocalizationComparisonResult
): BatchTranslationPlan {
  const items: BatchTranslationItem[] = []
  const filesAffectedSet = new Set<string>()
  let unresolvableCount = 0

  for (const file of files) {
    const targetFile = file.filename
    const targetLanguage = resolveLanguageFromFilename(targetFile)

    for (const entry of comparisonResult.keys) {
      const isMissing = entry.missingInFiles.includes(targetFile)
      const isEmpty = entry.emptyInFiles.includes(targetFile)

      if (isMissing || isEmpty) {
        filesAffectedSet.add(targetFile)

        const ref = findSourceReference(entry.key, targetFile, files)
        if (!ref || (!ref.sourceValue && ref.sourceValue !== '')) {
          unresolvableCount++
          items.push({
            id: `${targetFile}::${entry.key}`,
            targetFile,
            targetLanguage,
            key: entry.key,
            sourceFile: ref ? ref.sourceFile : '',
            sourceLanguage: ref ? ref.sourceLanguage : '',
            sourceValue: '',
            isMissing,
            isEmpty,
            proposedTranslation: '',
            status: 'error',
            errorMessage: 'No non-empty source translation found in compared files.',
          })
        } else {
          items.push({
            id: `${targetFile}::${entry.key}`,
            targetFile,
            targetLanguage,
            key: entry.key,
            sourceFile: ref.sourceFile,
            sourceLanguage: ref.sourceLanguage,
            sourceValue: ref.sourceValue,
            isMissing,
            isEmpty,
            proposedTranslation: '',
            status: 'pending',
          })
        }
      }
    }
  }

  // Deterministic sorting: by targetFile ascending, then key ascending
  items.sort((a, b) => {
    if (a.targetFile !== b.targetFile) {
      return a.targetFile.localeCompare(b.targetFile)
    }
    return a.key.localeCompare(b.key)
  })

  return {
    items,
    totalCount: items.length,
    filesAffected: Array.from(filesAffectedSet).sort(),
    unresolvableCount,
  }
}

/**
 * Executes batch translation for all pending items in the plan using optimized
 * multi-key chunks, strict validation, automatic splitting, and rate-limit backoff.
 */
export async function executeBatchTranslation(
  plan: BatchTranslationPlan,
  settings: AiTranslationSettings | import('../types/settings').AppSettings,
  onProgress?: (progress: BatchProgress) => void,
  abortSignal?: AbortSignal,
  options?: BatchTranslationOptions
): Promise<BatchTranslationPlan> {
  const opts = { ...DEFAULT_OPTIONS, ...options }
  const updatedItemsMap = new Map<string, BatchTranslationItem>()
  for (const item of plan.items) {
    updatedItemsMap.set(item.id, { ...item })
  }

  let successCount = plan.items.filter((i) => i.status === 'translated').length
  let errorCount = plan.items.filter((i) => i.status === 'error').length

  // Create initial optimized batch chunks
  const pendingItems = plan.items.filter((i) => i.status === 'pending')
  const chunkQueue: BatchChunk[] = createOptimizedBatchChunks(pendingItems, opts)

  let completedBatchCount = 0

  while (chunkQueue.length > 0) {
    if (abortSignal?.aborted) {
      // Mark remaining pending items as skipped
      for (const remainingChunk of chunkQueue) {
        for (const it of remainingChunk.items) {
          const existing = updatedItemsMap.get(it.id)
          if (existing && existing.status === 'pending') {
            updatedItemsMap.set(it.id, {
              ...existing,
              status: 'skipped',
              errorMessage: 'Batch translation cancelled by user.',
            })
          }
        }
      }
      break
    }

    const chunk = chunkQueue.shift()!
    completedBatchCount++
    const totalBatches = completedBatchCount + chunkQueue.length

    onProgress?.({
      current: successCount,
      total: plan.totalCount,
      currentBatch: completedBatchCount,
      totalBatches,
      keysInBatch: chunk.items.length,
      currentKey: chunk.items[0]?.key,
      targetFile: chunk.targetFile,
      successCount,
      errorCount,
      isRetrying: false,
      statusMessage: `Translating batch ${completedBatchCount} / ${totalBatches} (${chunk.items.length} keys in ${chunk.targetFile})...`,
    })

    let chunkSucceeded = false
    let lastErrorMessage = 'Batch translation failed.'

    for (let attempt = 0; attempt <= opts.maxRetries; attempt++) {
      if (abortSignal?.aborted) {
        for (const it of chunk.items) {
          const existing = updatedItemsMap.get(it.id)
          if (existing && existing.status === 'pending') {
            updatedItemsMap.set(it.id, {
              ...existing,
              status: 'skipped',
              errorMessage: 'Batch translation cancelled by user.',
            })
          }
        }
        break
      }

      try {
        const response = await executeBatchAiTranslation(
          {
            targetLanguage: chunk.targetLanguage,
            sourceLanguage: chunk.sourceLanguage,
            targetFile: chunk.targetFile,
            sourceFile: chunk.sourceFile,
            entries: chunk.items.map((it) => ({
              key: it.key,
              text: it.sourceValue,
            })),
          },
          settings
        )

        // Map response translations to items
        const resultMap = new Map<string, string>()
        for (const tr of response.translations) {
          resultMap.set(tr.key, tr.translation)
        }

        for (const it of chunk.items) {
          const translation = resultMap.get(it.key)
          const existing = updatedItemsMap.get(it.id)
          if (existing) {
            if (typeof translation === 'string') {
              updatedItemsMap.set(it.id, {
                ...existing,
                proposedTranslation: translation,
                status: 'translated',
                errorMessage: undefined,
              })
              successCount++
            } else {
              updatedItemsMap.set(it.id, {
                ...existing,
                status: 'error',
                errorMessage: `Translation missing for key "${it.key}" in AI response.`,
              })
              errorCount++
            }
          }
        }

        chunkSucceeded = true
        break
      } catch (err) {
        lastErrorMessage =
          err instanceof Error ? err.message : 'Batch translation failed.'

        // 1. Check if the error is a Request Size / Token Limit error and chunk can be split
        if (isRequestSizeOrTokenError(err) && chunk.items.length > 1) {
          const [sub1, sub2] = splitBatchChunk(chunk)
          chunkQueue.unshift(sub2)
          chunkQueue.unshift(sub1)
          completedBatchCount-- // Decrement since we're splitting instead of completing

          onProgress?.({
            current: successCount,
            total: plan.totalCount,
            currentBatch: completedBatchCount + 1,
            totalBatches: completedBatchCount + chunkQueue.length,
            keysInBatch: sub1.items.length,
            targetFile: chunk.targetFile,
            successCount,
            errorCount,
            isRetrying: false,
            statusMessage: `Batch payload too large — automatically split into smaller chunks (${sub1.items.length} & ${sub2.items.length} keys).`,
          })

          chunkSucceeded = true // Avoid marking items as failed
          break
        }

        const retryable = isRetryableError(err)
        if (!retryable || attempt === opts.maxRetries || abortSignal?.aborted) {
          break
        }

        // Calculate backoff delay
        const serverRetryAfter = getRetryAfterMs(err)
        let delayMs: number
        if (serverRetryAfter && serverRetryAfter > 0) {
          delayMs = Math.min(serverRetryAfter, opts.maxDelayMs)
        } else {
          const exp = Math.min(
            opts.maxDelayMs,
            opts.baseDelayMs * Math.pow(2, attempt)
          )
          const jitterMs = opts.jitter ? Math.floor(Math.random() * 200) : 0
          delayMs = exp + jitterMs
        }

        const secondsText = (delayMs / 1000).toFixed(1)
        const retryMsg = `Rate limit / temporary error reached — retrying batch in ${secondsText}s (attempt ${attempt + 1}/${opts.maxRetries})...`

        onProgress?.({
          current: successCount,
          total: plan.totalCount,
          currentBatch: completedBatchCount,
          totalBatches,
          keysInBatch: chunk.items.length,
          targetFile: chunk.targetFile,
          successCount,
          errorCount,
          isRetrying: true,
          retryAttempt: attempt + 1,
          maxRetries: opts.maxRetries,
          retryDelayRemainingMs: delayMs,
          statusMessage: retryMsg,
        })

        try {
          await waitWithAbort(delayMs, abortSignal)
        } catch {
          // Aborted during delay
          for (const it of chunk.items) {
            const existing = updatedItemsMap.get(it.id)
            if (existing && existing.status === 'pending') {
              updatedItemsMap.set(it.id, {
                ...existing,
                status: 'skipped',
                errorMessage: 'Batch translation cancelled by user.',
              })
            }
          }
          break
        }
      }
    }

    if (!chunkSucceeded) {
      for (const it of chunk.items) {
        const existing = updatedItemsMap.get(it.id)
        if (existing && existing.status === 'pending') {
          errorCount++
          updatedItemsMap.set(it.id, {
            ...existing,
            status: 'error',
            errorMessage: lastErrorMessage,
          })
        }
      }
    }

    onProgress?.({
      current: successCount,
      total: plan.totalCount,
      currentBatch: completedBatchCount,
      totalBatches: completedBatchCount + chunkQueue.length,
      keysInBatch: chunk.items.length,
      targetFile: chunk.targetFile,
      successCount,
      errorCount,
      isRetrying: false,
    })
  }

  const finalItems = plan.items.map((it) => updatedItemsMap.get(it.id) || it)

  return {
    ...plan,
    items: finalItems,
  }
}

/**
 * Resets failed items in a plan to 'pending' and re-executes translation
 * while preserving all already-translated items.
 */
export async function retryFailedBatchTranslations(
  plan: BatchTranslationPlan,
  settings: AiTranslationSettings | import('../types/settings').AppSettings,
  onProgress?: (progress: BatchProgress) => void,
  abortSignal?: AbortSignal,
  options?: BatchTranslationOptions
): Promise<BatchTranslationPlan> {
  const resetItems: BatchTranslationItem[] = plan.items.map((item) => {
    if (item.status === 'error' && item.sourceValue !== '') {
      return {
        ...item,
        status: 'pending',
        errorMessage: undefined,
      }
    }
    return item
  })

  return await executeBatchTranslation(
    { ...plan, items: resetItems },
    settings,
    onProgress,
    abortSignal,
    options
  )
}

/**
 * Generates formatted JSON updates for all files affected by approved translations.
 */
export function applyBatchTranslationPlan(
  files: readonly ParsedLocalizationFile[],
  plan: BatchTranslationPlan
): {
  filesToModify: { path: string; filename: string; content: string }[]
  appliedCount: number
} {
  const filesToModify: { path: string; filename: string; content: string }[] = []
  let appliedCount = 0

  // Filter items ready to apply
  const approvedItems = plan.items.filter(
    (item) => item.status === 'translated' && item.proposedTranslation !== undefined
  )

  if (approvedItems.length === 0) {
    return { filesToModify: [], appliedCount: 0 }
  }

  // Group approved items by targetFile
  const itemsByFile = new Map<string, BatchTranslationItem[]>()
  for (const item of approvedItems) {
    const list = itemsByFile.get(item.targetFile) || []
    list.push(item)
    itemsByFile.set(item.targetFile, list)
  }

  for (const [targetFile, items] of itemsByFile.entries()) {
    const file = files.find((f) => f.filename === targetFile)
    if (!file) continue

    // Deep clone raw JSON
    const clonedRaw: Record<string, JsonValue> =
      file.raw && typeof file.raw === 'object' && !Array.isArray(file.raw)
        ? JSON.parse(JSON.stringify(file.raw))
        : {}

    for (const item of items) {
      const segments = item.key.split('.')
      let current: Record<string, JsonValue> = clonedRaw
      let hasConflict = false

      for (let i = 0; i < segments.length - 1; i++) {
        const seg = segments[i]
        if (!Object.prototype.hasOwnProperty.call(current, seg)) {
          const newObj: Record<string, JsonValue> = {}
          current[seg] = newObj
          current = newObj
        } else {
          const val = current[seg]
          if (typeof val !== 'object' || val === null || Array.isArray(val)) {
            // Structural conflict: skip modifying this branch
            hasConflict = true
            break
          }
          current = val as Record<string, JsonValue>
        }
      }

      if (!hasConflict) {
        const leaf = segments[segments.length - 1]
        current[leaf] = item.proposedTranslation
        appliedCount++
      }
    }

    filesToModify.push({
      path: file.path,
      filename: file.filename,
      content: JSON.stringify(clonedRaw, null, 2) + '\n',
    })
  }

  return { filesToModify, appliedCount }
}

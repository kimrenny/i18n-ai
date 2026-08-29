import type {
  ParsedLocalizationFile,
  LocalizationComparisonResult,
  JsonValue,
} from '../types/localization'
import type { AiTranslationSettings } from '../types/settings'
import {
  findSourceReference,
  resolveLanguageFromFilename,
  executeAiTranslation,
  isRetryableError,
  getRetryAfterMs,
} from './aiTranslation'

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
  currentKey: string
  targetFile: string
  successCount: number
  errorCount: number
  statusMessage?: string
  isRetrying?: boolean
  retryAttempt?: number
  maxRetries?: number
  retryDelayRemainingMs?: number
}

export interface BatchTranslationOptions {
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
 * Executes batch translation for all pending items in the plan using a controlled
 * queue, concurrency throttling, and bounded exponential backoff on HTTP 429 / transient errors.
 */
export async function executeBatchTranslation(
  plan: BatchTranslationPlan,
  settings: AiTranslationSettings,
  onProgress?: (progress: BatchProgress) => void,
  abortSignal?: AbortSignal,
  options?: BatchTranslationOptions
): Promise<BatchTranslationPlan> {
  const opts = { ...DEFAULT_OPTIONS, ...options }
  const updatedItems = [...plan.items]

  let successCount = updatedItems.filter((i) => i.status === 'translated').length
  let errorCount = updatedItems.filter((i) => i.status === 'error').length

  // Process items in a queue with controlled concurrency (default: 1 sequential)
  let currentIndex = 0

  async function processNext(): Promise<void> {
    while (currentIndex < updatedItems.length) {
      const idx = currentIndex++
      const item = updatedItems[idx]

      if (abortSignal?.aborted) {
        if (item.status === 'pending') {
          updatedItems[idx] = {
            ...item,
            status: 'skipped',
            errorMessage: 'Batch translation cancelled by user.',
          }
        }
        continue
      }

      if (item.status !== 'pending') {
        continue
      }

      onProgress?.({
        current: idx + 1,
        total: updatedItems.length,
        currentKey: item.key,
        targetFile: item.targetFile,
        successCount,
        errorCount,
        isRetrying: false,
        statusMessage: `Translating ${item.key} (${item.targetFile})...`,
      })

      let translated = false
      let lastErrorMessage = 'AI translation request failed.'

      for (let attempt = 0; attempt <= opts.maxRetries; attempt++) {
        if (abortSignal?.aborted) {
          updatedItems[idx] = {
            ...item,
            status: 'skipped',
            errorMessage: 'Batch translation cancelled by user.',
          }
          break
        }

        try {
          const response = await executeAiTranslation(
            {
              key: item.key,
              sourceFile: item.sourceFile,
              sourceLanguage: item.sourceLanguage,
              targetFile: item.targetFile,
              targetLanguage: item.targetLanguage,
              sourceValue: item.sourceValue,
            },
            settings
          )

          updatedItems[idx] = {
            ...item,
            proposedTranslation: response.translatedText,
            status: 'translated',
            errorMessage: undefined,
          }
          successCount++
          translated = true
          break
        } catch (err) {
          lastErrorMessage =
            err instanceof Error ? err.message : 'AI translation request failed.'
          const retryable = isRetryableError(err)

          if (!retryable || attempt === opts.maxRetries || abortSignal?.aborted) {
            break
          }

          // Determine retry delay
          const serverRetryAfter = getRetryAfterMs(err)
          let delayMs: number
          if (serverRetryAfter && serverRetryAfter > 0) {
            delayMs = Math.min(serverRetryAfter, opts.maxDelayMs)
          } else {
            // Exponential backoff: baseDelay * 2^attempt + jitter
            const exp = Math.min(
              opts.maxDelayMs,
              opts.baseDelayMs * Math.pow(2, attempt)
            )
            const jitterMs = opts.jitter ? Math.floor(Math.random() * 200) : 0
            delayMs = exp + jitterMs
          }

          const secondsText = (delayMs / 1000).toFixed(1)
          const retryMsg = `Rate limit / temporary error reached — retrying in ${secondsText}s (attempt ${attempt + 1}/${opts.maxRetries})...`

          onProgress?.({
            current: idx + 1,
            total: updatedItems.length,
            currentKey: item.key,
            targetFile: item.targetFile,
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
            updatedItems[idx] = {
              ...item,
              status: 'skipped',
              errorMessage: 'Batch translation cancelled by user.',
            }
            break
          }
        }
      }

      if (!translated && updatedItems[idx].status === 'pending') {
        errorCount++
        updatedItems[idx] = {
          ...item,
          status: 'error',
          errorMessage: lastErrorMessage,
        }
      }

      onProgress?.({
        current: idx + 1,
        total: updatedItems.length,
        currentKey: item.key,
        targetFile: item.targetFile,
        successCount,
        errorCount,
        isRetrying: false,
      })
    }
  }

  // Run concurrency workers
  const workerCount = Math.max(1, opts.concurrency)
  const workers: Promise<void>[] = []
  for (let w = 0; w < workerCount; w++) {
    workers.push(processNext())
  }
  await Promise.all(workers)

  return {
    ...plan,
    items: updatedItems,
  }
}

/**
 * Resets failed items in a plan to 'pending' and re-executes translation
 * while preserving all already-translated items.
 */
export async function retryFailedBatchTranslations(
  plan: BatchTranslationPlan,
  settings: AiTranslationSettings,
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

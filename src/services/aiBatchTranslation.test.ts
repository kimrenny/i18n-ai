import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  createBatchTranslationPlan,
  executeBatchTranslation,
  retryFailedBatchTranslations,
  applyBatchTranslationPlan,
} from './aiBatchTranslation'
import { compareLocalizationFiles } from './localizationComparator'
import {
  setAiTranslationProvider,
  MockAiTranslationProvider,
  AiTranslationError,
  isRetryableError,
} from './aiTranslation'
import { DEFAULT_AI_TRANSLATION_SETTINGS } from '../types/settings'
import type { ParsedLocalizationFile } from '../types/localization'

describe('aiBatchTranslation service', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    setAiTranslationProvider(new MockAiTranslationProvider())
  })

  const mockParsedFiles: ParsedLocalizationFile[] = [
    {
      filename: 'en.json',
      path: '/locales/en.json',
      keys: {
        'APP.TITLE': 'My App',
        'APP.DESC': 'Description of app',
        'AUTH.LOGIN': 'Log In',
        'AUTH.LOGOUT': 'Log Out',
        'SETTINGS.THEME': 'Theme',
        'SETTINGS.NON_EMPTY_SPACE': ' ',
        'SETTINGS.NUM': 0,
        'SETTINGS.BOOL': false,
      },
      raw: {
        APP: { TITLE: 'My App', DESC: 'Description of app' },
        AUTH: { LOGIN: 'Log In', LOGOUT: 'Log Out' },
        SETTINGS: {
          THEME: 'Theme',
          NON_EMPTY_SPACE: ' ',
          NUM: 0,
          BOOL: false,
        },
      },
      keyCount: 8,
    },
    {
      filename: 'ru.json',
      path: '/locales/ru.json',
      keys: {
        'APP.TITLE': 'Мое приложение',
        'APP.DESC': '', // empty string translation
        'AUTH.LOGIN': '', // empty string translation
        'SETTINGS.NON_EMPTY_SPACE': ' ', // whitespace - should NOT be treated as empty
        'SETTINGS.NUM': 0, // number 0 - should NOT be treated as empty
        'SETTINGS.BOOL': false, // boolean false - should NOT be treated as empty
        // AUTH.LOGOUT and SETTINGS.THEME are physically missing
      },
      raw: {
        APP: { TITLE: 'Мое приложение', DESC: '' },
        AUTH: { LOGIN: '' },
        SETTINGS: { NON_EMPTY_SPACE: ' ', NUM: 0, BOOL: false },
      },
      keyCount: 6,
    },
  ]

  it('creates a batch plan including missing keys and empty-string keys, excluding whitespace/0/false', () => {
    const comparison = compareLocalizationFiles(mockParsedFiles)
    const plan = createBatchTranslationPlan(mockParsedFiles, comparison)

    expect(plan.totalCount).toBe(4)
    expect(plan.filesAffected).toEqual(['ru.json'])

    const keys = plan.items.map((i) => i.key)
    expect(keys).toContain('APP.DESC')
    expect(keys).toContain('AUTH.LOGIN')
    expect(keys).toContain('AUTH.LOGOUT')
    expect(keys).toContain('SETTINGS.THEME')

    expect(keys).not.toContain('APP.TITLE')
    expect(keys).not.toContain('SETTINGS.NON_EMPTY_SPACE')
    expect(keys).not.toContain('SETTINGS.NUM')
    expect(keys).not.toContain('SETTINGS.BOOL')
  })

  it('translates multiple entries in optimized batch chunks rather than 1 request per key', async () => {
    const comparison = compareLocalizationFiles(mockParsedFiles)
    const plan = createBatchTranslationPlan(mockParsedFiles, comparison)
    expect(plan.totalCount).toBe(4)

    let batchApiCallCount = 0
    let totalKeysRequested = 0

    setAiTranslationProvider(
      new MockAiTranslationProvider(
        undefined,
        async (req) => {
          batchApiCallCount++
          totalKeysRequested += req.entries.length
          return {
            translations: req.entries.map((e) => ({
              key: e.key,
              translation: `[MockRU] ${e.text}`,
            })),
            provider: 'mock',
            model: 'mock-v1',
          }
        }
      )
    )

    const executedPlan = await executeBatchTranslation(
      plan,
      DEFAULT_AI_TRANSLATION_SETTINGS
    )

    // All 4 keys should be translated in a SINGLE batch API request!
    expect(batchApiCallCount).toBe(1)
    expect(totalKeysRequested).toBe(4)
    expect(executedPlan.items.every((i) => i.status === 'translated')).toBe(true)
    expect(executedPlan.items[0].proposedTranslation).toContain('[MockRU]')
  })

  it('automatically splits batch into smaller sub-batches when token/request size limit error occurs', async () => {
    // 6 keys in total
    const enKeys: Record<string, string> = {}
    const ruKeys: Record<string, string> = {}
    for (let i = 1; i <= 6; i++) {
      enKeys[`KEY_${i}`] = `Source ${i}`
      ruKeys[`KEY_${i}`] = ''
    }

    const files: ParsedLocalizationFile[] = [
      { filename: 'en.json', path: '/locales/en.json', keys: enKeys, raw: enKeys, keyCount: 6 },
      { filename: 'ru.json', path: '/locales/ru.json', keys: ruKeys, raw: ruKeys, keyCount: 6 },
    ]

    let apiCalls = 0

    setAiTranslationProvider(
      new MockAiTranslationProvider(
        undefined,
        async (req) => {
          apiCalls++
          // Fail initial chunk of 6 with token error
          if (req.entries.length > 3) {
            throw new AiTranslationError('Payload too large: maximum context length exceeded', {
              status: 413,
              retryable: false,
            })
          }
          // Succeed for smaller chunks (length <= 3)
          return {
            translations: req.entries.map((e) => ({
              key: e.key,
              translation: `[RU] ${e.text}`,
            })),
            provider: 'mock',
            model: 'mock-v1',
          }
        }
      )
    )

    const comparison = compareLocalizationFiles(files)
    const plan = createBatchTranslationPlan(files, comparison)

    const executed = await executeBatchTranslation(
      plan,
      DEFAULT_AI_TRANSLATION_SETTINGS
    )

    // 1 rejected initial call + 2 successful split calls = 3 total API calls
    expect(apiCalls).toBe(3)
    expect(executed.items.every((i) => i.status === 'translated')).toBe(true)
  })

  describe('HTTP 429 & Rate Limit Retries on Batches', () => {
    it('handles HTTP 429 on batch chunk with backoff and succeeds on retry', async () => {
      let attempts = 0
      setAiTranslationProvider(
        new MockAiTranslationProvider(
          undefined,
          async (req) => {
            attempts++
            if (attempts === 1) {
              throw new AiTranslationError('Rate limit exceeded (HTTP 429)', {
                status: 429,
                retryable: true,
                retryAfterMs: 10,
              })
            }
            return {
              translations: req.entries.map((e) => ({
                key: e.key,
                translation: `[Mock] ${e.text}`,
              })),
              provider: 'mock',
              model: 'mock-v1',
            }
          }
        )
      )

      const comparison = compareLocalizationFiles(mockParsedFiles)
      const plan = createBatchTranslationPlan(mockParsedFiles, comparison)

      const progressStatuses: string[] = []
      const executed = await executeBatchTranslation(
        plan,
        DEFAULT_AI_TRANSLATION_SETTINGS,
        (p) => {
          if (p.statusMessage) progressStatuses.push(p.statusMessage)
        },
        undefined,
        { baseDelayMs: 5, maxDelayMs: 50, jitter: false }
      )

      expect(attempts).toBe(2)
      expect(executed.items.every((i) => i.status === 'translated')).toBe(true)
      expect(
        progressStatuses.some((msg) => msg.includes('Rate limit'))
      ).toBe(true)
    })

    it('marks batch chunk as error after exhausting maxRetries on persistent 429', async () => {
      let callCount = 0
      setAiTranslationProvider(
        new MockAiTranslationProvider(
          undefined,
          async () => {
            callCount++
            throw new AiTranslationError('Google Gemini rate limit (429)', {
              status: 429,
              retryable: true,
            })
          }
        )
      )

      const comparison = compareLocalizationFiles(mockParsedFiles)
      const plan = createBatchTranslationPlan(mockParsedFiles, comparison)

      const executed = await executeBatchTranslation(
        plan,
        DEFAULT_AI_TRANSLATION_SETTINGS,
        undefined,
        undefined,
        { maxRetries: 3, baseDelayMs: 5, maxDelayMs: 20, jitter: false }
      )

      expect(executed.items.every((i) => i.status === 'error')).toBe(true)
      expect(callCount).toBe(4) // 1 initial + 3 retries = 4
    })
  })

  describe('Retry Failed & Cancellation', () => {
    it('retries only failed entries while preserving already successful entries', async () => {
      const comparison = compareLocalizationFiles(mockParsedFiles)
      const plan = createBatchTranslationPlan(mockParsedFiles, comparison)

      // Simulate 2 successful items and 2 error items
      plan.items[0].status = 'translated'
      plan.items[0].proposedTranslation = 'Existing 1'
      plan.items[1].status = 'translated'
      plan.items[1].proposedTranslation = 'Existing 2'
      plan.items[2].status = 'error'
      plan.items[2].errorMessage = 'Rate limit error'
      plan.items[3].status = 'error'
      plan.items[3].errorMessage = 'Temporary timeout'

      let batchCallCount = 0
      setAiTranslationProvider(
        new MockAiTranslationProvider(
          undefined,
          async (req) => {
            batchCallCount++
            return {
              translations: req.entries.map((e) => ({
                key: e.key,
                translation: `[Retried] ${e.text}`,
              })),
              provider: 'mock',
              model: 'mock-v1',
            }
          }
        )
      )

      const retriedPlan = await retryFailedBatchTranslations(
        plan,
        DEFAULT_AI_TRANSLATION_SETTINGS
      )

      expect(batchCallCount).toBe(1) // Single batch call containing only the 2 failed items
      expect(retriedPlan.items[0].proposedTranslation).toBe('Existing 1')
      expect(retriedPlan.items[1].proposedTranslation).toBe('Existing 2')
      expect(retriedPlan.items[2].proposedTranslation).toBe(
        `[Retried] ${retriedPlan.items[2].sourceValue}`
      )
      expect(retriedPlan.items[3].proposedTranslation).toBe(
        `[Retried] ${retriedPlan.items[3].sourceValue}`
      )
      expect(retriedPlan.items.every((i) => i.status === 'translated')).toBe(true)
    })

    it('cancels gracefully during delay and marks pending items as skipped', async () => {
      const comparison = compareLocalizationFiles(mockParsedFiles)
      const plan = createBatchTranslationPlan(mockParsedFiles, comparison)

      const controller = new AbortController()

      setAiTranslationProvider(
        new MockAiTranslationProvider(
          undefined,
          async () => {
            throw new AiTranslationError('429 Rate limited', {
              status: 429,
              retryable: true,
              retryAfterMs: 5000,
            })
          }
        )
      )

      setTimeout(() => controller.abort(), 50)

      const executed = await executeBatchTranslation(
        plan,
        DEFAULT_AI_TRANSLATION_SETTINGS,
        undefined,
        controller.signal,
        { baseDelayMs: 5000, maxDelayMs: 5000 }
      )

      expect(executed.items.some((i) => i.status === 'skipped')).toBe(true)
    })
  })

  describe('applyBatchTranslationPlan', () => {
    it('applies batch plan and generates formatted JSON files ready for atomic disk write', () => {
      const comparison = compareLocalizationFiles(mockParsedFiles)
      const plan = createBatchTranslationPlan(mockParsedFiles, comparison)

      for (const item of plan.items) {
        item.status = 'translated'
        item.proposedTranslation = `Translated ${item.sourceValue}`
      }

      const { filesToModify, appliedCount } = applyBatchTranslationPlan(
        mockParsedFiles,
        plan
      )

      expect(appliedCount).toBe(4)
      expect(filesToModify.length).toBe(1)
      expect(filesToModify[0].filename).toBe('ru.json')

      const parsedJson = JSON.parse(filesToModify[0].content)
      expect(parsedJson.APP.TITLE).toBe('Мое приложение')
      expect(parsedJson.APP.DESC).toBe('Translated Description of app')
      expect(parsedJson.AUTH.LOGIN).toBe('Translated Log In')
      expect(parsedJson.AUTH.LOGOUT).toBe('Translated Log Out')
      expect(parsedJson.SETTINGS.THEME).toBe('Translated Theme')
    })
  })

  describe('Error classification', () => {
    it('correctly classifies retryable vs non-retryable errors', () => {
      expect(
        isRetryableError(new AiTranslationError('429', { status: 429, retryable: true }))
      ).toBe(true)
      expect(
        isRetryableError(new AiTranslationError('503', { status: 503, retryable: true }))
      ).toBe(true)
      expect(
        isRetryableError(new AiTranslationError('401', { status: 401, retryable: false }))
      ).toBe(false)
      expect(
        isRetryableError(new AiTranslationError('400', { status: 400, retryable: false }))
      ).toBe(false)
      expect(isRetryableError({ status: 429 })).toBe(true)
      expect(isRetryableError({ status: 502 })).toBe(true)
      expect(isRetryableError({ message: 'Rate limit exceeded (HTTP 429)' })).toBe(
        true
      )
      expect(isRetryableError({ message: 'fetch failed' })).toBe(true)
      expect(isRetryableError(new Error('Invalid API key'))).toBe(false)
    })
  })
})

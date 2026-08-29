import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  createBatchTranslationPlan,
  executeBatchTranslation,
  retryFailedBatchTranslations,
  applyBatchTranslationPlan,
  waitWithAbort,
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

  it('executes batch translation sequentially with concurrency=1 by default and updates proposed translations', async () => {
    const comparison = compareLocalizationFiles(mockParsedFiles)
    const initialPlan = createBatchTranslationPlan(mockParsedFiles, comparison)

    let activeConcurrent = 0
    let maxObservedConcurrent = 0

    setAiTranslationProvider(
      new MockAiTranslationProvider(async (req) => {
        activeConcurrent++
        if (activeConcurrent > maxObservedConcurrent) {
          maxObservedConcurrent = activeConcurrent
        }
        await new Promise((r) => setTimeout(r, 5))
        activeConcurrent--
        return {
          translatedText: `[Mock] ${req.sourceValue}`,
          provider: 'mock',
          model: 'mock-v1',
        }
      })
    )

    const executedPlan = await executeBatchTranslation(
      initialPlan,
      DEFAULT_AI_TRANSLATION_SETTINGS
    )

    expect(executedPlan.items.every((i) => i.status === 'translated')).toBe(true)
    expect(maxObservedConcurrent).toBe(1) // Controlled sequential processing by default
  })

  describe('HTTP 429 & Rate Limit Retries', () => {
    it('handles HTTP 429 rate limits with backoff and succeeds on retry', async () => {
      let attempts = 0
      setAiTranslationProvider(
        new MockAiTranslationProvider(async (req) => {
          attempts++
          if (attempts === 1) {
            throw new AiTranslationError('Rate limit exceeded (HTTP 429)', {
              status: 429,
              retryable: true,
              retryAfterMs: 10,
            })
          }
          return {
            translatedText: `[Mock] ${req.sourceValue}`,
            provider: 'mock',
            model: 'mock-v1',
          }
        })
      )

      const comparison = compareLocalizationFiles(mockParsedFiles)
      const singleItemPlan = createBatchTranslationPlan(mockParsedFiles, comparison)
      singleItemPlan.items = [singleItemPlan.items[0]] // Test single item
      singleItemPlan.totalCount = 1

      const progressStatuses: string[] = []
      const executed = await executeBatchTranslation(
        singleItemPlan,
        DEFAULT_AI_TRANSLATION_SETTINGS,
        (p) => {
          if (p.statusMessage) progressStatuses.push(p.statusMessage)
        },
        undefined,
        { baseDelayMs: 5, maxDelayMs: 50, jitter: false }
      )

      expect(attempts).toBe(2)
      expect(executed.items[0].status).toBe('translated')
      expect(executed.items[0].proposedTranslation).toBe('[Mock] Description of app')
      expect(
        progressStatuses.some((msg) => msg.includes('Rate limit'))
      ).toBe(true)
    })

    it('simulates the real-world scenario: 6 succeed, 7th encounters 429, retries, and all 9 complete', async () => {
      // Create a 9-item batch
      const enKeys: Record<string, string> = {}
      const ruKeys: Record<string, string> = {}
      for (let i = 1; i <= 9; i++) {
        enKeys[`KEY_${i}`] = `Source ${i}`
        ruKeys[`KEY_${i}`] = ''
      }

      const files: ParsedLocalizationFile[] = [
        {
          filename: 'en.json',
          path: '/locales/en.json',
          keys: enKeys,
          raw: enKeys,
          keyCount: 9,
        },
        {
          filename: 'ru.json',
          path: '/locales/ru.json',
          keys: ruKeys,
          raw: ruKeys,
          keyCount: 9,
        },
      ]

      let callCount = 0
      let rateLimitHit = false

      setAiTranslationProvider(
        new MockAiTranslationProvider(async (req) => {
          callCount++
          // On 7th call, return 429 once
          if (callCount === 7 && !rateLimitHit) {
            rateLimitHit = true
            throw new AiTranslationError('OpenAI rate limit (429)', {
              status: 429,
              retryable: true,
              retryAfterMs: 10,
            })
          }
          return {
            translatedText: `[RU] ${req.sourceValue}`,
            provider: 'openai',
            model: 'gpt-4o-mini',
          }
        })
      )

      const comparison = compareLocalizationFiles(files)
      const plan = createBatchTranslationPlan(files, comparison)
      expect(plan.totalCount).toBe(9)

      const executed = await executeBatchTranslation(
        plan,
        DEFAULT_AI_TRANSLATION_SETTINGS,
        undefined,
        undefined,
        { baseDelayMs: 5, maxDelayMs: 50, jitter: false }
      )

      expect(executed.items.every((i) => i.status === 'translated')).toBe(true)
      expect(callCount).toBe(10) // 9 items + 1 retry = 10 total calls
      expect(rateLimitHit).toBe(true)
    })

    it('marks item as error after exhausting maxRetries on persistent 429', async () => {
      let callCount = 0
      setAiTranslationProvider(
        new MockAiTranslationProvider(async () => {
          callCount++
          throw new AiTranslationError('Google Gemini rate limit (429)', {
            status: 429,
            retryable: true,
          })
        })
      )

      const comparison = compareLocalizationFiles(mockParsedFiles)
      const plan = createBatchTranslationPlan(mockParsedFiles, comparison)
      plan.items = [plan.items[0]]
      plan.totalCount = 1

      const executed = await executeBatchTranslation(
        plan,
        DEFAULT_AI_TRANSLATION_SETTINGS,
        undefined,
        undefined,
        { maxRetries: 3, baseDelayMs: 5, maxDelayMs: 20, jitter: false }
      )

      expect(executed.items[0].status).toBe('error')
      expect(executed.items[0].errorMessage).toContain('429')
      expect(callCount).toBe(4) // initial attempt + 3 retries = 4
    })

    it('does NOT retry non-retryable permanent errors (400, 401, missing API key)', async () => {
      let callCount = 0
      setAiTranslationProvider(
        new MockAiTranslationProvider(async () => {
          callCount++
          throw new AiTranslationError('Unauthorized API key (HTTP 401)', {
            status: 401,
            retryable: false,
          })
        })
      )

      const comparison = compareLocalizationFiles(mockParsedFiles)
      const plan = createBatchTranslationPlan(mockParsedFiles, comparison)
      plan.items = [plan.items[0]]
      plan.totalCount = 1

      const executed = await executeBatchTranslation(
        plan,
        DEFAULT_AI_TRANSLATION_SETTINGS,
        undefined,
        undefined,
        { maxRetries: 4, baseDelayMs: 5 }
      )

      expect(executed.items[0].status).toBe('error')
      expect(callCount).toBe(1) // Fails immediately on attempt 1 without retries
    })

    it('retries transient 500/502/503 server errors and recovers', async () => {
      let callCount = 0
      setAiTranslationProvider(
        new MockAiTranslationProvider(async (req) => {
          callCount++
          if (callCount === 1) {
            throw new AiTranslationError('Anthropic Server Overloaded (529/503)', {
              status: 503,
              retryable: true,
            })
          }
          return {
            translatedText: `[AI] ${req.sourceValue}`,
            provider: 'anthropic',
            model: 'claude-3-5-sonnet-20241022',
          }
        })
      )

      const comparison = compareLocalizationFiles(mockParsedFiles)
      const plan = createBatchTranslationPlan(mockParsedFiles, comparison)
      plan.items = [plan.items[0]]
      plan.totalCount = 1

      const executed = await executeBatchTranslation(
        plan,
        DEFAULT_AI_TRANSLATION_SETTINGS,
        undefined,
        undefined,
        { baseDelayMs: 5, maxDelayMs: 50, jitter: false }
      )

      expect(executed.items[0].status).toBe('translated')
      expect(callCount).toBe(2)
    })
  })

  describe('Retry Failed & Cancellation', () => {
    it('retries only failed entries while preserving already successful entries', async () => {
      const comparison = compareLocalizationFiles(mockParsedFiles)
      const plan = createBatchTranslationPlan(mockParsedFiles, comparison)

      // Simulate a plan with 2 successful items and 2 error items
      plan.items[0].status = 'translated'
      plan.items[0].proposedTranslation = 'Existing 1'
      plan.items[1].status = 'translated'
      plan.items[1].proposedTranslation = 'Existing 2'
      plan.items[2].status = 'error'
      plan.items[2].errorMessage = 'Rate limit error'
      plan.items[3].status = 'error'
      plan.items[3].errorMessage = 'Temporary timeout'

      let callCount = 0
      setAiTranslationProvider(
        new MockAiTranslationProvider(async (req) => {
          callCount++
          return {
            translatedText: `[Retried] ${req.sourceValue}`,
            provider: 'mock',
            model: 'mock-v1',
          }
        })
      )

      const retriedPlan = await retryFailedBatchTranslations(
        plan,
        DEFAULT_AI_TRANSLATION_SETTINGS
      )

      expect(callCount).toBe(2) // Only the 2 failed items were retried!
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
        new MockAiTranslationProvider(async () => {
          // Trigger 429 to cause backoff delay
          throw new AiTranslationError('429 Rate limited', {
            status: 429,
            retryable: true,
            retryAfterMs: 5000,
          })
        })
      )

      // Abort after 50ms
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

    it('waitWithAbort rejects immediately on abort signal', async () => {
      const controller = new AbortController()
      setTimeout(() => controller.abort(), 10)
      await expect(waitWithAbort(10000, controller.signal)).rejects.toThrow(
        /cancelled/i
      )
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

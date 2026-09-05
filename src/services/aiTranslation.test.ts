import { describe, it, expect, beforeEach } from 'vitest'
import {
  MockAiTranslationProvider,
  getAiTranslationProvider,
  setAiTranslationProvider,
  findSourceReference,
  resolveLanguageFromFilename,
  executeAiTranslation,
  executeAiTranslationWithRetry,
  is429RateLimitError,
  parseRetryAfterHeader,
  getRetryAfterMs,
  calculate429BackoffDelay,
  AiTranslationError,
  type AiTranslationRequest,
  type SingleTranslationProgressInfo,
} from './aiTranslation'
import { DEFAULT_AI_TRANSLATION_SETTINGS } from '../types/settings'

describe('aiTranslation service', () => {
  beforeEach(() => {
    setAiTranslationProvider(new MockAiTranslationProvider())
  })

  it('translates text using MockAiTranslationProvider deterministically', async () => {
    const provider = getAiTranslationProvider()
    const request: AiTranslationRequest = {
      key: 'MENU.PLAY',
      sourceFile: 'en.json',
      targetFile: 'ru.json',
      sourceValue: 'Play',
    }

    const response = await provider.translate(request)
    expect(response.translatedText).toBe('[AI: RU] Play')
    expect(response.provider).toBe('mock')
    expect(response.model).toBe('mock-v1')
  })

  it('allows plugging in a custom AI translation provider', async () => {
    const customProvider = new MockAiTranslationProvider(async (req) => ({
      translatedText: `Custom translated: ${req.sourceValue}`,
      provider: 'mock',
      model: 'custom-model',
    }))

    setAiTranslationProvider(customProvider)

    const response = await getAiTranslationProvider().translate({
      key: 'AUTH.LOGOUT',
      sourceFile: 'en.json',
      targetFile: 'es.json',
      sourceValue: 'Logout',
    })

    expect(response.translatedText).toBe('Custom translated: Logout')
    expect(response.model).toBe('custom-model')
  })

  it('validates API key requirement for cloud providers in executeAiTranslation', async () => {
    const request: AiTranslationRequest = {
      key: 'MENU.PLAY',
      sourceFile: 'en.json',
      targetFile: 'ru.json',
      sourceValue: 'Play',
    }

    const settingsWithNoKey = {
      ...DEFAULT_AI_TRANSLATION_SETTINGS,
      provider: 'openai' as const,
      providers: {
        ...DEFAULT_AI_TRANSLATION_SETTINGS.providers,
        openai: { model: 'gpt-4o-mini', apiKey: '' },
      },
    }

    await expect(
      executeAiTranslation(request, settingsWithNoKey)
    ).rejects.toThrow(/API key is missing for OpenAI/i)
  })

  it('resolves language code from filename', () => {
    expect(resolveLanguageFromFilename('en.json')).toBe('en')
    expect(resolveLanguageFromFilename('ru.JSON')).toBe('ru')
    expect(resolveLanguageFromFilename('zh-CN.json')).toBe('zh-CN')
  })

  describe('findSourceReference', () => {
    it('prefers en.json when non-empty value is available', () => {
      const compared = [
        { filename: 'ru.json', keys: { 'MENU.PLAY': '' } },
        { filename: 'de.json', keys: { 'MENU.PLAY': 'Spielen' } },
        { filename: 'en.json', keys: { 'MENU.PLAY': 'Play' } },
      ]

      const ref = findSourceReference('MENU.PLAY', 'ru.json', compared)
      expect(ref).toEqual({
        sourceFile: 'en.json',
        sourceLanguage: 'en',
        sourceValue: 'Play',
      })
    })

    it('falls back to another non-empty file when en.json is not available', () => {
      const compared = [
        { filename: 'ru.json', keys: { 'MENU.PLAY': '' } },
        { filename: 'de.json', keys: { 'MENU.PLAY': 'Spielen' } },
      ]

      const ref = findSourceReference('MENU.PLAY', 'ru.json', compared)
      expect(ref).toEqual({
        sourceFile: 'de.json',
        sourceLanguage: 'de',
        sourceValue: 'Spielen',
      })
    })

    it('returns null when no non-empty source is found', () => {
      const compared = [
        { filename: 'ru.json', keys: { 'MENU.PLAY': '' } },
        { filename: 'es.json', keys: { 'MENU.PLAY': '' } },
      ]

      const ref = findSourceReference('MENU.PLAY', 'ru.json', compared)
      expect(ref).toBeNull()
    })
  })

  describe('HTTP 429 Retry Engine & Helpers', () => {
    describe('is429RateLimitError', () => {
      it('returns true strictly for 429 and rate limit errors', () => {
        expect(is429RateLimitError(new AiTranslationError('Too many requests', { status: 429 }))).toBe(true)
        expect(is429RateLimitError(new AiTranslationError('Rate limit exceeded', { code: 'RATE_LIMIT' }))).toBe(true)
        expect(is429RateLimitError({ status: 429, message: 'Request limit reached' })).toBe(true)
        expect(is429RateLimitError(new Error('RESOURCE_EXHAUSTED: quota exceeded'))).toBe(true)
      })

      it('returns false for non-429 errors (500, 502, 503, 504, 408, network, timeout)', () => {
        expect(is429RateLimitError(new AiTranslationError('Gateway Timeout', { status: 504 }))).toBe(false)
        expect(is429RateLimitError(new AiTranslationError('Internal Server Error', { status: 500 }))).toBe(false)
        expect(is429RateLimitError(new AiTranslationError('Request Timeout', { status: 408 }))).toBe(false)
        expect(is429RateLimitError(new Error('Network error: ECONNRESET'))).toBe(false)
        expect(is429RateLimitError(new Error('ETIMEDOUT: Connection timed out'))).toBe(false)
        expect(is429RateLimitError(new Error('fetch failed'))).toBe(false)
      })
    })

    describe('parseRetryAfterHeader & getRetryAfterMs', () => {
      it('handles Retry-After: 0 returning 0 ms', () => {
        expect(parseRetryAfterHeader('0')).toBe(0)
        expect(getRetryAfterMs({ retryAfterMs: 0 })).toBe(0)
        expect(getRetryAfterMs({ retryAfter: '0' })).toBe(0)
      })

      it('parses numeric seconds into milliseconds', () => {
        expect(parseRetryAfterHeader('3')).toBe(3000)
        expect(getRetryAfterMs({ retryAfter: '5' })).toBe(5000)
      })

      it('safely returns undefined for invalid/malformed Retry-After headers', () => {
        expect(parseRetryAfterHeader('invalid-header')).toBeUndefined()
        expect(parseRetryAfterHeader('')).toBeUndefined()
        expect(getRetryAfterMs({ retryAfter: 'invalid' })).toBeUndefined()
      })
    })

    describe('calculate429BackoffDelay', () => {
      it('prioritizes valid retryAfterMs over exponential delay', () => {
        const delay0 = calculate429BackoffDelay(1, 0)
        expect(delay0).toBe(0)

        const delayFixed = calculate429BackoffDelay(1, 2500)
        expect(delayFixed).toBe(2500)
      })

      it('falls back to exponential backoff when retryAfterMs is undefined', () => {
        const delay1 = calculate429BackoffDelay(1, undefined, 1000, 15000, false)
        expect(delay1).toBe(1000) // 1000 * 2^0

        const delay2 = calculate429BackoffDelay(2, undefined, 1000, 15000, false)
        expect(delay2).toBe(2000) // 1000 * 2^1

        const delay3 = calculate429BackoffDelay(3, undefined, 1000, 15000, false)
        expect(delay3).toBe(4000) // 1000 * 2^2
      })

      it('caps delay at maxDelayMs', () => {
        const delayCapped = calculate429BackoffDelay(1, 20000, 1000, 15000)
        expect(delayCapped).toBe(15000)
      })
    })

    describe('executeAiTranslationWithRetry', () => {
      const baseReq: AiTranslationRequest = {
        key: 'WELCOME.TITLE',
        sourceFile: 'en.json',
        targetFile: 'ru.json',
        sourceValue: 'Welcome',
      }

      it('succeeds on first attempt without retries', async () => {
        const progressEvents: SingleTranslationProgressInfo[] = []
        const result = await executeAiTranslationWithRetry(
          baseReq,
          DEFAULT_AI_TRANSLATION_SETTINGS,
          {
            onProgress: (p) => progressEvents.push({ ...p }),
          }
        )

        expect(result.translatedText).toBe('[AI: RU] Welcome')
        expect(progressEvents).toHaveLength(2)
        expect(progressEvents[0].status).toBe('translating')
        expect(progressEvents[0].attempt).toBe(0)
        expect(progressEvents[1].status).toBe('success')
      })

      it('recovers from 429 across retries: 429 -> retry 1 -> retry 2 -> retry 3 -> success', async () => {
        let attemptsCount = 0
        const mockProvider = new MockAiTranslationProvider(async (req) => {
          attemptsCount++
          if (attemptsCount <= 3) {
            throw new AiTranslationError('429 Too Many Requests', { status: 429 })
          }
          return {
            translatedText: `[AI: RU] ${req.sourceValue}`,
            provider: 'mock',
            model: 'mock-v1',
          }
        })
        setAiTranslationProvider(mockProvider)

        const progressEvents: SingleTranslationProgressInfo[] = []
        const result = await executeAiTranslationWithRetry(
          baseReq,
          DEFAULT_AI_TRANSLATION_SETTINGS,
          {
            maxRetries: 3,
            baseDelayMs: 10,
            countdownIntervalMs: 5,
            onProgress: (p) => progressEvents.push({ ...p }),
          }
        )

        expect(attemptsCount).toBe(4) // 1 initial + 3 retries = 4 total attempts
        expect(result.translatedText).toBe('[AI: RU] Welcome')

        // Verify retrying progress representations (1/3), (2/3), (3/3)
        const retryEvents = progressEvents.filter((e) => e.status === 'retrying')
        expect(retryEvents.some((e) => e.attempt === 1)).toBe(true)
        expect(retryEvents.some((e) => e.attempt === 2)).toBe(true)
        expect(retryEvents.some((e) => e.attempt === 3)).toBe(true)
        expect(progressEvents[progressEvents.length - 1].status).toBe('success')
      })

      it('fails cleanly after exhausting all 3 retries on 429', async () => {
        let attemptsCount = 0
        const mockProvider = new MockAiTranslationProvider(async () => {
          attemptsCount++
          throw new AiTranslationError('429 Too Many Requests', { status: 429 })
        })
        setAiTranslationProvider(mockProvider)

        const progressEvents: SingleTranslationProgressInfo[] = []
        await expect(
          executeAiTranslationWithRetry(
            baseReq,
            DEFAULT_AI_TRANSLATION_SETTINGS,
            {
              maxRetries: 3,
              baseDelayMs: 10,
              countdownIntervalMs: 5,
              onProgress: (p) => progressEvents.push({ ...p }),
            }
          )
        ).rejects.toThrow(/429 Too Many Requests/i)

        expect(attemptsCount).toBe(4) // 1 initial + 3 retries = 4 total attempts
        expect(progressEvents[progressEvents.length - 1].status).toBe('error')
        expect(progressEvents[progressEvents.length - 1].attempt).toBe(3)
      })

      it('does NOT retry non-429 errors (such as 500, network error) and fails immediately', async () => {
        let attemptsCount = 0
        const mockProvider = new MockAiTranslationProvider(async () => {
          attemptsCount++
          throw new AiTranslationError('Internal Server Error', { status: 500 })
        })
        setAiTranslationProvider(mockProvider)

        const progressEvents: SingleTranslationProgressInfo[] = []
        await expect(
          executeAiTranslationWithRetry(
            baseReq,
            DEFAULT_AI_TRANSLATION_SETTINGS,
            {
              maxRetries: 3,
              baseDelayMs: 10,
              onProgress: (p) => progressEvents.push({ ...p }),
            }
          )
        ).rejects.toThrow(/Internal Server Error/i)

        expect(attemptsCount).toBe(1) // Exactly 1 attempt, zero retries
        expect(progressEvents.filter((e) => e.status === 'retrying')).toHaveLength(0)
      })

      it('aborts immediately when signal is cancelled during retry backoff', async () => {
        const controller = new AbortController()
        let attemptsCount = 0
        const mockProvider = new MockAiTranslationProvider(async () => {
          attemptsCount++
          // Cancel during the backoff after first failure
          setTimeout(() => controller.abort(), 20)
          throw new AiTranslationError('429 Too Many Requests', { status: 429 })
        })
        setAiTranslationProvider(mockProvider)

        await expect(
          executeAiTranslationWithRetry(
            baseReq,
            DEFAULT_AI_TRANSLATION_SETTINGS,
            {
              maxRetries: 3,
              baseDelayMs: 2000,
              countdownIntervalMs: 50,
              signal: controller.signal,
            }
          )
        ).rejects.toThrow(/cancelled/i)

        expect(attemptsCount).toBe(1)
      })
    })
  })
})

export interface AiTranslationRequestPayload {
  key: string
  sourceFile: string
  targetFile: string
  sourceLanguage?: string
  targetLanguage?: string
  sourceValue: string
  targetValue?: string
  context?: string
}

export interface BatchTranslationEntryPayload {
  key: string
  text: string
  context?: string
}

export interface BatchAiTranslationRequestPayload {
  targetLanguage: string
  sourceLanguage?: string
  targetFile: string
  sourceFile: string
  entries: BatchTranslationEntryPayload[]
}

export interface BatchAiTranslationResponsePayload {
  translations: { key: string; translation: string }[]
  provider: string
  model: string
}

export interface AiTranslationSettingsPayload {
  provider: string
  requireEditConfirmation: boolean
  providers: Record<
    string,
    {
      model: string
      apiKey?: string
      baseUrl?: string
    }
  >
}

export interface AiTranslationResponsePayload {
  translatedText: string
  provider: string
  model: string
  detectedLanguage?: string
}

export class AiTranslationError extends Error {
  readonly status?: number
  readonly code?: string
  readonly retryable: boolean
  readonly retryAfterMs?: number

  constructor(
    message: string,
    options?: {
      status?: number
      code?: string
      retryable?: boolean
      retryAfterMs?: number
    }
  ) {
    super(message)
    this.name = 'AiTranslationError'
    this.status = options?.status
    this.code = options?.code
    this.retryable = options?.retryable ?? false
    this.retryAfterMs = options?.retryAfterMs
    Object.setPrototypeOf(this, AiTranslationError.prototype)
  }
}

export function parseRetryAfterHeader(header?: string | null): number | undefined {
  if (!header) return undefined
  const trimmed = header.trim()
  const seconds = Number(trimmed)
  if (!isNaN(seconds) && seconds >= 0) {
    return Math.round(seconds * 1000)
  }
  const dateParsed = Date.parse(trimmed)
  if (!isNaN(dateParsed)) {
    const diff = dateParsed - Date.now()
    return diff > 0 ? diff : 0
  }
  return undefined
}

export const DEPRECATED_GEMINI_MODELS = new Set([
  'gemini-2.0-flash',
  'gemini-2.0-flash-exp',
  'gemini-2.0-pro-exp-02-05',
  'gemini-1.5-flash',
  'gemini-1.5-flash-latest',
  'gemini-1.5-flash-8b',
  'gemini-1.5-pro',
  'gemini-1.5-pro-latest',
  'gemini-1.0-pro',
  'gemini-pro',
])

function buildSystemPrompt(targetLanguage: string, context?: string): string {
  const contextInstruction = context
    ? `\nAdditional UI Context: ${context}`
    : ''

  return `You are a professional software localization and translation engine.
Your task is to accurately translate software localization text into target language: "${targetLanguage}".${contextInstruction}

STRICT TRANSLATION RULES:
1. Return ONLY the direct translation string. Do NOT output any introductory text, explanations, markdown formatting, or surrounding quotes.
2. PRESERVE ALL PLACEHOLDERS EXACTLY AS THEY ARE.
   - Examples of placeholders: {name}, {{user_count}}, %s, %d, %1$s, $t(key), @:key, :variable, #tag#.
   - NEVER translate, rename, reformat, or delete placeholder names.
3. PRESERVE ALL HTML / XML TAGS AND ATTRIBUTES EXACTLY.
   - Examples: <b>, </b>, <span class="highlight">, <a href="...">, <br/>.
4. PRESERVE ESCAPE SEQUENCES EXACTLY.
   - Examples: \\n, \\t, \\r.
5. Maintain the original grammatical intent, capitalization style, and punctuation of the UI text.
6. If the input is empty or whitespace only, return it unchanged.`
}

function buildUserPrompt(
  sourceText: string,
  key: string,
  sourceLanguage?: string
): string {
  const fromLang = sourceLanguage ? ` (from ${sourceLanguage})` : ''
  return `Localization Key: "${key}"${fromLang}
Source Text:
${sourceText}`
}

function buildBatchSystemPrompt(targetLanguage: string): string {
  return `You are a professional software localization and translation engine.
Your task is to accurately translate a batch of software localization entries into target language: "${targetLanguage}".

STRICT BATCH TRANSLATION AND JSON OUTPUT RULES:
1. You are given a JSON array of localization entries with "key" and "text" fields.
2. You MUST return ONLY a valid, parseable JSON array of objects with the exact structure:
   [
     { "key": "...", "translation": "..." }
   ]
3. Do NOT output any commentary, explanations, greetings, or markdown other than the raw JSON array.
4. Translate EVERY requested entry. DO NOT skip, rename, reorder, or omit any keys.
5. PRESERVE ALL PLACEHOLDERS EXACTLY AS THEY ARE.
   - Examples: {name}, {{count}}, %s, %d, %1$s, $t(key), @:key, :variable, #tag#.
   - NEVER translate, rename, or remove placeholder names.
6. PRESERVE ALL HTML / XML TAGS AND ATTRIBUTES EXACTLY.
   - Examples: <b>, </b>, <span class="...">, <a href="...">...</a>, <br/>.
7. PRESERVE ESCAPE SEQUENCES EXACTLY (e.g. \\n, \\t, \\r).
8. Maintain original grammar, capitalization, and punctuation.
9. If an entry's text is empty or whitespace only, return it unchanged.`
}

function buildBatchUserPrompt(
  entries: BatchTranslationEntryPayload[],
  targetLanguage: string,
  sourceLanguage?: string
): string {
  const fromLang = sourceLanguage ? ` from ${sourceLanguage}` : ''
  return `Translate the following ${entries.length} localization entries${fromLang} into target language "${targetLanguage}".
Return ONLY the JSON array of objects with "key" and "translation" fields:

${JSON.stringify(
  entries.map((e) => ({ key: e.key, text: e.text })),
  null,
  2
)}`
}

function cleanAiOutput(text: string): string {
  let cleaned = text.trim()
  if (cleaned.startsWith('```') && cleaned.endsWith('```')) {
    cleaned = cleaned.replace(/^```[a-zA-Z]*\n?/, '').replace(/\n?```$/, '').trim()
  }
  if (cleaned.length >= 2 && cleaned.startsWith('"') && cleaned.endsWith('"')) {
    cleaned = cleaned.substring(1, cleaned.length - 1)
  }
  return cleaned
}

function extractJsonArrayString(text: string): string {
  let cleaned = text.trim()
  const codeBlockMatch = cleaned.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i)
  if (codeBlockMatch) {
    cleaned = codeBlockMatch[1].trim()
  } else {
    const first = cleaned.indexOf('[')
    const last = cleaned.lastIndexOf(']')
    if (first !== -1 && last !== -1 && last > first) {
      cleaned = cleaned.substring(first, last + 1).trim()
    }
  }
  return cleaned
}

/**
 * Validates and parses a raw batch response JSON string.
 */
function parseAndValidateBatchOutput(
  rawText: string,
  entries: BatchTranslationEntryPayload[]
): { key: string; translation: string }[] {
  const cleaned = extractJsonArrayString(rawText)
  let parsed: unknown
  try {
    parsed = JSON.parse(cleaned)
  } catch (err) {
    throw new AiTranslationError(
      `Invalid JSON array returned by AI model: ${err instanceof Error ? err.message : String(err)}`,
      { code: 'INVALID_JSON_RESPONSE', retryable: false }
    )
  }

  if (!Array.isArray(parsed)) {
    throw new AiTranslationError(
      'AI model did not return a JSON array as requested.',
      { code: 'INVALID_JSON_STRUCTURE', retryable: false }
    )
  }

  const requestedMap = new Map<string, string>()
  for (const e of entries) {
    requestedMap.set(e.key, e.text)
  }

  const result: { key: string; translation: string }[] = []
  const seenKeys = new Set<string>()

  for (const item of parsed) {
    if (!item || typeof item !== 'object') continue
    const key = (item as Record<string, unknown>).key
    const translation = (item as Record<string, unknown>).translation

    if (typeof key === 'string' && typeof translation === 'string') {
      if (requestedMap.has(key) && !seenKeys.has(key)) {
        seenKeys.add(key)
        result.push({ key, translation })
      }
    }
  }

  // If any requested keys are missing, fallback or fail
  for (const e of entries) {
    if (!seenKeys.has(e.key)) {
      throw new AiTranslationError(
        `Batch response is missing translation for key: "${e.key}".`,
        { code: 'MISSING_BATCH_KEY', retryable: false }
      )
    }
  }

  return result
}

export async function performAiTranslation(
  request: AiTranslationRequestPayload,
  settings: AiTranslationSettingsPayload
): Promise<AiTranslationResponsePayload> {
  const provider = settings.provider || 'mock'
  const config = settings.providers[provider] || { model: 'default' }
  const targetLanguage =
    request.targetLanguage || request.targetFile.replace(/\.json$/i, '')
  const sourceLanguage =
    request.sourceLanguage || request.sourceFile.replace(/\.json$/i, '')

  if (!request.sourceValue) {
    return {
      translatedText: '',
      provider,
      model: config.model || 'default',
    }
  }

  const systemPrompt = buildSystemPrompt(targetLanguage, request.context)
  const userPrompt = buildUserPrompt(request.sourceValue, request.key, sourceLanguage)

  // 1. Mock / Offline
  if (provider === 'mock') {
    return {
      translatedText: `[AI: ${targetLanguage.toUpperCase()}] ${request.sourceValue}`,
      provider: 'mock',
      model: config.model || 'mock-v1',
    }
  }

  // 2. OpenAI / Compatible (xAI, Mistral, DeepSeek)
  if (
    provider === 'openai' ||
    provider === 'mistral' ||
    provider === 'xai' ||
    provider === 'deepseek'
  ) {
    if (!config.apiKey?.trim()) {
      throw new AiTranslationError(
        `API key is required for ${provider.toUpperCase()}.`,
        { code: 'MISSING_API_KEY', retryable: false }
      )
    }

    let endpoint = 'https://api.openai.com/v1/chat/completions'
    if (provider === 'mistral') endpoint = 'https://api.mistral.ai/v1/chat/completions'
    if (provider === 'xai') endpoint = 'https://api.x.ai/v1/chat/completions'
    if (provider === 'deepseek') endpoint = 'https://api.deepseek.com/chat/completions'

    let response: Response
    try {
      response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${config.apiKey.trim()}`,
        },
        body: JSON.stringify({
          model: config.model || (provider === 'openai' ? 'gpt-4o-mini' : 'default'),
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt },
          ],
          temperature: 0.2,
        }),
      })
    } catch (err) {
      throw new AiTranslationError(
        `Network error connecting to ${provider.toUpperCase()}: ${err instanceof Error ? err.message : String(err)}`,
        { retryable: true, code: 'NETWORK_ERROR' }
      )
    }

    if (!response.ok) {
      const errText = await response.text()
      const retryAfterMs = parseRetryAfterHeader(
        response.headers?.get ? response.headers.get('retry-after') : undefined
      )
      const status = response.status
      const retryable = status === 429 || (status >= 500 && status <= 504) || status === 408

      let message = `${provider.toUpperCase()} API Error (${status}): ${errText || response.statusText}`
      let code = `HTTP_${status}`

      if (status === 429) {
        message = `${provider.toUpperCase()} rate limit reached (HTTP 429). Too many requests.`
        code = 'RATE_LIMIT'
      } else if (status === 401 || status === 403) {
        message = `Unauthorized ${provider.toUpperCase()} request (HTTP ${status}). Please check your API key in Settings.`
        code = 'UNAUTHORIZED'
      }

      throw new AiTranslationError(message, {
        status,
        retryable,
        retryAfterMs,
        code,
      })
    }

    const data = (await response.json()) as {
      choices?: { message?: { content?: string } }[]
    }
    const content = data.choices?.[0]?.message?.content ?? ''
    return {
      translatedText: cleanAiOutput(content),
      provider,
      model: config.model,
    }
  }

  // 3. Google Gemini
  if (provider === 'gemini') {
    if (!config.apiKey?.trim()) {
      throw new AiTranslationError('API key is required for Google Gemini.', {
        code: 'MISSING_API_KEY',
        retryable: false,
      })
    }

    const rawModel = (config.model || 'gemini-3.6-flash')
      .trim()
      .replace(/^models\//i, '')

    // Fallback/auto-migrate obsolete models (e.g. gemini-2.0-flash)
    const effectiveModel = DEPRECATED_GEMINI_MODELS.has(rawModel.toLowerCase())
      ? 'gemini-3.6-flash'
      : rawModel

    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${effectiveModel}:generateContent?key=${encodeURIComponent(
      config.apiKey.trim()
    )}`

    let response: Response
    try {
      response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          contents: [
            {
              role: 'user',
              parts: [{ text: `${systemPrompt}\n\n${userPrompt}` }],
            },
          ],
          generationConfig: {
            temperature: 0.2,
          },
        }),
      })
    } catch (err) {
      throw new AiTranslationError(
        `Network error connecting to Google Gemini: ${err instanceof Error ? err.message : String(err)}`,
        { retryable: true, code: 'NETWORK_ERROR' }
      )
    }

    if (!response.ok) {
      const errText = await response.text()
      const retryAfterMs = parseRetryAfterHeader(
        response.headers?.get ? response.headers.get('retry-after') : undefined
      )
      const status = response.status
      const retryable = status === 429 || (status >= 500 && status <= 504) || status === 408

      let message = `Gemini API Error (${status}): ${errText || response.statusText}`
      let code = `HTTP_${status}`

      if (status === 429) {
        message = 'Google Gemini rate limit reached (HTTP 429). Too many requests.'
        code = 'RATE_LIMIT'
      } else if (status === 404) {
        message = `The selected Gemini model ("${rawModel}") is no longer available. Please select a supported model (such as gemini-3.6-flash) in Settings.`
        code = 'MODEL_NOT_FOUND'
      } else if (status === 400 && errText.includes('API_KEY_INVALID')) {
        message = 'Invalid Google Gemini API key. Please check your API key in Settings.'
        code = 'INVALID_API_KEY'
      } else if (status === 401 || status === 403) {
        message = 'Unauthorized Google Gemini request. Please check your API key permissions in Settings.'
        code = 'UNAUTHORIZED'
      }

      throw new AiTranslationError(message, {
        status,
        retryable,
        retryAfterMs,
        code,
      })
    }

    const data = (await response.json()) as {
      candidates?: { content?: { parts?: { text?: string }[] } }[]
      outputs?: { text?: string }[]
      interaction?: { output?: string }
      text?: string
    }

    let content = ''
    if (data.candidates?.[0]?.content?.parts?.[0]?.text) {
      content = data.candidates[0].content.parts[0].text
    } else if (data.outputs?.[0]?.text) {
      content = data.outputs[0].text
    } else if (data.interaction?.output) {
      content = data.interaction.output
    } else if (typeof data.text === 'string') {
      content = data.text
    }

    return {
      translatedText: cleanAiOutput(content),
      provider: 'gemini',
      model: effectiveModel,
    }
  }

  // 4. Anthropic Claude
  if (provider === 'anthropic') {
    if (!config.apiKey?.trim()) {
      throw new AiTranslationError('API key is required for Anthropic Claude.', {
        code: 'MISSING_API_KEY',
        retryable: false,
      })
    }

    const model = config.model || 'claude-3-5-sonnet-20241022'
    const endpoint = 'https://api.anthropic.com/v1/messages'

    let response: Response
    try {
      response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': config.apiKey.trim(),
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model,
          max_tokens: 1024,
          system: systemPrompt,
          messages: [{ role: 'user', content: userPrompt }],
          temperature: 0.2,
        }),
      })
    } catch (err) {
      throw new AiTranslationError(
        `Network error connecting to Anthropic: ${err instanceof Error ? err.message : String(err)}`,
        { retryable: true, code: 'NETWORK_ERROR' }
      )
    }

    if (!response.ok) {
      const errText = await response.text()
      const retryAfterMs = parseRetryAfterHeader(
        response.headers?.get ? response.headers.get('retry-after') : undefined
      )
      const status = response.status
      const retryable = status === 429 || (status >= 500 && status <= 504) || status === 408

      let message = `Anthropic API Error (${status}): ${errText || response.statusText}`
      let code = `HTTP_${status}`

      if (status === 429) {
        message = 'Anthropic Claude rate limit reached (HTTP 429). Too many requests.'
        code = 'RATE_LIMIT'
      } else if (status === 401 || status === 403) {
        message = 'Unauthorized Anthropic Claude request (HTTP 401/403). Please check your API key in Settings.'
        code = 'UNAUTHORIZED'
      }

      throw new AiTranslationError(message, {
        status,
        retryable,
        retryAfterMs,
        code,
      })
    }

    const data = (await response.json()) as {
      content?: { text?: string }[]
    }
    const content = data.content?.[0]?.text ?? ''
    return {
      translatedText: cleanAiOutput(content),
      provider: 'anthropic',
      model,
    }
  }

  // 5. Ollama (Local)
  if (provider === 'ollama') {
    const baseUrl = (config.baseUrl?.trim() || 'http://localhost:11434').replace(
      /\/+$/,
      ''
    )
    const endpoint = `${baseUrl}/api/chat`
    const model = config.model || 'llama3.1'

    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model,
          stream: false,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt },
          ],
          options: {
            temperature: 0.2,
          },
        }),
      })

      if (!response.ok) {
        const errText = await response.text()
        const status = response.status
        const retryable = status === 429 || (status >= 500 && status <= 504)
        throw new AiTranslationError(
          `Ollama Error (${status}): ${errText || response.statusText}`,
          {
            status,
            retryable,
            code: `HTTP_${status}`,
          }
        )
      }

      const data = (await response.json()) as {
        message?: { content?: string }
      }
      const content = data.message?.content ?? ''
      return {
        translatedText: cleanAiOutput(content),
        provider: 'ollama',
        model,
      }
    } catch (err) {
      if (err instanceof AiTranslationError) {
        throw err
      }
      if (
        err instanceof TypeError &&
        (err.message.includes('fetch failed') || err.message.includes('ECONNREFUSED'))
      ) {
        throw new AiTranslationError(
          `Unable to connect to Ollama at ${baseUrl}. Ensure the Ollama server is running.`,
          {
            status: 0,
            retryable: false,
            code: 'CONNECTION_REFUSED',
          }
        )
      }
      throw err
    }
  }

  throw new AiTranslationError(`Unsupported AI provider: "${provider}"`, {
    code: 'UNSUPPORTED_PROVIDER',
    retryable: false,
  })
}

/**
 * Performs batch AI translation for a chunk of localization entries in a single request.
 */
export async function performBatchAiTranslation(
  request: BatchAiTranslationRequestPayload,
  settings: AiTranslationSettingsPayload
): Promise<BatchAiTranslationResponsePayload> {
  const provider = settings.provider || 'mock'
  const config = settings.providers[provider] || { model: 'default' }
  const targetLanguage = request.targetLanguage

  if (!request.entries || request.entries.length === 0) {
    return {
      translations: [],
      provider,
      model: config.model || 'default',
    }
  }

  // 1. Mock Provider
  if (provider === 'mock') {
    const translations = request.entries.map((e) => ({
      key: e.key,
      translation: e.text ? `[AI: ${targetLanguage.toUpperCase()}] ${e.text}` : '',
    }))
    return {
      translations,
      provider: 'mock',
      model: config.model || 'mock-v1',
    }
  }

  const systemPrompt = buildBatchSystemPrompt(targetLanguage)
  const userPrompt = buildBatchUserPrompt(
    request.entries,
    targetLanguage,
    request.sourceLanguage
  )

  // 2. OpenAI / Compatible
  if (
    provider === 'openai' ||
    provider === 'mistral' ||
    provider === 'xai' ||
    provider === 'deepseek'
  ) {
    if (!config.apiKey?.trim()) {
      throw new AiTranslationError(
        `API key is required for ${provider.toUpperCase()}.`,
        { code: 'MISSING_API_KEY', retryable: false }
      )
    }

    let endpoint = 'https://api.openai.com/v1/chat/completions'
    if (provider === 'mistral') endpoint = 'https://api.mistral.ai/v1/chat/completions'
    if (provider === 'xai') endpoint = 'https://api.x.ai/v1/chat/completions'
    if (provider === 'deepseek') endpoint = 'https://api.deepseek.com/chat/completions'

    let response: Response
    try {
      response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${config.apiKey.trim()}`,
        },
        body: JSON.stringify({
          model: config.model || (provider === 'openai' ? 'gpt-4o-mini' : 'default'),
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt },
          ],
          temperature: 0.2,
        }),
      })
    } catch (err) {
      throw new AiTranslationError(
        `Network error connecting to ${provider.toUpperCase()}: ${err instanceof Error ? err.message : String(err)}`,
        { retryable: true, code: 'NETWORK_ERROR' }
      )
    }

    if (!response.ok) {
      const errText = await response.text()
      const retryAfterMs = parseRetryAfterHeader(
        response.headers?.get ? response.headers.get('retry-after') : undefined
      )
      const status = response.status
      const retryable = status === 429 || (status >= 500 && status <= 504) || status === 408

      throw new AiTranslationError(
        `${provider.toUpperCase()} API Error (${status}): ${errText || response.statusText}`,
        { status, retryable, retryAfterMs, code: `HTTP_${status}` }
      )
    }

    const data = (await response.json()) as {
      choices?: { message?: { content?: string } }[]
    }
    const content = data.choices?.[0]?.message?.content ?? ''
    const translations = parseAndValidateBatchOutput(content, request.entries)

    return {
      translations,
      provider,
      model: config.model,
    }
  }

  // 3. Google Gemini
  if (provider === 'gemini') {
    if (!config.apiKey?.trim()) {
      throw new AiTranslationError('API key is required for Google Gemini.', {
        code: 'MISSING_API_KEY',
        retryable: false,
      })
    }

    const rawModel = (config.model || 'gemini-3.6-flash')
      .trim()
      .replace(/^models\//i, '')

    const effectiveModel = DEPRECATED_GEMINI_MODELS.has(rawModel.toLowerCase())
      ? 'gemini-3.6-flash'
      : rawModel

    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${effectiveModel}:generateContent?key=${encodeURIComponent(
      config.apiKey.trim()
    )}`

    let response: Response
    try {
      response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          contents: [
            {
              role: 'user',
              parts: [{ text: `${systemPrompt}\n\n${userPrompt}` }],
            },
          ],
          generationConfig: {
            temperature: 0.2,
          },
        }),
      })
    } catch (err) {
      throw new AiTranslationError(
        `Network error connecting to Google Gemini: ${err instanceof Error ? err.message : String(err)}`,
        { retryable: true, code: 'NETWORK_ERROR' }
      )
    }

    if (!response.ok) {
      const errText = await response.text()
      const retryAfterMs = parseRetryAfterHeader(
        response.headers?.get ? response.headers.get('retry-after') : undefined
      )
      const status = response.status
      const retryable = status === 429 || (status >= 500 && status <= 504) || status === 408

      throw new AiTranslationError(
        `Gemini API Error (${status}): ${errText || response.statusText}`,
        { status, retryable, retryAfterMs, code: `HTTP_${status}` }
      )
    }

    const data = (await response.json()) as {
      candidates?: { content?: { parts?: { text?: string }[] } }[]
      outputs?: { text?: string }[]
      text?: string
    }

    let content = ''
    if (data.candidates?.[0]?.content?.parts?.[0]?.text) {
      content = data.candidates[0].content.parts[0].text
    } else if (data.outputs?.[0]?.text) {
      content = data.outputs[0].text
    } else if (typeof data.text === 'string') {
      content = data.text
    }

    const translations = parseAndValidateBatchOutput(content, request.entries)
    return {
      translations,
      provider: 'gemini',
      model: effectiveModel,
    }
  }

  // 4. Anthropic Claude
  if (provider === 'anthropic') {
    if (!config.apiKey?.trim()) {
      throw new AiTranslationError('API key is required for Anthropic Claude.', {
        code: 'MISSING_API_KEY',
        retryable: false,
      })
    }

    const model = config.model || 'claude-3-5-sonnet-20241022'
    const endpoint = 'https://api.anthropic.com/v1/messages'

    let response: Response
    try {
      response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': config.apiKey.trim(),
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model,
          max_tokens: 4096,
          system: systemPrompt,
          messages: [{ role: 'user', content: userPrompt }],
          temperature: 0.2,
        }),
      })
    } catch (err) {
      throw new AiTranslationError(
        `Network error connecting to Anthropic: ${err instanceof Error ? err.message : String(err)}`,
        { retryable: true, code: 'NETWORK_ERROR' }
      )
    }

    if (!response.ok) {
      const errText = await response.text()
      const retryAfterMs = parseRetryAfterHeader(
        response.headers?.get ? response.headers.get('retry-after') : undefined
      )
      const status = response.status
      const retryable = status === 429 || (status >= 500 && status <= 504) || status === 408

      throw new AiTranslationError(
        `Anthropic API Error (${status}): ${errText || response.statusText}`,
        { status, retryable, retryAfterMs, code: `HTTP_${status}` }
      )
    }

    const data = (await response.json()) as {
      content?: { text?: string }[]
    }
    const content = data.content?.[0]?.text ?? ''
    const translations = parseAndValidateBatchOutput(content, request.entries)

    return {
      translations,
      provider: 'anthropic',
      model,
    }
  }

  // 5. Ollama
  if (provider === 'ollama') {
    const baseUrl = (config.baseUrl?.trim() || 'http://localhost:11434').replace(
      /\/+$/,
      ''
    )
    const endpoint = `${baseUrl}/api/chat`
    const model = config.model || 'llama3.1'

    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model,
          stream: false,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt },
          ],
          options: {
            temperature: 0.2,
          },
        }),
      })

      if (!response.ok) {
        const errText = await response.text()
        const status = response.status
        const retryable = status === 429 || (status >= 500 && status <= 504)
        throw new AiTranslationError(
          `Ollama Error (${status}): ${errText || response.statusText}`,
          { status, retryable, code: `HTTP_${status}` }
        )
      }

      const data = (await response.json()) as {
        message?: { content?: string }
      }
      const content = data.message?.content ?? ''
      const translations = parseAndValidateBatchOutput(content, request.entries)

      return {
        translations,
        provider: 'ollama',
        model,
      }
    } catch (err) {
      if (err instanceof AiTranslationError) throw err
      if (
        err instanceof TypeError &&
        (err.message.includes('fetch failed') || err.message.includes('ECONNREFUSED'))
      ) {
        throw new AiTranslationError(
          `Unable to connect to Ollama at ${baseUrl}. Ensure the Ollama server is running.`,
          { status: 0, retryable: false, code: 'CONNECTION_REFUSED' }
        )
      }
      throw err
    }
  }

  throw new AiTranslationError(`Unsupported AI provider: "${provider}"`, {
    code: 'UNSUPPORTED_PROVIDER',
    retryable: false,
  })
}

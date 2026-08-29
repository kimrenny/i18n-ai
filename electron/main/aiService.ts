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

function cleanAiOutput(text: string): string {
  let cleaned = text.trim()
  // Remove wrapping backticks / markdown code blocks if the model erroneously added them
  if (cleaned.startsWith('```') && cleaned.endsWith('```')) {
    cleaned = cleaned.replace(/^```[a-zA-Z]*\n?/, '').replace(/\n?```$/, '').trim()
  }
  // Remove wrapping double quotes if the model wrapped the entire output in quotes
  if (cleaned.length >= 2 && cleaned.startsWith('"') && cleaned.endsWith('"')) {
    cleaned = cleaned.substring(1, cleaned.length - 1)
  }
  return cleaned
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
      throw new Error(`API key is required for ${provider.toUpperCase()}.`)
    }

    let endpoint = 'https://api.openai.com/v1/chat/completions'
    if (provider === 'mistral') endpoint = 'https://api.mistral.ai/v1/chat/completions'
    if (provider === 'xai') endpoint = 'https://api.x.ai/v1/chat/completions'
    if (provider === 'deepseek') endpoint = 'https://api.deepseek.com/chat/completions'

    const response = await fetch(endpoint, {
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

    if (!response.ok) {
      const errText = await response.text()
      throw new Error(
        `${provider.toUpperCase()} API Error (${response.status}): ${errText || response.statusText}`
      )
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
      throw new Error('API key is required for Google Gemini.')
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

    const response = await fetch(endpoint, {
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

    if (!response.ok) {
      const errText = await response.text()

      if (response.status === 404) {
        throw new Error(
          `The selected Gemini model ("${rawModel}") is no longer available. Please select a supported model (such as gemini-3.6-flash) in Settings.`
        )
      }
      if (response.status === 400 && errText.includes('API_KEY_INVALID')) {
        throw new Error(
          'Invalid Google Gemini API key. Please check your API key in Settings.'
        )
      }
      if (response.status === 401 || response.status === 403) {
        throw new Error(
          'Unauthorized Google Gemini request. Please check your API key permissions in Settings.'
        )
      }

      throw new Error(
        `Gemini API Error (${response.status}): ${errText || response.statusText}`
      )
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
      throw new Error('API key is required for Anthropic Claude.')
    }

    const model = config.model || 'claude-3-5-sonnet-20241022'
    const endpoint = 'https://api.anthropic.com/v1/messages'

    const response = await fetch(endpoint, {
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

    if (!response.ok) {
      const errText = await response.text()
      throw new Error(
        `Anthropic API Error (${response.status}): ${errText || response.statusText}`
      )
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
        throw new Error(
          `Ollama Error (${response.status}): ${errText || response.statusText}`
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
      if (
        err instanceof TypeError &&
        (err.message.includes('fetch failed') || err.message.includes('ECONNREFUSED'))
      ) {
        throw new Error(
          `Unable to connect to Ollama at ${baseUrl}. Ensure the Ollama server is running.`
        )
      }
      throw err
    }
  }

  throw new Error(`Unsupported AI provider: "${provider}"`)
}

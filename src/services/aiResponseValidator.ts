/**
 * Validates batch translation responses from AI providers.
 * Enforces strict key matching, format validation, duplicate detection,
 * and preservation of placeholders and HTML/XML tags.
 */

export interface TranslationEntryRequest {
  key: string
  text: string
}

export interface ValidatedTranslationEntry {
  key: string
  translation: string
}

export interface ValidationResult {
  valid: boolean
  translations: ValidatedTranslationEntry[]
  error?: string
}

// Regex patterns to capture software placeholders
// Matches: {name}, {{count}}, %s, %d, %1$s, $t(key), @:key, :variable, #tag#
const PLACEHOLDER_REGEX = /\{\{[^}]+\}\}|\{[^}]+\}|%[0-9]*\$?[sd]|%s|%d|\$t\([^)]+\)|@:[a-zA-Z0-9_.-]+|:[a-zA-Z0-9_]+|#[a-zA-Z0-9_]+#/g

// Regex pattern to capture HTML/XML tags
const HTML_TAG_REGEX = /<\/?([a-zA-Z0-9_-]+)(?:\s+[^>]*?)?\/?>/g

export function extractPlaceholders(text: string): string[] {
  if (!text) return []
  const matches = text.match(PLACEHOLDER_REGEX)
  return matches ? Array.from(new Set(matches)) : []
}

export function extractHtmlTags(text: string): string[] {
  if (!text) return []
  const matches = text.match(HTML_TAG_REGEX)
  return matches ? Array.from(new Set(matches)) : []
}

/**
 * Strips markdown code block wrappers (```json ... ```) or trims whitespace.
 */
export function extractJsonFromAiResponse(raw: string): string {
  let cleaned = raw.trim()

  // Match ```json ... ``` or ``` ... ```
  const codeBlockMatch = cleaned.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i)
  if (codeBlockMatch) {
    cleaned = codeBlockMatch[1].trim()
  } else {
    // If output has extra leading/trailing text, locate the outermost JSON array '[' ... ']'
    const firstBracket = cleaned.indexOf('[')
    const lastBracket = cleaned.lastIndexOf(']')
    if (firstBracket !== -1 && lastBracket !== -1 && lastBracket > firstBracket) {
      cleaned = cleaned.substring(firstBracket, lastBracket + 1).trim()
    }
  }

  return cleaned
}

/**
 * Validates that an AI batch response matches the requested keys and preserves
 * critical localization tokens.
 */
export function validateBatchTranslationResponse(
  requested: readonly TranslationEntryRequest[],
  rawContent: string
): ValidationResult {
  if (!rawContent || !rawContent.trim()) {
    return {
      valid: false,
      translations: [],
      error: 'Empty response received from AI provider.',
    }
  }

  const cleanedJson = extractJsonFromAiResponse(rawContent)
  let parsed: unknown

  try {
    parsed = JSON.parse(cleanedJson)
  } catch (err) {
    return {
      valid: false,
      translations: [],
      error: `Invalid JSON format in AI response: ${err instanceof Error ? err.message : String(err)}`,
    }
  }

  if (!Array.isArray(parsed)) {
    return {
      valid: false,
      translations: [],
      error: 'AI response must be a JSON array of translation objects.',
    }
  }

  const requestedKeyMap = new Map<string, string>()
  for (const item of requested) {
    requestedKeyMap.set(item.key, item.text)
  }

  const receivedKeySet = new Set<string>()
  const validatedList: ValidatedTranslationEntry[] = []

  for (let i = 0; i < parsed.length; i++) {
    const item = parsed[i]

    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      return {
        valid: false,
        translations: [],
        error: `Item at index ${i} is not a valid JSON object.`,
      }
    }

    const key = (item as Record<string, unknown>).key
    const translation = (item as Record<string, unknown>).translation

    if (typeof key !== 'string' || !key.trim()) {
      return {
        valid: false,
        translations: [],
        error: `Item at index ${i} is missing a valid "key" string property.`,
      }
    }

    if (typeof translation !== 'string') {
      return {
        valid: false,
        translations: [],
        error: `Translation for key "${key}" must be a string, got ${typeof translation}.`,
      }
    }

    if (!requestedKeyMap.has(key)) {
      return {
        valid: false,
        translations: [],
        error: `Unexpected key "${key}" returned by AI that was not in the batch request.`,
      }
    }

    if (receivedKeySet.has(key)) {
      return {
        valid: false,
        translations: [],
        error: `Duplicate key "${key}" returned in batch response.`,
      }
    }

    receivedKeySet.add(key)
    const sourceText = requestedKeyMap.get(key) || ''

    // If source was non-empty, translation should not be accidentally empty
    if (sourceText.trim() !== '' && translation.trim() === '') {
      return {
        valid: false,
        translations: [],
        error: `Empty translation returned for non-empty key "${key}".`,
      }
    }

    // Verify Placeholders Preservation
    const sourcePlaceholders = extractPlaceholders(sourceText)
    for (const ph of sourcePlaceholders) {
      if (!translation.includes(ph)) {
        return {
          valid: false,
          translations: [],
          error: `Placeholder "${ph}" in key "${key}" was corrupted or removed in translation: "${translation}".`,
        }
      }
    }

    // Verify HTML/XML Tags Preservation
    const sourceTags = extractHtmlTags(sourceText)
    for (const tag of sourceTags) {
      if (!translation.includes(tag)) {
        return {
          valid: false,
          translations: [],
          error: `HTML/XML tag "${tag}" in key "${key}" was corrupted or removed in translation: "${translation}".`,
        }
      }
    }

    validatedList.push({
      key,
      translation,
    })
  }

  // Verify all requested keys were returned
  for (const req of requested) {
    if (!receivedKeySet.has(req.key)) {
      return {
        valid: false,
        translations: [],
        error: `Missing translation for requested key "${req.key}" in batch response.`,
      }
    }
  }

  return {
    valid: true,
    translations: validatedList,
  }
}

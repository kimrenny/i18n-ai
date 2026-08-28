import type {
  JsonValue,
  ParsedLocalizationFile,
  FileParseResult,
} from '../types/localization'

/**
 * Flattens a nested JSON object into dot-notation localization keys.
 *
 * Rules:
 * - Nested objects are recursively flattened using dot notation: `A.B.C`.
 * - Arrays are treated as leaf values (do not generate numeric indices).
 * - Primitive values (string, number, boolean, null) are leaf values.
 * - Empty objects `{}` do not generate artificial keys.
 */
export function flattenLocalizationKeys(
  data: unknown,
  prefix = ''
): Record<string, JsonValue> {
  const result: Record<string, JsonValue> = {}

  if (data === null || typeof data !== 'object' || Array.isArray(data)) {
    if (prefix) {
      result[prefix] = data as JsonValue
    }
    return result
  }

  for (const [key, value] of Object.entries(data as Record<string, unknown>)) {
    const currentKey = prefix ? `${prefix}.${key}` : key

    if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
      const nestedEntries = Object.entries(value)
      if (nestedEntries.length === 0) {
        // Empty objects are safely ignored without generating artificial keys
        continue
      }
      const nestedFlattened = flattenLocalizationKeys(value, currentKey)
      Object.assign(result, nestedFlattened)
    } else {
      result[currentKey] = value as JsonValue
    }
  }

  return result
}

/**
 * Parses in-memory JSON data into a structured localization representation
 * containing both original raw data and flattened dot-notation keys.
 */
export function parseLocalizationData(
  filename: string,
  filePath: string,
  rawJson: unknown
): ParsedLocalizationFile {
  const keys = flattenLocalizationKeys(rawJson)
  return {
    filename,
    path: filePath,
    raw: rawJson as JsonValue,
    keys,
    keyCount: Object.keys(keys).length,
  }
}

/**
 * Parses raw JSON string into a structured FileParseResult, capturing syntax errors safely.
 */
export function parseLocalizationJsonString(
  filename: string,
  filePath: string,
  jsonString: string
): FileParseResult {
  try {
    const parsed = JSON.parse(jsonString)
    const data = parseLocalizationData(filename, filePath, parsed)
    return {
      filename,
      path: filePath,
      success: true,
      data,
    }
  } catch (err) {
    return {
      filename,
      path: filePath,
      success: false,
      error: err instanceof Error ? err.message : 'Invalid JSON',
    }
  }
}

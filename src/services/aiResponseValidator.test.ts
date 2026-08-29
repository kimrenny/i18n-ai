import { describe, it, expect } from 'vitest'
import {
  validateBatchTranslationResponse,
  extractPlaceholders,
  extractHtmlTags,
  extractJsonFromAiResponse,
} from './aiResponseValidator'

describe('aiResponseValidator', () => {
  const sampleRequested = [
    { key: 'MENU.FILE.OPEN', text: 'Open' },
    { key: 'MENU.FILE.SAVE', text: 'Save {file_name}' },
    { key: 'USER.WELCOME', text: 'Welcome <b>{user}</b>, you have %d messages!' },
  ]

  it('validates a correct JSON batch response with preserved placeholders and markup', () => {
    const rawJson = JSON.stringify([
      { key: 'MENU.FILE.OPEN', translation: 'Открыть' },
      { key: 'MENU.FILE.SAVE', translation: 'Сохранить {file_name}' },
      { key: 'USER.WELCOME', translation: 'Добро пожаловать <b>{user}</b>, у вас %d сообщений!' },
    ])

    const result = validateBatchTranslationResponse(sampleRequested, rawJson)
    expect(result.valid).toBe(true)
    expect(result.translations).toHaveLength(3)
    expect(result.translations[0].translation).toBe('Открыть')
    expect(result.translations[1].translation).toBe('Сохранить {file_name}')
  })

  it('handles markdown codeblock wrapping (```json ... ```)', () => {
    const rawContent = `\`\`\`json
[
  { "key": "MENU.FILE.OPEN", "translation": "Открыть" },
  { "key": "MENU.FILE.SAVE", "translation": "Сохранить {file_name}" },
  { "key": "USER.WELCOME", "translation": "Добро пожаловать <b>{user}</b>, у вас %d сообщений!" }
]
\`\`\``

    const result = validateBatchTranslationResponse(sampleRequested, rawContent)
    expect(result.valid).toBe(true)
    expect(result.translations).toHaveLength(3)
  })

  it('fails if a requested key is missing from response', () => {
    const rawJson = JSON.stringify([
      { key: 'MENU.FILE.OPEN', translation: 'Открыть' },
      { key: 'MENU.FILE.SAVE', translation: 'Сохранить {file_name}' },
      // USER.WELCOME missing
    ])

    const result = validateBatchTranslationResponse(sampleRequested, rawJson)
    expect(result.valid).toBe(false)
    expect(result.error).toContain('Missing translation for requested key "USER.WELCOME"')
  })

  it('fails if an unexpected key is returned', () => {
    const rawJson = JSON.stringify([
      { key: 'MENU.FILE.OPEN', translation: 'Открыть' },
      { key: 'MENU.FILE.SAVE', translation: 'Сохранить {file_name}' },
      { key: 'USER.WELCOME', translation: 'Добро пожаловать <b>{user}</b>, у вас %d сообщений!' },
      { key: 'UNEXPECTED.KEY', translation: 'Лишний' },
    ])

    const result = validateBatchTranslationResponse(sampleRequested, rawJson)
    expect(result.valid).toBe(false)
    expect(result.error).toContain('Unexpected key "UNEXPECTED.KEY"')
  })

  it('fails if duplicate keys are returned in the batch response', () => {
    const rawJson = JSON.stringify([
      { key: 'MENU.FILE.OPEN', translation: 'Открыть' },
      { key: 'MENU.FILE.OPEN', translation: 'Открыть 2' },
      { key: 'MENU.FILE.SAVE', translation: 'Сохранить {file_name}' },
      { key: 'USER.WELCOME', translation: 'Добро пожаловать <b>{user}</b>, у вас %d сообщений!' },
    ])

    const result = validateBatchTranslationResponse(sampleRequested, rawJson)
    expect(result.valid).toBe(false)
    expect(result.error).toContain('Duplicate key "MENU.FILE.OPEN"')
  })

  it('fails if a placeholder is removed or corrupted', () => {
    const rawJson = JSON.stringify([
      { key: 'MENU.FILE.OPEN', translation: 'Открыть' },
      { key: 'MENU.FILE.SAVE', translation: 'Сохранить имя_файла' }, // {file_name} was removed!
      { key: 'USER.WELCOME', translation: 'Добро пожаловать <b>{user}</b>, у вас %d сообщений!' },
    ])

    const result = validateBatchTranslationResponse(sampleRequested, rawJson)
    expect(result.valid).toBe(false)
    expect(result.error).toContain('Placeholder "{file_name}"')
  })

  it('fails if HTML/XML markup is corrupted or removed', () => {
    const rawJson = JSON.stringify([
      { key: 'MENU.FILE.OPEN', translation: 'Открыть' },
      { key: 'MENU.FILE.SAVE', translation: 'Сохранить {file_name}' },
      { key: 'USER.WELCOME', translation: 'Добро пожаловать {user}, у вас %d сообщений!' }, // <b> removed!
    ])

    const result = validateBatchTranslationResponse(sampleRequested, rawJson)
    expect(result.valid).toBe(false)
    expect(result.error).toContain('HTML/XML tag "<b>"')
  })

  it('extracts placeholders and html tags accurately', () => {
    expect(
      extractPlaceholders('Hello {name}, you have {{count}} items (%s) and %1$s, $t(item.name)')
    ).toEqual(['{name}', '{{count}}', '%s', '%1$s', '$t(item.name)'])

    expect(
      extractHtmlTags('Click <a href="link"><b>here</b></a> or <br/>')
    ).toEqual(['<a href="link">', '<b>', '</b>', '</a>', '<br/>'])
  })

  it('extracts JSON array when surrounded by miscellaneous model commentary', () => {
    const raw = `Here is the translation:
[
  { "key": "A", "translation": "B" }
]
Hope that helps!`
    expect(extractJsonFromAiResponse(raw)).toBe('[\n  { "key": "A", "translation": "B" }\n]')
  })
})

import { describe, it, expect } from 'vitest'
import {
  flattenLocalizationKeys,
  parseLocalizationData,
  parseLocalizationJsonString,
} from './localizationParser'

describe('localizationParser', () => {
  describe('flattenLocalizationKeys', () => {
    it('handles simple flat object', () => {
      const data = { HELLO: 'Hello' }
      const keys = flattenLocalizationKeys(data)

      expect(keys).toEqual({
        HELLO: 'Hello',
      })
    })

    it('handles nested objects', () => {
      const data = {
        ADMIN: {
          PANEL: {
            TITLE: 'Admin',
          },
        },
      }
      const keys = flattenLocalizationKeys(data)

      expect(keys).toEqual({
        'ADMIN.PANEL.TITLE': 'Admin',
      })
    })

    it('handles arbitrary deep nesting', () => {
      const data = {
        L1: {
          L2: {
            L3: {
              L4: {
                L5: {
                  VALUE: 'Deep nested text',
                },
              },
            },
          },
        },
      }
      const keys = flattenLocalizationKeys(data)

      expect(keys).toEqual({
        'L1.L2.L3.L4.L5.VALUE': 'Deep nested text',
      })
    })

    it('discovers all branches across multiple levels', () => {
      const data = {
        AUTH: {
          LOGIN: {
            TITLE: 'Login',
            BUTTON: {
              SUBMIT: 'Submit',
              CANCEL: 'Cancel',
            },
          },
          LOGOUT: {
            TITLE: 'Logout',
          },
        },
        COMMON: {
          OK: 'OK',
        },
      }
      const keys = flattenLocalizationKeys(data)

      expect(keys).toEqual({
        'AUTH.LOGIN.TITLE': 'Login',
        'AUTH.LOGIN.BUTTON.SUBMIT': 'Submit',
        'AUTH.LOGIN.BUTTON.CANCEL': 'Cancel',
        'AUTH.LOGOUT.TITLE': 'Logout',
        'COMMON.OK': 'OK',
      })
    })

    it('treats arrays as leaf values without generating numeric indices', () => {
      const data = {
        ITEMS: ['one', 'two', 'three'],
        NESTED: {
          TAGS: ['a', 'b'],
        },
      }
      const keys = flattenLocalizationKeys(data)

      expect(keys).toEqual({
        ITEMS: ['one', 'two', 'three'],
        'NESTED.TAGS': ['a', 'b'],
      })
      expect(keys['ITEMS.0']).toBeUndefined()
      expect(keys['ITEMS.1']).toBeUndefined()
    })

    it('preserves primitive values: string, number, boolean, and null', () => {
      const data = {
        APP: {
          NAME: 'App',
          VERSION: 42,
          ENABLED: true,
          DISABLED: false,
          DESCRIPTION: null,
        },
      }
      const keys = flattenLocalizationKeys(data)

      expect(keys).toEqual({
        'APP.NAME': 'App',
        'APP.VERSION': 42,
        'APP.ENABLED': true,
        'APP.DISABLED': false,
        'APP.DESCRIPTION': null,
      })
    })

    it('safely handles empty objects without artificial keys or infinite recursion', () => {
      const data = {
        ADMIN: {},
        USER: {
          PROFILE: {},
          NAME: 'Alice',
        },
      }
      const keys = flattenLocalizationKeys(data)

      expect(keys).toEqual({
        'USER.NAME': 'Alice',
      })
      expect(keys['ADMIN']).toBeUndefined()
      expect(keys['USER.PROFILE']).toBeUndefined()
    })
  })

  describe('parseLocalizationData', () => {
    it('creates ParsedLocalizationFile preserving raw structure and key count', () => {
      const raw = {
        ADMIN: {
          PANEL: {
            TITLE: 'Admin panel',
            BUTTON: {
              SAVE: 'Save',
            },
          },
        },
      }

      const result = parseLocalizationData('en.json', '/locales/en.json', raw)

      expect(result.filename).toBe('en.json')
      expect(result.path).toBe('/locales/en.json')
      expect(result.raw).toEqual(raw)
      expect(result.keyCount).toBe(2)
      expect(result.keys).toEqual({
        'ADMIN.PANEL.TITLE': 'Admin panel',
        'ADMIN.PANEL.BUTTON.SAVE': 'Save',
      })
    })
  })

  describe('parseLocalizationJsonString and multi-file error isolation', () => {
    it('successfully parses valid JSON string', () => {
      const validJson = JSON.stringify({ HELLO: 'World' })
      const result = parseLocalizationJsonString('en.json', '/path/en.json', validJson)

      expect(result.success).toBe(true)
      expect(result.data?.keyCount).toBe(1)
      expect(result.data?.keys['HELLO']).toBe('World')
      expect(result.error).toBeUndefined()
    })

    it('safely captures invalid JSON syntax error without throwing', () => {
      const invalidJson = '{ "HELLO": "World", '
      const result = parseLocalizationJsonString('uk.json', '/path/uk.json', invalidJson)

      expect(result.success).toBe(false)
      expect(result.data).toBeUndefined()
      expect(result.error).toBeDefined()
    })

    it('isolates failures so one invalid file does not prevent valid files from parsing', () => {
      const files = [
        { name: 'en.json', path: '/p/en.json', content: '{"A":"1"}' },
        { name: 'uk.json', path: '/p/uk.json', content: '{"INVALID":' },
        { name: 'ru.json', path: '/p/ru.json', content: '{"B":"2"}' },
      ]

      const results = files.map((f) =>
        parseLocalizationJsonString(f.name, f.path, f.content)
      )

      expect(results[0].success).toBe(true)
      expect(results[0].data?.keys['A']).toBe('1')

      expect(results[1].success).toBe(false)
      expect(results[1].error).toBeDefined()

      expect(results[2].success).toBe(true)
      expect(results[2].data?.keys['B']).toBe('2')
    })
  })
})

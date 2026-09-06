import { describe, it, expect } from 'vitest'
import {
  calculateWorkspaceQuality,
  filterQualityIssues,
  checkPlaceholderMismatch,
  checkHtmlTagMismatch,
  checkWhitespaceMismatch,
  extractPlaceholderCounts,
} from './localizationQuality'
import type { ParsedLocalizationFile } from '../types/localization'

describe('localizationQuality service', () => {
  const createMockFile = (
    filename: string,
    keys: Record<string, string>
  ): ParsedLocalizationFile => ({
    filename,
    path: `/locales/${filename}`,
    raw: keys,
    keys,
    keyCount: Object.keys(keys).length,
  })

  describe('extractPlaceholderCounts & checkPlaceholderMismatch', () => {
    it('counts occurrences of placeholders in a multiset', () => {
      const counts = extractPlaceholderCounts('Hello {name}, welcome {name}! Count: {count}.')
      expect(counts.get('{name}')).toBe(2)
      expect(counts.get('{count}')).toBe(1)
    })

    it('considers placeholder order differences valid', () => {
      const ref = 'User {name} has {count} messages.'
      const target = 'У вас {count} сообщений, {name}.'
      const result = checkPlaceholderMismatch(ref, target)
      expect(result.hasMismatch).toBe(false)
      expect(result.missing).toHaveLength(0)
      expect(result.extra).toHaveLength(0)
    })

    it('fails when target is missing a repeated placeholder (multiset count mismatch)', () => {
      const ref = '{name} invited {name} to group.'
      const target = '{name} пригласил в группу.'
      const result = checkPlaceholderMismatch(ref, target)
      expect(result.hasMismatch).toBe(true)
      expect(result.missing).toEqual(['{name}'])
    })

    it('fails when target contains an extra unexpected placeholder', () => {
      const ref = 'Welcome to the app!'
      const target = 'Добро пожаловать в {app}!'
      const result = checkPlaceholderMismatch(ref, target)
      expect(result.hasMismatch).toBe(true)
      expect(result.extra).toEqual(['{app}'])
    })
  })

  describe('checkHtmlTagMismatch', () => {
    it('passes when HTML tags match', () => {
      const ref = 'Click <b>here</b> to <i>continue</i>.'
      const target = 'Нажмите <b>сюда</b>, чтобы <i>продолжить</i>.'
      const result = checkHtmlTagMismatch(ref, target)
      expect(result.hasMismatch).toBe(false)
    })

    it('detects missing HTML tags in target', () => {
      const ref = 'Click <b>here</b>.'
      const target = 'Нажмите сюда.'
      const result = checkHtmlTagMismatch(ref, target)
      expect(result.hasMismatch).toBe(true)
      expect(result.missing).toContain('<b>')
      expect(result.missing).toContain('</b>')
    })

    it('detects extra HTML tags in target', () => {
      const ref = 'Plain text.'
      const target = '<span>Plain text.</span>'
      const result = checkHtmlTagMismatch(ref, target)
      expect(result.hasMismatch).toBe(true)
      expect(result.extra).toContain('<span>')
    })
  })

  describe('checkWhitespaceMismatch', () => {
    it('detects leading whitespace mismatch', () => {
      expect(checkWhitespaceMismatch('Hello', ' Hello')).toBe(true)
      expect(checkWhitespaceMismatch(' Hello', 'Hello')).toBe(true)
    })

    it('detects trailing whitespace mismatch', () => {
      expect(checkWhitespaceMismatch('Hello', 'Hello ')).toBe(true)
      expect(checkWhitespaceMismatch('Hello ', 'Hello')).toBe(true)
    })

    it('detects newline mismatch', () => {
      expect(checkWhitespaceMismatch('Hello\n', 'Hello')).toBe(true)
      expect(checkWhitespaceMismatch('Hello', 'Hello\n')).toBe(true)
    })

    it('passes when whitespace structure matches', () => {
      expect(checkWhitespaceMismatch(' Hello ', ' Привет ')).toBe(false)
      expect(checkWhitespaceMismatch('Clean', 'Чистый')).toBe(false)
    })
  })

  describe('calculateWorkspaceQuality', () => {
    it('returns zero issues for a completely clean and synchronized workspace', () => {
      const files = [
        createMockFile('en.json', {
          'APP.TITLE': 'Localization AI',
          'APP.WELCOME': 'Hello, {name}!',
        }),
        createMockFile('ru.json', {
          'APP.TITLE': 'Локализация ИИ',
          'APP.WELCOME': 'Привет, {name}!',
        }),
      ]

      const summary = calculateWorkspaceQuality(files)
      expect(summary.totalIssues).toBe(0)
      expect(summary.errorCount).toBe(0)
      expect(summary.warningCount).toBe(0)
      expect(summary.infoCount).toBe(0)
    })

    it('reports missing translations as errors with short-circuiting', () => {
      const files = [
        createMockFile('en.json', {
          'COMMON.SAVE': 'Save',
          'COMMON.CANCEL': 'Cancel',
        }),
        createMockFile('ru.json', {
          'COMMON.SAVE': 'Сохранить',
          // COMMON.CANCEL is missing
        }),
      ]

      const summary = calculateWorkspaceQuality(files)
      expect(summary.totalIssues).toBe(1)
      expect(summary.issues[0]).toMatchObject({
        type: 'missing_translation',
        severity: 'error',
        filename: 'ru.json',
        key: 'COMMON.CANCEL',
      })
    })

    it('reports empty translations as warnings with short-circuiting', () => {
      const files = [
        createMockFile('en.json', {
          'COMMON.SAVE': 'Save {icon}',
        }),
        createMockFile('ru.json', {
          'COMMON.SAVE': '',
        }),
      ]

      const summary = calculateWorkspaceQuality(files)
      expect(summary.totalIssues).toBe(1)
      expect(summary.issues[0]).toMatchObject({
        type: 'empty_translation',
        severity: 'warning',
        filename: 'ru.json',
        key: 'COMMON.SAVE',
      })
      // Ensure no secondary placeholder errors were generated for the empty string
      expect(summary.byType.placeholder_mismatch).toHaveLength(0)
    })

    it('reports same-as-reference translations as info', () => {
      const files = [
        createMockFile('en.json', {
          'COMMON.OK': 'OK',
          'SETTINGS.TITLE': 'Settings',
        }),
        createMockFile('ru.json', {
          'COMMON.OK': 'OK',
          'SETTINGS.TITLE': 'Настройки',
        }),
      ]

      const summary = calculateWorkspaceQuality(files)
      expect(summary.infoCount).toBe(1)
      expect(summary.byType.same_as_reference).toHaveLength(1)
      expect(summary.byType.same_as_reference[0]).toMatchObject({
        type: 'same_as_reference',
        severity: 'info',
        filename: 'ru.json',
        key: 'COMMON.OK',
      })
    })

    it('detects structural conflicts in file keys', () => {
      const files = [
        createMockFile('en.json', {
          'AUTH.LOGIN': 'Login section',
          'AUTH.LOGIN.BUTTON': 'Sign In',
        }),
      ]

      const summary = calculateWorkspaceQuality(files)
      expect(summary.byType.structural_conflict).toHaveLength(1)
      expect(summary.byType.structural_conflict[0]).toMatchObject({
        type: 'structural_conflict',
        severity: 'error',
        key: 'AUTH.LOGIN',
      })
    })

    it('sorts issues deterministically by severity, filename, key, and type', () => {
      const files = [
        createMockFile('en.json', {
          'KEY.A': 'Hello {name}',
          'KEY.B': 'Same Text',
          'KEY.C': 'Missing in RU',
        }),
        createMockFile('ru.json', {
          'KEY.A': 'Привет', // placeholder error
          'KEY.B': 'Same Text', // same as reference info
          // KEY.C is missing error
        }),
      ]

      const summary = calculateWorkspaceQuality(files)
      expect(summary.totalIssues).toBe(3)

      // Errors must come first
      expect(summary.issues[0].severity).toBe('error')
      expect(summary.issues[1].severity).toBe('error')
      // Info must come last
      expect(summary.issues[2].severity).toBe('info')
    })
  })

  describe('filterQualityIssues', () => {
    const files = [
      createMockFile('en.json', {
        'KEY.A': 'Hello {name}',
        'KEY.B': 'Same Text',
        'KEY.C': 'Target',
      }),
      createMockFile('ru.json', {
        'KEY.A': 'Привет', // placeholder error
        'KEY.B': 'Same Text', // info
        'KEY.C': ' Target ', // whitespace warning
      }),
    ]

    it('filters by severity', () => {
      const summary = calculateWorkspaceQuality(files)
      const errorIssues = filterQualityIssues(summary.issues, { severity: 'error' })
      expect(errorIssues.every((i) => i.severity === 'error')).toBe(true)

      const warningIssues = filterQualityIssues(summary.issues, { severity: 'warning' })
      expect(warningIssues.every((i) => i.severity === 'warning')).toBe(true)
    })

    it('filters by issue type', () => {
      const summary = calculateWorkspaceQuality(files)
      const whitespaceIssues = filterQualityIssues(summary.issues, { type: 'whitespace_mismatch' })
      expect(whitespaceIssues).toHaveLength(1)
      expect(whitespaceIssues[0].type).toBe('whitespace_mismatch')
    })

    it('filters by filename', () => {
      const summary = calculateWorkspaceQuality(files)
      const ruIssues = filterQualityIssues(summary.issues, { filename: 'ru.json' })
      expect(ruIssues).toHaveLength(3)
      expect(ruIssues.every((i) => i.filename === 'ru.json')).toBe(true)
    })
  })
})

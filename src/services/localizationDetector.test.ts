import { describe, it, expect } from 'vitest'
import {
  isLocalizationFile,
  isLocalizationContentStructure,
  normalizeLocaleCode,
} from './localizationDetector'

describe('localizationDetector', () => {
  describe('normalizeLocaleCode', () => {
    it('normalizes ua alias to uk for Ukrainian', () => {
      expect(normalizeLocaleCode('ua')).toBe('uk')
      expect(normalizeLocaleCode('UA')).toBe('uk')
      expect(normalizeLocaleCode('ua-ua')).toBe('uk')
      expect(normalizeLocaleCode('uk-ua')).toBe('uk')
    })

    it('preserves standard ISO 639-1 language codes', () => {
      expect(normalizeLocaleCode('en')).toBe('en')
      expect(normalizeLocaleCode('ru')).toBe('ru')
      expect(normalizeLocaleCode('uk')).toBe('uk')
      expect(normalizeLocaleCode('de')).toBe('de')
    })
  })

  describe('isLocalizationFile', () => {
    it('identifies standard language code JSON files as translation files', () => {
      expect(isLocalizationFile('en.json')).toBe(true)
      expect(isLocalizationFile('ru.json')).toBe(true)
      expect(isLocalizationFile('uk.json')).toBe(true)
      expect(isLocalizationFile('de.json')).toBe(true)
      expect(isLocalizationFile('fr.json')).toBe(true)
      expect(isLocalizationFile('es.json')).toBe(true)
      expect(isLocalizationFile('it.json')).toBe(true)
      expect(isLocalizationFile('pt.json')).toBe(true)
      expect(isLocalizationFile('pl.json')).toBe(true)
      expect(isLocalizationFile('cs.json')).toBe(true)
      expect(isLocalizationFile('tr.json')).toBe(true)
      expect(isLocalizationFile('zh-CN.json')).toBe(true)
      expect(isLocalizationFile('pt-BR.json')).toBe(true)
      expect(isLocalizationFile('ja.json')).toBe(true)
      expect(isLocalizationFile('ko.json')).toBe(true)
    })

    it('identifies ua.json and Ukrainian alias naming conventions as translation files', () => {
      expect(isLocalizationFile('ua.json')).toBe(true)
      expect(isLocalizationFile('uk.json')).toBe(true)
      expect(isLocalizationFile('messages-ua.json')).toBe(true)
      expect(isLocalizationFile('messages_ua.json')).toBe(true)
      expect(isLocalizationFile('locale.ua.json')).toBe(true)
      expect(isLocalizationFile('i18n-ua.json')).toBe(true)
      expect(isLocalizationFile('translation_ua.json')).toBe(true)
    })

    it('identifies prefixed/suffixed locale files as translation files', () => {
      expect(isLocalizationFile('messages_en.json')).toBe(true)
      expect(isLocalizationFile('translation.ru.json')).toBe(true)
      expect(isLocalizationFile('app-de.json')).toBe(true)
    })

    it('identifies files in localization directories with recognized namespace', () => {
      expect(isLocalizationFile('common.json', 'src/locales/common.json')).toBe(true)
      expect(isLocalizationFile('auth.json', 'i18n/auth.json')).toBe(true)
      expect(isLocalizationFile('errors.json', 'translations/errors.json')).toBe(true)
    })

    it('rejects known configuration and project JSON files', () => {
      expect(isLocalizationFile('package.json')).toBe(false)
      expect(isLocalizationFile('package-lock.json')).toBe(false)
      expect(isLocalizationFile('tsconfig.json')).toBe(false)
      expect(isLocalizationFile('tsconfig.app.json')).toBe(false)
      expect(isLocalizationFile('tsconfig.node.json')).toBe(false)
      expect(isLocalizationFile('.eslintrc.json')).toBe(false)
      expect(isLocalizationFile('nest-cli.json')).toBe(false)
      expect(isLocalizationFile('angular.json')).toBe(false)
      expect(isLocalizationFile('turbo.json')).toBe(false)
      expect(isLocalizationFile('manifest.json')).toBe(false)
      expect(isLocalizationFile('settings.json')).toBe(false)
      expect(isLocalizationFile('config.json')).toBe(false)
      expect(isLocalizationFile('random.json')).toBe(false)
      expect(isLocalizationFile('unrelated.json')).toBe(false)
    })

    it('rejects arbitrary non-localization JSON files outside and inside locale directories without recognized namespace or content', () => {
      expect(isLocalizationFile('data.json', 'src/data/data.json')).toBe(false)
      expect(isLocalizationFile('user.json', 'fixtures/user.json')).toBe(false)
      expect(isLocalizationFile('config.json', 'config.json')).toBe(false)
      expect(isLocalizationFile('random.json', 'random.json')).toBe(false)
      expect(isLocalizationFile('unrelated.json', 'src/locales/unrelated.json')).toBe(false)
    })

    it('rejects non-JSON files', () => {
      expect(isLocalizationFile('README.md')).toBe(false)
      expect(isLocalizationFile('index.ts')).toBe(false)
      expect(isLocalizationFile('App.tsx')).toBe(false)
      expect(isLocalizationFile('styles.css')).toBe(false)
    })
  })

  describe('isLocalizationContentStructure', () => {
    it('detects translation dictionary structure', () => {
      const translationData = {
        HOME: {
          TITLE: 'Home Title',
          WELCOME: 'Welcome to our app',
        },
        AUTH: {
          LOGIN: 'Log In',
        },
      }
      expect(isLocalizationContentStructure(translationData)).toBe(true)
    })

    it('rejects package.json / config structure', () => {
      const packageJson = {
        name: 'my-app',
        version: '1.0.0',
        scripts: { build: 'tsc' },
        dependencies: { react: '^18.0.0' },
      }
      expect(isLocalizationContentStructure(packageJson)).toBe(false)
    })
  })
})

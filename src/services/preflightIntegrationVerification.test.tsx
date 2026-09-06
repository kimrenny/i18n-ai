import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import App from '../App'
import { setAiTranslationProvider, MockAiTranslationProvider } from './aiTranslation'
import type { ElectronAPI } from '../types/electron'
import { DEFAULT_APP_SETTINGS } from '../types/settings'

function createMockElectronAPI(overrides: Partial<ElectronAPI> = {}): ElectronAPI {
  return {
    isElectron: true,
    platform: 'win32',
    selectDirectory: vi.fn(),
    getJsonFiles: vi.fn(),
    readJsonFile: vi.fn(),
    writeJsonFiles: vi.fn(),
    readDirectoryTree: vi.fn(),
    getSettings: vi.fn().mockResolvedValue(DEFAULT_APP_SETTINGS),
    updateAiTranslationSettings: vi.fn().mockResolvedValue(DEFAULT_APP_SETTINGS),
    translateWithAi: vi.fn(),
    translateBatchWithAi: vi.fn(),
    ...overrides,
  }
}

describe('Manual & Focused Runtime Verification of Pre-flight Validator', () => {
  const initialEn = {
    auth: {
      login: 'Log in',
      logout: 'Log out',
      welcome: 'Hello, {name}. You have {count} messages.',
    },
    ui: {
      whitespace_key: '  Padded text  ',
      tag_example: 'Click <b>here</b> to continue.',
    },
  }

  const initialRu = {
    auth: {
      login: 'Log in', // same-as-reference (info)
      logout: '', // empty (warning)
      welcome: 'Привет, {count}. У тебя {name} сообщений.', // valid reordered placeholders
    },
    ui: {
      whitespace_key: 'Padded text', // whitespace mismatch (warning)
      tag_example: 'Нажмите <b>здесь</i> чтобы продолжить.', // tag mismatch (error)
    },
  }

  const initialDe = {
    auth: {
      login: 'Anmelden',
      logout: 'Abmelden',
      welcome: 'Hallo {name} {name}!', // duplicate placeholder mismatch (error)
    },
    ui: {
      whitespace_key: '  Padded text  ',
      tag_example: 'Klicken Sie <b>hier</b>.',
    },
  }

  it('verifies Pre-flight Validator across all statuses, check categories, issue navigation, real-time updates, and multi-language UI', async () => {
    Element.prototype.scrollIntoView = vi.fn()
    HTMLElement.prototype.scrollTo = vi.fn()
    setAiTranslationProvider(new MockAiTranslationProvider())

    const mockWriteJsonFiles = vi.fn().mockResolvedValue({ success: true })
    const currentRu = JSON.parse(JSON.stringify(initialRu))
    let currentDe = JSON.parse(JSON.stringify(initialDe))

    const mockReadJsonFile = vi.fn().mockImplementation(async (filePath: string) => {
      if (filePath.endsWith('en.json')) return initialEn
      if (filePath.endsWith('ru.json')) return currentRu
      if (filePath.endsWith('de.json')) return currentDe
      throw new Error('File not found')
    })

    const mockElectronAPI = createMockElectronAPI({
      selectDirectory: vi.fn().mockResolvedValue('C:/Projects/locales'),
      readDirectoryTree: vi.fn().mockResolvedValue({
        rootPath: 'C:/Projects/locales',
        rootName: 'locales',
        entries: [
          {
            name: 'en.json',
            path: 'C:/Projects/locales/en.json',
            relativePath: 'en.json',
            isDirectory: false,
            isLocalizationCandidate: true,
          },
          {
            name: 'ru.json',
            path: 'C:/Projects/locales/ru.json',
            relativePath: 'ru.json',
            isDirectory: false,
            isLocalizationCandidate: true,
          },
          {
            name: 'de.json',
            path: 'C:/Projects/locales/de.json',
            relativePath: 'de.json',
            isDirectory: false,
            isLocalizationCandidate: true,
          },
        ],
      }),
      getJsonFiles: vi.fn().mockResolvedValue(['en.json', 'ru.json', 'de.json']),
      readJsonFile: mockReadJsonFile,
      writeJsonFiles: mockWriteJsonFiles,
    })

    window.electronAPI = mockElectronAPI

    render(<App />)

    // Open workspace folder
    const selectFolderBtn = screen.getByRole('button', { name: /select folder/i })
    fireEvent.click(selectFolderBtn)

    await waitFor(() => {
      expect(screen.getByTestId('coverage-row-ru.json')).toBeInTheDocument()
      expect(screen.getByTestId('coverage-row-de.json')).toBeInTheDocument()
    })

    // 1. Verify Pre-flight status button in Status Bar
    const preflightStatusBtn = screen.getByTestId('statusbar-preflight-btn')
    expect(preflightStatusBtn).toBeInTheDocument()
    expect(preflightStatusBtn).toHaveTextContent(/Validation ✕ 2/i)
    expect(preflightStatusBtn).toHaveClass('statusbar-preflight-failed')

    // 2. Click status bar button to open Pre-flight panel
    fireEvent.click(preflightStatusBtn)

    await waitFor(() => {
      expect(screen.getByTestId('preflight-panel')).toBeInTheDocument()
    })

    // 3. Verify Hero Card & metrics
    expect(screen.getByTestId('preflight-hero-card')).toBeInTheDocument()
    expect(screen.getByTestId('preflight-hero-card')).toHaveTextContent(/Validation Failed/i)
    expect(screen.getByTestId('preflight-hero-card')).toHaveTextContent(/2 Errors/i)
    expect(screen.getByTestId('preflight-hero-card')).toHaveTextContent(/2 Warnings/i)
    expect(screen.getByTestId('preflight-hero-card')).toHaveTextContent(/2 Info/i)

    // 4. Verify Check Summaries count & icons
    const tagCheck = screen.getByTestId('preflight-check-tag_mismatches')
    expect(tagCheck).toBeInTheDocument()
    expect(tagCheck).toHaveTextContent('1')

    const phCheck = screen.getByTestId('preflight-check-placeholder_mismatches')
    expect(phCheck).toBeInTheDocument()
    expect(phCheck).toHaveTextContent('1')

    const emptyCheck = screen.getByTestId('preflight-check-empty_translations')
    expect(emptyCheck).toBeInTheDocument()
    expect(emptyCheck).toHaveTextContent('1')

    const wsCheck = screen.getByTestId('preflight-check-whitespace_mismatches')
    expect(wsCheck).toBeInTheDocument()
    expect(wsCheck).toHaveTextContent('1')

    const sameCheck = screen.getByTestId('preflight-check-same_as_reference')
    expect(sameCheck).toBeInTheDocument()
    expect(sameCheck).toHaveTextContent('2')

    // 5. Test Check category filtering
    fireEvent.click(phCheck)
    expect(screen.getByTestId('preflight-issue-de.json:placeholder_mismatch:auth.welcome')).toBeInTheDocument()
    expect(screen.queryByTestId('preflight-issue-ru.json:tag_mismatch:ui.tag_example')).not.toBeInTheDocument()

    // Reset check filter
    fireEvent.click(screen.getByTestId('preflight-reset-category-filter'))
    expect(screen.getByTestId('preflight-issue-ru.json:tag_mismatch:ui.tag_example')).toBeInTheDocument()

    // 6. Test File filtering
    const ruFileBtn = screen.getByTestId('preflight-file-ru.json')
    fireEvent.click(ruFileBtn)
    expect(screen.getByTestId('preflight-issue-ru.json:tag_mismatch:ui.tag_example')).toBeInTheDocument()
    expect(screen.queryByTestId('preflight-issue-de.json:placeholder_mismatch:auth.welcome')).not.toBeInTheDocument()

    fireEvent.click(screen.getByTestId('preflight-reset-file-filter'))
    expect(screen.getByTestId('preflight-issue-de.json:placeholder_mismatch:auth.welcome')).toBeInTheDocument()

    // 7. Click Run Validation button
    const runValidationBtn = screen.getByTestId('preflight-run-btn')
    fireEvent.click(runValidationBtn)

    // 8. Navigation to Diff Viewer on issue click
    const phIssue = screen.getByTestId('preflight-issue-de.json:placeholder_mismatch:auth.welcome')
    fireEvent.click(phIssue)

    await waitFor(() => {
      expect(screen.getByTestId('diff-viewer-section')).toBeInTheDocument()
    })

    // 9. Real-time updates: Inline edit in de.json to fix placeholder issue
    currentDe = {
      ...currentDe,
      auth: {
        ...currentDe.auth,
        welcome: 'Hallo, {name}. Sie haben {count} Nachrichten.',
      },
    }

    const welcomeRow = screen.getByTestId('tree-node-auth.welcome')
    fireEvent.doubleClick(welcomeRow)

    const inputField = await screen.findByRole('textbox', { name: /auth\.welcome/i })
    fireEvent.change(inputField, { target: { value: 'Hallo, {name}. Sie haben {count} Nachrichten.' } })
    fireEvent.click(screen.getByRole('button', { name: /^Save$|^Сохранить$|^Зберегти$/i }))

    // Verify error count decreased
    await waitFor(() => {
      expect(screen.queryByTestId('preflight-issue-de.json:placeholder_mismatch:auth.welcome')).not.toBeInTheDocument()
    })

    // 10. Multi-language UI testing
    const testLanguages = [
      { code: 'ru', expectedStatus: /Валидация ✕ 1/i, expectedHero: /Валидация не пройдена/i },
      { code: 'de', expectedStatus: /Validierung ✕ 1/i, expectedHero: /Validierung fehlgeschlagen/i },
      { code: 'uk', expectedStatus: /Валідація ✕ 1/i, expectedHero: /Валідацію не пройдено/i },
      { code: 'ja', expectedStatus: /検証 ✕ 1/i, expectedHero: /検証に失敗しました/i },
      { code: 'ko', expectedStatus: /검증 ✕ 1/i, expectedHero: /검증 실패/i },
      { code: 'en', expectedStatus: /Validation ✕ 1/i, expectedHero: /Validation Failed/i },
    ]

    for (const lang of testLanguages) {
      const openSettingsBtn = document.querySelector('.settings-open-btn') as HTMLButtonElement
      fireEvent.click(openSettingsBtn)
      await waitFor(() => expect(document.querySelector('#app-language-select')).toBeInTheDocument())
      const langSelect = document.querySelector('#app-language-select') as HTMLSelectElement
      fireEvent.change(langSelect, {
        target: { value: lang.code },
      })
      const doneBtn = document.querySelector('.settings-done-btn') as HTMLButtonElement
      fireEvent.click(doneBtn)

      await waitFor(() => {
        expect(screen.getByTestId('statusbar-preflight-btn')).toHaveTextContent(lang.expectedStatus)
      })
      expect(screen.getByTestId('preflight-hero-card')).toHaveTextContent(lang.expectedHero)
    }
  }, 25000)
})

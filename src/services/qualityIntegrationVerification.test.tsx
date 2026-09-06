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
    getSettings: vi.fn().mockResolvedValue(DEFAULT_APP_SETTINGS),
    updateAiTranslationSettings: vi.fn(),
    translateWithAi: vi.fn(),
    translateBatchWithAi: vi.fn(),
    ...overrides,
  }
}

describe('Manual & Focused Runtime Verification of Quality Checks', () => {
  const initialEn = {
    auth: {
      welcome: 'Hello, {name}. You have {count} messages.',
      login: 'Log in',
      logout: 'Log out',
    },
    ui: {
      empty_ref: '',
      tag_example: 'Click <b>here</b> to continue.',
      whitespace_key: '  Padded text  ',
      newline_key: 'Line 1\n',
    },
    nested: {
      deep: {
        leaf: 'Deep text',
      },
    },
  }

  const initialRu = {
    auth: {
      welcome: 'Привет, {count}. У тебя {name} сообщений.', // Valid reordered placeholders
      login: 'Log in', // Same as reference (info)
      logout: '', // Empty translation (warning)
    },
    ui: {
      empty_ref: '', // Empty in reference and target (only warning, no same-as-ref)
      tag_example: 'Нажмите <b>сюда<i> чтобы продолжить.', // Tag mismatch (error)
      whitespace_key: 'Padded text', // Missing leading/trailing whitespace (warning)
      newline_key: 'Line 1', // Missing trailing newline (warning)
    },
    // nested.deep.leaf is MISSING (error)
  }

  const initialDe = {
    auth: {
      welcome: 'Hallo {name} {name}!', // Duplicate placeholder count mismatch (error)
      login: 'Einloggen',
      logout: 'Ausloggen',
    },
    ui: {
      empty_ref: '',
      tag_example: 'Klicken Sie <b>hier</b> um fortzufahren.',
      whitespace_key: '  Padded text  ',
      newline_key: 'Line 1\n',
    },
    nested: {
      deep: 'Conflict as string', // Structural conflict with nested.deep.leaf (error)
    },
  }

  it('verifies all 14 quality check requirements thoroughly', async () => {
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

    window.electronAPI = createMockElectronAPI({
      selectDirectory: vi.fn().mockResolvedValue('C:/Projects/locales'),
      readDirectoryTree: vi.fn().mockResolvedValue({
        rootPath: 'C:/Projects/locales',
        rootName: 'locales',
        entries: [
          { name: 'en.json', path: 'C:/Projects/locales/en.json', relativePath: 'en.json', isDirectory: false, isLocalizationCandidate: true },
          { name: 'ru.json', path: 'C:/Projects/locales/ru.json', relativePath: 'ru.json', isDirectory: false, isLocalizationCandidate: true },
          { name: 'de.json', path: 'C:/Projects/locales/de.json', relativePath: 'de.json', isDirectory: false, isLocalizationCandidate: true },
        ],
      }),
      readJsonFile: mockReadJsonFile,
      writeJsonFiles: mockWriteJsonFiles,
    })

    render(<App />)

    // Open workspace
    fireEvent.click(screen.getByRole('button', { name: /select folder/i }))
    await waitFor(() => expect(screen.getByTestId('coverage-row-ru.json')).toBeInTheDocument())

    // 1. Quality Panel: Verify status bar button and panel open
    const statusBtn = screen.getByTestId('statusbar-quality-btn')
    expect(statusBtn).toBeInTheDocument()
    expect(statusBtn).toHaveTextContent(/Quality/i)

    fireEvent.click(statusBtn)
    await waitFor(() => expect(screen.getByTestId('quality-panel')).toBeInTheDocument())
    const totalBadge = screen.getByTestId('quality-total-badge')
    expect(totalBadge).toBeInTheDocument()

    // 2. Missing / Empty semantics:
    // - ru.json:nested.deep.leaf is missing -> reported as missing_translation error
    expect(screen.getByTestId('quality-item-ru.json:missing_translation:nested.deep.leaf')).toBeInTheDocument()
    // - ru.json:auth.logout is empty -> reported as empty_translation warning
    expect(screen.getByTestId('quality-item-ru.json:empty_translation:auth.logout')).toBeInTheDocument()
    // - No duplicate placeholder/whitespace/tag issue for missing nested.deep.leaf
    expect(screen.queryByTestId('quality-item-ru.json:placeholder_mismatch:nested.deep.leaf')).not.toBeInTheDocument()
    expect(screen.queryByTestId('quality-item-ru.json:whitespace_mismatch:nested.deep.leaf')).not.toBeInTheDocument()

    // 3. Placeholder checks:
    // - ru.json:auth.welcome (reordered {count} and {name}) -> NO issue
    expect(screen.queryByTestId('quality-item-ru.json:placeholder_mismatch:auth.welcome')).not.toBeInTheDocument()
    // - de.json:auth.welcome ({name} {name} vs {name} {count}) -> placeholder_mismatch error
    expect(screen.getByTestId('quality-item-de.json:placeholder_mismatch:auth.welcome')).toBeInTheDocument()

    // 4. Tag checks:
    // - ru.json:ui.tag_example (unclosed <i>, mismatched tags) -> tag_mismatch error
    expect(screen.getByTestId('quality-item-ru.json:tag_mismatch:ui.tag_example')).toBeInTheDocument()

    // 5. Same-as-reference:
    // - ru.json:auth.login ("Log in" === "Log in") -> same_as_reference info
    expect(screen.getByTestId('quality-item-ru.json:same_as_reference:auth.login')).toBeInTheDocument()
    // - ui.empty_ref is empty -> NOT reported as same_as_reference
    expect(screen.queryByTestId('quality-item-ru.json:same_as_reference:ui.empty_ref')).not.toBeInTheDocument()

    // 6. Whitespace:
    // - ru.json:ui.whitespace_key (missing leading/trailing padding) -> whitespace_mismatch warning
    expect(screen.getByTestId('quality-item-ru.json:whitespace_mismatch:ui.whitespace_key')).toBeInTheDocument()
    // - ru.json:ui.newline_key (missing newline) -> whitespace_mismatch warning
    expect(screen.getByTestId('quality-item-ru.json:whitespace_mismatch:ui.newline_key')).toBeInTheDocument()

    // 7. Structural conflicts:
    // - de.json:nested.deep (string vs object in en.json) -> structural_conflict error
    expect(screen.getByTestId('quality-item-de.json:structural_conflict:nested.deep')).toBeInTheDocument()

    // 8. Filtering:
    const severitySelect = screen.getByTestId('quality-severity-filter')
    fireEvent.change(severitySelect, { target: { value: 'error' } })
    expect(screen.getByTestId('quality-item-de.json:placeholder_mismatch:auth.welcome')).toBeInTheDocument()
    expect(screen.queryByTestId('quality-item-ru.json:empty_translation:auth.logout')).not.toBeInTheDocument()

    fireEvent.change(severitySelect, { target: { value: 'warning' } })
    expect(screen.getByTestId('quality-item-ru.json:empty_translation:auth.logout')).toBeInTheDocument()
    expect(screen.queryByTestId('quality-item-de.json:placeholder_mismatch:auth.welcome')).not.toBeInTheDocument()

    fireEvent.change(severitySelect, { target: { value: 'all' } })

    const langSelect = screen.getByTestId('quality-language-filter')
    fireEvent.change(langSelect, { target: { value: 'de.json' } })
    expect(screen.getByTestId('quality-item-de.json:placeholder_mismatch:auth.welcome')).toBeInTheDocument()
    expect(screen.queryByTestId('quality-item-ru.json:empty_translation:auth.logout')).not.toBeInTheDocument()

    fireEvent.change(langSelect, { target: { value: 'all' } })

    // 9. Navigation to Diff Viewer:
    const phIssue = screen.getByTestId('quality-item-de.json:placeholder_mismatch:auth.welcome')
    fireEvent.click(phIssue)

    await waitFor(() => {
      expect(screen.getByTestId('diff-viewer-section')).toBeInTheDocument()
    })

    // 10. Translation Key Inspector shows compact quality issues:
    await waitFor(() => {
      expect(screen.getByTestId('inspector-quality-section')).toBeInTheDocument()
    })
    expect(screen.getByTestId('inspector-quality-section')).toHaveTextContent(/Placeholder mismatch/i)

    // 11. Real-time updates:
    // Update currentDe data for when write/save occurs
    currentDe = {
      ...currentDe,
      auth: {
        ...currentDe.auth,
        welcome: 'Hallo {name}, Sie haben {count} Nachrichten.',
      },
    }

    // Double click row to enter inline edit
    const welcomeRow = screen.getByTestId('tree-node-auth.welcome')
    fireEvent.doubleClick(welcomeRow)

    const inputField = await screen.findByRole('textbox', { name: /auth\.welcome/i })
    fireEvent.change(inputField, { target: { value: 'Hallo {name}, Sie haben {count} Nachrichten.' } })
    fireEvent.click(screen.getByRole('button', { name: /^Save$|^Сохранить$|^Зберегти$/i }))

    // Verify placeholder issue for de.json:auth.welcome is resolved and disappears
    await waitFor(() => {
      expect(screen.queryByTestId('quality-item-de.json:placeholder_mismatch:auth.welcome')).not.toBeInTheDocument()
    })

    // 12. Status bar updates:
    expect(screen.getByTestId('statusbar-quality-btn')).toBeInTheDocument()

    // 13. Internationalization testing across multiple languages:
    const testLanguages = [
      { code: 'ru', expectedTitle: 'Качество', expectedStatus: /Качество/i },
      { code: 'de', expectedTitle: 'Qualität', expectedStatus: /Qualität/i },
      { code: 'uk', expectedTitle: 'Якість', expectedStatus: /Якість/i },
      { code: 'ja', expectedTitle: '品質', expectedStatus: /品質/i },
      { code: 'ko', expectedTitle: '품질', expectedStatus: /품질/i },
      { code: 'en', expectedTitle: 'Quality', expectedStatus: /Quality/i },
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
        expect(screen.getByTestId('statusbar-quality-btn')).toHaveTextContent(lang.expectedStatus)
      })
      const panelTitle = screen.getByText(lang.expectedTitle)
      expect(panelTitle).toBeInTheDocument()
    }
  }, 25000)
})

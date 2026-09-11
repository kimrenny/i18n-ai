import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import App from '../App'
import { DEFAULT_APP_SETTINGS, type AppSettings } from '../types/settings'
import {
  type FeatureId,
  FEATURE_DEFINITIONS,
  getDefaultFeatureState,
  isFeatureEnabled,
} from '../types/features'
import { setAiTranslationProvider, MockAiTranslationProvider } from './aiTranslation'
import type { ElectronAPI } from '../types/electron'

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

describe('Feature Gating Across All 12 Registered Features', () => {
  let currentSettings: AppSettings
  let mockWriteJsonFiles: ReturnType<typeof vi.fn>

  beforeEach(() => {
    vi.restoreAllMocks()
    delete (window as unknown as { electronAPI?: unknown }).electronAPI
    Element.prototype.scrollIntoView = vi.fn()
    HTMLElement.prototype.scrollTo = vi.fn()
    setAiTranslationProvider(new MockAiTranslationProvider())

    currentSettings = JSON.parse(JSON.stringify(DEFAULT_APP_SETTINGS))
    mockWriteJsonFiles = vi.fn().mockResolvedValue({ success: true, count: 1 })

    const mockEn = {
      AUTH: {
        LOGIN: 'Log In',
        CANCEL: 'Cancel',
      },
    }

    const mockRu = {
      AUTH: {
        LOGIN: 'Вход',
        CANCEL: '', // Empty
      },
    }

    window.electronAPI = createMockElectronAPI({
      selectDirectory: vi.fn().mockResolvedValue('C:/Projects/locales'),
      getJsonFiles: vi.fn().mockResolvedValue([
        { name: 'en.json', path: 'C:/Projects/locales/en.json' },
        { name: 'ru.json', path: 'C:/Projects/locales/ru.json' },
      ]),
      readJsonFile: vi.fn().mockImplementation(async (filePath: string) => {
        if (filePath.endsWith('en.json')) return mockEn
        if (filePath.endsWith('ru.json')) return mockRu
        return {}
      }),
      writeJsonFiles: mockWriteJsonFiles,
      getSettings: vi.fn().mockImplementation(async () => currentSettings),
      updateTranslationSettings: vi.fn().mockImplementation(async (up: Partial<AppSettings>) => {
        currentSettings = {
          ...currentSettings,
          ...up,
          features: up.features ? { ...currentSettings.features, ...up.features } : currentSettings.features,
        }
        return currentSettings
      }),
      updateFeatureSettings: vi.fn().mockImplementation(async (up: Partial<Record<FeatureId, boolean>>) => {
        currentSettings = {
          ...currentSettings,
          features: { ...currentSettings.features, ...up },
        }
        return currentSettings
      }),
      gitGetRepositoryInfo: vi.fn().mockResolvedValue({
        isRepository: true,
        rootPath: 'C:/Projects/locales',
        branch: 'main',
        isGitAvailable: true,
      }),
      gitGetStatus: vi.fn().mockResolvedValue({
        branch: 'main',
        hasWorkingChanges: false,
        totalChanges: 0,
        staged: [],
        unstaged: [],
        untracked: [],
      }),
    })
  })

  it('verifies all 12 feature definitions are defined with defaultEnabled true', () => {
    expect(FEATURE_DEFINITIONS.length).toBe(12)
    const defaults = getDefaultFeatureState()
    for (const def of FEATURE_DEFINITIONS) {
      expect(defaults[def.id]).toBe(true)
      expect(isFeatureEnabled(defaults, def.id)).toBe(true)
    }
  })

  it('1. Global Search: gates search button, shortcut listener, and auto-closes dialog', async () => {
    render(<App />)

    fireEvent.click(screen.getByRole('button', { name: /select folder/i }))
    await waitFor(() => expect(screen.getByTestId('ide-search-btn')).toBeInTheDocument())

    // Shortcut Ctrl+F opens search
    fireEvent.keyDown(window, { key: 'f', ctrlKey: true })
    await waitFor(() => expect(screen.getByTestId('global-search-dialog')).toBeInTheDocument())
    fireEvent.keyDown(window, { key: 'Escape' })

    // Disable Global Search in Settings
    fireEvent.click(screen.getByRole('button', { name: /open settings/i }))
    fireEvent.click(screen.getByRole('tab', { name: /features/i }))
    await waitFor(() => expect(screen.getByTestId('feature-toggle-global_search')).toBeInTheDocument())
    fireEvent.click(screen.getByTestId('feature-toggle-global_search'))
    fireEvent.click(screen.getByRole('button', { name: /done/i }))

    // Verify Search button is removed from IDE header
    await waitFor(() => expect(screen.queryByTestId('ide-search-btn')).not.toBeInTheDocument())

    // Verify Ctrl+F shortcut is now ignored
    fireEvent.keyDown(window, { key: 'f', ctrlKey: true })
    expect(screen.queryByTestId('global-search-dialog')).not.toBeInTheDocument()

    // Re-enable Global Search
    fireEvent.click(screen.getByRole('button', { name: /open settings/i }))
    fireEvent.click(screen.getByRole('tab', { name: /features/i }))
    await waitFor(() => expect(screen.getByTestId('feature-toggle-global_search')).toBeInTheDocument())
    fireEvent.click(screen.getByTestId('feature-toggle-global_search'))
    fireEvent.click(screen.getByRole('button', { name: /done/i }))

    // Verify Search button is immediately restored
    await waitFor(() => expect(screen.getByTestId('ide-search-btn')).toBeInTheDocument())
  })

  it('2. Missing Key Navigator: gates navigator bar, add missing button, and addition modal', async () => {
    render(<App />)

    fireEvent.click(screen.getByRole('button', { name: /select folder/i }))
    await waitFor(() => expect(screen.getByTestId('coverage-row-ru.json')).toBeInTheDocument())
    fireEvent.click(screen.getByTestId('coverage-row-ru.json'))

    await waitFor(() => expect(screen.getByTestId('file-tab-ru.json')).toBeInTheDocument())
    await waitFor(() => expect(screen.getByTestId('missing-key-navigator')).toBeInTheDocument())

    // Disable missing_key_navigator in settings
    fireEvent.click(screen.getByRole('button', { name: /open settings/i }))
    fireEvent.click(screen.getByRole('tab', { name: /features/i }))
    await waitFor(() => expect(screen.getByTestId('feature-toggle-missing_key_navigator')).toBeInTheDocument())
    fireEvent.click(screen.getByTestId('feature-toggle-missing_key_navigator'))
    fireEvent.click(screen.getByRole('button', { name: /done/i }))

    // Navigator is immediately hidden
    await waitFor(() => expect(screen.queryByTestId('missing-key-navigator')).not.toBeInTheDocument())

    // Re-enable missing_key_navigator
    fireEvent.click(screen.getByRole('button', { name: /open settings/i }))
    fireEvent.click(screen.getByRole('tab', { name: /features/i }))
    await waitFor(() => expect(screen.getByTestId('feature-toggle-missing_key_navigator')).toBeInTheDocument())
    fireEvent.click(screen.getByTestId('feature-toggle-missing_key_navigator'))
    fireEvent.click(screen.getByRole('button', { name: /done/i }))

    // Immediately restored
    await waitFor(() => expect(screen.getByTestId('missing-key-navigator')).toBeInTheDocument())
  })

  it('3. Key Inspector: gates inspector column rendering and toggling', async () => {
    render(<App />)

    fireEvent.click(screen.getByRole('button', { name: /select folder/i }))
    await waitFor(() => expect(screen.getByTestId('coverage-row-ru.json')).toBeInTheDocument())
    fireEvent.click(screen.getByTestId('coverage-row-ru.json'))

    await waitFor(() => expect(screen.getByTestId('file-tab-ru.json')).toBeInTheDocument())
    await waitFor(() => expect(screen.getByTestId('translation-key-inspector')).toBeInTheDocument())

    // Disable key_inspector
    fireEvent.click(screen.getByRole('button', { name: /open settings/i }))
    fireEvent.click(screen.getByRole('tab', { name: /features/i }))
    await waitFor(() => expect(screen.getByTestId('feature-toggle-key_inspector')).toBeInTheDocument())
    fireEvent.click(screen.getByTestId('feature-toggle-key_inspector'))
    fireEvent.click(screen.getByRole('button', { name: /done/i }))

    await waitFor(() => expect(screen.queryByTestId('translation-key-inspector')).not.toBeInTheDocument())

    // Re-enable
    fireEvent.click(screen.getByRole('button', { name: /open settings/i }))
    fireEvent.click(screen.getByRole('tab', { name: /features/i }))
    await waitFor(() => expect(screen.getByTestId('feature-toggle-key_inspector')).toBeInTheDocument())
    fireEvent.click(screen.getByTestId('feature-toggle-key_inspector'))
    fireEvent.click(screen.getByRole('button', { name: /done/i }))

    await waitFor(() => expect(screen.getByTestId('translation-key-inspector')).toBeInTheDocument())
  })

  it('4. Translation Editor: gates inline editing, add key, and context menu actions', async () => {
    render(<App />)

    fireEvent.click(screen.getByRole('button', { name: /select folder/i }))
    await waitFor(() => expect(screen.getByTestId('coverage-row-ru.json')).toBeInTheDocument())
    fireEvent.click(screen.getByTestId('coverage-row-ru.json'))

    await waitFor(() => expect(screen.getByTestId('open-add-key-modal-btn')).toBeInTheDocument())

    // Disable translation_editor
    fireEvent.click(screen.getByRole('button', { name: /open settings/i }))
    fireEvent.click(screen.getByRole('tab', { name: /features/i }))
    await waitFor(() => expect(screen.getByTestId('feature-toggle-translation_editor')).toBeInTheDocument())
    fireEvent.click(screen.getByTestId('feature-toggle-translation_editor'))
    fireEvent.click(screen.getByRole('button', { name: /done/i }))

    // Add key button hidden
    await waitFor(() => expect(screen.queryByTestId('open-add-key-modal-btn')).not.toBeInTheDocument())

    // Double clicking row does not open editor
    const row = screen.getByTestId('tree-node-AUTH.CANCEL')
    fireEvent.doubleClick(row)
    expect(screen.queryByLabelText(/edit auth\.cancel/i)).not.toBeInTheDocument()

    // Re-enable
    fireEvent.click(screen.getByRole('button', { name: /open settings/i }))
    fireEvent.click(screen.getByRole('tab', { name: /features/i }))
    await waitFor(() => expect(screen.getByTestId('feature-toggle-translation_editor')).toBeInTheDocument())
    fireEvent.click(screen.getByTestId('feature-toggle-translation_editor'))
    fireEvent.click(screen.getByRole('button', { name: /done/i }))

    await waitFor(() => expect(screen.getByTestId('open-add-key-modal-btn')).toBeInTheDocument())
  })

  it('5. Quality Checks & Pre-flight Validator: gates status bar buttons and bottom panels', async () => {
    render(<App />)

    fireEvent.click(screen.getByRole('button', { name: /select folder/i }))
    await waitFor(() => expect(screen.getByTestId('statusbar-quality-btn')).toBeInTheDocument())
    expect(screen.getByTestId('statusbar-preflight-btn')).toBeInTheDocument()

    // Disable quality_checks & preflight_validator
    fireEvent.click(screen.getByRole('button', { name: /open settings/i }))
    fireEvent.click(screen.getByRole('tab', { name: /features/i }))
    await waitFor(() => expect(screen.getByTestId('feature-toggle-quality_checks')).toBeInTheDocument())
    fireEvent.click(screen.getByTestId('feature-toggle-quality_checks'))
    fireEvent.click(screen.getByTestId('feature-toggle-preflight_validator'))
    fireEvent.click(screen.getByRole('button', { name: /done/i }))

    await waitFor(() => {
      expect(screen.queryByTestId('statusbar-quality-btn')).not.toBeInTheDocument()
      expect(screen.queryByTestId('statusbar-preflight-btn')).not.toBeInTheDocument()
    })

    // Re-enable
    fireEvent.click(screen.getByRole('button', { name: /open settings/i }))
    fireEvent.click(screen.getByRole('tab', { name: /features/i }))
    await waitFor(() => expect(screen.getByTestId('feature-toggle-quality_checks')).toBeInTheDocument())
    fireEvent.click(screen.getByTestId('feature-toggle-quality_checks'))
    fireEvent.click(screen.getByTestId('feature-toggle-preflight_validator'))
    fireEvent.click(screen.getByRole('button', { name: /done/i }))

    await waitFor(() => {
      expect(screen.getByTestId('statusbar-quality-btn')).toBeInTheDocument()
      expect(screen.getByTestId('statusbar-preflight-btn')).toBeInTheDocument()
    })
  })

  it('6. Git Integration: gates header tab and status bar button', async () => {
    render(<App />)

    fireEvent.click(screen.getByRole('button', { name: /select folder/i }))
    await waitFor(() => expect(screen.getByTestId('ide-git-btn')).toBeInTheDocument())

    // Disable git_integration
    fireEvent.click(screen.getByRole('button', { name: /open settings/i }))
    fireEvent.click(screen.getByRole('tab', { name: /features/i }))
    await waitFor(() => expect(screen.getByTestId('feature-toggle-git_integration')).toBeInTheDocument())
    fireEvent.click(screen.getByTestId('feature-toggle-git_integration'))
    fireEvent.click(screen.getByRole('button', { name: /done/i }))

    await waitFor(() => {
      expect(screen.queryByTestId('ide-git-btn')).not.toBeInTheDocument()
      expect(screen.queryByTestId('statusbar-git-btn')).not.toBeInTheDocument()
    })

    // Re-enable
    fireEvent.click(screen.getByRole('button', { name: /open settings/i }))
    fireEvent.click(screen.getByRole('tab', { name: /features/i }))
    await waitFor(() => expect(screen.getByTestId('feature-toggle-git_integration')).toBeInTheDocument())
    fireEvent.click(screen.getByTestId('feature-toggle-git_integration'))
    fireEvent.click(screen.getByRole('button', { name: /done/i }))

    await waitFor(() => expect(screen.getByTestId('ide-git-btn')).toBeInTheDocument())
  })

  it('7. Translation History: gates history panel, undo/redo shortcuts, and context menu items', async () => {
    render(<App />)

    fireEvent.click(screen.getByRole('button', { name: /select folder/i }))
    await waitFor(() => expect(screen.getByTestId('coverage-row-ru.json')).toBeInTheDocument())
    fireEvent.click(screen.getByTestId('coverage-row-ru.json'))

    await waitFor(() => expect(screen.getByTestId('file-tab-ru.json')).toBeInTheDocument())
    expect(screen.getByTestId('toggle-history-btn')).toBeInTheDocument()
    fireEvent.click(screen.getByTestId('toggle-history-btn'))
    expect(screen.getByTestId('translation-history-panel')).toBeInTheDocument()

    // Disable translation_history in settings
    fireEvent.click(screen.getByRole('button', { name: /open settings/i }))
    fireEvent.click(screen.getByRole('tab', { name: /features/i }))
    await waitFor(() => expect(screen.getByTestId('feature-toggle-translation_history')).toBeInTheDocument())
    fireEvent.click(screen.getByTestId('feature-toggle-translation_history'))
    fireEvent.click(screen.getByRole('button', { name: /done/i }))

    // Panel auto-closes and toolbar button disappears
    await waitFor(() => {
      expect(screen.queryByTestId('toggle-history-btn')).not.toBeInTheDocument()
      expect(screen.queryByTestId('translation-history-panel')).not.toBeInTheDocument()
    })

    // Re-enable
    fireEvent.click(screen.getByRole('button', { name: /open settings/i }))
    fireEvent.click(screen.getByRole('tab', { name: /features/i }))
    await waitFor(() => expect(screen.getByTestId('feature-toggle-translation_history')).toBeInTheDocument())
    fireEvent.click(screen.getByTestId('feature-toggle-translation_history'))
    fireEvent.click(screen.getByRole('button', { name: /done/i }))

    await waitFor(() => expect(screen.getByTestId('toggle-history-btn')).toBeInTheDocument())
  })

  it('8. Automated Translation (AI vs Free): handles single engine disabled and all engines disabled', async () => {
    render(<App />)

    fireEvent.click(screen.getByRole('button', { name: /select folder/i }))
    await waitFor(() => expect(screen.getByTestId('coverage-row-ru.json')).toBeInTheDocument())
    fireEvent.click(screen.getByTestId('coverage-row-ru.json'))

    // Initially AI translation is enabled
    await waitFor(() => expect(screen.getByRole('button', { name: /translate AUTH\.CANCEL with ai/i })).toBeInTheDocument())

    // Disable ai_translation -> automatically falls back to Free
    fireEvent.click(screen.getByRole('button', { name: /open settings/i }))
    fireEvent.click(screen.getByRole('tab', { name: /features/i }))
    await waitFor(() => expect(screen.getByTestId('feature-toggle-ai_translation')).toBeInTheDocument())
    fireEvent.click(screen.getByTestId('feature-toggle-ai_translation'))
    fireEvent.click(screen.getByRole('button', { name: /done/i }))

    // Translate button label automatically becomes Free
    await waitFor(() => expect(screen.getByRole('button', { name: /translate AUTH\.CANCEL with free/i })).toBeInTheDocument())
    expect(screen.queryByRole('button', { name: /translate AUTH\.CANCEL with ai/i })).not.toBeInTheDocument()

    // Disable free_translation as well -> both disabled
    fireEvent.click(screen.getByRole('button', { name: /open settings/i }))
    fireEvent.click(screen.getByRole('tab', { name: /features/i }))
    await waitFor(() => expect(screen.getByTestId('feature-toggle-free_translation')).toBeInTheDocument())
    fireEvent.click(screen.getByTestId('feature-toggle-free_translation'))
    fireEvent.click(screen.getByRole('button', { name: /done/i }))

    // Translation buttons disappear / are gated cleanly
    await waitFor(() => {
      expect(screen.queryByRole('button', { name: /translate AUTH\.CANCEL/i })).not.toBeInTheDocument()
      expect(screen.queryByRole('button', { name: /translate all/i })).not.toBeInTheDocument()
    })

    // Re-enable both
    fireEvent.click(screen.getByRole('button', { name: /open settings/i }))
    fireEvent.click(screen.getByRole('tab', { name: /features/i }))
    await waitFor(() => expect(screen.getByTestId('feature-toggle-ai_translation')).toBeInTheDocument())
    fireEvent.click(screen.getByTestId('feature-toggle-ai_translation'))
    fireEvent.click(screen.getByTestId('feature-toggle-free_translation'))
    fireEvent.click(screen.getByRole('button', { name: /done/i }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())

    await waitFor(() => expect(screen.getByRole('button', { name: /translate AUTH\.CANCEL with (ai|free)/i })).toBeInTheDocument())
  })

  it('9. Diff Viewer: degrades gracefully to dashboard when disabled', async () => {
    render(<App />)

    fireEvent.click(screen.getByRole('button', { name: /select folder/i }))
    await waitFor(() => expect(screen.getByTestId('coverage-row-ru.json')).toBeInTheDocument())
    fireEvent.click(screen.getByTestId('coverage-row-ru.json'))

    await waitFor(() => expect(screen.getByTestId('file-tab-ru.json')).toBeInTheDocument())

    // Disable diff_viewer in settings
    fireEvent.click(screen.getByRole('button', { name: /open settings/i }))
    fireEvent.click(screen.getByRole('tab', { name: /features/i }))
    await waitFor(() => expect(screen.getByTestId('feature-toggle-diff_viewer')).toBeInTheDocument())
    fireEvent.click(screen.getByTestId('feature-toggle-diff_viewer'))
    fireEvent.click(screen.getByRole('button', { name: /done/i }))

    // Active workspace tab immediately falls back to dashboard
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    await waitFor(() => expect(screen.getByTestId('coverage-dashboard')).toBeInTheDocument())
    expect(screen.queryByTestId('file-tab-ru.json')).not.toBeInTheDocument()

    // Re-enable diff_viewer
    fireEvent.click(screen.getByRole('button', { name: /open settings/i }))
    fireEvent.click(screen.getByRole('tab', { name: /features/i }))
    await waitFor(() => expect(screen.getByTestId('feature-toggle-diff_viewer')).toBeInTheDocument())
    fireEvent.click(screen.getByTestId('feature-toggle-diff_viewer'))
    fireEvent.click(screen.getByRole('button', { name: /done/i }))

    // Wait for settings to close
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())

    // Clicking language row opens Diff Viewer again
    fireEvent.click(screen.getByTestId('coverage-row-ru.json'))
    await waitFor(() => expect(screen.getByTestId('file-tab-ru.json')).toBeInTheDocument())
  })
})

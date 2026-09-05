import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import App from './App'
import {
  setAiTranslationProvider,
  MockAiTranslationProvider,
} from './services/aiTranslation'
import type { ElectronAPI } from './types/electron'
import { DEFAULT_APP_SETTINGS, type AppSettings } from './types/settings'

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

describe('App', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    delete (window as unknown as { electronAPI?: unknown }).electronAPI
    Element.prototype.scrollIntoView = vi.fn()
    HTMLElement.prototype.scrollTo = vi.fn()
    setAiTranslationProvider(new MockAiTranslationProvider())
  })

  afterEach(() => {
    vi.restoreAllMocks()
    delete (window as unknown as { electronAPI?: unknown }).electronAPI
    setAiTranslationProvider(new MockAiTranslationProvider())
  })

  it('renders application title, settings button, and initial empty folder state', () => {
    render(<App />)

    expect(
      screen.getByRole('heading', { level: 1, name: /localization ai/i })
    ).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: /open settings/i })
    ).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: /select folder/i })
    ).toBeInTheDocument()
    expect(screen.getByText(/no folder selected/i)).toBeInTheDocument()
    expect(screen.queryByText(/json files:/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/parse results:/i)).not.toBeInTheDocument()
    expect(screen.queryByLabelText(/localization diff viewer/i)).not.toBeInTheDocument()
  })

  it('opens settings modal, configures multi-provider AI settings, API key, model and toggles confirmation', async () => {
    let currentSettings = { ...DEFAULT_APP_SETTINGS }

    const mockGetSettings = vi.fn().mockImplementation(async () => currentSettings)
    const mockUpdateSettings = vi
      .fn()
      .mockImplementation(async (update: Record<string, unknown>) => {
        currentSettings = {
          ...currentSettings,
          aiTranslation: {
            ...currentSettings.aiTranslation,
            ...update,
          },
        }
        return currentSettings
      })

    window.electronAPI = createMockElectronAPI({
      getSettings: mockGetSettings,
      updateAiTranslationSettings: mockUpdateSettings,
    })

    render(<App />)

    await waitFor(() => {
      expect(mockGetSettings).toHaveBeenCalled()
    })

    // Open settings modal
    const settingsBtn = screen.getByRole('button', { name: /open settings/i })
    fireEvent.click(settingsBtn)

    expect(
      screen.getByRole('dialog', { name: /settings/i })
    ).toBeInTheDocument()
    expect(screen.getByText('AI Translation Provider')).toBeInTheDocument()

    // 1. Verify Default Provider is Mock / Offline
    const providerSelect = screen.getByRole('combobox', { name: /select ai provider/i })
    expect(providerSelect).toHaveValue('mock')

    // 2. Switch provider to OpenAI
    fireEvent.change(providerSelect, { target: { value: 'openai' } })
    await waitFor(() => {
      expect(mockUpdateSettings).toHaveBeenCalledWith(
        expect.objectContaining({ provider: 'openai' })
      )
    })

    // Verify API Key input appears for OpenAI
    const apiKeyInput = screen.getByLabelText(/openai api key/i)
    expect(apiKeyInput).toBeInTheDocument()
    expect(apiKeyInput).toHaveAttribute('type', 'password')

    // Enter API Key
    fireEvent.change(apiKeyInput, { target: { value: 'sk-test-key-12345' } })
    await waitFor(() => {
      expect(mockUpdateSettings).toHaveBeenCalled()
    })

    // Toggle API Key visibility
    const showToggleBtn = screen.getByRole('button', { name: /show/i })
    fireEvent.click(showToggleBtn)
    expect(apiKeyInput).toHaveAttribute('type', 'text')

    // 3. Switch provider to Ollama
    fireEvent.change(providerSelect, { target: { value: 'ollama' } })
    await waitFor(() => {
      expect(mockUpdateSettings).toHaveBeenCalledWith(
        expect.objectContaining({ provider: 'ollama' })
      )
    })

    // Verify Ollama Base URL input appears
    const baseUrlInput = screen.getByLabelText(/ollama base url/i)
    expect(baseUrlInput).toBeInTheDocument()
    expect(baseUrlInput).toHaveValue('http://localhost:11434')

    // 4. Toggle Confirmation checkbox
    const checkbox = screen.getByRole('checkbox', {
      name: /ask for confirmation before applying (ai|generated) translations/i,
    })
    expect(checkbox).toBeChecked()

    fireEvent.click(checkbox)
    await waitFor(() => {
      expect(mockUpdateSettings).toHaveBeenCalledWith(
        expect.objectContaining({ requireEditConfirmation: false })
      )
    })

    // Close settings modal
    const doneBtn = screen.getByRole('button', { name: /done/i })
    fireEvent.click(doneBtn)

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('triggers AI translation review modal when requireEditConfirmation is true, displaying engine badge and source info', async () => {
    let ruContent: Record<string, unknown> = {
      MENU: {
        PLAY: '', // empty key
        EXIT: 'Выход',
      },
    }

    const mockSelectDirectory = vi.fn().mockResolvedValue('C:/Projects/locales')
    const mockGetJsonFiles = vi.fn().mockResolvedValue([
      { name: 'en.json', path: 'C:/Projects/locales/en.json' },
      { name: 'ru.json', path: 'C:/Projects/locales/ru.json' },
    ])
    const mockReadJsonFile = vi.fn().mockImplementation(async (filePath: string) => {
      if (filePath.endsWith('en.json')) {
        return {
          MENU: {
            PLAY: 'Play',
            EXIT: 'Exit',
          },
        }
      }
      if (filePath.endsWith('ru.json')) {
        return ruContent
      }
      throw new Error('File not found')
    })
    const mockWriteJsonFiles = vi
      .fn()
      .mockImplementation(async (files: { path: string; content: string }[]) => {
        for (const file of files) {
          if (file.path.endsWith('ru.json')) {
            ruContent = JSON.parse(file.content)
          }
        }
        return { success: true }
      })

    window.electronAPI = createMockElectronAPI({
      selectDirectory: mockSelectDirectory,
      getJsonFiles: mockGetJsonFiles,
      readJsonFile: mockReadJsonFile,
      writeJsonFiles: mockWriteJsonFiles,
    })

    render(<App />)

    fireEvent.click(screen.getByRole('button', { name: /select folder/i }))
    await waitFor(() => expect(screen.getByTestId('coverage-row-ru.json')).toBeInTheDocument())
    fireEvent.click(screen.getByTestId('coverage-row-ru.json'))

    // Switch to ru.json tab
    await waitFor(() => expect(screen.getByRole('tab', { name: /ru\.json/i })).toBeInTheDocument())

    // Click "✨ Translate with AI" on MENU.PLAY
    const aiTranslateBtn = screen.getByRole('button', { name: /translate menu\.play with ai/i })
    fireEvent.click(aiTranslateBtn)

    // Review Modal should appear with Provider & Model info
    await waitFor(() => {
      expect(screen.getByRole('dialog', { name: /review ai translation/i })).toBeInTheDocument()
    })

    expect(screen.getByText(/Source Reference \(en\.json · en\)/i)).toBeInTheDocument()
    expect(screen.getByText('Play')).toBeInTheDocument()
    expect(screen.getByText(/Mock \/ Offline · mock-v1/i)).toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: /ai proposed translation/i })).toHaveValue('[AI: RU] Play')

    // Test Cancel
    fireEvent.click(screen.getByRole('button', { name: /^cancel$/i }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(mockWriteJsonFiles).not.toHaveBeenCalled()

    // Click AI translate again and Confirm
    fireEvent.click(screen.getByRole('button', { name: /translate menu\.play with ai/i }))
    await waitFor(() => {
      expect(screen.getByRole('dialog', { name: /review ai translation/i })).toBeInTheDocument()
    })

    const applyBtn = screen.getByRole('button', { name: /apply translation/i })
    fireEvent.click(applyBtn)

    await waitFor(() => {
      expect(mockWriteJsonFiles).toHaveBeenCalledWith([
        {
          path: 'C:/Projects/locales/ru.json',
          content: JSON.stringify(
            {
              MENU: {
                PLAY: '[AI: RU] Play',
                EXIT: 'Выход',
              },
            },
            null,
            2
          ) + '\n',
        },
      ])
    })

    // Modal closes and tree updates
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
      expect(screen.getByTestId('tree-node-MENU.PLAY')).toHaveTextContent('"[AI: RU] Play"')
    })
  })

  it('navigates to the first problem key when clicking summary problem counters', async () => {
    const mockSelectDirectory = vi.fn().mockResolvedValue('C:/Projects/locales')
    const mockGetJsonFiles = vi.fn().mockResolvedValue([
      { name: 'en.json', path: 'C:/Projects/locales/en.json' },
      { name: 'ru.json', path: 'C:/Projects/locales/ru.json' },
    ])
    const mockReadJsonFile = vi.fn().mockImplementation(async (filePath: string) => {
      if (filePath.endsWith('en.json')) {
        return {
          AUTH: { LOGIN: 'Log In', LOGOUT: 'Log Out' },
          MENU: { PLAY: 'Play' },
        }
      }
      if (filePath.endsWith('ru.json')) {
        return {
          AUTH: { LOGIN: '' }, // empty
          // AUTH.LOGOUT and MENU.PLAY are missing
        }
      }
      throw new Error('File not found')
    })

    window.electronAPI = createMockElectronAPI({
      selectDirectory: mockSelectDirectory,
      getJsonFiles: mockGetJsonFiles,
      readJsonFile: mockReadJsonFile,
    })

    render(<App />)

    fireEvent.click(screen.getByRole('button', { name: /select folder/i }))
    await waitFor(() => expect(screen.getByTestId('coverage-row-en.json')).toBeInTheDocument())
    fireEvent.click(screen.getByTestId('coverage-row-en.json'))

    await waitFor(() => expect(screen.getByTestId('file-tab-en.json')).toBeInTheDocument())

    // Missing keys counter: 2
    const missingBtn = screen.getByRole('button', { name: /navigate 2 missing keys/i })
    expect(missingBtn).toBeInTheDocument()

    // Click Missing keys counter -> switches to ru.json and selects first missing key (AUTH.LOGOUT)
    fireEvent.click(missingBtn)
    expect(screen.getByTestId('navigator-position')).toHaveTextContent('Missing translation 1 of 2')
    expect(screen.getByTestId('tree-node-AUTH.LOGOUT')).toHaveClass('row-active-missing')

    // Empty keys counter: 1
    const emptyBtn = screen.getByRole('button', { name: /navigate 1 empty keys/i })
    expect(emptyBtn).toBeInTheDocument()

    // Click Empty keys counter -> switches to empty mode and selects AUTH.LOGIN
    fireEvent.click(emptyBtn)
    expect(screen.getByTestId('navigator-position')).toHaveTextContent('Empty translation 1 of 1')
    expect(screen.getByTestId('tree-node-AUTH.LOGIN')).toHaveClass('row-empty')
  })

  it('performs batch "Translate All" with progress, review modal, inline editing, and atomic file update', async () => {
    let ruContent: Record<string, unknown> = {
      AUTH: { LOGIN: '' }, // empty
      // MENU.PLAY is missing
    }

    const mockSelectDirectory = vi.fn().mockResolvedValue('C:/Projects/locales')
    const mockGetJsonFiles = vi.fn().mockResolvedValue([
      { name: 'en.json', path: 'C:/Projects/locales/en.json' },
      { name: 'ru.json', path: 'C:/Projects/locales/ru.json' },
    ])
    const mockReadJsonFile = vi.fn().mockImplementation(async (filePath: string) => {
      if (filePath.endsWith('en.json')) {
        return {
          AUTH: { LOGIN: 'Log In' },
          MENU: { PLAY: 'Play' },
        }
      }
      if (filePath.endsWith('ru.json')) {
        return ruContent
      }
      throw new Error('File not found')
    })
    const mockWriteJsonFiles = vi
      .fn()
      .mockImplementation(async (files: { path: string; content: string }[]) => {
        for (const file of files) {
          if (file.path.endsWith('ru.json')) {
            ruContent = JSON.parse(file.content)
          }
        }
        return { success: true }
      })

    window.electronAPI = createMockElectronAPI({
      selectDirectory: mockSelectDirectory,
      getJsonFiles: mockGetJsonFiles,
      readJsonFile: mockReadJsonFile,
      writeJsonFiles: mockWriteJsonFiles,
    })

    render(<App />)

    fireEvent.click(screen.getByRole('button', { name: /select folder/i }))
    await waitFor(() => expect(screen.getByTestId('coverage-row-ru.json')).toBeInTheDocument())
    fireEvent.click(screen.getByTestId('coverage-row-ru.json'))

    // Click "✨ Translate All (2)"
    await waitFor(() => expect(screen.getByRole('button', { name: /translate all \(2\)/i })).toBeEnabled())
    const translateAllBtn = screen.getByRole('button', { name: /translate all \(2\)/i })
    fireEvent.click(translateAllBtn)

    // Review Modal should appear
    await waitFor(() => {
      expect(
        screen.getByRole('dialog', { name: /review batch translations/i })
      ).toBeInTheDocument()
    })

    expect(screen.getByTestId('batch-row-ru.json-AUTH.LOGIN')).toBeInTheDocument()
    expect(screen.getByTestId('batch-row-ru.json-MENU.PLAY')).toBeInTheDocument()

    // Edit proposed translation for AUTH.LOGIN
    const loginInput = screen.getByRole('textbox', {
      name: /translation for auth\.login/i,
    })
    expect(loginInput).toHaveValue('[AI: RU] Log In')
    fireEvent.change(loginInput, { target: { value: 'Войти' } })

    // Click "✓ Apply All (2)"
    const applyAllBtn = screen.getByRole('button', { name: /apply all \(2\)/i })
    fireEvent.click(applyAllBtn)

    await waitFor(() => {
      expect(mockWriteJsonFiles).toHaveBeenCalledWith([
        {
          path: 'C:/Projects/locales/ru.json',
          content: JSON.stringify(
            {
              AUTH: { LOGIN: 'Войти' },
              MENU: { PLAY: '[AI: RU] Play' },
            },
            null,
            2
          ) + '\n',
        },
      ])
    })

    // After refresh, modal should be closed and success message shown
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
      expect(
        screen.getByText(/successfully applied 2 translations/i)
      ).toBeInTheDocument()
    })
  })

  it('automatically applies batch translations when requireEditConfirmation is false', async () => {
    let ruContent: Record<string, unknown> = {
      AUTH: { LOGIN: '' },
    }

    const mockSelectDirectory = vi.fn().mockResolvedValue('C:/Projects/locales')
    const mockGetJsonFiles = vi.fn().mockResolvedValue([
      { name: 'en.json', path: 'C:/Projects/locales/en.json' },
      { name: 'ru.json', path: 'C:/Projects/locales/ru.json' },
    ])
    const mockReadJsonFile = vi.fn().mockImplementation(async (filePath: string) => {
      if (filePath.endsWith('en.json')) {
        return { AUTH: { LOGIN: 'Log In' } }
      }
      if (filePath.endsWith('ru.json')) {
        return ruContent
      }
      throw new Error('File not found')
    })
    const mockWriteJsonFiles = vi
      .fn()
      .mockImplementation(async (files: { path: string; content: string }[]) => {
        for (const file of files) {
          if (file.path.endsWith('ru.json')) {
            ruContent = JSON.parse(file.content)
          }
        }
        return { success: true }
      })

    window.electronAPI = createMockElectronAPI({
      selectDirectory: mockSelectDirectory,
      getJsonFiles: mockGetJsonFiles,
      readJsonFile: mockReadJsonFile,
      writeJsonFiles: mockWriteJsonFiles,
      getSettings: vi.fn().mockResolvedValue({
        ...DEFAULT_APP_SETTINGS,
        aiTranslation: {
          ...DEFAULT_APP_SETTINGS.aiTranslation,
          requireEditConfirmation: false,
        },
      }),
    })

    render(<App />)

    fireEvent.click(screen.getByRole('button', { name: /select folder/i }))
    await waitFor(() => expect(screen.getByTestId('coverage-row-ru.json')).toBeInTheDocument())
    fireEvent.click(screen.getByTestId('coverage-row-ru.json'))

    await waitFor(() => expect(screen.getByRole('button', { name: /translate all \(1\)/i })).toBeInTheDocument())
    const translateAllBtn = screen.getByRole('button', { name: /translate all \(1\)/i })
    fireEvent.click(translateAllBtn)

    await waitFor(() => {
      expect(mockWriteJsonFiles).toHaveBeenCalledWith([
        {
          path: 'C:/Projects/locales/ru.json',
          content: JSON.stringify(
            {
              AUTH: { LOGIN: '[AI: RU] Log In' },
            },
            null,
            2
          ) + '\n',
        },
      ])
    })

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('displays error and does not modify files when AI provider fails or lacks required API key', async () => {
    const mockSelectDirectory = vi.fn().mockResolvedValue('C:/Projects/locales')
    const mockGetJsonFiles = vi.fn().mockResolvedValue([
      { name: 'en.json', path: 'C:/Projects/locales/en.json' },
      { name: 'ru.json', path: 'C:/Projects/locales/ru.json' },
    ])
    const mockReadJsonFile = vi.fn().mockImplementation(async (filePath: string) => {
      if (filePath.endsWith('en.json')) {
        return { MENU: { PLAY: 'Play' } }
      }
      if (filePath.endsWith('ru.json')) {
        return { MENU: { PLAY: '' } }
      }
      throw new Error('File not found')
    })
    const mockWriteJsonFiles = vi.fn()

    window.electronAPI = createMockElectronAPI({
      selectDirectory: mockSelectDirectory,
      getJsonFiles: mockGetJsonFiles,
      readJsonFile: mockReadJsonFile,
      writeJsonFiles: mockWriteJsonFiles,
      getSettings: vi.fn().mockResolvedValue({
        aiTranslation: {
          provider: 'openai',
          requireEditConfirmation: true,
          providers: {
            openai: { model: 'gpt-4o-mini', apiKey: '' },
          },
        },
      }),
    })

    render(<App />)

    fireEvent.click(screen.getByRole('button', { name: /select folder/i }))
    await waitFor(() => expect(screen.getByTestId('coverage-row-ru.json')).toBeInTheDocument())
    fireEvent.click(screen.getByTestId('coverage-row-ru.json'))

    await waitFor(() => expect(screen.getByRole('tab', { name: /ru\.json/i })).toBeInTheDocument())

    const aiTranslateBtn = screen.getByRole('button', { name: /translate menu\.play with ai/i })
    fireEvent.click(aiTranslateBtn)

    await waitFor(() => {
      expect(screen.getByText(/api key is missing for openai/i)).toBeInTheDocument()
    })

    expect(mockWriteJsonFiles).not.toHaveBeenCalled()
  })

  it('displays discovered JSON files with checkboxes in Explorer', async () => {
    const mockSelectDirectory = vi.fn().mockResolvedValue('C:/Projects/locales')
    const mockGetJsonFiles = vi.fn().mockResolvedValue([
      { name: 'en.json', path: 'C:/Projects/locales/en.json' },
      { name: 'ru.json', path: 'C:/Projects/locales/ru.json' },
    ])

    window.electronAPI = createMockElectronAPI({
      selectDirectory: mockSelectDirectory,
      getJsonFiles: mockGetJsonFiles,
    })

    render(<App />)

    const selectButton = screen.getByRole('button', { name: /select folder/i })
    fireEvent.click(selectButton)

    await waitFor(() => {
      expect(screen.getByText('C:/Projects/locales')).toBeInTheDocument()
    })

    expect(screen.getByRole('checkbox', { name: /select en\.json/i })).toBeChecked()
    expect(screen.getByRole('checkbox', { name: /select ru\.json/i })).toBeChecked()
  })

  it('parses files, compares them, and enables navigation between missing keys', async () => {
    const mockSelectDirectory = vi.fn().mockResolvedValue('C:/Projects/locales')
    const mockGetJsonFiles = vi.fn().mockResolvedValue([
      { name: 'en.json', path: 'C:/Projects/locales/en.json' },
      { name: 'ru.json', path: 'C:/Projects/locales/ru.json' },
    ])
    const mockReadJsonFile = vi.fn().mockImplementation(async (filePath: string) => {
      if (filePath.endsWith('en.json')) {
        return {
          ADMIN: {
            PANEL: {
              TITLE: 'Admin panel',
              BUTTON: { SAVE: 'Save', CANCEL: 'Cancel' },
            },
          },
          AUTH: {
            LOGOUT: 'Logout',
          },
        }
      }
      if (filePath.endsWith('ru.json')) {
        return {
          ADMIN: {
            PANEL: {
              TITLE: 'Панель администратора',
            },
          },
        }
      }
      throw new Error('File not found')
    })

    window.electronAPI = createMockElectronAPI({
      selectDirectory: mockSelectDirectory,
      getJsonFiles: mockGetJsonFiles,
      readJsonFile: mockReadJsonFile,
    })

    render(<App />)

    fireEvent.click(screen.getByRole('button', { name: /select folder/i }))

    await waitFor(() => {
      expect(screen.getByTestId('coverage-row-ru.json')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByTestId('coverage-row-ru.json'))

    await waitFor(() => {
      expect(screen.getByRole('tab', { name: /ru\.json/i })).toBeInTheDocument()
    })

    // Dashboard navigation automatically focuses first missing key
    expect(screen.getByTestId('navigator-position')).toHaveTextContent('Missing translation 1 of 3')

    const prevBtn = screen.getByRole('button', { name: /previous key/i })
    const nextBtn = screen.getByRole('button', { name: /next key/i })
    const topBtn = screen.getByRole('button', { name: /scroll to top/i })

    expect(prevBtn).toBeDisabled()
    expect(nextBtn).toBeEnabled()

    const cancelNode = screen.getByTestId('tree-node-ADMIN.PANEL.BUTTON.CANCEL')
    expect(cancelNode).toHaveClass('row-active-missing')

    // Click Next -> moves to 2nd missing key (ADMIN.PANEL.BUTTON.SAVE)
    fireEvent.click(nextBtn)
    expect(screen.getByTestId('navigator-position')).toHaveTextContent('Missing translation 2 of 3')
    expect(prevBtn).toBeEnabled()
    expect(nextBtn).toBeEnabled()

    const saveNode = screen.getByTestId('tree-node-ADMIN.PANEL.BUTTON.SAVE')
    expect(saveNode).toHaveClass('row-active-missing')

    // Click Next -> moves to 3rd missing key (AUTH.LOGOUT)
    fireEvent.click(nextBtn)
    expect(screen.getByTestId('navigator-position')).toHaveTextContent('Missing translation 3 of 3')
    expect(prevBtn).toBeEnabled()
    expect(nextBtn).toBeDisabled()

    const logoutNode = screen.getByTestId('tree-node-AUTH.LOGOUT')
    expect(logoutNode).toHaveClass('row-active-missing')

    // Click Previous -> moves back to 2nd missing key
    fireEvent.click(prevBtn)
    expect(screen.getByTestId('navigator-position')).toHaveTextContent('Missing translation 2 of 3')
    expect(saveNode).toHaveClass('row-active-missing')

    // Click Top -> clears active focus
    fireEvent.click(topBtn)
    expect(screen.getByTestId('navigator-position')).toHaveTextContent('3 missing translations in this file')
    expect(saveNode).not.toHaveClass('row-active-missing')
  })

  it('supports previewing and confirming addition of missing keys as empty strings', async () => {
    let ruContent: Record<string, unknown> = {
      ADMIN: {
        PANEL: {
          TITLE: 'Панель администратора',
        },
      },
    }

    const mockSelectDirectory = vi.fn().mockResolvedValue('C:/Projects/locales')
    const mockGetJsonFiles = vi.fn().mockResolvedValue([
      { name: 'en.json', path: 'C:/Projects/locales/en.json' },
      { name: 'ru.json', path: 'C:/Projects/locales/ru.json' },
    ])
    const mockReadJsonFile = vi.fn().mockImplementation(async (filePath: string) => {
      if (filePath.endsWith('en.json')) {
        return {
          ADMIN: {
            PANEL: {
              TITLE: 'Admin panel',
              BUTTON: { SAVE: 'Save' },
            },
          },
        }
      }
      if (filePath.endsWith('ru.json')) {
        return ruContent
      }
      throw new Error('File not found')
    })
    const mockWriteJsonFiles = vi
      .fn()
      .mockImplementation(async (files: { path: string; content: string }[]) => {
        for (const file of files) {
          if (file.path.endsWith('ru.json')) {
            ruContent = JSON.parse(file.content)
          }
        }
        return { success: true }
      })

    window.electronAPI = createMockElectronAPI({
      selectDirectory: mockSelectDirectory,
      getJsonFiles: mockGetJsonFiles,
      readJsonFile: mockReadJsonFile,
      writeJsonFiles: mockWriteJsonFiles,
    })

    render(<App />)

    fireEvent.click(screen.getByRole('button', { name: /select folder/i }))
    await waitFor(() => expect(screen.getByTestId('coverage-row-ru.json')).toBeInTheDocument())
    fireEvent.click(screen.getByTestId('coverage-row-ru.json'))

    // Switch to ru.json
    await waitFor(() => expect(screen.getByRole('tab', { name: /ru\.json/i })).toBeInTheDocument())
    fireEvent.click(screen.getByRole('tab', { name: /ru\.json/i }))

    // Add Missing Keys button should be enabled
    const addMissingBtn = screen.getByRole('button', { name: /add missing keys/i })
    expect(addMissingBtn).toBeEnabled()

    // Open Preview Modal
    fireEvent.click(addMissingBtn)

    expect(screen.getByRole('dialog', { name: /add missing keys preview/i })).toBeInTheDocument()
    expect(screen.getByText('ADMIN.PANEL.BUTTON.SAVE')).toBeInTheDocument()

    // Test Cancel
    const cancelBtn = screen.getByRole('button', { name: /cancel/i })
    fireEvent.click(cancelBtn)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(mockWriteJsonFiles).not.toHaveBeenCalled()

    // Open Modal again and Confirm
    fireEvent.click(screen.getByRole('button', { name: /add missing keys/i }))
    const confirmBtn = screen.getByRole('button', { name: /confirm & write to disk/i })
    fireEvent.click(confirmBtn)

    await waitFor(() => {
      expect(mockWriteJsonFiles).toHaveBeenCalledWith([
        {
          path: 'C:/Projects/locales/ru.json',
          content: JSON.stringify(
            {
              ADMIN: {
                PANEL: {
                  TITLE: 'Панель администратора',
                  BUTTON: {
                    SAVE: '',
                  },
                },
              },
            },
            null,
            2
          ) + '\n',
        },
      ])
    })

    // After refresh, modal should be closed and Add Missing Keys button becomes "✓ All Keys Present"
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
      expect(screen.getByRole('button', { name: /✓ all keys present/i })).toBeDisabled()
    })
  })

  it('displays [ EMPTY ] badge for empty translations and enables inline manual editing', async () => {
    let ruContent: Record<string, unknown> = {
      MENU: {
        PLAY: '', // empty
        EXIT: 'Выход',
      },
    }

    const mockSelectDirectory = vi.fn().mockResolvedValue('C:/Projects/locales')
    const mockGetJsonFiles = vi.fn().mockResolvedValue([
      { name: 'en.json', path: 'C:/Projects/locales/en.json' },
      { name: 'ru.json', path: 'C:/Projects/locales/ru.json' },
    ])
    const mockReadJsonFile = vi.fn().mockImplementation(async (filePath: string) => {
      if (filePath.endsWith('en.json')) {
        return {
          MENU: {
            PLAY: 'Play',
            EXIT: 'Exit',
          },
        }
      }
      if (filePath.endsWith('ru.json')) {
        return ruContent
      }
      throw new Error('File not found')
    })
    const mockWriteJsonFiles = vi
      .fn()
      .mockImplementation(async (files: { path: string; content: string }[]) => {
        for (const file of files) {
          if (file.path.endsWith('ru.json')) {
            ruContent = JSON.parse(file.content)
          }
        }
        return { success: true }
      })

    window.electronAPI = createMockElectronAPI({
      selectDirectory: mockSelectDirectory,
      getJsonFiles: mockGetJsonFiles,
      readJsonFile: mockReadJsonFile,
      writeJsonFiles: mockWriteJsonFiles,
    })

    render(<App />)

    fireEvent.click(screen.getByRole('button', { name: /select folder/i }))
    await waitFor(() => expect(screen.getByTestId('coverage-row-ru.json')).toBeInTheDocument())
    fireEvent.click(screen.getByTestId('coverage-row-ru.json'))

    // Switch to ru.json
    await waitFor(() => expect(screen.getByRole('tab', { name: /ru\.json/i })).toBeInTheDocument())

    // Check [ EMPTY ] badge is present for MENU.PLAY
    const playNode = screen.getByTestId('tree-node-MENU.PLAY')
    expect(playNode).toHaveTextContent('[ EMPTY ]')

    // Click the empty badge in the file tabs to navigate to it
    const emptyTabBadge = screen.getByRole('button', {
      name: /1 empty keys, click to navigate/i,
    })
    fireEvent.click(emptyTabBadge)

    expect(screen.getByTestId('navigator-position')).toHaveTextContent('Empty translation 1 of 1')

    // Click the row to start editing
    fireEvent.click(playNode)

    const input = screen.getByRole('textbox', { name: /edit menu\.play/i })
    expect(input).toBeInTheDocument()
    expect(input).toHaveValue('')

    // Test Cancel
    fireEvent.change(input, { target: { value: 'Something' } })
    fireEvent.click(screen.getByRole('button', { name: /cancel/i }))
    expect(mockWriteJsonFiles).not.toHaveBeenCalled()
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument()

    // Click row again, enter translation and Save
    fireEvent.click(screen.getByTestId('tree-node-MENU.PLAY'))
    const editInput = screen.getByRole('textbox', { name: /edit menu\.play/i })
    fireEvent.change(editInput, { target: { value: 'Играть' } })
    fireEvent.click(screen.getByRole('button', { name: /save/i }))

    await waitFor(() => {
      expect(mockWriteJsonFiles).toHaveBeenCalledWith([
        {
          path: 'C:/Projects/locales/ru.json',
          content: JSON.stringify(
            {
              MENU: {
                PLAY: 'Играть',
                EXIT: 'Выход',
              },
            },
            null,
            2
          ) + '\n',
        },
      ])
    })

    // After refresh, [ EMPTY ] badge should disappear and value should be displayed
    await waitFor(() => {
      expect(screen.getByTestId('tree-node-MENU.PLAY')).toHaveTextContent('"Играть"')
      expect(screen.getByTestId('tree-node-MENU.PLAY')).not.toHaveTextContent('[ EMPTY ]')
    })
  })

  it('switches translation engine to Free Translator, configures LibreTranslate and MyMemory settings, and persists configuration', async () => {
    let currentSettings: AppSettings = { ...DEFAULT_APP_SETTINGS }

    const mockGetSettings = vi.fn().mockImplementation(async () => currentSettings)
    const mockUpdateTranslationSettings = vi
      .fn()
      .mockImplementation(async (update: Partial<AppSettings>) => {
        currentSettings = {
          ...currentSettings,
          ...update,
          aiTranslation: {
            ...currentSettings.aiTranslation,
            ...(update.aiTranslation || {}),
          },
          freeTranslation: {
            ...(currentSettings.freeTranslation || DEFAULT_APP_SETTINGS.freeTranslation!),
            ...(update.freeTranslation || {}),
          },
        }
        return currentSettings
      })

    window.electronAPI = createMockElectronAPI({
      getSettings: mockGetSettings,
      updateTranslationSettings: mockUpdateTranslationSettings,
    })

    render(<App />)

    await waitFor(() => expect(mockGetSettings).toHaveBeenCalled())

    // Open settings modal
    fireEvent.click(screen.getByRole('button', { name: /open settings/i }))

    // Switch engine to Free Translator
    const engineSelect = screen.getByRole('combobox', { name: /select translation engine/i })
    expect(engineSelect).toHaveValue('ai')

    fireEvent.change(engineSelect, { target: { value: 'free' } })
    expect(mockUpdateTranslationSettings).toHaveBeenCalledWith({ engine: 'free' })

    // Verify Free Provider select is visible
    const freeProviderSelect = screen.getByRole('combobox', { name: /select free provider/i })
    expect(freeProviderSelect).toHaveValue('libretranslate')

    // Edit LibreTranslate server URL
    const urlInput = screen.getByRole('textbox', { name: /libretranslate server url/i })
    fireEvent.change(urlInput, { target: { value: 'http://my-libretranslate.internal:5000' } })
    expect(mockUpdateTranslationSettings).toHaveBeenCalled()

    // Switch to MyMemory
    fireEvent.change(freeProviderSelect, { target: { value: 'mymemory' } })
    expect(mockUpdateTranslationSettings).toHaveBeenCalled()

    // Enter MyMemory email
    const emailInput = screen.getByRole('textbox', { name: /mymemory email/i })
    fireEvent.change(emailInput, { target: { value: 'dev@example.com' } })
    expect(mockUpdateTranslationSettings).toHaveBeenCalled()
  })

  it('ensures that zero network fetch requests are dispatched during application startup and settings loading', async () => {
    const fetchSpy = vi.fn()
    globalThis.fetch = fetchSpy

    const mockGetSettings = vi.fn().mockResolvedValue(DEFAULT_APP_SETTINGS)
    window.electronAPI = createMockElectronAPI({
      getSettings: mockGetSettings,
    })

    render(<App />)

    await waitFor(() => {
      expect(mockGetSettings).toHaveBeenCalled()
    })

    // Assert that no provider network request occurred during initialization
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('dynamically updates the translation button label between AI and Free Translation modes without restarting', async () => {
    let currentSettings: AppSettings = { ...DEFAULT_APP_SETTINGS, engine: 'ai' }

    const mockGetSettings = vi.fn().mockImplementation(async () => currentSettings)
    const mockUpdateTranslationSettings = vi
      .fn()
      .mockImplementation(async (update: Partial<AppSettings>) => {
        currentSettings = { ...currentSettings, ...update }
        return currentSettings
      })

    window.electronAPI = createMockElectronAPI({
      getSettings: mockGetSettings,
      updateTranslationSettings: mockUpdateTranslationSettings,
      selectDirectory: vi.fn().mockResolvedValue('/mock/locales'),
      getJsonFiles: vi.fn().mockResolvedValue([
        { name: 'en.json', path: '/mock/locales/en.json' },
        { name: 'ru.json', path: '/mock/locales/ru.json' },
      ]),
      readJsonFile: vi.fn().mockImplementation(async (path: string) => {
        if (path.endsWith('en.json')) {
          return { MENU: { PLAY: 'Play' } }
        }
        if (path.endsWith('ru.json')) {
          return { MENU: { PLAY: '' } }
        }
        return {}
      }),
    })

    render(<App />)

    await waitFor(() => expect(mockGetSettings).toHaveBeenCalled())

    // Load and compare via Dashboard
    fireEvent.click(screen.getByRole('button', { name: /select folder/i }))
    await waitFor(() => expect(screen.getByTestId('coverage-row-ru.json')).toBeInTheDocument())
    fireEvent.click(screen.getByTestId('coverage-row-ru.json'))

    // Switch to ru.json
    await waitFor(() => expect(screen.getByRole('tab', { name: /ru\.json/i })).toBeInTheDocument())
    fireEvent.click(screen.getByRole('tab', { name: /ru\.json/i }))

    // In AI mode, verify button label is "✨ Translate with AI"
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /translate menu\.play with ai/i })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /translate menu\.play with ai/i })).toHaveTextContent('✨ Translate with AI')
    })

    // Open settings and switch engine to Free Translation
    fireEvent.click(screen.getByRole('button', { name: /open settings/i }))
    const engineSelect = screen.getByRole('combobox', { name: /select translation engine/i })
    fireEvent.change(engineSelect, { target: { value: 'free' } })

    // Close settings
    fireEvent.click(screen.getByRole('button', { name: /^done$/i }))

    // Verify button dynamically updated to "✨ Translate with Free" immediately
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /translate menu\.play with free/i })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /translate menu\.play with free/i })).toHaveTextContent('✨ Translate with Free')
    })
  })

  it('allows switching the application UI language and immediately translates interface elements without touching localization files', async () => {
    let currentSettings: AppSettings = { ...DEFAULT_APP_SETTINGS, language: 'en' }

    const mockGetSettings = vi.fn().mockImplementation(async () => currentSettings)
    const mockUpdateTranslationSettings = vi
      .fn()
      .mockImplementation(async (update: Partial<AppSettings>) => {
        currentSettings = { ...currentSettings, ...update }
        return currentSettings
      })

    window.electronAPI = createMockElectronAPI({
      getSettings: mockGetSettings,
      updateTranslationSettings: mockUpdateTranslationSettings,
    })

    render(<App />)

    await waitFor(() => expect(mockGetSettings).toHaveBeenCalled())

    // Initial English check
    expect(screen.getByRole('button', { name: /select folder/i })).toHaveTextContent('Select Folder')

    // Open settings
    fireEvent.click(screen.getByRole('button', { name: /settings/i }))

    // Switch language to Ukrainian (uk)
    const langSelect = document.getElementById('app-language-select') as HTMLSelectElement
    expect(langSelect).toBeTruthy()
    fireEvent.change(langSelect, { target: { value: 'uk' } })

    // Close settings
    const doneBtnUk = document.querySelector('.settings-done-btn') as HTMLButtonElement
    fireEvent.click(doneBtnUk)

    // Verify UI is immediately in Ukrainian
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /обрати папку/i })).toHaveTextContent('Обрати папку')
    })

    // Open settings again and switch to Japanese (ja)
    fireEvent.click(screen.getByRole('button', { name: /налаштування/i }))
    const langSelectJa = document.getElementById('app-language-select') as HTMLSelectElement
    fireEvent.change(langSelectJa, {
      target: { value: 'ja' },
    })
    const doneBtnJa = document.querySelector('.settings-done-btn') as HTMLButtonElement
    fireEvent.click(doneBtnJa)

    // Verify UI is immediately in Japanese
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /フォルダーを選択/i })).toHaveTextContent('フォルダーを選択')
    })
  })

  it('shows an error message if Electron API is unavailable', () => {
    render(<App />)

    const selectButton = screen.getByRole('button', { name: /select folder/i })
    fireEvent.click(selectButton)

    expect(
      screen.getByText(/unable to open folder selection dialog: electron api is unavailable/i)
    ).toBeInTheDocument()
  })

  it('supports context-menu deletion, section deletion, undo/redo, and keyboard shortcuts', async () => {
    const enContent = JSON.stringify({
      APP: {
        TITLE: 'My App',
        MENU: {
          OPEN: 'Open',
          CLOSE: 'Close',
        },
      },
    })
    const ruContent = JSON.stringify({
      APP: {
        TITLE: 'Мое приложение',
        MENU: {
          OPEN: 'Открыть',
          CLOSE: 'Закрыть',
        },
      },
    })

    let ruState = JSON.parse(ruContent)
    const mockWriteJsonFiles = vi
      .fn()
      .mockImplementation(async (files: { path: string; content: string }[]) => {
        for (const f of files) {
          if (f.path.endsWith('ru.json')) {
            ruState = JSON.parse(f.content)
          }
        }
        return { success: true }
      })

    const mockReadJsonFile = vi.fn().mockImplementation(async (filePath: string) => {
      if (filePath.endsWith('en.json')) {
        return JSON.parse(enContent)
      }
      if (filePath.endsWith('ru.json')) {
        return ruState
      }
      throw new Error('File not found')
    })

    window.electronAPI = createMockElectronAPI({
      selectDirectory: vi.fn().mockResolvedValue('C:/Projects/locales'),
      getJsonFiles: vi.fn().mockResolvedValue([
        { name: 'en.json', path: 'C:/Projects/locales/en.json' },
        { name: 'ru.json', path: 'C:/Projects/locales/ru.json' },
      ]),
      readJsonFile: mockReadJsonFile,
      writeJsonFiles: mockWriteJsonFiles,
    })

    render(<App />)

    fireEvent.click(screen.getByRole('button', { name: /select folder/i }))
    await waitFor(() => expect(screen.getByTestId('coverage-row-ru.json')).toBeInTheDocument())
    fireEvent.click(screen.getByTestId('coverage-row-ru.json'))

    await waitFor(() => expect(screen.getByTestId('tree-node-APP.TITLE')).toBeInTheDocument())

    // Right-click APP.TITLE to open context menu
    const titleRow = screen.getByTestId('tree-node-APP.TITLE')
    fireEvent.contextMenu(titleRow)

    // Context menu should appear
    expect(screen.getByRole('menu', { name: /localization context menu/i })).toBeInTheDocument()
    const deleteEntryBtn = screen.getByRole('menuitem', { name: /delete entry/i })
    expect(deleteEntryBtn).toBeInTheDocument()

    // Click Delete Entry
    fireEvent.click(deleteEntryBtn)

    await waitFor(() => {
      expect(mockWriteJsonFiles).toHaveBeenCalled()
      expect('TITLE' in (ruState.APP || {})).toBe(false)
    })

    // Undo button in toolbar should now be enabled
    const undoBtn = screen.getByRole('button', { name: /^undo$/i })
    expect(undoBtn).toBeEnabled()

    // Click Undo
    fireEvent.click(undoBtn)
    await waitFor(() => {
      expect(mockWriteJsonFiles).toHaveBeenCalledTimes(2)
      expect(ruState.APP.TITLE).toBe('Мое приложение')
    })

    // Click Redo
    const redoBtn = screen.getByRole('button', { name: /^redo$/i })
    expect(redoBtn).toBeEnabled()
    fireEvent.click(redoBtn)
    await waitFor(() => {
      expect(mockWriteJsonFiles).toHaveBeenCalledTimes(3)
      expect('TITLE' in (ruState.APP || {})).toBe(false)
    })

    // Right-click APP.MENU folder to open context menu
    const menuFolderRow = screen.getByTestId('tree-node-APP.MENU')
    fireEvent.contextMenu(menuFolderRow)

    const deleteSectionBtn = screen.getByRole('menuitem', { name: /delete section/i })
    expect(deleteSectionBtn).toBeInTheDocument()
    fireEvent.click(deleteSectionBtn)

    // DeleteSectionModal confirmation should appear
    await waitFor(() => {
      expect(screen.getByRole('dialog', { name: /confirm section deletion/i })).toBeInTheDocument()
    })

    // Confirm deletion
    const confirmDeleteBtn = screen.getByRole('button', { name: /^delete section$/i })
    fireEvent.click(confirmDeleteBtn)

    await waitFor(() => {
      expect(mockWriteJsonFiles).toHaveBeenCalledTimes(4)
      expect('MENU' in (ruState.APP || {})).toBe(false)
    })

    // Use Ctrl+Z keyboard shortcut to undo section deletion
    fireEvent.keyDown(window, { key: 'z', ctrlKey: true })
    await waitFor(() => {
      expect(mockWriteJsonFiles).toHaveBeenCalledTimes(5)
      expect('MENU' in (ruState.APP || {})).toBe(true)
      expect(ruState.APP.MENU.OPEN).toBe('Открыть')
    })
  })

  it('renders opened folder as root in Explorer, strictly gives checkboxes only to translation files, and previews files on click', async () => {
    const mockTreeResult = {
      rootPath: 'C:/Users/dev/MyProject',
      rootName: 'MyProject',
      entries: [
        {
          name: 'src',
          path: 'C:/Users/dev/MyProject/src',
          relativePath: 'src',
          isDirectory: true,
          children: [
            {
              name: 'locales',
              path: 'C:/Users/dev/MyProject/src/locales',
              relativePath: 'src/locales',
              isDirectory: true,
              children: [
                {
                  name: 'en.json',
                  path: 'C:/Users/dev/MyProject/src/locales/en.json',
                  relativePath: 'src/locales/en.json',
                  isDirectory: false,
                  isLocalizationCandidate: true,
                },
                {
                  name: 'ru.json',
                  path: 'C:/Users/dev/MyProject/src/locales/ru.json',
                  relativePath: 'src/locales/ru.json',
                  isDirectory: false,
                  isLocalizationCandidate: true,
                },
              ],
            },
          ],
        },
        {
          name: 'package.json',
          path: 'C:/Users/dev/MyProject/package.json',
          relativePath: 'package.json',
          isDirectory: false,
          isLocalizationCandidate: false,
        },
        {
          name: 'tsconfig.json',
          path: 'C:/Users/dev/MyProject/tsconfig.json',
          relativePath: 'tsconfig.json',
          isDirectory: false,
          isLocalizationCandidate: false,
        },
        {
          name: 'README.md',
          path: 'C:/Users/dev/MyProject/README.md',
          relativePath: 'README.md',
          isDirectory: false,
          isLocalizationCandidate: false,
        },
      ],
    }

    const mockReadFileText = vi.fn().mockImplementation(async (filePath: string) => {
      if (filePath.endsWith('package.json')) {
        return { success: true, content: '{\n  "name": "my-project",\n  "version": "1.0.0"\n}\n' }
      }
      if (filePath.endsWith('en.json')) {
        return { success: true, content: '{\n  "APP": {\n    "TITLE": "Hello"\n  }\n}\n' }
      }
      if (filePath.endsWith('README.md')) {
        return { success: true, content: '# My Project\nDocumentation here.\n' }
      }
      return { success: false, error: 'File not found' }
    })

    window.electronAPI = createMockElectronAPI({
      selectDirectory: vi.fn().mockResolvedValue('C:/Users/dev/MyProject'),
      readDirectoryTree: vi.fn().mockResolvedValue(mockTreeResult),
      readFileText: mockReadFileText,
    })

    render(<App />)

    // Click "Select Folder"
    const selectFolderBtn = screen.getByRole('button', { name: /select folder/i })
    fireEvent.click(selectFolderBtn)

    await waitFor(() => {
      expect(screen.getByTestId('explorer-root-folder')).toBeInTheDocument()
    })

    // 1. Root folder is displayed as root node
    const rootNode = screen.getByTestId('explorer-root-folder')
    expect(rootNode).toHaveTextContent('MyProject')

    // 2. Expand nested folders
    const srcFolder = screen.getByText('src')
    fireEvent.click(srcFolder)
    const localesFolder = screen.getByText('locales')
    fireEvent.click(localesFolder)

    // 3. Translation files en.json and ru.json have checkboxes
    expect(screen.getByRole('checkbox', { name: /select en\.json/i })).toBeInTheDocument()
    expect(screen.getByRole('checkbox', { name: /select ru\.json/i })).toBeInTheDocument()

    // 4. package.json, tsconfig.json, README.md MUST NOT have checkboxes
    expect(screen.queryByRole('checkbox', { name: /select package\.json/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('checkbox', { name: /select tsconfig\.json/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('checkbox', { name: /select readme\.md/i })).not.toBeInTheDocument()

    // 5. Click en.json -> opens File Preview in workspace
    const enJsonRow = screen.getByTestId('explorer-file-en.json')
    fireEvent.click(enJsonRow)

    await waitFor(() => {
      expect(mockReadFileText).toHaveBeenCalledWith('C:/Users/dev/MyProject/src/locales/en.json')
      expect(screen.getByTestId('file-preview-container')).toBeInTheDocument()
      expect(screen.getByTestId('preview-filename')).toHaveTextContent('en.json')
      expect(screen.getByText(/read-only/i)).toBeInTheDocument()
      expect(screen.getByText(/translation file/i)).toBeInTheDocument()
      expect(screen.getByText(/"TITLE": "Hello"/)).toBeInTheDocument()
    })

    // 6. Click package.json -> opens Preview for package.json without making it selectable as translation
    const packageJsonRow = screen.getByTestId('explorer-file-package.json')
    fireEvent.click(packageJsonRow)

    await waitFor(() => {
      expect(mockReadFileText).toHaveBeenCalledWith('C:/Users/dev/MyProject/package.json')
      expect(screen.getByTestId('preview-filename')).toHaveTextContent('package.json')
      expect(screen.queryByText(/translation file/i)).not.toBeInTheDocument()
      expect(screen.getByText(/"name": "my-project"/)).toBeInTheDocument()
    })

    // 7. Close preview
    const closeBtn = screen.getByRole('button', { name: /close/i })
    fireEvent.click(closeBtn)
    expect(screen.queryByTestId('file-preview-container')).not.toBeInTheDocument()
  })

  it('performs full runtime verification on the exact realistic project structure', async () => {
    const realisticTreeResult = {
      rootPath: 'C:/Users/dev/MyProject',
      rootName: 'MyProject',
      entries: [
        {
          name: 'src',
          path: 'C:/Users/dev/MyProject/src',
          relativePath: 'src',
          isDirectory: true,
          children: [
            {
              name: 'components',
              path: 'C:/Users/dev/MyProject/src/components',
              relativePath: 'src/components',
              isDirectory: true,
              children: [],
            },
            {
              name: 'locales',
              path: 'C:/Users/dev/MyProject/src/locales',
              relativePath: 'src/locales',
              isDirectory: true,
              children: [
                {
                  name: 'en.json',
                  path: 'C:/Users/dev/MyProject/src/locales/en.json',
                  relativePath: 'src/locales/en.json',
                  isDirectory: false,
                  isLocalizationCandidate: true,
                },
                {
                  name: 'ru.json',
                  path: 'C:/Users/dev/MyProject/src/locales/ru.json',
                  relativePath: 'src/locales/ru.json',
                  isDirectory: false,
                  isLocalizationCandidate: true,
                },
                {
                  name: 'uk.json',
                  path: 'C:/Users/dev/MyProject/src/locales/uk.json',
                  relativePath: 'src/locales/uk.json',
                  isDirectory: false,
                  isLocalizationCandidate: true,
                },
                {
                  name: 'ua.json',
                  path: 'C:/Users/dev/MyProject/src/locales/ua.json',
                  relativePath: 'src/locales/ua.json',
                  isDirectory: false,
                  isLocalizationCandidate: true,
                },
                {
                  name: 'unrelated.json',
                  path: 'C:/Users/dev/MyProject/src/locales/unrelated.json',
                  relativePath: 'src/locales/unrelated.json',
                  isDirectory: false,
                  isLocalizationCandidate: false,
                },
              ],
            },
          ],
        },
        {
          name: 'package.json',
          path: 'C:/Users/dev/MyProject/package.json',
          relativePath: 'package.json',
          isDirectory: false,
          isLocalizationCandidate: false,
        },
        {
          name: 'package-lock.json',
          path: 'C:/Users/dev/MyProject/package-lock.json',
          relativePath: 'package-lock.json',
          isDirectory: false,
          isLocalizationCandidate: false,
        },
        {
          name: 'tsconfig.json',
          path: 'C:/Users/dev/MyProject/tsconfig.json',
          relativePath: 'tsconfig.json',
          isDirectory: false,
          isLocalizationCandidate: false,
        },
        {
          name: 'README.md',
          path: 'C:/Users/dev/MyProject/README.md',
          relativePath: 'README.md',
          isDirectory: false,
          isLocalizationCandidate: false,
        },
        {
          name: 'example.ts',
          path: 'C:/Users/dev/MyProject/example.ts',
          relativePath: 'example.ts',
          isDirectory: false,
          isLocalizationCandidate: false,
        },
        {
          name: 'config.json',
          path: 'C:/Users/dev/MyProject/config.json',
          relativePath: 'config.json',
          isDirectory: false,
          isLocalizationCandidate: false,
        },
      ],
    }

    const mockEnJson = { APP: { TITLE: 'Welcome' } }
    const mockRuJson = { APP: { TITLE: 'Добро пожаловать' } }
    const mockUkJson = { APP: { TITLE: 'Ласкаво просимо' } }
    const mockUaJson = { APP: { TITLE: 'Ласкаво просимо (UA)' } }

    const mockReadFileText = vi.fn().mockImplementation(async (filePath: string) => {
      if (filePath.endsWith('en.json')) return { success: true, content: JSON.stringify(mockEnJson, null, 2) }
      if (filePath.endsWith('ru.json')) return { success: true, content: JSON.stringify(mockRuJson, null, 2) }
      if (filePath.endsWith('uk.json')) return { success: true, content: JSON.stringify(mockUkJson, null, 2) }
      if (filePath.endsWith('ua.json')) return { success: true, content: JSON.stringify(mockUaJson, null, 2) }
      if (filePath.endsWith('package.json')) return { success: true, content: '{"name": "test-app"}' }
      if (filePath.endsWith('unrelated.json')) return { success: true, content: '{"foo": "bar"}' }
      return { success: false, error: 'File error' }
    })

    const mockReadJsonFile = vi.fn().mockImplementation(async (filePath: string) => {
      if (filePath.endsWith('en.json')) return mockEnJson
      if (filePath.endsWith('ru.json')) return mockRuJson
      if (filePath.endsWith('uk.json')) return mockUkJson
      if (filePath.endsWith('ua.json')) return mockUaJson
      throw new Error('Not a translation file')
    })

    window.electronAPI = createMockElectronAPI({
      selectDirectory: vi.fn().mockResolvedValue('C:/Users/dev/MyProject'),
      readDirectoryTree: vi.fn().mockResolvedValue(realisticTreeResult),
      readFileText: mockReadFileText,
      readJsonFile: mockReadJsonFile,
    })

    render(<App />)

    // Select directory
    const selectFolderBtn = screen.getByRole('button', { name: /select folder/i })
    fireEvent.click(selectFolderBtn)

    await waitFor(() => {
      expect(screen.getByTestId('explorer-root-folder')).toBeInTheDocument()
    })

    // 1. MyProject is displayed as Explorer root
    const rootNode = screen.getByTestId('explorer-root-folder')
    expect(rootNode).toHaveTextContent('MyProject')

    // 2. Complete project structure is shown
    expect(screen.getByText('src')).toBeInTheDocument()
    expect(screen.getByText('package.json')).toBeInTheDocument()
    expect(screen.getByText('package-lock.json')).toBeInTheDocument()
    expect(screen.getByText('tsconfig.json')).toBeInTheDocument()
    expect(screen.getByText('README.md')).toBeInTheDocument()
    expect(screen.getByText('example.ts')).toBeInTheDocument()
    expect(screen.getByText('config.json')).toBeInTheDocument()

    // 3. Expanding src/ or locales/ does NOT change the workspace root
    const srcDir = screen.getByText('src')
    fireEvent.click(srcDir)
    expect(screen.getByTestId('selected-path-display')).toHaveTextContent('C:/Users/dev/MyProject')

    const localesDir = screen.getByText('locales')
    fireEvent.click(localesDir)
    expect(screen.getByTestId('selected-path-display')).toHaveTextContent('C:/Users/dev/MyProject')

    // 4. en.json, ru.json, uk.json, and ua.json receive translation checkboxes
    const enCheckbox = screen.getByRole('checkbox', { name: /select en\.json/i })
    const ruCheckbox = screen.getByRole('checkbox', { name: /select ru\.json/i })
    const ukCheckbox = screen.getByRole('checkbox', { name: /select uk\.json/i })
    const uaCheckbox = screen.getByRole('checkbox', { name: /select ua\.json/i })
    expect(enCheckbox).toBeInTheDocument()
    expect(ruCheckbox).toBeInTheDocument()
    expect(ukCheckbox).toBeInTheDocument()
    expect(uaCheckbox).toBeInTheDocument()

    // 5. package.json has NO checkbox
    expect(screen.queryByRole('checkbox', { name: /select package\.json/i })).not.toBeInTheDocument()
    // 6. package-lock.json has NO checkbox
    expect(screen.queryByRole('checkbox', { name: /select package-lock\.json/i })).not.toBeInTheDocument()
    // 7. tsconfig.json has NO checkbox
    expect(screen.queryByRole('checkbox', { name: /select tsconfig\.json/i })).not.toBeInTheDocument()
    // 8. config.json has NO checkbox
    expect(screen.queryByRole('checkbox', { name: /select config\.json/i })).not.toBeInTheDocument()
    // 9. README.md, example.ts have NO checkbox
    expect(screen.queryByRole('checkbox', { name: /select readme\.md/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('checkbox', { name: /select example\.ts/i })).not.toBeInTheDocument()
    // 10. unrelated.json inside locales/ has NO checkbox
    expect(screen.queryByRole('checkbox', { name: /select unrelated\.json/i })).not.toBeInTheDocument()

    // 11. Clicking en.json opens its current contents in the read-only preview
    const enFileRow = screen.getByTestId('explorer-file-en.json')
    fireEvent.click(enFileRow)

    await waitFor(() => {
      expect(screen.getByTestId('file-preview-container')).toBeInTheDocument()
      expect(screen.getByTestId('preview-filename')).toHaveTextContent('en.json')
      expect(screen.getByText(/read-only/i)).toBeInTheDocument()
      expect(screen.getByText(/"TITLE": "Welcome"/)).toBeInTheDocument()
    })

    // 12. Clicking package.json opens its contents in preview but does NOT make it a localization candidate
    const pkgFileRow = screen.getByTestId('explorer-file-package.json')
    fireEvent.click(pkgFileRow)

    await waitFor(() => {
      expect(screen.getByTestId('preview-filename')).toHaveTextContent('package.json')
      expect(screen.queryByText(/translation file/i)).not.toBeInTheDocument()
      expect(screen.getByText(/"name": "test-app"/)).toBeInTheDocument()
    })

    // 13. Selecting/unselecting translation checkboxes affects existing comparison workflow
    // Uncheck ru.json
    fireEvent.click(ruCheckbox)
    // 14. Compare still opens the existing Diff Viewer with checked files
    // Close preview to return to main workspace overview
    const closePreviewBtn = screen.getByRole('button', { name: /close/i })
    fireEvent.click(closePreviewBtn)

    // Click language row on Dashboard to open Diff Viewer
    await waitFor(() => expect(screen.getByTestId('coverage-row-uk.json')).toBeInTheDocument())
    fireEvent.click(screen.getByTestId('coverage-row-uk.json'))

    await waitFor(() => {
      expect(screen.getByLabelText(/localization diff viewer/i)).toBeInTheDocument()
    })
  })

  describe('Workspace Persistence & Auto-Restoration', () => {
    it('persists selected folder path to lastWorkspace when opened', async () => {
      const mockSetLastWorkspace = vi.fn()
      window.electronAPI = createMockElectronAPI({
        selectDirectory: vi.fn().mockResolvedValue('C:/Projects/MyProject'),
        setLastWorkspace: mockSetLastWorkspace,
        getJsonFiles: vi.fn().mockResolvedValue([{ name: 'en.json', path: 'C:/Projects/MyProject/en.json' }]),
      })

      render(<App />)

      const openBtn = screen.getByRole('button', { name: /select folder/i })
      fireEvent.click(openBtn)

      await waitFor(() => {
        expect(mockSetLastWorkspace).toHaveBeenCalledWith('C:/Projects/MyProject')
      })
    })

    it('automatically restores workspace on application startup when valid path exists', async () => {
      const mockTreeResult = {
        rootPath: 'C:/Projects/RestoredProject',
        rootName: 'RestoredProject',
        entries: [
          {
            name: 'en.json',
            path: 'C:/Projects/RestoredProject/en.json',
            relativePath: 'en.json',
            isDirectory: false,
            isLocalizationCandidate: true,
          },
          {
            name: 'ua.json',
            path: 'C:/Projects/RestoredProject/ua.json',
            relativePath: 'ua.json',
            isDirectory: false,
            isLocalizationCandidate: true,
          },
          {
            name: 'package.json',
            path: 'C:/Projects/RestoredProject/package.json',
            relativePath: 'package.json',
            isDirectory: false,
            isLocalizationCandidate: false,
          },
        ],
      }

      window.electronAPI = createMockElectronAPI({
        getLastWorkspace: vi.fn().mockResolvedValue('C:/Projects/RestoredProject'),
        readDirectoryTree: vi.fn().mockResolvedValue(mockTreeResult),
      })

      render(<App />)

      // Automatically populates Explorer with RestoredProject without clicking select folder
      await waitFor(() => {
        expect(screen.getByTestId('explorer-root-folder')).toBeInTheDocument()
      })

      expect(screen.getByTestId('selected-path-display')).toHaveTextContent('C:/Projects/RestoredProject')
      expect(screen.getAllByText('RestoredProject').length).toBeGreaterThanOrEqual(1)
      expect(screen.getByRole('checkbox', { name: /select en\.json/i })).toBeInTheDocument()
      expect(screen.getByRole('checkbox', { name: /select ua\.json/i })).toBeInTheDocument()
      expect(screen.queryByRole('checkbox', { name: /select package\.json/i })).not.toBeInTheDocument()
    })

    it('gracefully handles deleted/invalid workspace by clearing path and showing welcome state', async () => {
      const mockClearLastWorkspace = vi.fn()
      window.electronAPI = createMockElectronAPI({
        getLastWorkspace: vi.fn().mockResolvedValue('C:/Projects/DeletedProject'),
        readDirectoryTree: vi.fn().mockRejectedValue(new Error('ENOENT: no such file or directory')),
        getJsonFiles: vi.fn().mockRejectedValue(new Error('ENOENT: no such file or directory')),
        clearLastWorkspace: mockClearLastWorkspace,
      })

      render(<App />)

      await waitFor(() => {
        expect(mockClearLastWorkspace).toHaveBeenCalled()
      })

      // Remains in clean welcome state without crash or broken Explorer
      expect(screen.getAllByText(/no folder opened/i).length).toBeGreaterThanOrEqual(1)
      expect(screen.getAllByRole('button', { name: /open folder/i }).length).toBeGreaterThanOrEqual(1)
    })

    it('updates persisted workspace path when switching from Project A to Project B', async () => {
      const mockSetLastWorkspace = vi.fn()
      let currentSelection = 'C:/Projects/ProjectA'

      window.electronAPI = createMockElectronAPI({
        selectDirectory: vi.fn().mockImplementation(async () => currentSelection),
        setLastWorkspace: mockSetLastWorkspace,
        getJsonFiles: vi.fn().mockResolvedValue([{ name: 'en.json', path: 'C:/Projects/en.json' }]),
      })

      render(<App />)

      const openBtn = screen.getByRole('button', { name: /select folder/i })
      // Open Project A
      fireEvent.click(openBtn)
      await waitFor(() => {
        expect(mockSetLastWorkspace).toHaveBeenCalledWith('C:/Projects/ProjectA')
      })

      // Open Project B
      currentSelection = 'C:/Projects/ProjectB'
      fireEvent.click(openBtn)
      await waitFor(() => {
        expect(mockSetLastWorkspace).toHaveBeenCalledWith('C:/Projects/ProjectB')
      })
    })
  })

  describe('Translation Coverage Dashboard Integration', () => {
    const mockFiles = [
      { name: 'en.json', path: 'C:/Projects/locales/en.json' },
      { name: 'ua.json', path: 'C:/Projects/locales/ua.json' },
      { name: 'de.json', path: 'C:/Projects/locales/de.json' },
    ]

    const mockJsonData: Record<string, unknown> = {
      'C:/Projects/locales/en.json': {
        app: { title: 'App Title', desc: 'Description' },
        actions: { save: 'Save', cancel: 'Cancel', delete: 'Delete' },
      },
      'C:/Projects/locales/ua.json': {
        app: { title: 'Назва', desc: 'Опис' },
        actions: { save: 'Зберегти', cancel: 'Скасувати', delete: 'Видалити' },
      },
      'C:/Projects/locales/de.json': {
        app: { title: 'Titel', desc: '' }, // empty: app.desc
        actions: { save: 'Speichern', cancel: 'Abbrechen' }, // missing: actions.delete
      },
    }

    it('renders the Dashboard by default when a workspace is opened, displaying metrics & language coverage', async () => {
      window.electronAPI = createMockElectronAPI({
        selectDirectory: vi.fn().mockResolvedValue('C:/Projects/MyProject'),
        readDirectoryTree: vi.fn().mockResolvedValue({
          rootPath: 'C:/Projects/MyProject',
          rootName: 'MyProject',
          entries: [
            {
              name: 'locales',
              path: 'C:/Projects/locales',
              isDirectory: true,
              children: [
                { name: 'en.json', path: 'C:/Projects/locales/en.json', isDirectory: false, isLocalizationCandidate: true },
                { name: 'ua.json', path: 'C:/Projects/locales/ua.json', isDirectory: false, isLocalizationCandidate: true },
                { name: 'de.json', path: 'C:/Projects/locales/de.json', isDirectory: false, isLocalizationCandidate: true },
              ],
            },
            { name: 'package.json', path: 'C:/Projects/package.json', isDirectory: false, isLocalizationCandidate: false },
          ],
        }),
        readJsonFile: vi.fn().mockImplementation(async (path: string) => mockJsonData[path] || {}),
      })

      render(<App />)

      const selectBtn = screen.getByRole('button', { name: /select folder/i })
      fireEvent.click(selectBtn)

      await waitFor(() => {
        expect(screen.getByTestId('coverage-dashboard')).toBeInTheDocument()
      })

      // Top metrics
      expect(screen.getByTestId('metric-languages')).toHaveTextContent('3')
      expect(screen.getByTestId('metric-files')).toHaveTextContent('3')
      expect(screen.getByTestId('metric-total-keys')).toHaveTextContent('5')
      // Non-reference average coverage: ua is 100% (5/5), de is 60% (3/5) -> avg is (100+60)/2 = 80%
      expect(screen.getByTestId('metric-average-coverage')).toHaveTextContent('80%')

      // Language rows
      expect(screen.getByTestId('coverage-row-en.json')).toHaveTextContent('English')
      expect(screen.getByTestId('ref-pill-en.json')).toHaveTextContent('Reference')
      expect(screen.getByTestId('coverage-row-ua.json')).toHaveTextContent('Ukrainian')
      expect(screen.getByTestId('coverage-row-ua.json')).toHaveTextContent('100%')
      expect(screen.getByTestId('coverage-row-de.json')).toHaveTextContent('German')
      expect(screen.getByTestId('coverage-row-de.json')).toHaveTextContent('60%')
    })

    it('clicking a language with missing keys switches to Diff Viewer and focuses first missing key (actions.delete)', async () => {
      window.electronAPI = createMockElectronAPI({
        selectDirectory: vi.fn().mockResolvedValue('C:/Projects/MyProject'),
        getJsonFiles: vi.fn().mockResolvedValue(mockFiles),
        readJsonFile: vi.fn().mockImplementation(async (path: string) => mockJsonData[path] || {}),
      })

      render(<App />)

      const selectBtn = screen.getByRole('button', { name: /select folder/i })
      fireEvent.click(selectBtn)

      await waitFor(() => {
        expect(screen.getByTestId('coverage-dashboard')).toBeInTheDocument()
      })

      // Click German row
      const deRow = screen.getByTestId('coverage-row-de.json')
      fireEvent.click(deRow)

      // Diff Viewer opens
      await waitFor(() => {
        expect(screen.getByTestId('localization-tree-panel')).toBeInTheDocument()
      })

      // de.json tab is active
      expect(screen.getByTestId('file-tab-de.json')).toHaveClass('active-tab')

      // Problem navigator is in missing mode for actions.delete
      expect(screen.getByTestId('navigator-position')).toHaveTextContent(/missing translation 1 of 1/i)
      expect(screen.getByTestId('tree-node-actions.delete')).toBeInTheDocument()
    })

    it('clicking a language with only empty keys focuses first empty key (alphabetical)', async () => {
      const fileWithOnlyEmptyData: Record<string, unknown> = {
        'C:/Projects/locales/en.json': {
          app: { title: 'App Title', desc: 'Description' },
          actions: { save: 'Save', cancel: 'Cancel', delete: 'Delete' },
        },
        'C:/Projects/locales/de.json': {
          app: { title: 'Titel', desc: '' }, // empty: app.desc
          actions: { save: 'Speichern', cancel: '', delete: 'Löschen' }, // empty: actions.cancel
        },
      }

      window.electronAPI = createMockElectronAPI({
        selectDirectory: vi.fn().mockResolvedValue('C:/Projects/MyProject'),
        getJsonFiles: vi.fn().mockResolvedValue([
          { name: 'en.json', path: 'C:/Projects/locales/en.json' },
          { name: 'de.json', path: 'C:/Projects/locales/de.json' },
        ]),
        readJsonFile: vi.fn().mockImplementation(async (path: string) => fileWithOnlyEmptyData[path] || {}),
      })

      render(<App />)

      const selectBtn = screen.getByRole('button', { name: /select folder/i })
      fireEvent.click(selectBtn)

      await waitFor(() => {
        expect(screen.getByTestId('coverage-dashboard')).toBeInTheDocument()
      })

      // Click German row
      fireEvent.click(screen.getByTestId('coverage-row-de.json'))

      await waitFor(() => {
        expect(screen.getByTestId('localization-tree-panel')).toBeInTheDocument()
      })

      // First empty key alphabetically is actions.cancel
      expect(screen.getByTestId('navigator-position')).toHaveTextContent(/empty translation 1 of 2/i)
      expect(screen.getByTestId('tree-node-actions.cancel')).toBeInTheDocument()
    })

    it('clicking a complete language opens Diff Viewer normally without problem navigation', async () => {
      window.electronAPI = createMockElectronAPI({
        selectDirectory: vi.fn().mockResolvedValue('C:/Projects/MyProject'),
        getJsonFiles: vi.fn().mockResolvedValue(mockFiles),
        readJsonFile: vi.fn().mockImplementation(async (path: string) => mockJsonData[path] || {}),
      })

      render(<App />)

      const selectBtn = screen.getByRole('button', { name: /select folder/i })
      fireEvent.click(selectBtn)

      await waitFor(() => {
        expect(screen.getByTestId('coverage-dashboard')).toBeInTheDocument()
      })

      // Click Ukrainian row (100% complete)
      fireEvent.click(screen.getByTestId('coverage-row-ua.json'))

      await waitFor(() => {
        expect(screen.getByTestId('localization-tree-panel')).toBeInTheDocument()
      })

      expect(screen.getByTestId('file-tab-ua.json')).toHaveClass('active-tab')
      // No active missing problem selected (0 missing)
      expect(screen.getByTestId('navigator-position')).toHaveTextContent('0 missing translations in this file')
    })
  })

  describe('Problems Panel Integration', () => {
    const mockFiles = [
      { name: 'en.json', path: 'C:/Projects/locales/en.json' },
      { name: 'ua.json', path: 'C:/Projects/locales/ua.json' },
      { name: 'de.json', path: 'C:/Projects/locales/de.json' },
    ]

    const mockJsonData: Record<string, unknown> = {
      'C:/Projects/locales/en.json': {
        app: { title: 'App Title', desc: 'Description' },
        actions: { save: 'Save', cancel: 'Cancel', delete: 'Delete' },
      },
      'C:/Projects/locales/ua.json': {
        app: { title: 'Назва', desc: 'Опис' },
        actions: { save: 'Зберегти', cancel: 'Скасувати', delete: 'Видалити' },
      },
      'C:/Projects/locales/de.json': {
        app: { title: 'Titel', desc: '' }, // empty: app.desc
        actions: { save: 'Speichern', cancel: 'Abbrechen' }, // missing: actions.delete
      },
    }

    it('renders problem count in status bar and opens panel via status bar and dashboard buttons', async () => {
      window.electronAPI = createMockElectronAPI({
        selectDirectory: vi.fn().mockResolvedValue('C:/Projects/MyProject'),
        getJsonFiles: vi.fn().mockResolvedValue(mockFiles),
        readJsonFile: vi.fn().mockImplementation(async (path: string) => mockJsonData[path] || {}),
      })

      render(<App />)

      const selectBtn = screen.getByRole('button', { name: /select folder/i })
      fireEvent.click(selectBtn)

      await waitFor(() => {
        expect(screen.getByTestId('coverage-dashboard')).toBeInTheDocument()
      })

      // Status bar displays "Problems 2"
      const statusbarBtn = screen.getByTestId('statusbar-problems-btn')
      expect(statusbarBtn).toHaveTextContent('Problems 2')
      expect(statusbarBtn).toHaveClass('has-problems')

      // Dashboard shows problems button with "Problems (2)"
      const dashboardProblemsBtn = screen.getByTestId('dashboard-open-problems-btn')
      expect(dashboardProblemsBtn).toHaveTextContent('Problems (2)')

      // Click status bar button to open Problems Panel
      fireEvent.click(statusbarBtn)
      await waitFor(() => {
        expect(screen.getByTestId('problems-panel')).toBeInTheDocument()
      })

      // Total badge in panel header shows 2
      expect(screen.getByTestId('problems-total-badge')).toHaveTextContent('2')

      // Close panel via close button
      fireEvent.click(screen.getByTestId('problems-close-btn'))
      expect(screen.queryByTestId('problems-panel')).not.toBeInTheDocument()

      // Open panel via dashboard button
      fireEvent.click(dashboardProblemsBtn)
      expect(screen.getByTestId('problems-panel')).toBeInTheDocument()
    })

    it('clicking a missing problem in Problems Panel navigates to Diff Viewer with key focused', async () => {
      window.electronAPI = createMockElectronAPI({
        selectDirectory: vi.fn().mockResolvedValue('C:/Projects/MyProject'),
        getJsonFiles: vi.fn().mockResolvedValue(mockFiles),
        readJsonFile: vi.fn().mockImplementation(async (path: string) => mockJsonData[path] || {}),
      })

      render(<App />)

      fireEvent.click(screen.getByRole('button', { name: /select folder/i }))
      await waitFor(() => expect(screen.getByTestId('coverage-dashboard')).toBeInTheDocument())

      // Open Problems Panel
      fireEvent.click(screen.getByTestId('statusbar-problems-btn'))
      await waitFor(() => expect(screen.getByTestId('problems-panel')).toBeInTheDocument())

      // Click missing problem item for German (actions.delete)
      const missingItem = screen.getByTestId('problem-item-de.json:missing:actions.delete')
      expect(missingItem).toHaveTextContent('actions.delete')
      fireEvent.click(missingItem)

      // Switches to Diff Viewer, activates de.json, focuses actions.delete
      await waitFor(() => {
        expect(screen.getByTestId('localization-tree-panel')).toBeInTheDocument()
      })

      expect(screen.getByTestId('file-tab-de.json')).toHaveClass('active-tab')
      expect(screen.getByTestId('navigator-position')).toHaveTextContent(/missing translation 1 of 1/i)
      expect(screen.getByTestId('tree-node-actions.delete')).toBeInTheDocument()
    })

    it('clicking an empty problem in Problems Panel navigates to Diff Viewer with empty key focused', async () => {
      window.electronAPI = createMockElectronAPI({
        selectDirectory: vi.fn().mockResolvedValue('C:/Projects/MyProject'),
        getJsonFiles: vi.fn().mockResolvedValue(mockFiles),
        readJsonFile: vi.fn().mockImplementation(async (path: string) => mockJsonData[path] || {}),
      })

      render(<App />)

      fireEvent.click(screen.getByRole('button', { name: /select folder/i }))
      await waitFor(() => expect(screen.getByTestId('coverage-dashboard')).toBeInTheDocument())

      // Open Problems Panel
      fireEvent.click(screen.getByTestId('statusbar-problems-btn'))
      await waitFor(() => expect(screen.getByTestId('problems-panel')).toBeInTheDocument())

      // Click empty problem item for German (app.desc)
      const emptyItem = screen.getByTestId('problem-item-de.json:empty:app.desc')
      expect(emptyItem).toHaveTextContent('app.desc')
      fireEvent.click(emptyItem)

      // Switches to Diff Viewer, activates de.json, focuses app.desc in empty mode
      await waitFor(() => {
        expect(screen.getByTestId('localization-tree-panel')).toBeInTheDocument()
      })

      expect(screen.getByTestId('file-tab-de.json')).toHaveClass('active-tab')
      expect(screen.getByTestId('navigator-position')).toHaveTextContent(/empty translation 1 of 1/i)
      expect(screen.getByTestId('tree-node-app.desc')).toBeInTheDocument()
    })
  })

  describe('Resizable Explorer and Problems Panels', () => {
    it('renders explorer and problems resize handles with accessible attributes and responds to drag interactions', async () => {
      window.electronAPI = createMockElectronAPI({
        selectDirectory: vi.fn().mockResolvedValue('C:/Projects/MyProject'),
        readDirectoryTree: vi.fn().mockResolvedValue({
          rootPath: 'C:/Projects/MyProject',
          rootName: 'MyProject',
          entries: [
            { name: 'en.json', path: 'C:/Projects/locales/en.json', isDirectory: false, isLocalizationCandidate: true },
            { name: 'de.json', path: 'C:/Projects/locales/de.json', isDirectory: false, isLocalizationCandidate: true },
          ],
        }),
        readJsonFile: vi.fn().mockResolvedValue({ hello: 'world' }),
      })

      render(<App />)

      // Open workspace
      fireEvent.click(screen.getByRole('button', { name: /select folder/i }))
      await waitFor(() => {
        expect(screen.getByTestId('project-explorer')).toBeInTheDocument()
      })

      // Explorer resize handle exists and has correct accessibility semantics
      const explorerHandle = screen.getByTestId('explorer-resize-handle')
      expect(explorerHandle).toBeInTheDocument()
      expect(explorerHandle).toHaveAttribute('role', 'separator')
      expect(explorerHandle).toHaveAttribute('aria-orientation', 'vertical')
      expect(explorerHandle).toHaveAttribute('aria-label', 'Resize Explorer')
      expect(explorerHandle).toHaveAttribute('aria-valuenow', '280')

      // Explorer container has initial width style
      const explorer = screen.getByTestId('project-explorer')
      expect(explorer).toHaveStyle({ width: '280px' })

      // Keyboard resizing: press ArrowRight twice to increase width by +20px (280 -> 300)
      fireEvent.keyDown(explorerHandle, { key: 'ArrowRight' })
      fireEvent.keyDown(explorerHandle, { key: 'ArrowRight' })
      expect(explorer).toHaveStyle({ width: '300px' })
      expect(explorerHandle).toHaveAttribute('aria-valuenow', '300')

      // Collapse and reopen explorer restores width
      const collapseExplorerBtn = screen.getByRole('button', { name: /collapse explorer/i })
      fireEvent.click(collapseExplorerBtn)
      expect(explorer).toHaveClass('is-collapsed')

      // Reopen
      const expandExplorerBtn = screen.getByRole('button', { name: /expand/i })
      fireEvent.click(expandExplorerBtn)
      expect(screen.getByTestId('project-explorer')).not.toHaveClass('is-collapsed')
      expect(screen.getByTestId('project-explorer')).toHaveStyle({ width: '300px' })

      // Open Problems Panel
      fireEvent.click(screen.getByTestId('statusbar-problems-btn'))
      await waitFor(() => {
        expect(screen.getByTestId('problems-panel')).toBeInTheDocument()
      })

      // Problems resize handle exists and has correct accessibility semantics
      const problemsHandle = screen.getByTestId('problems-resize-handle')
      expect(problemsHandle).toBeInTheDocument()
      expect(problemsHandle).toHaveAttribute('role', 'separator')
      expect(problemsHandle).toHaveAttribute('aria-orientation', 'horizontal')
      expect(problemsHandle).toHaveAttribute('aria-label', 'Resize Problems Panel')
      expect(problemsHandle).toHaveAttribute('aria-valuenow', '220')

      // Problems container has initial height style
      const problemsPanel = screen.getByTestId('problems-panel')
      expect(problemsPanel).toHaveStyle({ height: '220px' })

      // Keyboard resizing: press ArrowUp 3 times to increase height by +30px (220 -> 250)
      fireEvent.keyDown(problemsHandle, { key: 'ArrowUp' })
      fireEvent.keyDown(problemsHandle, { key: 'ArrowUp' })
      fireEvent.keyDown(problemsHandle, { key: 'ArrowUp' })
      expect(problemsPanel).toHaveStyle({ height: '250px' })
      expect(problemsHandle).toHaveAttribute('aria-valuenow', '250')
    })
  })

  describe('Global Search Integration', () => {
    const mockFiles = [
      { name: 'en.json', path: 'C:/Projects/locales/en.json' },
      { name: 'de.json', path: 'C:/Projects/locales/de.json' },
      { name: 'fr.json', path: 'C:/Projects/locales/fr.json' },
    ]

    const mockJsonData: Record<string, unknown> = {
      'C:/Projects/locales/en.json': {
        dashboard: {
          title: 'Analytics Dashboard',
          users: 'Active Users',
        },
        settings: {
          admin: {
            role: 'Super Administrator',
            permissions: 'All Permissions',
          },
        },
        actions: {
          save: 'Save',
        },
      },
      'C:/Projects/locales/de.json': {
        dashboard: {
          title: 'Analytik-Übersicht',
          users: 'Aktive Benutzer',
        },
        settings: {
          admin: {
            role: 'Hauptadministrator',
            permissions: 'Alle Berechtigungen',
          },
        },
        actions: {
          save: 'Speichern',
        },
      },
      'C:/Projects/locales/fr.json': {
        dashboard: {
          title: 'Tableau de bord',
        },
        actions: {
          save: 'Enregistrer',
        },
      },
    }

    it('opens Global Search via header search button and via Ctrl+F shortcut', async () => {
      window.electronAPI = createMockElectronAPI({
        selectDirectory: vi.fn().mockResolvedValue('C:/Projects/MyProject'),
        getJsonFiles: vi.fn().mockResolvedValue(mockFiles),
        readJsonFile: vi.fn().mockImplementation(async (path: string) => mockJsonData[path] || {}),
      })

      render(<App />)

      // Open workspace
      fireEvent.click(screen.getByRole('button', { name: /select folder/i }))
      await waitFor(() => expect(screen.getByTestId('coverage-dashboard')).toBeInTheDocument())

      // Header button exists
      const searchBtn = screen.getByTestId('ide-search-btn')
      expect(searchBtn).toBeInTheDocument()

      // Click Search button -> dialog opens
      fireEvent.click(searchBtn)
      expect(screen.getByTestId('global-search-dialog')).toBeInTheDocument()

      // Close via Esc
      fireEvent.keyDown(screen.getByTestId('global-search-dialog'), { key: 'Escape' })
      expect(screen.queryByTestId('global-search-dialog')).not.toBeInTheDocument()

      // Open via Ctrl+F
      fireEvent.keyDown(window, { key: 'f', ctrlKey: true })
      expect(screen.getByTestId('global-search-dialog')).toBeInTheDocument()
    })

    it('searches keys and values across files and navigates to the exact key in Diff Viewer', async () => {
      window.electronAPI = createMockElectronAPI({
        selectDirectory: vi.fn().mockResolvedValue('C:/Projects/MyProject'),
        getJsonFiles: vi.fn().mockResolvedValue(mockFiles),
        readJsonFile: vi.fn().mockImplementation(async (path: string) => mockJsonData[path] || {}),
      })

      render(<App />)

      fireEvent.click(screen.getByRole('button', { name: /select folder/i }))
      await waitFor(() => expect(screen.getByTestId('coverage-dashboard')).toBeInTheDocument())

      // Open Global Search
      fireEvent.click(screen.getByTestId('ide-search-btn'))
      expect(screen.getByTestId('global-search-dialog')).toBeInTheDocument()

      // Search nested key 'permissions'
      const searchInput = screen.getByTestId('global-search-input')
      fireEvent.change(searchInput, { target: { value: 'permissions' } })

      // Results summary shows 2 matches across 2 files (en.json and de.json)
      expect(screen.getByTestId('search-summary-bar')).toHaveTextContent(/2 results/i)

      // Click German result item
      const deResult = screen.getByTestId('search-result-de.json-settings.admin.permissions')
      expect(deResult).toBeInTheDocument()
      fireEvent.click(deResult)

      // Global Search closes
      expect(screen.queryByTestId('global-search-dialog')).not.toBeInTheDocument()

      // Diff Viewer opens
      await waitFor(() => {
        expect(screen.getByTestId('localization-tree-panel')).toBeInTheDocument()
      })

      // German file tab is activated
      expect(screen.getByTestId('file-tab-de.json')).toHaveClass('active-tab')

      // Target nested node is present in DOM and ancestors expanded
      expect(screen.getByTestId('tree-node-settings.admin.permissions')).toBeInTheDocument()
    })

    it('searching by translation value snippet navigates to matching English key', async () => {
      window.electronAPI = createMockElectronAPI({
        selectDirectory: vi.fn().mockResolvedValue('C:/Projects/MyProject'),
        getJsonFiles: vi.fn().mockResolvedValue(mockFiles),
        readJsonFile: vi.fn().mockImplementation(async (path: string) => mockJsonData[path] || {}),
      })

      render(<App />)

      fireEvent.click(screen.getByRole('button', { name: /select folder/i }))
      await waitFor(() => expect(screen.getByTestId('coverage-dashboard')).toBeInTheDocument())

      // Open Global Search
      fireEvent.click(screen.getByTestId('ide-search-btn'))

      // Search translation value 'Analytics'
      const searchInput = screen.getByTestId('global-search-input')
      fireEvent.change(searchInput, { target: { value: 'Analytics' } })

      const enResult = screen.getByTestId('search-result-en.json-dashboard.title')
      fireEvent.click(enResult)

      // Diff Viewer opens with en.json active
      await waitFor(() => {
        expect(screen.getByTestId('localization-tree-panel')).toBeInTheDocument()
      })
      expect(screen.getByTestId('file-tab-en.json')).toHaveClass('active-tab')
      expect(screen.getByTestId('tree-node-dashboard.title')).toBeInTheDocument()
    })
  })

  describe('Add Translation Key Feature & Undo/Redo Integration', () => {
    const mockFiles = [
      { name: 'en.json', path: 'C:/Projects/MyProject/locales/en.json' },
      { name: 'de.json', path: 'C:/Projects/MyProject/locales/de.json' },
    ]

    let mockJsonData: Record<string, Record<string, unknown>>

    beforeEach(() => {
      mockJsonData = {
        'C:/Projects/MyProject/locales/en.json': {
          COMMON: {
            HELLO: 'Hello',
          },
        },
        'C:/Projects/MyProject/locales/de.json': {
          COMMON: {
            HELLO: 'Hallo',
          },
        },
      }
    })

    it('adds a translation key to a single language file and focuses it in Diff Viewer', async () => {
      const mockWriteJsonFiles = vi.fn().mockImplementation(async (files: { path: string; content: string }[]) => {
        for (const file of files) {
          mockJsonData[file.path] = JSON.parse(file.content)
        }
        return { success: true }
      })

      window.electronAPI = createMockElectronAPI({
        selectDirectory: vi.fn().mockResolvedValue('C:/Projects/MyProject'),
        getJsonFiles: vi.fn().mockResolvedValue(mockFiles),
        readJsonFile: vi.fn().mockImplementation(async (path: string) => mockJsonData[path] || {}),
        writeJsonFiles: mockWriteJsonFiles,
      })

      render(<App />)

      // Load folder
      fireEvent.click(screen.getByRole('button', { name: /select folder/i }))
      await waitFor(() => expect(screen.getByTestId('coverage-dashboard')).toBeInTheDocument())

      // Navigate to Diff Viewer via Dashboard language row
      fireEvent.click(screen.getByTestId('coverage-row-en.json'))
      await waitFor(() => expect(screen.getByTestId('localization-tree-panel')).toBeInTheDocument())

      // Click + Add Key button
      const openAddKeyBtn = screen.getByTestId('open-add-key-modal-btn')
      expect(openAddKeyBtn).toBeInTheDocument()
      fireEvent.click(openAddKeyBtn)

      // Modal is displayed
      expect(screen.getByTestId('add-key-modal')).toBeInTheDocument()

      // Switch to single language mode
      fireEvent.click(screen.getByTestId('mode-single-btn'))

      // Select de.json
      const singleSelect = screen.getByTestId('single-lang-select')
      fireEvent.change(singleSelect, { target: { value: 'de.json' } })

      // Enter key name
      const keyInput = screen.getByTestId('add-key-input')
      fireEvent.change(keyInput, { target: { value: 'COMMON.BYE' } })

      // Enter translation
      const transInput = screen.getByTestId('single-translation-input')
      fireEvent.change(transInput, { target: { value: 'Tschüss' } })

      // Confirm Add Key
      const confirmBtn = screen.getByTestId('add-key-confirm-btn')
      expect(confirmBtn).not.toBeDisabled()
      fireEvent.click(confirmBtn)

      // Modal closes and writeJsonFiles is called
      await waitFor(() => {
        expect(screen.queryByTestId('add-key-modal')).not.toBeInTheDocument()
        expect(mockWriteJsonFiles).toHaveBeenCalledWith([
          {
            path: 'C:/Projects/MyProject/locales/de.json',
            content: expect.stringContaining('"BYE": "Tschüss"'),
          },
        ])
      })

      // German tab is active and key is present in tree
      expect(screen.getByTestId('file-tab-de.json')).toHaveClass('active-tab')
      expect(screen.getByTestId('tree-node-COMMON.BYE')).toBeInTheDocument()
    })

    it('adds a translation key to all languages, then reverts with ONE Undo and restores with ONE Redo', async () => {
      const mockWriteJsonFiles = vi.fn().mockImplementation(async (files: { path: string; content: string }[]) => {
        for (const file of files) {
          mockJsonData[file.path] = JSON.parse(file.content)
        }
        return { success: true }
      })

      window.electronAPI = createMockElectronAPI({
        selectDirectory: vi.fn().mockResolvedValue('C:/Projects/MyProject'),
        getJsonFiles: vi.fn().mockResolvedValue(mockFiles),
        readJsonFile: vi.fn().mockImplementation(async (path: string) => mockJsonData[path] || {}),
        writeJsonFiles: mockWriteJsonFiles,
      })

      render(<App />)

      // Open workspace
      fireEvent.click(screen.getByRole('button', { name: /select folder/i }))
      await waitFor(() => expect(screen.getByTestId('coverage-dashboard')).toBeInTheDocument())

      // Switch to Diff Viewer via Dashboard language row
      fireEvent.click(screen.getByTestId('coverage-row-en.json'))
      await waitFor(() => expect(screen.getByTestId('localization-tree-panel')).toBeInTheDocument())

      // Open Add Key Modal
      fireEvent.click(screen.getByTestId('open-add-key-modal-btn'))
      expect(screen.getByTestId('add-key-modal')).toBeInTheDocument()

      // Enter key name
      const keyInput = screen.getByTestId('add-key-input')
      fireEvent.change(keyInput, { target: { value: 'SETTINGS.THEME' } })

      // Enter translations for en and de
      const enInput = screen.getByTestId('translation-input-en.json')
      const deInput = screen.getByTestId('translation-input-de.json')
      fireEvent.change(enInput, { target: { value: 'Dark' } })
      fireEvent.change(deInput, { target: { value: 'Dunkel' } })

      // Submit
      fireEvent.click(screen.getByTestId('add-key-confirm-btn'))

      // Both files were modified in a single write call
      await waitFor(() => {
        expect(mockWriteJsonFiles).toHaveBeenCalledWith([
          {
            path: 'C:/Projects/MyProject/locales/en.json',
            content: expect.stringContaining('"THEME": "Dark"'),
          },
          {
            path: 'C:/Projects/MyProject/locales/de.json',
            content: expect.stringContaining('"THEME": "Dunkel"'),
          },
        ])
      })

      // Undo button is enabled
      const undoBtn = screen.getByRole('button', { name: /undo/i })
      expect(undoBtn).not.toBeDisabled()

      // Press Undo ONCE -> reverts both files atomically
      mockWriteJsonFiles.mockClear()
      fireEvent.click(undoBtn)

      await waitFor(() => {
        expect(mockWriteJsonFiles).toHaveBeenCalledTimes(1)
        expect(mockWriteJsonFiles).toHaveBeenCalledWith([
          {
            path: 'C:/Projects/MyProject/locales/en.json',
            content: expect.not.stringContaining('"THEME"'),
          },
          {
            path: 'C:/Projects/MyProject/locales/de.json',
            content: expect.not.stringContaining('"THEME"'),
          },
        ])
      })

      // Redo button is enabled
      const redoBtn = screen.getByRole('button', { name: /redo/i })
      expect(redoBtn).not.toBeDisabled()

      // Press Redo ONCE -> restores both files atomically
      mockWriteJsonFiles.mockClear()
      fireEvent.click(redoBtn)

      await waitFor(() => {
        expect(mockWriteJsonFiles).toHaveBeenCalledTimes(1)
        expect(mockWriteJsonFiles).toHaveBeenCalledWith([
          {
            path: 'C:/Projects/MyProject/locales/en.json',
            content: expect.stringContaining('"THEME": "Dark"'),
          },
          {
            path: 'C:/Projects/MyProject/locales/de.json',
            content: expect.stringContaining('"THEME": "Dunkel"'),
          },
        ])
      })
    })
  })
})



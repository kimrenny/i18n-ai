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
    await waitFor(() => expect(screen.getByText('en.json')).toBeInTheDocument())

    fireEvent.click(screen.getByRole('button', { name: /parse json files/i }))
    await waitFor(() => expect(screen.getByRole('button', { name: /compare selected files/i })).toBeEnabled())

    fireEvent.click(screen.getByRole('button', { name: /compare selected files/i }))

    // Switch to ru.json
    fireEvent.click(screen.getByRole('tab', { name: /ru\.json/i }))

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
    await waitFor(() => expect(screen.getByText('en.json')).toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: /parse json files/i }))
    await waitFor(() => expect(screen.getByRole('button', { name: /compare selected files/i })).toBeEnabled())
    fireEvent.click(screen.getByRole('button', { name: /compare selected files/i }))

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
    await waitFor(() => expect(screen.getByText('en.json')).toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: /parse json files/i }))
    await waitFor(() => expect(screen.getByRole('button', { name: /compare selected files/i })).toBeEnabled())
    fireEvent.click(screen.getByRole('button', { name: /compare selected files/i }))

    // Click "✨ Translate All (2)"
    const translateAllBtn = screen.getByRole('button', { name: /translate all \(2\)/i })
    expect(translateAllBtn).toBeEnabled()
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
    await waitFor(() => expect(screen.getByText('en.json')).toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: /parse json files/i }))
    await waitFor(() => expect(screen.getByRole('button', { name: /compare selected files/i })).toBeEnabled())
    fireEvent.click(screen.getByRole('button', { name: /compare selected files/i }))

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
    await waitFor(() => expect(screen.getByText('en.json')).toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: /parse json files/i }))
    await waitFor(() => expect(screen.getByRole('button', { name: /compare selected files/i })).toBeEnabled())
    fireEvent.click(screen.getByRole('button', { name: /compare selected files/i }))

    fireEvent.click(screen.getByRole('tab', { name: /ru\.json/i }))

    const aiTranslateBtn = screen.getByRole('button', { name: /translate menu\.play with ai/i })
    fireEvent.click(aiTranslateBtn)

    await waitFor(() => {
      expect(screen.getByText(/api key is missing for openai/i)).toBeInTheDocument()
    })

    expect(mockWriteJsonFiles).not.toHaveBeenCalled()
  })

  it('displays discovered JSON files with checkboxes and parse button', async () => {
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

    expect(screen.getByText(/json files:/i)).toBeInTheDocument()
    expect(screen.getByRole('checkbox', { name: /select en\.json/i })).toBeChecked()
    expect(screen.getByRole('checkbox', { name: /select ru\.json/i })).toBeChecked()
    expect(
      screen.getByRole('button', { name: /parse json files/i })
    ).toBeInTheDocument()
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
      expect(screen.getByText('en.json')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByRole('button', { name: /parse json files/i }))

    await waitFor(() => {
      expect(screen.getByText(/parse results:/i)).toBeInTheDocument()
    })

    fireEvent.click(screen.getByRole('button', { name: /compare selected files/i }))

    // Switch tab to ru.json (which has 3 missing keys: ADMIN.PANEL.BUTTON.CANCEL, ADMIN.PANEL.BUTTON.SAVE, AUTH.LOGOUT)
    const ruTab = screen.getByRole('tab', { name: /ru\.json/i })
    fireEvent.click(ruTab)

    expect(screen.getByTestId('navigator-position')).toHaveTextContent('3 missing translations in this file')

    const prevBtn = screen.getByRole('button', { name: /previous key/i })
    const nextBtn = screen.getByRole('button', { name: /next key/i })
    const topBtn = screen.getByRole('button', { name: /scroll to top/i })

    expect(prevBtn).toBeDisabled()
    expect(nextBtn).toBeEnabled()

    // Click Next -> moves to 1st missing key (ADMIN.PANEL.BUTTON.CANCEL)
    fireEvent.click(nextBtn)
    expect(screen.getByTestId('navigator-position')).toHaveTextContent('Missing translation 1 of 3')
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
    await waitFor(() => expect(screen.getByText('en.json')).toBeInTheDocument())

    fireEvent.click(screen.getByRole('button', { name: /parse json files/i }))
    await waitFor(() => expect(screen.getByRole('button', { name: /compare selected files/i })).toBeEnabled())

    fireEvent.click(screen.getByRole('button', { name: /compare selected files/i }))

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
    await waitFor(() => expect(screen.getByText('en.json')).toBeInTheDocument())

    fireEvent.click(screen.getByRole('button', { name: /parse json files/i }))
    await waitFor(() => expect(screen.getByRole('button', { name: /compare selected files/i })).toBeEnabled())

    fireEvent.click(screen.getByRole('button', { name: /compare selected files/i }))

    // Switch to ru.json
    const ruTab = screen.getByRole('tab', { name: /ru\.json/i })
    fireEvent.click(ruTab)

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

    // Load and compare
    fireEvent.click(screen.getByRole('button', { name: /select folder/i }))
    await waitFor(() => expect(screen.getByRole('button', { name: /parse json files/i })).toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: /parse json files/i }))
    await waitFor(() => expect(screen.getByRole('button', { name: /compare selected files/i })).toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: /compare selected files/i }))

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
})

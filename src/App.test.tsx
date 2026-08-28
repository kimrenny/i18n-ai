import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import App from './App'

describe('App', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    delete (window as unknown as { electronAPI?: unknown }).electronAPI
    Element.prototype.scrollIntoView = vi.fn()
    HTMLElement.prototype.scrollTo = vi.fn()
  })

  afterEach(() => {
    vi.restoreAllMocks()
    delete (window as unknown as { electronAPI?: unknown }).electronAPI
  })

  it('renders application title and initial empty folder state', () => {
    render(<App />)

    expect(
      screen.getByRole('heading', { level: 1, name: /localization ai/i })
    ).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: /select folder/i })
    ).toBeInTheDocument()
    expect(screen.getByText(/no folder selected/i)).toBeInTheDocument()
    expect(screen.queryByText(/json files:/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/parse results:/i)).not.toBeInTheDocument()
    expect(screen.queryByLabelText(/localization diff viewer/i)).not.toBeInTheDocument()
  })

  it('displays discovered JSON files with checkboxes and parse button', async () => {
    const mockSelectDirectory = vi.fn().mockResolvedValue('C:/Projects/locales')
    const mockGetJsonFiles = vi.fn().mockResolvedValue([
      { name: 'en.json', path: 'C:/Projects/locales/en.json' },
      { name: 'ru.json', path: 'C:/Projects/locales/ru.json' },
    ])

    window.electronAPI = {
      isElectron: true,
      platform: 'win32',
      selectDirectory: mockSelectDirectory,
      getJsonFiles: mockGetJsonFiles,
      readJsonFile: vi.fn(),
      writeJsonFiles: vi.fn(),
    }

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

    window.electronAPI = {
      isElectron: true,
      platform: 'win32',
      selectDirectory: mockSelectDirectory,
      getJsonFiles: mockGetJsonFiles,
      readJsonFile: mockReadJsonFile,
      writeJsonFiles: vi.fn(),
    }

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

    window.electronAPI = {
      isElectron: true,
      platform: 'win32',
      selectDirectory: mockSelectDirectory,
      getJsonFiles: mockGetJsonFiles,
      readJsonFile: mockReadJsonFile,
      writeJsonFiles: mockWriteJsonFiles,
    }

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

    window.electronAPI = {
      isElectron: true,
      platform: 'win32',
      selectDirectory: mockSelectDirectory,
      getJsonFiles: mockGetJsonFiles,
      readJsonFile: mockReadJsonFile,
      writeJsonFiles: mockWriteJsonFiles,
    }

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

  it('shows an error message if Electron API is unavailable', () => {
    render(<App />)

    const selectButton = screen.getByRole('button', { name: /select folder/i })
    fireEvent.click(selectButton)

    expect(
      screen.getByText(/unable to open folder selection dialog: electron api is unavailable/i)
    ).toBeInTheDocument()
  })
})

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import App from './App'

describe('App', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    delete (window as unknown as { electronAPI?: unknown }).electronAPI
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
    expect(screen.queryByText(/comparison/i)).not.toBeInTheDocument()
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

  it('parses checked files, displays results, and enables comparison for >=2 files', async () => {
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
    }

    render(<App />)

    fireEvent.click(screen.getByRole('button', { name: /select folder/i }))

    await waitFor(() => {
      expect(screen.getByText('en.json')).toBeInTheDocument()
    })

    const parseButton = screen.getByRole('button', { name: /parse json files/i })
    fireEvent.click(parseButton)

    await waitFor(() => {
      expect(screen.getByText(/parse results:/i)).toBeInTheDocument()
    })

    const compareButton = screen.getByRole('button', { name: /compare selected files/i })
    expect(compareButton).toBeEnabled()

    // Trigger comparison
    fireEvent.click(compareButton)

    expect(screen.getByRole('heading', { level: 2, name: /^comparison$/i })).toBeInTheDocument()
    expect(screen.getByText(/files compared:/i)).toBeInTheDocument()
    expect(screen.getByText(/unique keys:/i)).toBeInTheDocument()

    const titleKey = screen.getByTestId('comparison-key-ADMIN.PANEL.TITLE')
    expect(titleKey).toHaveTextContent('Complete')

    const buttonSaveKey = screen.getByTestId('comparison-key-ADMIN.PANEL.BUTTON.SAVE')
    expect(buttonSaveKey).toHaveTextContent('Missing: ru.json')
  })

  it('keeps compare button disabled when only 1 file is successfully parsed', async () => {
    const mockSelectDirectory = vi.fn().mockResolvedValue('C:/Projects/locales')
    const mockGetJsonFiles = vi.fn().mockResolvedValue([
      { name: 'en.json', path: 'C:/Projects/locales/en.json' },
      { name: 'invalid.json', path: 'C:/Projects/locales/invalid.json' },
    ])
    const mockReadJsonFile = vi.fn().mockImplementation(async (filePath: string) => {
      if (filePath.endsWith('en.json')) {
        return { HELLO: 'Hello' }
      }
      throw new Error('SyntaxError: Unexpected token')
    })

    window.electronAPI = {
      isElectron: true,
      platform: 'win32',
      selectDirectory: mockSelectDirectory,
      getJsonFiles: mockGetJsonFiles,
      readJsonFile: mockReadJsonFile,
    }

    render(<App />)

    fireEvent.click(screen.getByRole('button', { name: /select folder/i }))

    await waitFor(() => {
      expect(screen.getByText('en.json')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByRole('button', { name: /parse json files/i }))

    await waitFor(() => {
      expect(screen.getByTestId('parse-result-en.json')).toHaveTextContent('✓ Parsed')
    })

    const compareButton = screen.getByRole('button', { name: /compare selected files/i })
    expect(compareButton).toBeDisabled()
    expect(
      screen.getByText(/at least 2 successfully parsed files required to compare/i)
    ).toBeInTheDocument()
  })

  it('excludes invalid files from comparison when >=2 other files succeed', async () => {
    const mockSelectDirectory = vi.fn().mockResolvedValue('C:/Projects/locales')
    const mockGetJsonFiles = vi.fn().mockResolvedValue([
      { name: 'en.json', path: 'C:/Projects/locales/en.json' },
      { name: 'ru.json', path: 'C:/Projects/locales/ru.json' },
      { name: 'invalid.json', path: 'C:/Projects/locales/invalid.json' },
    ])
    const mockReadJsonFile = vi.fn().mockImplementation(async (filePath: string) => {
      if (filePath.endsWith('en.json')) {
        return { A: '1' }
      }
      if (filePath.endsWith('ru.json')) {
        return { A: '1' }
      }
      throw new Error('SyntaxError')
    })

    window.electronAPI = {
      isElectron: true,
      platform: 'win32',
      selectDirectory: mockSelectDirectory,
      getJsonFiles: mockGetJsonFiles,
      readJsonFile: mockReadJsonFile,
    }

    render(<App />)

    fireEvent.click(screen.getByRole('button', { name: /select folder/i }))

    await waitFor(() => {
      expect(screen.getByText('en.json')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByRole('button', { name: /parse json files/i }))

    await waitFor(() => {
      expect(screen.getByTestId('parse-result-invalid.json')).toHaveTextContent('✕ Invalid JSON')
    })

    const compareButton = screen.getByRole('button', { name: /compare selected files/i })
    expect(compareButton).toBeEnabled()

    fireEvent.click(compareButton)

    expect(screen.getByTestId('comparison-key-A')).toHaveTextContent('Complete')
  })

  it('shows a warning message and does not parse if no files are checked', async () => {
    const mockSelectDirectory = vi.fn().mockResolvedValue('C:/Projects/locales')
    const mockGetJsonFiles = vi.fn().mockResolvedValue([
      { name: 'en.json', path: 'C:/Projects/locales/en.json' },
    ])
    const mockReadJsonFile = vi.fn().mockResolvedValue({ KEY: 'Value' })

    window.electronAPI = {
      isElectron: true,
      platform: 'win32',
      selectDirectory: mockSelectDirectory,
      getJsonFiles: mockGetJsonFiles,
      readJsonFile: mockReadJsonFile,
    }

    render(<App />)

    fireEvent.click(screen.getByRole('button', { name: /select folder/i }))

    await waitFor(() => {
      expect(screen.getByText('en.json')).toBeInTheDocument()
    })

    // Uncheck en.json
    const enCheckbox = screen.getByRole('checkbox', { name: /select en\.json/i })
    fireEvent.click(enCheckbox)

    fireEvent.click(screen.getByRole('button', { name: /parse json files/i }))

    expect(
      screen.getByText(/no files selected for parsing/i)
    ).toBeInTheDocument()
    expect(mockReadJsonFile).not.toHaveBeenCalled()
    expect(screen.queryByText(/parse results:/i)).not.toBeInTheDocument()
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

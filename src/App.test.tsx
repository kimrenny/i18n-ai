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

  it('parses checked files and displays parse results including key count', async () => {
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

    expect(mockReadJsonFile).toHaveBeenCalledWith('C:/Projects/locales/en.json')
    expect(mockReadJsonFile).toHaveBeenCalledWith('C:/Projects/locales/ru.json')

    const enResult = screen.getByTestId('parse-result-en.json')
    expect(enResult).toHaveTextContent('en.json')
    expect(enResult).toHaveTextContent('✓ Parsed')
    expect(enResult).toHaveTextContent('2 keys')

    const ruResult = screen.getByTestId('parse-result-ru.json')
    expect(ruResult).toHaveTextContent('ru.json')
    expect(ruResult).toHaveTextContent('✓ Parsed')
    expect(ruResult).toHaveTextContent('1 keys')
  })

  it('handles invalid JSON files gracefully alongside valid files', async () => {
    const mockSelectDirectory = vi.fn().mockResolvedValue('C:/Projects/locales')
    const mockGetJsonFiles = vi.fn().mockResolvedValue([
      { name: 'en.json', path: 'C:/Projects/locales/en.json' },
      { name: 'invalid.json', path: 'C:/Projects/locales/invalid.json' },
    ])
    const mockReadJsonFile = vi.fn().mockImplementation(async (filePath: string) => {
      if (filePath.endsWith('en.json')) {
        return { HELLO: 'Hello' }
      }
      if (filePath.endsWith('invalid.json')) {
        throw new Error('SyntaxError: Unexpected token in JSON')
      }
      throw new Error('Unknown file')
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

    const invalidResult = screen.getByTestId('parse-result-invalid.json')
    expect(invalidResult).toHaveTextContent('invalid.json')
    expect(invalidResult).toHaveTextContent('✕ Invalid JSON')
  })

  it('only parses checked files and ignores unchecked files', async () => {
    const mockSelectDirectory = vi.fn().mockResolvedValue('C:/Projects/locales')
    const mockGetJsonFiles = vi.fn().mockResolvedValue([
      { name: 'en.json', path: 'C:/Projects/locales/en.json' },
      { name: 'ru.json', path: 'C:/Projects/locales/ru.json' },
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

    // Uncheck ru.json
    const ruCheckbox = screen.getByRole('checkbox', { name: /select ru\.json/i })
    fireEvent.click(ruCheckbox)
    expect(ruCheckbox).not.toBeChecked()

    fireEvent.click(screen.getByRole('button', { name: /parse json files/i }))

    await waitFor(() => {
      expect(screen.getByTestId('parse-result-en.json')).toBeInTheDocument()
    })

    expect(mockReadJsonFile).toHaveBeenCalledTimes(1)
    expect(mockReadJsonFile).toHaveBeenCalledWith('C:/Projects/locales/en.json')
    expect(screen.queryByTestId('parse-result-ru.json')).not.toBeInTheDocument()
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

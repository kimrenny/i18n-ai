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

  it('parses files, compares them, and renders the diff viewer with tabs and tree', async () => {
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

    // Verify Diff Viewer section is displayed
    expect(screen.getByLabelText(/localization diff viewer/i)).toBeInTheDocument()
    expect(screen.getByText(/files compared:/i)).toBeInTheDocument()
    expect(screen.getByText(/unique keys:/i)).toBeInTheDocument()

    // Default active tab is en.json
    const enTab = screen.getByRole('tab', { name: /en\.json/i })
    const ruTab = screen.getByRole('tab', { name: /ru\.json/i })
    expect(enTab).toHaveAttribute('aria-selected', 'true')
    expect(ruTab).toHaveAttribute('aria-selected', 'false')

    // In en.json, both keys are present
    expect(screen.getByText('"Admin panel"')).toBeInTheDocument()
    expect(screen.getByText('"Save"')).toBeInTheDocument()

    // Switch tab to ru.json
    fireEvent.click(ruTab)
    expect(ruTab).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByText('"Панель администратора"')).toBeInTheDocument()

    // In ru.json, ADMIN.PANEL.BUTTON.SAVE is missing
    const saveNode = screen.getByTestId('tree-node-ADMIN.PANEL.BUTTON.SAVE')
    expect(saveNode).toHaveTextContent('[ MISSING ]')

    // Check active tab summary stats
    expect(screen.getByText('1 missing')).toBeInTheDocument()
  })

  it('supports expand and collapse all in the diff viewer tree', async () => {
    const mockSelectDirectory = vi.fn().mockResolvedValue('C:/Projects/locales')
    const mockGetJsonFiles = vi.fn().mockResolvedValue([
      { name: 'en.json', path: 'C:/Projects/locales/en.json' },
      { name: 'ru.json', path: 'C:/Projects/locales/ru.json' },
    ])
    const mockReadJsonFile = vi.fn().mockResolvedValue({
      AUTH: {
        LOGIN: 'Login',
      },
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
    await waitFor(() => expect(screen.getByText('en.json')).toBeInTheDocument())

    fireEvent.click(screen.getByRole('button', { name: /parse json files/i }))
    await waitFor(() => expect(screen.getByRole('button', { name: /compare selected files/i })).toBeEnabled())

    fireEvent.click(screen.getByRole('button', { name: /compare selected files/i }))

    expect(screen.getByText('"Login"')).toBeInTheDocument()

    // Collapse All
    const collapseBtn = screen.getByRole('button', { name: /collapse all/i })
    fireEvent.click(collapseBtn)
    expect(screen.queryByText('"Login"')).not.toBeInTheDocument()

    // Expand All
    const expandBtn = screen.getByRole('button', { name: /expand all/i })
    fireEvent.click(expandBtn)
    expect(screen.getByText('"Login"')).toBeInTheDocument()
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

  it('shows an error message if Electron API is unavailable', () => {
    render(<App />)

    const selectButton = screen.getByRole('button', { name: /select folder/i })
    fireEvent.click(selectButton)

    expect(
      screen.getByText(/unable to open folder selection dialog: electron api is unavailable/i)
    ).toBeInTheDocument()
  })
})

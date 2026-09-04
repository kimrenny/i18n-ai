import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { ProjectExplorer } from './ProjectExplorer'
import { I18nProvider } from '../../i18n/I18nContext'
import type { ProjectFileEntry } from '../../types/explorer'

const mockTreeEntries: ProjectFileEntry[] = [
  {
    name: 'locales',
    path: 'C:/project/locales',
    relativePath: 'locales',
    isDirectory: true,
    children: [
      {
        name: 'en.json',
        path: 'C:/project/locales/en.json',
        relativePath: 'locales/en.json',
        isDirectory: false,
        isLocalizationCandidate: true,
      },
      {
        name: 'ru.json',
        path: 'C:/project/locales/ru.json',
        relativePath: 'locales/ru.json',
        isDirectory: false,
        isLocalizationCandidate: true,
      },
      {
        name: 'schema.ts',
        path: 'C:/project/locales/schema.ts',
        relativePath: 'locales/schema.ts',
        isDirectory: false,
        isLocalizationCandidate: false,
      },
    ],
  },
  {
    name: 'package.json',
    path: 'C:/project/package.json',
    relativePath: 'package.json',
    isDirectory: false,
    isLocalizationCandidate: false,
  },
  {
    name: 'tsconfig.json',
    path: 'C:/project/tsconfig.json',
    relativePath: 'tsconfig.json',
    isDirectory: false,
    isLocalizationCandidate: false,
  },
  {
    name: 'settings.json',
    path: 'C:/project/settings.json',
    relativePath: 'settings.json',
    isDirectory: false,
    isLocalizationCandidate: false,
  },
  {
    name: 'README.md',
    path: 'C:/project/README.md',
    relativePath: 'README.md',
    isDirectory: false,
    isLocalizationCandidate: false,
  },
]

describe('ProjectExplorer', () => {
  it('renders empty folder state when rootPath is null', () => {
    const handleOpen = vi.fn()
    render(
      <I18nProvider language="en">
        <ProjectExplorer
          rootPath={null}
          rootName={null}
          treeEntries={[]}
          flatJsonFiles={[]}
          checkedPaths={new Set()}
          onToggleCheckFile={vi.fn()}
          onSelectAllJson={vi.fn()}
          onUnselectAllJson={vi.fn()}
          onOpenFolder={handleOpen}
        />
      </I18nProvider>
    )

    expect(screen.getByText(/no folder opened/i)).toBeInTheDocument()
    const openBtn = screen.getByRole('button', { name: /open folder/i })
    fireEvent.click(openBtn)
    expect(handleOpen).toHaveBeenCalledTimes(1)
  })

  it('renders opened folder as root node above project contents', () => {
    render(
      <I18nProvider language="en">
        <ProjectExplorer
          rootPath="C:/MyProject"
          rootName="MyProject"
          treeEntries={mockTreeEntries}
          flatJsonFiles={[]}
          checkedPaths={new Set()}
          onToggleCheckFile={vi.fn()}
          onSelectAllJson={vi.fn()}
          onUnselectAllJson={vi.fn()}
          onOpenFolder={vi.fn()}
        />
      </I18nProvider>
    )

    const rootFolder = screen.getByTestId('explorer-root-folder')
    expect(rootFolder).toBeInTheDocument()
    // Root name is visible as top root node
    expect(rootFolder).toHaveTextContent('MyProject')

    // Children are rendered beneath root
    expect(screen.getByText('locales')).toBeInTheDocument()
    expect(screen.getByText('package.json')).toBeInTheDocument()
    expect(screen.getByText('tsconfig.json')).toBeInTheDocument()
    expect(screen.getByText('README.md')).toBeInTheDocument()
  })

  it('strictly distinguishes translation files from configuration/project JSON files and other files', () => {
    const handleToggle = vi.fn()
    const handleSelectFile = vi.fn()

    render(
      <I18nProvider language="en">
        <ProjectExplorer
          rootPath="C:/project"
          rootName="project"
          treeEntries={mockTreeEntries}
          flatJsonFiles={[]}
          checkedPaths={new Set(['C:/project/locales/en.json'])}
          onToggleCheckFile={handleToggle}
          onSelectAllJson={vi.fn()}
          onUnselectAllJson={vi.fn()}
          onSelectFile={handleSelectFile}
          onOpenFolder={vi.fn()}
        />
      </I18nProvider>
    )

    // Expand locales directory
    const localesDir = screen.getByText('locales')
    fireEvent.click(localesDir)

    // Translation files have checkboxes
    const enCheckbox = screen.getByRole('checkbox', { name: /select en\.json/i })
    const ruCheckbox = screen.getByRole('checkbox', { name: /select ru\.json/i })
    expect(enCheckbox).toBeChecked()
    expect(ruCheckbox).not.toBeChecked()

    // Non-translation JSON files MUST NOT have checkboxes
    expect(screen.queryByRole('checkbox', { name: /select package\.json/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('checkbox', { name: /select tsconfig\.json/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('checkbox', { name: /select settings\.json/i })).not.toBeInTheDocument()

    // Non-JSON files (.ts, .md) MUST NOT have checkboxes
    expect(screen.queryByRole('checkbox', { name: /select readme\.md/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('checkbox', { name: /select schema\.ts/i })).not.toBeInTheDocument()

    // Toggling translation file checkbox triggers callback
    fireEvent.click(ruCheckbox)
    expect(handleToggle).toHaveBeenCalledWith('C:/project/locales/ru.json')
  })

  it('invokes onSelectFile when clicking any file row for preview', () => {
    const handleSelectFile = vi.fn()

    render(
      <I18nProvider language="en">
        <ProjectExplorer
          rootPath="C:/project"
          rootName="project"
          treeEntries={mockTreeEntries}
          flatJsonFiles={[]}
          checkedPaths={new Set()}
          onToggleCheckFile={vi.fn()}
          onSelectAllJson={vi.fn()}
          onUnselectAllJson={vi.fn()}
          onSelectFile={handleSelectFile}
          onOpenFolder={vi.fn()}
        />
      </I18nProvider>
    )

    // Click package.json
    const packageJsonRow = screen.getByTestId('explorer-file-package.json')
    fireEvent.click(packageJsonRow)
    expect(handleSelectFile).toHaveBeenCalledWith('C:/project/package.json', 'package.json', false)

    // Expand locales and click en.json
    const localesDir = screen.getByText('locales')
    fireEvent.click(localesDir)
    const enJsonRow = screen.getByTestId('explorer-file-en.json')
    fireEvent.click(enJsonRow)
    expect(handleSelectFile).toHaveBeenCalledWith('C:/project/locales/en.json', 'en.json', true)
  })

  it('supports expanding and collapsing directories without navigating workspace', () => {
    render(
      <I18nProvider language="en">
        <ProjectExplorer
          rootPath="C:/project"
          rootName="project"
          treeEntries={mockTreeEntries}
          flatJsonFiles={[]}
          checkedPaths={new Set()}
          onToggleCheckFile={vi.fn()}
          onSelectAllJson={vi.fn()}
          onUnselectAllJson={vi.fn()}
          onOpenFolder={vi.fn()}
        />
      </I18nProvider>
    )

    const localesDir = screen.getByText('locales')
    // Initially locales is closed
    expect(screen.queryByText('en.json')).not.toBeInTheDocument()

    // Click to expand
    fireEvent.click(localesDir)
    expect(screen.getByText('en.json')).toBeInTheDocument()

    // Click to collapse
    fireEvent.click(localesDir)
    expect(screen.queryByText('en.json')).not.toBeInTheDocument()
  })

  it('filters files when searching in search input', () => {
    render(
      <I18nProvider language="en">
        <ProjectExplorer
          rootPath="C:/project"
          rootName="project"
          treeEntries={mockTreeEntries}
          flatJsonFiles={[]}
          checkedPaths={new Set()}
          onToggleCheckFile={vi.fn()}
          onSelectAllJson={vi.fn()}
          onUnselectAllJson={vi.fn()}
          onOpenFolder={vi.fn()}
        />
      </I18nProvider>
    )

    const searchInput = screen.getByRole('searchbox', { name: /search files/i })
    fireEvent.change(searchInput, { target: { value: 'README' } })

    expect(screen.getByText('README.md')).toBeInTheDocument()
    expect(screen.queryByText('locales')).not.toBeInTheDocument()
  })

  it('supports select all and unselect all JSON actions', () => {
    const handleSelectAll = vi.fn()
    const handleUnselectAll = vi.fn()

    render(
      <I18nProvider language="en">
        <ProjectExplorer
          rootPath="C:/project"
          rootName="project"
          treeEntries={mockTreeEntries}
          flatJsonFiles={[]}
          checkedPaths={new Set(['C:/project/locales/en.json'])}
          onToggleCheckFile={vi.fn()}
          onSelectAllJson={handleSelectAll}
          onUnselectAllJson={handleUnselectAll}
          onOpenFolder={vi.fn()}
        />
      </I18nProvider>
    )

    const selectAllBtn = screen.getByRole('button', { name: /^all$/i })
    fireEvent.click(selectAllBtn)
    expect(handleSelectAll).toHaveBeenCalledTimes(1)

    const unselectAllBtn = screen.getByRole('button', { name: /^none$/i })
    fireEvent.click(unselectAllBtn)
    expect(handleUnselectAll).toHaveBeenCalledTimes(1)
  })
})

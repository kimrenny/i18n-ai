import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { GlobalSearch } from './GlobalSearch'
import type { ParsedLocalizationFile } from '../../types/localization'

describe('GlobalSearch component', () => {
  const mockFiles: ParsedLocalizationFile[] = [
    {
      filename: 'en.json',
      path: 'C:/Projects/locales/en.json',
      raw: {},
      keys: {
        'app.title': 'Admin Dashboard',
        'actions.save': 'Save',
        'empty.field': '',
      },
      keyCount: 3,
    },
    {
      filename: 'de.json',
      path: 'C:/Projects/locales/de.json',
      raw: {},
      keys: {
        'app.title': 'Admin-Übersicht',
        'actions.save': 'Speichern',
      },
      keyCount: 2,
    },
  ]

  it('renders dialog when isOpen is true and shows initial empty query hint', () => {
    render(
      <GlobalSearch
        isOpen={true}
        onClose={vi.fn()}
        onSelectResult={vi.fn()}
        files={mockFiles}
        isWorkspaceOpen={true}
      />
    )

    expect(screen.getByTestId('global-search-dialog')).toBeInTheDocument()
    expect(screen.getByTestId('global-search-input')).toBeInTheDocument()
    expect(screen.getByTestId('search-empty-query')).toBeInTheDocument()
  })

  it('does not render when isOpen is false', () => {
    render(
      <GlobalSearch
        isOpen={false}
        onClose={vi.fn()}
        onSelectResult={vi.fn()}
        files={mockFiles}
        isWorkspaceOpen={true}
      />
    )

    expect(screen.queryByTestId('global-search-dialog')).not.toBeInTheDocument()
  })

  it('renders search results grouped by file with highlighted matches', () => {
    render(
      <GlobalSearch
        isOpen={true}
        onClose={vi.fn()}
        onSelectResult={vi.fn()}
        files={mockFiles}
        isWorkspaceOpen={true}
      />
    )

    const input = screen.getByTestId('global-search-input')
    fireEvent.change(input, { target: { value: 'admin' } })

    // Results in both en.json and de.json
    expect(screen.getByTestId('search-summary-bar')).toHaveTextContent(/2 results/i)
    expect(screen.getByTestId('search-result-en.json-app.title')).toBeInTheDocument()
    expect(screen.getByTestId('search-result-de.json-app.title')).toBeInTheDocument()
  })

  it('navigates through results using ArrowDown/ArrowUp and selects on Enter', () => {
    const handleSelect = vi.fn()
    render(
      <GlobalSearch
        isOpen={true}
        onClose={vi.fn()}
        onSelectResult={handleSelect}
        files={mockFiles}
        isWorkspaceOpen={true}
      />
    )

    const input = screen.getByTestId('global-search-input')
    fireEvent.change(input, { target: { value: 'save' } })

    const enItem = screen.getByTestId('search-result-en.json-actions.save')
    const deItem = screen.getByTestId('search-result-de.json-actions.save')

    // Initial selected is index 0 (en.json)
    expect(enItem).toHaveClass('is-selected')

    // Press ArrowDown to move to index 1 (de.json)
    const dialog = screen.getByTestId('global-search-dialog')
    fireEvent.keyDown(dialog, { key: 'ArrowDown' })
    expect(deItem).toHaveClass('is-selected')

    // Press Enter to activate
    fireEvent.keyDown(dialog, { key: 'Enter' })
    expect(handleSelect).toHaveBeenCalledWith(
      expect.objectContaining({
        filename: 'de.json',
        key: 'actions.save',
      })
    )
  })

  it('invokes onSelectResult when clicking a result item', () => {
    const handleSelect = vi.fn()
    render(
      <GlobalSearch
        isOpen={true}
        onClose={vi.fn()}
        onSelectResult={handleSelect}
        files={mockFiles}
        isWorkspaceOpen={true}
      />
    )

    const input = screen.getByTestId('global-search-input')
    fireEvent.change(input, { target: { value: 'dashboard' } })

    const resultItem = screen.getByTestId('search-result-en.json-app.title')
    fireEvent.click(resultItem)

    expect(handleSelect).toHaveBeenCalledWith(
      expect.objectContaining({
        filename: 'en.json',
        key: 'app.title',
        value: 'Admin Dashboard',
      })
    )
  })

  it('closes dialog on Escape key press or close button click', () => {
    const handleClose = vi.fn()
    render(
      <GlobalSearch
        isOpen={true}
        onClose={handleClose}
        onSelectResult={vi.fn()}
        files={mockFiles}
        isWorkspaceOpen={true}
      />
    )

    const dialog = screen.getByTestId('global-search-dialog')
    fireEvent.keyDown(dialog, { key: 'Escape' })
    expect(handleClose).toHaveBeenCalledTimes(1)

    const closeBtn = screen.getByTestId('search-close-btn')
    fireEvent.click(closeBtn)
    expect(handleClose).toHaveBeenCalledTimes(2)
  })

  it('renders appropriate empty states for no workspace and no results', () => {
    const { rerender } = render(
      <GlobalSearch
        isOpen={true}
        onClose={vi.fn()}
        onSelectResult={vi.fn()}
        files={mockFiles}
        isWorkspaceOpen={false}
      />
    )

    expect(screen.getByTestId('search-no-workspace')).toBeInTheDocument()

    rerender(
      <GlobalSearch
        isOpen={true}
        onClose={vi.fn()}
        onSelectResult={vi.fn()}
        files={mockFiles}
        isWorkspaceOpen={true}
      />
    )

    const input = screen.getByTestId('global-search-input')
    fireEvent.change(input, { target: { value: 'nonexistent_key_xyz' } })
    expect(screen.getByTestId('search-no-results')).toBeInTheDocument()
  })
})

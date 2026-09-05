import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { TranslationHistory } from './TranslationHistory'
import type { TranslationHistoryItem } from '../../types/localizationHistoryView'

describe('TranslationHistory component', () => {
  const mockItems: TranslationHistoryItem[] = [
    {
      id: 'item-1',
      timestamp: Date.now() - 10000,
      type: 'edit',
      targetFile: 'uk.json',
      targetFilePath: '/path/uk.json',
      key: 'COMMON.SAVE',
      previousValue: 'Зберегти старе',
      newValue: 'Зберегти',
      summary: 'Edit COMMON.SAVE',
      affectedFilesCount: 1,
      affectedFiles: ['uk.json'],
      canRevert: true,
      action: {
        id: 'item-1',
        timestamp: Date.now() - 10000,
        targetFile: 'uk.json',
        targetFilePath: '/path/uk.json',
        type: 'edit_key',
        description: 'Edit COMMON.SAVE',
        key: 'COMMON.SAVE',
        beforeRawJson: { COMMON: { SAVE: 'Зберегти старе' } },
        afterRawJson: { COMMON: { SAVE: 'Зберегти' } },
      },
    },
    {
      id: 'item-2',
      timestamp: Date.now() - 120000,
      type: 'ai_translate',
      targetFile: 'de.json',
      targetFilePath: '/path/de.json',
      key: 'NAV.HOME',
      previousValue: '',
      newValue: 'Startseite',
      summary: 'AI translation: NAV.HOME',
      affectedFilesCount: 1,
      affectedFiles: ['de.json'],
      canRevert: true,
      action: {
        id: 'item-2',
        timestamp: Date.now() - 120000,
        targetFile: 'de.json',
        targetFilePath: '/path/de.json',
        type: 'ai_translate',
        description: 'AI translate NAV.HOME',
        key: 'NAV.HOME',
        beforeRawJson: { NAV: { HOME: '' } },
        afterRawJson: { NAV: { HOME: 'Startseite' } },
      },
    },
    {
      id: 'item-3',
      timestamp: Date.now() - 300000,
      type: 'rename_key',
      targetFile: 'en.json',
      targetFilePath: '/path/en.json',
      oldKey: 'OLD.NAME',
      newKey: 'NEW.NAME',
      summary: 'Rename OLD.NAME → NEW.NAME',
      affectedFilesCount: 2,
      affectedFiles: ['en.json', 'uk.json'],
      canRevert: true,
      action: {
        id: 'item-3',
        timestamp: Date.now() - 300000,
        targetFile: 'en.json',
        targetFilePath: '/path/en.json',
        type: 'rename_key',
        description: 'Rename OLD.NAME to NEW.NAME',
        oldKey: 'OLD.NAME',
        newKey: 'NEW.NAME',
        beforeRawJson: {},
        afterRawJson: {},
      },
    },
  ]

  it('renders empty state when no items exist', () => {
    render(<TranslationHistory items={[]} />)
    expect(screen.getByTestId('history-empty-state')).toBeInTheDocument()
    expect(screen.getByTestId('history-total-count')).toHaveTextContent('0')
  })

  it('renders history items with operation badges and summaries', () => {
    render(<TranslationHistory items={mockItems} />)
    expect(screen.getByTestId('history-total-count')).toHaveTextContent('3')
    expect(screen.getByTestId('history-item-item-1')).toBeInTheDocument()
    expect(screen.getByTestId('history-item-item-2')).toBeInTheDocument()
    expect(screen.getByTestId('history-item-item-3')).toBeInTheDocument()
  })

  it('filters history items when tab is clicked', () => {
    render(<TranslationHistory items={mockItems} />)

    // Filter AI
    fireEvent.click(screen.getByTestId('history-filter-ai'))
    expect(screen.queryByTestId('history-item-item-1')).not.toBeInTheDocument()
    expect(screen.getByTestId('history-item-item-2')).toBeInTheDocument()
    expect(screen.queryByTestId('history-item-item-3')).not.toBeInTheDocument()

    // Filter Keys
    fireEvent.click(screen.getByTestId('history-filter-keys'))
    expect(screen.queryByTestId('history-item-item-1')).not.toBeInTheDocument()
    expect(screen.queryByTestId('history-item-item-2')).not.toBeInTheDocument()
    expect(screen.getByTestId('history-item-item-3')).toBeInTheDocument()

    // Filter All
    fireEvent.click(screen.getByTestId('history-filter-all'))
    expect(screen.getByTestId('history-item-item-1')).toBeInTheDocument()
  })

  it('shows details for selected item and allows navigation', () => {
    const onNavigateKey = vi.fn()
    const onSelectItem = vi.fn()

    render(
      <TranslationHistory
        items={mockItems}
        selectedItemId="item-1"
        onSelectItem={onSelectItem}
        onNavigateKey={onNavigateKey}
      />
    )

    expect(screen.getByTestId('history-detail-pane')).toBeInTheDocument()
    expect(screen.getByTestId('detail-prev-value')).toHaveTextContent('Зберегти старе')
    expect(screen.getByTestId('detail-new-value')).toHaveTextContent('Зберегти')

    const navBtn = screen.getByTestId('history-navigate-btn')
    fireEvent.click(navBtn)
    expect(onNavigateKey).toHaveBeenCalledWith(mockItems[0])
  })

  it('prompts confirmation modal before clearing history', () => {
    const onClearHistory = vi.fn()
    render(<TranslationHistory items={mockItems} onClearHistory={onClearHistory} />)

    fireEvent.click(screen.getByTestId('clear-history-btn'))
    expect(screen.getByTestId('clear-history-modal')).toBeInTheDocument()

    // Cancel first
    fireEvent.click(screen.getByTestId('clear-history-cancel'))
    expect(screen.queryByTestId('clear-history-modal')).not.toBeInTheDocument()
    expect(onClearHistory).not.toHaveBeenCalled()

    // Reopen and confirm
    fireEvent.click(screen.getByTestId('clear-history-btn'))
    fireEvent.click(screen.getByTestId('clear-history-confirm'))
    expect(onClearHistory).toHaveBeenCalledTimes(1)
  })

  it('prompts confirmation modal before reverting history item', () => {
    const onRevertItem = vi.fn()
    render(
      <TranslationHistory
        items={mockItems}
        selectedItemId="item-1"
        onRevertItem={onRevertItem}
      />
    )

    fireEvent.click(screen.getByTestId('history-revert-btn'))
    expect(screen.getByTestId('revert-history-modal')).toBeInTheDocument()

    fireEvent.click(screen.getByTestId('revert-history-confirm'))
    expect(onRevertItem).toHaveBeenCalledWith(mockItems[0])
  })
})

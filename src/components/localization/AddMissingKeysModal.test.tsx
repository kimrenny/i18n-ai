import { describe, it, expect, vi } from 'vitest'
import React from 'react'
import { render, screen, fireEvent } from '@testing-library/react'
import { AddMissingKeysModal } from './AddMissingKeysModal'
import { I18nProvider } from '../../i18n/I18nContext'
import type { MissingKeysAdditionPlan } from '../../types/localization'

describe('AddMissingKeysModal Component', () => {
  const mockPlan: MissingKeysAdditionPlan = {
    totalKeysToAdd: 3,
    hasConflicts: false,
    conflictMessages: [],
    filesToModify: [
      {
        filename: 'uk.json',
        path: '/long/workspace/path/to/locales/uk.json',
        keysToAdd: [
          { key: 'COMMON.BUTTONS.SAVE', value: '' },
          { key: 'COMMON.BUTTONS.CANCEL', value: '' },
        ],
        conflicts: [],
        newRawJson: {},
        formattedJson: '{}',
      },
      {
        filename: 'ja_test.json',
        path: '/long/workspace/path/to/locales/ja_test.json',
        keysToAdd: [{ key: 'SETTINGS.THEME', value: '' }],
        conflicts: [],
        newRawJson: {},
        formattedJson: '{}',
      },
    ],
  }

  const renderModal = (props: Partial<React.ComponentProps<typeof AddMissingKeysModal>> = {}) => {
    const defaultProps = {
      plan: mockPlan,
      isWriting: false,
      onConfirm: vi.fn(),
      onClose: vi.fn(),
      ...props,
    }

    const utils = render(
      <I18nProvider language="en">
        <AddMissingKeysModal {...defaultProps} />
      </I18nProvider>
    )

    return { ...utils, props: defaultProps }
  }

  it('renders all affected languages and files in the selector', () => {
    renderModal()

    // Verifies language selector items exist
    const ukItem = screen.getByTestId('lang-item-uk.json')
    const jaItem = screen.getByTestId('lang-item-ja_test.json')

    expect(ukItem).toBeInTheDocument()
    expect(jaItem).toBeInTheDocument()

    expect(ukItem).toHaveTextContent('Ukrainian')
    expect(ukItem).toHaveTextContent('uk.json')
    expect(ukItem).toHaveTextContent('+2')

    expect(jaItem).toHaveTextContent('Japanese')
    expect(jaItem).toHaveTextContent('ja_test.json')
    expect(jaItem).toHaveTextContent('+1')
  })

  it('selects the first affected language initially and renders only its preview', () => {
    renderModal()

    // First item is active
    const ukItem = screen.getByTestId('lang-item-uk.json')
    expect(ukItem).toHaveClass('active')

    // Preview panel shows Ukrainian keys
    const previewPanel = screen.getByTestId('preview-panel-uk.json')
    expect(previewPanel).toBeInTheDocument()
    expect(screen.getByText('COMMON.BUTTONS.SAVE')).toBeInTheDocument()
    expect(screen.getByText('COMMON.BUTTONS.CANCEL')).toBeInTheDocument()

    // Does NOT render Japanese keys in preview
    expect(screen.queryByText('SETTINGS.THEME')).not.toBeInTheDocument()
  })

  it('switches the preview to the clicked language when a selector item is clicked', () => {
    renderModal()

    const jaItem = screen.getByTestId('lang-item-ja_test.json')
    fireEvent.click(jaItem)

    // Japanese is now active
    expect(jaItem).toHaveClass('active')
    expect(screen.getByTestId('lang-item-uk.json')).not.toHaveClass('active')

    // Preview now shows Japanese keys
    expect(screen.getByTestId('preview-panel-ja_test.json')).toBeInTheDocument()
    expect(screen.getByText('SETTINGS.THEME')).toBeInTheDocument()

    // Ukrainian keys are no longer rendered in the preview
    expect(screen.queryByText('COMMON.BUTTONS.SAVE')).not.toBeInTheDocument()
    expect(screen.queryByText('COMMON.BUTTONS.CANCEL')).not.toBeInTheDocument()
  })

  it('renders correctly with 14 languages without layout breakdown', () => {
    const all14Codes = ['en', 'uk', 'ru', 'de', 'fr', 'es', 'it', 'pt', 'ja', 'zh', 'ko', 'pl', 'nl', 'tr']
    const bigPlan: MissingKeysAdditionPlan = {
      totalKeysToAdd: 14,
      hasConflicts: false,
      conflictMessages: [],
      filesToModify: all14Codes.map((code) => ({
        filename: `${code}.json`,
        path: `/locales/${code}.json`,
        keysToAdd: [{ key: `KEY.${code.toUpperCase()}`, value: '' }],
        conflicts: [],
        newRawJson: {},
        formattedJson: '{}',
      })),
    }

    renderModal({ plan: bigPlan })

    // All 14 languages are in the selector
    all14Codes.forEach((code) => {
      expect(screen.getByTestId(`lang-item-${code}.json`)).toBeInTheDocument()
    })

    // Initial preview is English
    expect(screen.getByTestId('preview-panel-en.json')).toBeInTheDocument()
    expect(screen.getByText('KEY.EN')).toBeInTheDocument()
    expect(screen.queryByText('KEY.UK')).not.toBeInTheDocument()
  })

  it('triggers onConfirm and onClose callbacks correctly', () => {
    const onConfirm = vi.fn()
    const onClose = vi.fn()
    renderModal({ onConfirm, onClose })

    fireEvent.click(screen.getByRole('button', { name: /confirm/i }))
    expect(onConfirm).toHaveBeenCalledTimes(1)

    fireEvent.click(screen.getByRole('button', { name: /cancel/i }))
    expect(onClose).toHaveBeenCalledTimes(1)
  })
})

import { describe, it, expect, vi } from 'vitest'
import React from 'react'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { AddTranslationKeyModal } from './AddTranslationKeyModal'
import { I18nProvider } from '../../i18n/I18nContext'
import type { ParsedLocalizationFile } from '../../types/localization'

describe('AddTranslationKeyModal Component', () => {
  const mockFiles: ParsedLocalizationFile[] = [
    {
      filename: 'en.json',
      path: '/locales/en.json',
      raw: {
        HEADER: {
          TITLE: 'Header Title',
        },
      },
      keys: {
        'HEADER.TITLE': 'Header Title',
      },
      keyCount: 1,
    },
    {
      filename: 'de.json',
      path: '/locales/de.json',
      raw: {},
      keys: {},
      keyCount: 0,
    },
  ]

  const renderModal = (props: Partial<React.ComponentProps<typeof AddTranslationKeyModal>> = {}) => {
    const defaultProps = {
      isOpen: true,
      parsedFiles: mockFiles,
      initialActiveFilename: 'en.json',
      onClose: vi.fn(),
      onConfirmAddKey: vi.fn().mockResolvedValue(undefined),
      ...props,
    }

    const utils = render(
      <I18nProvider language="en">
        <AddTranslationKeyModal {...defaultProps} />
      </I18nProvider>
    )

    return { ...utils, props: defaultProps }
  }

  it('renders correctly when open', () => {
    renderModal()
    expect(screen.getByTestId('add-key-modal')).toBeInTheDocument()
    expect(screen.getByTestId('add-key-input')).toBeInTheDocument()
    expect(screen.getByTestId('mode-all-btn')).toBeInTheDocument()
    expect(screen.getByTestId('mode-single-btn')).toBeInTheDocument()
  })

  it('does not render when isOpen is false', () => {
    renderModal({ isOpen: false })
    expect(screen.queryByTestId('add-key-modal')).not.toBeInTheDocument()
  })

  it('validates key input live and disables confirm button when invalid', () => {
    renderModal()
    const input = screen.getByTestId('add-key-input')
    const confirmBtn = screen.getByTestId('add-key-confirm-btn')

    expect(confirmBtn).toBeDisabled()

    // Invalid key with consecutive dots
    fireEvent.change(input, { target: { value: 'HEADER..TITLE' } })
    expect(confirmBtn).toBeDisabled()

    // Valid key
    fireEvent.change(input, { target: { value: 'HEADER.SUBTITLE' } })
    expect(confirmBtn).not.toBeDisabled()
  })

  it('shows existing key status in All Languages mode and allows entering translation for absent languages', () => {
    renderModal()
    const input = screen.getByTestId('add-key-input')

    // Key already exists in en.json but absent in de.json
    fireEvent.change(input, { target: { value: 'HEADER.TITLE' } })

    expect(screen.getByText(/Header Title/)).toBeInTheDocument()
    expect(screen.getByTestId('translation-input-de.json')).toBeInTheDocument()
    expect(screen.queryByTestId('translation-input-en.json')).not.toBeInTheDocument()
  })

  it('supports single language mode and warns if key already exists in selected file', () => {
    renderModal()
    fireEvent.click(screen.getByTestId('mode-single-btn'))

    const input = screen.getByTestId('add-key-input')
    fireEvent.change(input, { target: { value: 'HEADER.TITLE' } })

    const select = screen.getByTestId('single-lang-select')
    fireEvent.change(select, { target: { value: 'en.json' } })

    expect(screen.getByText(/already exists in this language/i)).toBeInTheDocument()
    expect(screen.getByTestId('add-key-confirm-btn')).toBeDisabled()

    // Switch to de.json
    fireEvent.change(select, { target: { value: 'de.json' } })
    expect(screen.queryByText(/already exists in this language/i)).not.toBeInTheDocument()
    expect(screen.getByTestId('add-key-confirm-btn')).not.toBeDisabled()
  })

  it('calls onConfirmAddKey and onClose on submission', async () => {
    const onConfirmAddKey = vi.fn().mockResolvedValue(undefined)
    const onClose = vi.fn()

    renderModal({ onConfirmAddKey, onClose })

    const input = screen.getByTestId('add-key-input')
    fireEvent.change(input, { target: { value: 'HEADER.SUBTITLE' } })

    const deInput = screen.getByTestId('translation-input-de.json')
    fireEvent.change(deInput, { target: { value: 'Untertitel' } })

    const confirmBtn = screen.getByTestId('add-key-confirm-btn')
    fireEvent.click(confirmBtn)

    await waitFor(() => {
      expect(onConfirmAddKey).toHaveBeenCalledWith({
        key: 'HEADER.SUBTITLE',
        mode: 'all',
        singleTargetFile: 'en.json',
        translationsByFile: {
          'de.json': 'Untertitel',
        },
      })
      expect(onClose).toHaveBeenCalled()
    })
  })

  it('closes on Escape key and Cancel button', () => {
    const onClose = vi.fn()
    renderModal({ onClose })

    fireEvent.keyDown(window, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledTimes(1)

    fireEvent.click(screen.getByText('Cancel'))
    expect(onClose).toHaveBeenCalledTimes(2)
  })
})

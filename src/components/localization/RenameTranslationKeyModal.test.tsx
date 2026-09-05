import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { RenameTranslationKeyModal } from './RenameTranslationKeyModal'
import type { ParsedLocalizationFile } from '../../types/localization'

describe('RenameTranslationKeyModal', () => {
  const mockFiles: ParsedLocalizationFile[] = [
    {
      filename: 'en.json',
      path: '/locales/en.json',
      raw: {
        ADMIN: {
          TITLE: 'Admin Dashboard',
          EXISTING: 'Already Here',
        },
      },
      keys: {
        'ADMIN.TITLE': 'Admin Dashboard',
        'ADMIN.EXISTING': 'Already Here',
      },
      keyCount: 2,
    },
    {
      filename: 'ru.json',
      path: '/locales/ru.json',
      raw: {
        ADMIN: {
          TITLE: 'Панель управления',
        },
      },
      keys: {
        'ADMIN.TITLE': 'Панель управления',
      },
      keyCount: 1,
    },
  ]

  it('renders old key display and preview for affected files', () => {
    render(
      <RenameTranslationKeyModal
        oldKey="ADMIN.TITLE"
        parsedFiles={mockFiles}
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />
    )

    expect(screen.getByTestId('rename-old-key-display')).toHaveTextContent('ADMIN.TITLE')
    expect(screen.getByTestId('rename-new-key-input')).toHaveValue('ADMIN.TITLE')
    expect(screen.getByText(/2 \/ 2/i)).toBeInTheDocument()
  })

  it('shows error and disables submit when typing an existing key', () => {
    render(
      <RenameTranslationKeyModal
        oldKey="ADMIN.TITLE"
        parsedFiles={mockFiles}
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />
    )

    const input = screen.getByTestId('rename-new-key-input')
    fireEvent.change(input, { target: { value: 'ADMIN.EXISTING' } })

    expect(screen.getByTestId('rename-error-banner')).toHaveTextContent(/already exists/i)
    expect(screen.getByTestId('rename-submit-btn')).toBeDisabled()
  })

  it('shows error for invalid dot syntax', () => {
    render(
      <RenameTranslationKeyModal
        oldKey="ADMIN.TITLE"
        parsedFiles={mockFiles}
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />
    )

    const input = screen.getByTestId('rename-new-key-input')
    fireEvent.change(input, { target: { value: 'ADMIN..HEADER' } })

    expect(screen.getByTestId('rename-error-banner')).toBeInTheDocument()
    expect(screen.getByTestId('rename-submit-btn')).toBeDisabled()
  })

  it('submits plan when valid new key is entered and submit is clicked', () => {
    const onConfirm = vi.fn()

    render(
      <RenameTranslationKeyModal
        oldKey="ADMIN.TITLE"
        parsedFiles={mockFiles}
        onConfirm={onConfirm}
        onCancel={vi.fn()}
      />
    )

    const input = screen.getByTestId('rename-new-key-input')
    fireEvent.change(input, { target: { value: 'ADMIN.HEADER' } })

    expect(screen.getByTestId('rename-submit-btn')).toBeEnabled()
    fireEvent.click(screen.getByTestId('rename-submit-btn'))

    expect(onConfirm).toHaveBeenCalledTimes(1)
    const submittedPlan = onConfirm.mock.calls[0][0]
    expect(submittedPlan.oldKey).toBe('ADMIN.TITLE')
    expect(submittedPlan.newKey).toBe('ADMIN.HEADER')
    expect(submittedPlan.filesToModify).toHaveLength(2)
  })

  it('calls onCancel when Cancel button is clicked', () => {
    const onCancel = vi.fn()

    render(
      <RenameTranslationKeyModal
        oldKey="ADMIN.TITLE"
        parsedFiles={mockFiles}
        onConfirm={vi.fn()}
        onCancel={onCancel}
      />
    )

    fireEvent.click(screen.getByRole('button', { name: /cancel/i }))
    expect(onCancel).toHaveBeenCalledTimes(1)
  })
})

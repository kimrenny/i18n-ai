import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import {
  AiTranslationConfirmModal,
  type AiTranslationProposal,
} from './AiTranslationConfirmModal'

describe('AiTranslationConfirmModal', () => {
  const baseProposal: AiTranslationProposal = {
    key: 'AUTH.LOGIN.TITLE',
    targetFile: 'ru.json',
    targetLanguage: 'ru',
    sourceFile: 'en.json',
    sourceLanguage: 'en',
    sourceValue: 'Welcome Back',
    translatedText: 'С возвращением',
    provider: 'gemini',
    model: 'gemini-1.5-flash',
  }

  it('renders short engine name and all metadata correctly', () => {
    const onConfirm = vi.fn()
    const onCancel = vi.fn()

    render(
      <AiTranslationConfirmModal
        proposal={baseProposal}
        isApplying={false}
        error={null}
        onConfirm={onConfirm}
        onCancel={onCancel}
      />
    )

    expect(screen.getByText('AUTH.LOGIN.TITLE')).toBeInTheDocument()
    expect(screen.getByText('ru.json')).toBeInTheDocument()
    expect(screen.getByText('en.json')).toBeInTheDocument()
    expect(screen.getByText('Welcome Back')).toBeInTheDocument()

    const engineEl = screen.getByText(/Google Gemini/i)
    expect(engineEl).toBeInTheDocument()
    expect(engineEl).toHaveAttribute('title', 'Google Gemini · gemini-1.5-flash')
  })

  it('renders long engine model name in DOM with native title tooltip and preserves other metadata', () => {
    const longProposal: AiTranslationProposal = {
      ...baseProposal,
      provider: 'gemini',
      model: 'gemini-3.6-flash-experimental-long-preview-identifier',
    }

    render(
      <AiTranslationConfirmModal
        proposal={longProposal}
        isApplying={false}
        error={null}
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />
    )

    // Key, Target File, Source File remain visible
    expect(screen.getByText('AUTH.LOGIN.TITLE')).toBeInTheDocument()
    expect(screen.getByText('ru.json')).toBeInTheDocument()
    expect(screen.getByText('en.json')).toBeInTheDocument()

    // Engine element has full text in title attribute
    const expectedTitle = 'Google Gemini · gemini-3.6-flash-experimental-long-preview-identifier'
    const engineEl = screen.getByTitle(expectedTitle)
    expect(engineEl).toBeInTheDocument()
    expect(engineEl).toHaveClass('ai-engine-badge')
  })

  it('allows editing proposed translation and confirms with updated text', () => {
    const onConfirm = vi.fn()
    const onCancel = vi.fn()

    render(
      <AiTranslationConfirmModal
        proposal={baseProposal}
        isApplying={false}
        error={null}
        onConfirm={onConfirm}
        onCancel={onCancel}
      />
    )

    const textarea = screen.getByRole('textbox')
    expect(textarea).toHaveValue('С возвращением')

    fireEvent.change(textarea, { target: { value: 'Добро пожаловать' } })
    fireEvent.click(screen.getByRole('button', { name: /apply translation/i }))

    expect(onConfirm).toHaveBeenCalledWith('Добро пожаловать')
    expect(onCancel).not.toHaveBeenCalled()
  })

  it('invokes onCancel when clicking cancel or close button', () => {
    const onCancel = vi.fn()

    render(
      <AiTranslationConfirmModal
        proposal={baseProposal}
        isApplying={false}
        error={null}
        onConfirm={vi.fn()}
        onCancel={onCancel}
      />
    )

    fireEvent.click(screen.getByRole('button', { name: /cancel/i }))
    expect(onCancel).toHaveBeenCalledTimes(1)
  })
})

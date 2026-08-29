import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { BatchTranslationModal } from './BatchTranslationModal'
import type { BatchTranslationPlan } from '../../services/aiBatchTranslation'

describe('BatchTranslationModal', () => {
  const samplePlan: BatchTranslationPlan = {
    totalCount: 3,
    filesAffected: ['ru.json', 'de.json'],
    unresolvableCount: 0,
    items: [
      {
        id: 'ru.json::AUTH.LOGIN',
        targetFile: 'ru.json',
        targetLanguage: 'ru',
        key: 'AUTH.LOGIN',
        sourceFile: 'en.json',
        sourceLanguage: 'en',
        sourceValue: 'Log In',
        isMissing: false,
        isEmpty: true,
        proposedTranslation: 'Войти',
        status: 'translated',
      },
      {
        id: 'de.json::AUTH.LOGOUT',
        targetFile: 'de.json',
        targetLanguage: 'de',
        key: 'AUTH.LOGOUT',
        sourceFile: 'en.json',
        sourceLanguage: 'en',
        sourceValue: 'Log Out',
        isMissing: true,
        isEmpty: false,
        proposedTranslation: 'Abmelden',
        status: 'translated',
      },
      {
        id: 'ru.json::SETTINGS.THEME',
        targetFile: 'ru.json',
        targetLanguage: 'ru',
        key: 'SETTINGS.THEME',
        sourceFile: 'en.json',
        sourceLanguage: 'en',
        sourceValue: 'Theme',
        isMissing: true,
        isEmpty: false,
        proposedTranslation: '',
        status: 'error',
        errorMessage: 'Quota exceeded',
      },
    ],
  }

  it('renders progress view with rate limit retry banner when isRetrying is true', () => {
    const onCancel = vi.fn()
    render(
      <BatchTranslationModal
        plan={samplePlan}
        progress={{
          current: 2,
          total: 3,
          currentBatch: 1,
          totalBatches: 2,
          keysInBatch: 2,
          currentKey: 'AUTH.LOGOUT',
          targetFile: 'de.json',
          successCount: 1,
          errorCount: 0,
          isRetrying: true,
          retryAttempt: 2,
          maxRetries: 4,
          retryDelayRemainingMs: 3000,
          statusMessage: 'Rate limit reached (429) — retrying in 3.0s (attempt 2/4)...',
        }}
        isTranslating={true}
        isWriting={false}
        error={null}
        onUpdateProposedTranslation={vi.fn()}
        onCancelTranslate={onCancel}
        onConfirmApplyAll={vi.fn()}
        onClose={vi.fn()}
      />
    )

    expect(
      screen.getByRole('heading', { name: /translating all untranslated keys/i })
    ).toBeInTheDocument()
    expect(screen.getByText(/Translated 1 \/ 3/i)).toBeInTheDocument()
    expect(screen.getByText(/Batches: 1 \/ 2/i)).toBeInTheDocument()
    expect(screen.getByRole('status')).toBeInTheDocument()
    expect(
      screen.getAllByText(/Rate limit reached \(429\) — retrying in 3\.0s \(attempt 2\/4\)\.\.\./i).length
    ).toBeGreaterThanOrEqual(1)

    const cancelBtn = screen.getByRole('button', { name: /cancel translation/i })
    fireEvent.click(cancelBtn)
    expect(onCancel).toHaveBeenCalled()
  })

  it('renders review table and supports Retry Failed action when errorCount > 0', () => {
    const onUpdate = vi.fn()
    const onApply = vi.fn()
    const onRetryFailed = vi.fn()
    const onClose = vi.fn()

    render(
      <BatchTranslationModal
        plan={samplePlan}
        progress={null}
        isTranslating={false}
        isWriting={false}
        error={null}
        onUpdateProposedTranslation={onUpdate}
        onCancelTranslate={vi.fn()}
        onRetryFailed={onRetryFailed}
        onConfirmApplyAll={onApply}
        onClose={onClose}
      />
    )

    expect(
      screen.getByRole('heading', { name: /review batch translations/i })
    ).toBeInTheDocument()

    // Status filter tabs
    expect(screen.getByRole('button', { name: /all \(3\)/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /ready to apply \(2\)/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /errors \(1\)/i })).toBeInTheDocument()

    // Retry Failed button
    const retryFailedBtn = screen.getByRole('button', { name: /retry failed \(1\)/i })
    expect(retryFailedBtn).toBeInTheDocument()
    fireEvent.click(retryFailedBtn)
    expect(onRetryFailed).toHaveBeenCalled()

    // Edit proposed translation
    const loginInput = screen.getByRole('textbox', {
      name: /translation for auth\.login/i,
    })
    expect(loginInput).toHaveValue('Войти')

    fireEvent.change(loginInput, { target: { value: 'Авторизоваться' } })
    expect(onUpdate).toHaveBeenCalledWith(
      'ru.json::AUTH.LOGIN',
      'Авторизоваться'
    )

    // Apply All button
    const applyBtn = screen.getByRole('button', { name: /apply all \(2\)/i })
    fireEvent.click(applyBtn)
    expect(onApply).toHaveBeenCalled()

    // Close button
    const closeBtn = screen.getByRole('button', { name: /close batch review/i })
    fireEvent.click(closeBtn)
    expect(onClose).toHaveBeenCalled()
  })
})

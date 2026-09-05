import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import {
  TranslationProgressToast,
  type TranslationProgressToastState,
} from './TranslationProgressToast'

// Mock useTranslation
vi.mock('../../i18n/useTranslation', () => ({
  useTranslation: () => ({
    t: (key: string, options?: Record<string, unknown>) => {
      if (key === 'progress.translating') return 'Translating...'
      if (key === 'progress.translatingKey') return `Translating "${options?.key}"...`
      if (key === 'progress.retrying') return `Rate limit reached. Retrying (${options?.attempt}/${options?.maxRetries})...`
      if (key === 'progress.retryingWithCountdown')
        return `Rate limited. Retrying (${options?.attempt}/${options?.maxRetries}) in ${options?.seconds}s...`
      if (key === 'progress.completed') return 'Translation completed'
      if (key === 'progress.completedKey') return `Translation for "${options?.key}" completed`
      if (key === 'progress.failed') return 'Translation failed'
      if (key === 'progress.failedAfterRetries')
        return `Translation failed after ${options?.retries} retries`
      if (key === 'progress.batchTranslating')
        return `Translating ${options?.current} of ${options?.total}...`
      if (key === 'progress.batchRetrying')
        return `Rate limited — retrying ${options?.current}/${options?.total} (${options?.attempt}/${options?.maxRetries})...`
      if (key === 'progress.batchRetryingCountdown')
        return `Rate limited — retrying ${options?.current}/${options?.total} (${options?.attempt}/${options?.maxRetries}) in ${options?.seconds}s...`
      if (key === 'progress.batchCompleted')
        return `Batch translation completed (${options?.count} keys)`
      if (key === 'progress.dismiss') return 'Dismiss'
      return key
    },
  }),
}))

describe('TranslationProgressToast', () => {
  it('renders nothing when state is null or idle', () => {
    const { container: c1 } = render(<TranslationProgressToast state={null} />)
    expect(c1.firstChild).toBeNull()

    const { container: c2 } = render(
      <TranslationProgressToast state={{ status: 'idle' }} />
    )
    expect(c2.firstChild).toBeNull()
  })

  it('renders translating state for single key with spinner', () => {
    const state: TranslationProgressToastState = {
      status: 'translating',
      key: 'COMMON.SAVE',
    }
    render(<TranslationProgressToast state={state} />)

    expect(screen.getByText('Translating "COMMON.SAVE"...')).toBeInTheDocument()
    expect(screen.getByTestId('toast-spinner')).toBeInTheDocument()
  })

  it('renders retrying state with countdown badge and attempt counter', () => {
    const state: TranslationProgressToastState = {
      status: 'retrying',
      attempt: 2,
      maxRetries: 3,
      delayRemainingMs: 3800,
      key: 'COMMON.SAVE',
    }
    render(<TranslationProgressToast state={state} />)

    expect(
      screen.getByText('Rate limited. Retrying (2/3) in 4s...')
    ).toBeInTheDocument()
    expect(screen.getByTestId('toast-spinner-retrying')).toBeInTheDocument()
    expect(screen.getByText('4s')).toBeInTheDocument()
  })

  it('renders success state with completed checkmark', () => {
    const state: TranslationProgressToastState = {
      status: 'success',
      key: 'COMMON.SAVE',
    }
    render(<TranslationProgressToast state={state} />)

    expect(
      screen.getByText('Translation for "COMMON.SAVE" completed')
    ).toBeInTheDocument()
    expect(screen.getByTestId('toast-icon-success')).toBeInTheDocument()
  })

  it('renders error state after retries exhausted', () => {
    const state: TranslationProgressToastState = {
      status: 'error',
      attempt: 3,
      maxRetries: 3,
      key: 'COMMON.SAVE',
    }
    render(<TranslationProgressToast state={state} />)

    expect(
      screen.getByText('Translation failed after 3 retries')
    ).toBeInTheDocument()
    expect(screen.getByTestId('toast-icon-error')).toBeInTheDocument()
  })

  it('renders batch translation progress accurately', () => {
    const state: TranslationProgressToastState = {
      status: 'translating',
      isBatch: true,
      batchCurrent: 4,
      batchTotal: 12,
    }
    render(<TranslationProgressToast state={state} />)

    expect(screen.getByText('Translating 4 of 12...')).toBeInTheDocument()
  })

  it('renders batch retry with rate limit countdown', () => {
    const state: TranslationProgressToastState = {
      status: 'retrying',
      isBatch: true,
      batchCurrent: 4,
      batchTotal: 12,
      attempt: 1,
      maxRetries: 3,
      delayRemainingMs: 2000,
    }
    render(<TranslationProgressToast state={state} />)

    expect(
      screen.getByText('Rate limited — retrying 4/12 (1/3) in 2s...')
    ).toBeInTheDocument()
  })

  it('calls onDismiss callback when close button is clicked', () => {
    const onDismiss = vi.fn()
    const state: TranslationProgressToastState = {
      status: 'error',
      message: 'Rate limit error',
    }
    render(<TranslationProgressToast state={state} onDismiss={onDismiss} />)

    const dismissBtn = screen.getByTestId('toast-dismiss-btn')
    fireEvent.click(dismissBtn)
    expect(onDismiss).toHaveBeenCalledTimes(1)
  })

  it('handles extremely long key and error strings gracefully without crashing', () => {
    const longKey = 'A'.repeat(200)
    const longError = 'Error '.repeat(50)
    const state: TranslationProgressToastState = {
      status: 'error',
      key: longKey,
      error: longError,
    }
    const { container } = render(<TranslationProgressToast state={state} />)
    expect(container).toBeInTheDocument()
    expect(screen.getByText(longError.trim())).toBeInTheDocument()
  })
})

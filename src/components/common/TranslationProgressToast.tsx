import React, { useEffect } from 'react'
import { useTranslation } from '../../i18n/useTranslation'
import './TranslationProgressToast.css'

export interface TranslationProgressToastState {
  status: 'idle' | 'translating' | 'retrying' | 'success' | 'error'
  attempt?: number
  maxRetries?: number
  delayRemainingMs?: number
  message?: string
  error?: string | null
  key?: string
  targetFile?: string
  isBatch?: boolean
  batchCurrent?: number
  batchTotal?: number
}

interface TranslationProgressToastProps {
  state: TranslationProgressToastState | null
  onDismiss?: () => void
  autoDismissMs?: number
}

export const TranslationProgressToast: React.FC<TranslationProgressToastProps> = ({
  state,
  onDismiss,
  autoDismissMs = 4000,
}) => {
  const { t } = useTranslation()

  // Auto-dismiss on success or completed state
  useEffect(() => {
    if (!state || (state.status !== 'success' && state.status !== 'error')) {
      return
    }

    if (state.status === 'success' && autoDismissMs > 0) {
      const timer = setTimeout(() => {
        onDismiss?.()
      }, autoDismissMs)
      return () => clearTimeout(timer)
    }
  }, [state, onDismiss, autoDismissMs])

  if (!state || state.status === 'idle') {
    return null
  }

  const {
    status,
    attempt = 0,
    maxRetries = 3,
    delayRemainingMs,
    message,
    error,
    key,
    isBatch,
    batchCurrent = 0,
    batchTotal = 0,
  } = state

  const renderContent = () => {
    if (isBatch) {
      if (status === 'translating') {
        return {
          title: t('progress.batchTranslating', {
            current: batchCurrent,
            total: batchTotal,
          }),
          subtitle: key ? `Key: ${key}` : undefined,
          icon: <div className="toast-spinner" data-testid="toast-spinner" />,
        }
      }

      if (status === 'retrying') {
        const seconds = Math.max(1, Math.ceil((delayRemainingMs || 0) / 1000))
        const title = delayRemainingMs && delayRemainingMs > 0
          ? t('progress.batchRetryingCountdown', {
              current: batchCurrent,
              total: batchTotal,
              attempt,
              maxRetries,
              seconds,
            })
          : t('progress.batchRetrying', {
              current: batchCurrent,
              total: batchTotal,
              attempt,
              maxRetries,
            })
        return {
          title,
          subtitle: key ? `Key: ${key}` : undefined,
          icon: <div className="toast-spinner retrying" data-testid="toast-spinner-retrying" />,
          badge: delayRemainingMs && delayRemainingMs > 0 ? `${seconds}s` : undefined,
        }
      }

      if (status === 'success') {
        return {
          title: message || t('progress.batchCompleted', { count: batchTotal }),
          icon: <span className="toast-icon success-icon" data-testid="toast-icon-success">✓</span>,
        }
      }

      return {
        title: error || message || t('progress.failed'),
        icon: <span className="toast-icon error-icon" data-testid="toast-icon-error">✕</span>,
      }
    }

    // Single translation mode
    if (status === 'translating') {
      return {
        title: key ? t('progress.translatingKey', { key }) : t('progress.translating'),
        icon: <div className="toast-spinner" data-testid="toast-spinner" />,
      }
    }

    if (status === 'retrying') {
      const seconds = Math.max(1, Math.ceil((delayRemainingMs || 0) / 1000))
      const title = delayRemainingMs && delayRemainingMs > 0
        ? t('progress.retryingWithCountdown', {
            attempt,
            maxRetries,
            seconds,
          })
        : t('progress.retrying', {
            attempt,
            maxRetries,
          })
      return {
        title,
        subtitle: key ? `Key: ${key}` : undefined,
        icon: <div className="toast-spinner retrying" data-testid="toast-spinner-retrying" />,
        badge: delayRemainingMs && delayRemainingMs > 0 ? `${seconds}s` : undefined,
      }
    }

    if (status === 'success') {
      return {
        title: message || (key ? t('progress.completedKey', { key }) : t('progress.completed')),
        icon: <span className="toast-icon success-icon" data-testid="toast-icon-success">✓</span>,
      }
    }

    // Error status
    const errorTitle =
      error ||
      message ||
      (attempt >= maxRetries
        ? t('progress.failedAfterRetries', { retries: maxRetries })
        : t('progress.failed'))

    return {
      title: errorTitle,
      subtitle: key ? `Key: ${key}` : undefined,
      icon: <span className="toast-icon error-icon" data-testid="toast-icon-error">✕</span>,
    }
  }

  const { title, subtitle, icon, badge } = renderContent()

  return (
    <div
      className="translation-progress-toast-container"
      role="status"
      aria-live="polite"
      data-testid="translation-progress-toast-container"
    >
      <div
        className={`translation-progress-toast status-${status}`}
        data-testid="translation-progress-toast"
      >
        <div className="toast-content-wrapper">
          <div className="toast-icon-wrapper">{icon}</div>
          <div className="toast-text-block">
            <span className="toast-title" title={title}>
              {title}
            </span>
            {subtitle && (
              <span className="toast-subtitle" title={subtitle}>
                {subtitle}
              </span>
            )}
          </div>
          {badge && <span className="toast-badge-countdown">{badge}</span>}
        </div>
        {onDismiss && (
          <button
            type="button"
            className="toast-dismiss-btn"
            onClick={onDismiss}
            aria-label={t('progress.dismiss')}
            title={t('progress.dismiss')}
            data-testid="toast-dismiss-btn"
          >
            ✕
          </button>
        )}
      </div>
    </div>
  )
}

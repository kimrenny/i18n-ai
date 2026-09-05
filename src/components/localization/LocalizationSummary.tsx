import React from 'react'
import type { LocalizationComparisonResult } from '../../types/localization'
import { useTranslation } from '../../i18n/useTranslation'

interface LocalizationSummaryProps {
  comparisonResult: LocalizationComparisonResult
  onOpenAddKeyModal?: () => void
  onOpenAddMissingModal?: () => void
  onNavigateMissing?: () => void
  onNavigateEmpty?: () => void
  onStartBatchTranslate?: () => void
  isBatchTranslating?: boolean
}

export const LocalizationSummary: React.FC<LocalizationSummaryProps> = ({
  comparisonResult,
  onOpenAddKeyModal,
  onOpenAddMissingModal,
  onNavigateMissing,
  onNavigateEmpty,
  onStartBatchTranslate,
  isBatchTranslating = false,
}) => {
  const { t } = useTranslation()
  const hasMissing = comparisonResult.incompleteKeysCount > 0
  const hasEmpty = comparisonResult.emptyKeysCount > 0
  const totalUntranslated =
    comparisonResult.incompleteKeysCount + comparisonResult.emptyKeysCount

  return (
    <div className="diff-summary-bar" aria-label={t('summary.comparisonSummaryAria')}>
      <div className="summary-stats-grid">
        <div className="summary-stat">
          <span className="stat-label">{t('summary.filesCompared')}:</span>
          <span className="stat-value">{comparisonResult.comparedFileCount}</span>
        </div>
        <div className="summary-stat">
          <span className="stat-label">{t('summary.uniqueKeys')}:</span>
          <span className="stat-value">{comparisonResult.totalUniqueKeys}</span>
        </div>
        <div className="summary-stat">
          <span className="stat-label">{t('summary.completeKeys')}:</span>
          <span className="stat-value stat-complete">
            {comparisonResult.completeKeysCount}
          </span>
        </div>
        <div className="summary-stat">
          <span className="stat-label">{t('summary.missingKeys')}:</span>
          {hasMissing && onNavigateMissing ? (
            <button
              type="button"
              className="summary-stat-btn stat-missing-btn"
              onClick={onNavigateMissing}
              title={t('summary.interactiveMissingHint')}
              aria-label={t('summary.navigateMissingAria', { count: comparisonResult.incompleteKeysCount })}
            >
              <span className="stat-value stat-missing">
                {comparisonResult.incompleteKeysCount}
              </span>
            </button>
          ) : (
            <span
              className={`stat-value ${hasMissing ? 'stat-missing' : 'stat-zero'}`}
            >
              {comparisonResult.incompleteKeysCount}
            </span>
          )}
        </div>
        <div className="summary-stat">
          <span className="stat-label">{t('summary.emptyKeys')}:</span>
          {hasEmpty && onNavigateEmpty ? (
            <button
              type="button"
              className="summary-stat-btn stat-empty-btn"
              onClick={onNavigateEmpty}
              title={t('summary.interactiveEmptyHint')}
              aria-label={t('summary.navigateEmptyAria', { count: comparisonResult.emptyKeysCount })}
            >
              <span className="stat-value stat-empty">
                {comparisonResult.emptyKeysCount}
              </span>
            </button>
          ) : (
            <span
              className={`stat-value ${hasEmpty ? 'stat-empty' : 'stat-zero'}`}
            >
              {comparisonResult.emptyKeysCount}
            </span>
          )}
        </div>
      </div>

      <div className="summary-actions">
        {onStartBatchTranslate && (
          <button
            type="button"
            className="batch-translate-btn"
            onClick={onStartBatchTranslate}
            disabled={totalUntranslated === 0 || isBatchTranslating}
            title={
              totalUntranslated > 0
                ? `${t('translation.translateAll')} (${totalUntranslated})`
                : t('summary.allComplete')
            }
          >
            {isBatchTranslating
              ? t('translation.translating')
              : `${t('translation.translateAll')} (${totalUntranslated})`}
          </button>
        )}
        {onOpenAddKeyModal && (
          <button
            type="button"
            className="add-key-trigger-btn"
            onClick={onOpenAddKeyModal}
            title={t('addKey.title')}
            data-testid="open-add-key-modal-btn"
          >
            {t('addKey.button')}
          </button>
        )}
        <button
          type="button"
          className="add-missing-btn"
          onClick={onOpenAddMissingModal}
          disabled={!hasMissing}
        >
          {hasMissing ? t('nav.addMissingKeys') : t('nav.allKeysPresent')}
        </button>
      </div>
    </div>
  )
}

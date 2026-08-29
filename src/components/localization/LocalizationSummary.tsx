import React from 'react'
import type { LocalizationComparisonResult } from '../../types/localization'

interface LocalizationSummaryProps {
  comparisonResult: LocalizationComparisonResult
  onOpenAddMissingModal?: () => void
  onNavigateMissing?: () => void
  onNavigateEmpty?: () => void
  onStartBatchTranslate?: () => void
  isBatchTranslating?: boolean
}

export const LocalizationSummary: React.FC<LocalizationSummaryProps> = ({
  comparisonResult,
  onOpenAddMissingModal,
  onNavigateMissing,
  onNavigateEmpty,
  onStartBatchTranslate,
  isBatchTranslating = false,
}) => {
  const hasMissing = comparisonResult.incompleteKeysCount > 0
  const hasEmpty = comparisonResult.emptyKeysCount > 0
  const totalUntranslated =
    comparisonResult.incompleteKeysCount + comparisonResult.emptyKeysCount

  return (
    <div className="diff-summary-bar" aria-label="Comparison summary">
      <div className="summary-stats-grid">
        <div className="summary-stat">
          <span className="stat-label">Files compared:</span>
          <span className="stat-value">{comparisonResult.comparedFileCount}</span>
        </div>
        <div className="summary-stat">
          <span className="stat-label">Unique keys:</span>
          <span className="stat-value">{comparisonResult.totalUniqueKeys}</span>
        </div>
        <div className="summary-stat">
          <span className="stat-label">Complete keys:</span>
          <span className="stat-value stat-complete">
            {comparisonResult.completeKeysCount}
          </span>
        </div>
        <div className="summary-stat">
          <span className="stat-label">Missing keys:</span>
          {hasMissing && onNavigateMissing ? (
            <button
              type="button"
              className="summary-stat-btn stat-missing-btn"
              onClick={onNavigateMissing}
              title={`Click to navigate ${comparisonResult.incompleteKeysCount} missing keys`}
              aria-label={`Navigate ${comparisonResult.incompleteKeysCount} missing keys`}
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
          <span className="stat-label">Empty keys:</span>
          {hasEmpty && onNavigateEmpty ? (
            <button
              type="button"
              className="summary-stat-btn stat-empty-btn"
              onClick={onNavigateEmpty}
              title={`Click to navigate ${comparisonResult.emptyKeysCount} empty keys`}
              aria-label={`Navigate ${comparisonResult.emptyKeysCount} empty keys`}
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
                ? `Translate all ${totalUntranslated} missing and empty entries with AI`
                : 'All keys are translated'
            }
          >
            {isBatchTranslating
              ? 'Translating Batch...'
              : `✨ Translate All (${totalUntranslated})`}
          </button>
        )}
        <button
          type="button"
          className="add-missing-btn"
          onClick={onOpenAddMissingModal}
          disabled={!hasMissing}
          title={
            hasMissing
              ? 'Add all missing keys as empty values'
              : 'All localization keys are present'
          }
        >
          {hasMissing ? 'Add Missing Keys' : '✓ All Keys Present'}
        </button>
      </div>
    </div>
  )
}

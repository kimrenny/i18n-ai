import React from 'react'
import type { LocalizationComparisonResult } from '../../types/localization'

interface LocalizationSummaryProps {
  comparisonResult: LocalizationComparisonResult
  onOpenAddMissingModal?: () => void
}

export const LocalizationSummary: React.FC<LocalizationSummaryProps> = ({
  comparisonResult,
  onOpenAddMissingModal,
}) => {
  const hasMissing = comparisonResult.incompleteKeysCount > 0

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
          <span className="stat-value stat-missing">
            {comparisonResult.incompleteKeysCount}
          </span>
        </div>
        <div className="summary-stat">
          <span className="stat-label">Empty keys:</span>
          <span className="stat-value stat-empty">
            {comparisonResult.emptyKeysCount}
          </span>
        </div>
      </div>

      <div className="summary-actions">
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

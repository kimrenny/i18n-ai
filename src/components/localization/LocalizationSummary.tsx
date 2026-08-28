import React from 'react'
import type { LocalizationComparisonResult } from '../../types/localization'

interface LocalizationSummaryProps {
  comparisonResult: LocalizationComparisonResult
}

export const LocalizationSummary: React.FC<LocalizationSummaryProps> = ({
  comparisonResult,
}) => {
  return (
    <div className="diff-summary-bar" aria-label="Comparison summary">
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
        <span className="stat-label">Keys with missing:</span>
        <span className="stat-value stat-missing">
          {comparisonResult.incompleteKeysCount}
        </span>
      </div>
    </div>
  )
}

import React from 'react'
import type { WorkspaceCoverageSummary } from '../../types/localizationCoverage'
import { useTranslation } from '../../i18n/useTranslation'
import './TranslationCoverageDashboard.css'

export interface TranslationCoverageDashboardProps {
  summary: WorkspaceCoverageSummary
  onSelectLanguage: (filename: string) => void
  onOpenFolder?: () => void
  onOpenProblems?: () => void
  totalProblems?: number
}

function getProgressColorClass(percentage: number): string {
  if (percentage >= 100) return 'progress-fill-100'
  if (percentage >= 80) return 'progress-fill-high'
  if (percentage >= 50) return 'progress-fill-mid'
  return 'progress-fill-low'
}

export const TranslationCoverageDashboard: React.FC<TranslationCoverageDashboardProps> = ({
  summary,
  onSelectLanguage,
  onOpenFolder,
  onOpenProblems,
  totalProblems,
}) => {
  const { t } = useTranslation()

  if (summary.totalFiles === 0) {
    return (
      <div className="coverage-dashboard-container" data-testid="coverage-dashboard-empty">
        <div className="coverage-empty-card">
          <div className="coverage-empty-icon">📁</div>
          <h2 className="coverage-empty-title">{t('dashboard.noLocalizationFiles')}</h2>
          <p className="coverage-empty-desc">{t('dashboard.singleLanguageHint')}</p>
          {onOpenFolder && (
            <button
              type="button"
              className="app-btn app-btn-md coverage-open-folder-btn"
              onClick={onOpenFolder}
            >
              📂 {t('app.selectFolder')}
            </button>
          )}
        </div>
      </div>
    )
  }

  const isSingleFile = summary.totalFiles === 1

  return (
    <div className="coverage-dashboard-container" data-testid="coverage-dashboard">
      {/* Header Area */}
      <header className="coverage-dashboard-header">
        <div className="coverage-header-titles">
          <h2 className="coverage-main-title">{t('dashboard.title')}</h2>
          <p className="coverage-subtitle">{t('dashboard.subtitle')}</p>
        </div>
        {summary.referenceLanguageCode && (
          <div className="coverage-reference-badge" data-testid="reference-language-badge">
            <span className="reference-badge-label">
              {t('dashboard.referenceLanguage', {
                language: summary.referenceLanguageName,
                file: summary.referenceFilename,
              })}
            </span>
          </div>
        )}
      </header>

      {/* Top Metric Cards */}
      <section className="coverage-metrics-grid" aria-label={t('dashboard.overview')}>
        <div className="coverage-metric-card" data-testid="metric-languages">
          <span className="metric-label">{t('dashboard.languages')}</span>
          <span className="metric-value">{summary.totalLanguages}</span>
        </div>

        <div className="coverage-metric-card" data-testid="metric-files">
          <span className="metric-label">{t('dashboard.files')}</span>
          <span className="metric-value">{summary.totalFiles}</span>
        </div>

        <div className="coverage-metric-card" data-testid="metric-total-keys">
          <span className="metric-label">{t('dashboard.totalKeys')}</span>
          <span className="metric-value">{summary.totalReferenceKeys.toLocaleString()}</span>
        </div>

        <div className="coverage-metric-card" data-testid="metric-average-coverage">
          <span className="metric-label">{t('dashboard.averageCoverage')}</span>
          <span className="metric-value">
            {summary.averageCoverage !== null ? `${summary.averageCoverage}%` : t('dashboard.notApplicable')}
          </span>
        </div>
      </section>

      {isSingleFile && (
        <div className="coverage-single-file-banner" role="status">
          ℹ {t('dashboard.singleLanguageHint')}
        </div>
      )}

      {/* Translation Coverage Section */}
      <section className="coverage-section" aria-label={t('dashboard.translationCoverage')}>
        <div className="coverage-section-header">
          <h3 className="coverage-section-title">{t('dashboard.translationCoverage')}</h3>
        </div>

        <div className="coverage-rows-list" role="list">
          {summary.items.map((item) => {
            const colorClass = getProgressColorClass(item.coveragePercentage)
            return (
              <div
                key={item.filename}
                className="coverage-row-card"
                role="button"
                tabIndex={0}
                data-testid={`coverage-row-${item.filename}`}
                onClick={() => onSelectLanguage(item.filename)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault()
                    onSelectLanguage(item.filename)
                  }
                }}
                title={`${item.languageName} (${item.filename}) - ${item.coveragePercentage}%`}
              >
                <div className="coverage-row-main">
                  {/* Language Title & Badges */}
                  <div className="coverage-row-info">
                    <span className="coverage-row-name">{item.languageName}</span>
                    <span className="coverage-row-code">{item.languageCode}</span>
                    {item.isReference && (
                      <span className="coverage-row-ref-pill" data-testid={`ref-pill-${item.filename}`}>
                        {t('dashboard.referenceBadge')}
                      </span>
                    )}
                  </div>

                  {/* Progress Bar & Percentage */}
                  <div className="coverage-row-progress-container">
                    <div className="coverage-progress-track" aria-hidden="true">
                      <div
                        className={`coverage-progress-fill ${colorClass}`}
                        style={{ width: `${item.coveragePercentage}%` }}
                      />
                    </div>
                    <span className="coverage-percentage-text">{item.coveragePercentage}%</span>
                  </div>

                  {/* Key Stats Breakdown */}
                  <div className="coverage-row-stats">
                    <span className="stat-pill stat-translated">
                      {t('dashboard.translatedRatio', {
                        translated: item.translatedKeysCount.toLocaleString(),
                        total: item.totalExpectedKeys.toLocaleString(),
                      })}
                    </span>

                    {!item.isReference && item.missingKeysCount > 0 && (
                      <span className="stat-pill stat-missing">
                        {t('dashboard.missingCount', { count: item.missingKeysCount })}
                      </span>
                    )}

                    {!item.isReference && item.emptyKeysCount > 0 && (
                      <span className="stat-pill stat-empty">
                        {t('dashboard.emptyCount', { count: item.emptyKeysCount })}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </section>

      {/* Bottom Insights Grid */}
      {!isSingleFile && (
        <div className="coverage-insights-grid">
          {/* Summary Card */}
          <div className="coverage-insight-card" data-testid="coverage-summary-card">
            <h4 className="insight-card-title">{t('dashboard.summary')}</h4>
            <div className="insight-stats-list">
              <div className="insight-stat-row">
                <span className="insight-stat-label">
                  {t('dashboard.missingTranslations', { count: summary.totalMissingKeys })}
                </span>
                <span className="insight-stat-val missing-val">{summary.totalMissingKeys}</span>
              </div>
              <div className="insight-stat-row">
                <span className="insight-stat-label">
                  {t('dashboard.emptyTranslations', { count: summary.totalEmptyKeys })}
                </span>
                <span className="insight-stat-val empty-val">{summary.totalEmptyKeys}</span>
              </div>
              <div className="insight-stat-row total-issues-row">
                <span className="insight-stat-label">
                  {t('dashboard.totalIssues', { count: summary.totalMissingKeys + summary.totalEmptyKeys })}
                </span>
                <span className="insight-stat-val total-val">
                  {summary.totalMissingKeys + summary.totalEmptyKeys}
                </span>
              </div>
            </div>
            {onOpenProblems && (
              <button
                type="button"
                className="app-btn app-btn-sm coverage-problems-btn"
                data-testid="dashboard-open-problems-btn"
                onClick={onOpenProblems}
              >
                {t('problems.title')} ({totalProblems ?? (summary.totalMissingKeys + summary.totalEmptyKeys)})
              </button>
            )}
          </div>

          {/* Least Complete Languages Card */}
          <div className="coverage-insight-card" data-testid="coverage-least-complete-card">
            <h4 className="insight-card-title">{t('dashboard.leastComplete')}</h4>
            {summary.leastCompleteLanguages.length === 0 ||
            summary.leastCompleteLanguages.every((l) => l.coveragePercentage === 100) ? (
              <p className="insight-empty-text">✓ {t('dashboard.allComplete')}</p>
            ) : (
              <div className="least-complete-list">
                {summary.leastCompleteLanguages.slice(0, 5).map((l) => (
                  <div
                    key={l.filename}
                    className="least-complete-item"
                    role="button"
                    tabIndex={0}
                    data-testid={`least-complete-${l.filename}`}
                    onClick={() => onSelectLanguage(l.filename)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault()
                        onSelectLanguage(l.filename)
                      }
                    }}
                    title={`${l.languageName} - ${l.coveragePercentage}% (${l.issuesCount} issues)`}
                  >
                    <div className="least-complete-left">
                      <span className="least-complete-name">{l.languageName}</span>
                      <span className="least-complete-percent">{l.coveragePercentage}%</span>
                    </div>
                    <span className="least-complete-badge">
                      {t('dashboard.issuesBadge', { count: l.issuesCount })}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

import React, { useState, useMemo } from 'react'
import type {
  LocalizationQualityIssue,
  WorkspaceQualitySummary,
  QualityIssueSeverity,
  QualityIssueType,
} from '../../types/localizationQuality'
import { filterQualityIssues } from '../../services/localizationQuality'
import { useTranslation } from '../../i18n/useTranslation'
import { ResizeHandle, type ResizeHandleProps } from '../common/ResizeHandle'
import './QualityPanel.css'

export interface QualityPanelProps {
  isOpen: boolean
  onClose: () => void
  summary: WorkspaceQualitySummary
  onNavigateQuality: (issue: LocalizationQualityIssue) => void
  height?: number
  isResizing?: boolean
  resizeHandleProps?: Partial<ResizeHandleProps>
}

export const QualityPanel: React.FC<QualityPanelProps> = ({
  isOpen,
  onClose,
  summary,
  onNavigateQuality,
  height,
  isResizing = false,
  resizeHandleProps,
}) => {
  const { t } = useTranslation()
  const [languageFilter, setLanguageFilter] = useState<string>('all')
  const [typeFilter, setTypeFilter] = useState<QualityIssueType | 'all'>('all')
  const [severityFilter, setSeverityFilter] = useState<QualityIssueSeverity | 'all'>('all')

  const filteredIssues = useMemo(() => {
    return filterQualityIssues(summary.issues, {
      language: languageFilter,
      type: typeFilter,
      severity: severityFilter,
    })
  }, [summary.issues, languageFilter, typeFilter, severityFilter])

  if (!isOpen) {
    return null
  }

  const availableFiles = Array.from(
    new Set(summary.issues.map((i) => i.filename))
  ).map((filename) => {
    const issue = summary.issues.find((i) => i.filename === filename)
    return {
      filename,
      languageName: issue?.languageName || filename,
    }
  })

  const getSeverityLabel = (severity: QualityIssueSeverity) => {
    switch (severity) {
      case 'error':
        return t('quality.severityError')
      case 'warning':
        return t('quality.severityWarning')
      case 'info':
        return t('quality.severityInfo')
    }
  }

  const getTypeLabel = (type: QualityIssueType) => {
    switch (type) {
      case 'missing_translation':
        return t('quality.typeMissing')
      case 'empty_translation':
        return t('quality.typeEmpty')
      case 'placeholder_mismatch':
        return t('quality.typePlaceholderMismatch')
      case 'tag_mismatch':
        return t('quality.typeTagMismatch')
      case 'same_as_reference':
        return t('quality.typeSameAsReference')
      case 'whitespace_mismatch':
        return t('quality.typeWhitespaceMismatch')
      case 'structural_conflict':
        return t('quality.typeStructuralConflict')
    }
  }

  return (
    <aside
      className={`quality-panel-container ${isResizing ? 'is-resizing' : ''}`}
      style={
        height !== undefined
          ? {
              height: `${height}px`,
              minHeight: '120px',
              maxHeight: '600px',
              transition: isResizing ? 'none' : undefined,
            }
          : undefined
      }
      data-testid="quality-panel"
      aria-label={t('quality.ariaLabel')}
    >
      {/* Top Vertical Resize Handle */}
      {resizeHandleProps?.onPointerDown && (
        <ResizeHandle
          direction="vertical"
          onPointerDown={resizeHandleProps.onPointerDown}
          onPointerMove={resizeHandleProps.onPointerMove}
          onPointerUp={resizeHandleProps.onPointerUp}
          onKeyDown={resizeHandleProps.onKeyDown}
          isResizing={isResizing}
          valueNow={resizeHandleProps.valueNow ?? height}
          valueMin={resizeHandleProps.valueMin ?? 120}
          valueMax={resizeHandleProps.valueMax ?? 600}
        />
      )}

      {/* Quality Panel Header */}
      <div className="quality-panel-header">
        <div className="quality-header-left">
          <span className="quality-panel-title">{t('quality.title')}</span>
          <span
            className={`quality-header-badge ${
              summary.totalIssues > 0 ? 'badge-has-issues' : 'badge-no-issues'
            }`}
            data-testid="quality-total-badge"
          >
            {summary.totalIssues}
          </span>
          {summary.totalIssues > 0 && (
            <div className="quality-breakdown-badges">
              {summary.totalErrors > 0 && (
                <span className="quality-sub-badge badge-error" title={t('quality.errors')}>
                  {summary.totalErrors}E
                </span>
              )}
              {summary.totalWarnings > 0 && (
                <span className="quality-sub-badge badge-warning" title={t('quality.warnings')}>
                  {summary.totalWarnings}W
                </span>
              )}
              {summary.totalInfos > 0 && (
                <span className="quality-sub-badge badge-info" title={t('quality.info')}>
                  {summary.totalInfos}I
                </span>
              )}
            </div>
          )}
        </div>

        {/* Filters */}
        <div className="quality-header-filters">
          <div className="quality-filter-group">
            <select
              className="quality-filter-select"
              aria-label={t('quality.allLanguages')}
              data-testid="quality-language-filter"
              value={languageFilter}
              onChange={(e) => setLanguageFilter(e.target.value)}
            >
              <option value="all">{t('quality.allLanguages')}</option>
              {availableFiles.map((f) => (
                <option key={f.filename} value={f.filename}>
                  {f.languageName} ({f.filename})
                </option>
              ))}
            </select>
          </div>

          <div className="quality-filter-group">
            <select
              className="quality-filter-select"
              aria-label={t('quality.allSeverities')}
              data-testid="quality-severity-filter"
              value={severityFilter}
              onChange={(e) =>
                setSeverityFilter(e.target.value as QualityIssueSeverity | 'all')
              }
            >
              <option value="all">{t('quality.allSeverities')}</option>
              <option value="error">
                {t('quality.severityError')} ({summary.totalErrors})
              </option>
              <option value="warning">
                {t('quality.severityWarning')} ({summary.totalWarnings})
              </option>
              <option value="info">
                {t('quality.severityInfo')} ({summary.totalInfos})
              </option>
            </select>
          </div>

          <div className="quality-filter-group">
            <select
              className="quality-filter-select"
              aria-label={t('quality.allTypes')}
              data-testid="quality-type-filter"
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value as QualityIssueType | 'all')}
            >
              <option value="all">{t('quality.allTypes')}</option>
              <option value="missing_translation">{t('quality.typeMissing')}</option>
              <option value="empty_translation">{t('quality.typeEmpty')}</option>
              <option value="placeholder_mismatch">{t('quality.typePlaceholderMismatch')}</option>
              <option value="tag_mismatch">{t('quality.typeTagMismatch')}</option>
              <option value="same_as_reference">{t('quality.typeSameAsReference')}</option>
              <option value="whitespace_mismatch">{t('quality.typeWhitespaceMismatch')}</option>
              <option value="structural_conflict">{t('quality.typeStructuralConflict')}</option>
            </select>
          </div>
        </div>

        {/* Panel Actions */}
        <div className="quality-header-actions">
          <button
            type="button"
            className="quality-close-btn"
            aria-label={t('quality.closePanel')}
            title={t('quality.closePanel')}
            data-testid="quality-close-btn"
            onClick={onClose}
          >
            ✕
          </button>
        </div>
      </div>

      {/* Quality Panel Body */}
      <div className="quality-panel-body" role="region" aria-live="polite">
        {filteredIssues.length === 0 ? (
          summary.totalIssues === 0 ? (
            <div
              className="quality-empty-state"
              data-testid="quality-empty-all-clean"
            >
              <span className="quality-empty-icon" aria-hidden="true">
                ✓
              </span>
              <span className="quality-empty-title">
                {t('quality.noIssuesTitle')}
              </span>
              <span className="quality-empty-desc">
                {t('quality.noIssuesDesc')}
              </span>
            </div>
          ) : (
            <div
              className="quality-empty-state"
              data-testid="quality-empty-filtered"
            >
              <span className="quality-empty-desc">
                {t('quality.noFilteredIssues')}
              </span>
            </div>
          )
        ) : (
          <div className="quality-issues-list" role="list">
            {filteredIssues.map((issue) => (
              <div
                key={issue.id}
                className={`quality-issue-row quality-row-${issue.severity}`}
                role="button"
                tabIndex={0}
                data-testid={`quality-item-${issue.id}`}
                onClick={() => onNavigateQuality(issue)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault()
                    onNavigateQuality(issue)
                  }
                }}
                aria-label={`${issue.key}: ${issue.message} (${issue.languageName})`}
              >
                <span
                  className={`quality-issue-severity-badge severity-${issue.severity}`}
                >
                  {getSeverityLabel(issue.severity)}
                </span>
                <span className="quality-issue-type-badge">
                  {getTypeLabel(issue.type)}
                </span>
                <span className="quality-issue-key" title={issue.key}>
                  {issue.key}
                </span>
                <span className="quality-issue-lang">{issue.languageName}</span>
                <span className="quality-issue-message" title={issue.message}>
                  {issue.message}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </aside>
  )
}

import React, { useState, useMemo } from 'react'
import type {
  WorkspacePreflightReport,
  PreflightCheckCategory,
} from '../../types/localizationValidation'
import type {
  LocalizationQualityIssue,
  QualityIssueSeverity,
  QualityIssueType,
} from '../../types/localizationQuality'
import { useTranslation } from '../../i18n/useTranslation'
import { ResizeHandle, type ResizeHandleProps } from '../common/ResizeHandle'
import './PreflightValidatorPanel.css'

export interface PreflightValidatorPanelProps {
  isOpen: boolean
  onClose: () => void
  report: WorkspacePreflightReport
  onRunValidation?: () => void
  onNavigateQuality: (issue: LocalizationQualityIssue) => void
  height?: number
  isResizing?: boolean
  resizeHandleProps?: Partial<ResizeHandleProps>
}

export const PreflightValidatorPanel: React.FC<PreflightValidatorPanelProps> = ({
  isOpen,
  onClose,
  report,
  onRunValidation,
  onNavigateQuality,
  height,
  isResizing = false,
  resizeHandleProps,
}) => {
  const { t } = useTranslation()
  const [selectedCategory, setSelectedCategory] = useState<PreflightCheckCategory | 'all'>('all')
  const [selectedFile, setSelectedFile] = useState<string | 'all'>('all')
  const [isValidating, setIsValidating] = useState(false)

  const handleRunValidationClick = () => {
    setIsValidating(true)
    onRunValidation?.()
    setTimeout(() => {
      setIsValidating(false)
    }, 400)
  }

  const filteredIssues = useMemo(() => {
    let result = report.allIssues
    if (selectedCategory !== 'all') {
      const activeCheck = report.checks.find((c) => c.category === selectedCategory)
      if (activeCheck) {
        result = result.filter((issue) => issue.type === activeCheck.type)
      }
    }
    if (selectedFile !== 'all') {
      result = result.filter((issue) => issue.filename === selectedFile)
    }
    return result
  }, [report.allIssues, report.checks, selectedCategory, selectedFile])

  if (!isOpen) {
    return null
  }

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

  const getStatusBadge = () => {
    switch (report.status) {
      case 'PASS':
        return (
          <span className="preflight-status-badge badge-pass" data-testid="preflight-status-badge">
            ✓ {t('preflight.statusPass')}
          </span>
        )
      case 'WARNINGS':
        return (
          <span className="preflight-status-badge badge-warnings" data-testid="preflight-status-badge">
            ⚠ {t('preflight.statusWarningsBadge')}
          </span>
        )
      case 'FAILED':
        return (
          <span className="preflight-status-badge badge-failed" data-testid="preflight-status-badge">
            ✕ {t('preflight.statusFailedBadge')}
          </span>
        )
    }
  }

  const getHeroDescription = () => {
    switch (report.status) {
      case 'PASS':
        return t('preflight.readyDesc')
      case 'WARNINGS':
        return t('preflight.warningsDesc')
      case 'FAILED':
        return t('preflight.failedDesc')
    }
  }

  return (
    <aside
      className={`preflight-panel-container ${isResizing ? 'is-resizing' : ''}`}
      style={
        height !== undefined
          ? {
              height: `${height}px`,
              minHeight: '140px',
              maxHeight: '650px',
              transition: isResizing ? 'none' : undefined,
            }
          : undefined
      }
      data-testid="preflight-panel"
      aria-label={t('preflight.ariaLabel')}
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
          valueMin={resizeHandleProps.valueMin ?? 140}
          valueMax={resizeHandleProps.valueMax ?? 650}
        />
      )}

      {/* Pre-flight Header */}
      <div className="preflight-panel-header">
        <div className="preflight-header-left">
          <span className="preflight-panel-icon" aria-hidden="true">
            🚀
          </span>
          <span className="preflight-panel-title">{t('preflight.title')}</span>
          {getStatusBadge()}
        </div>

        <div className="preflight-header-actions">
          <button
            type="button"
            className={`preflight-run-btn ${isValidating ? 'is-validating' : ''}`}
            onClick={handleRunValidationClick}
            data-testid="preflight-run-btn"
            title={t('preflight.runValidationTooltip')}
            aria-label={t('preflight.runValidation')}
          >
            <span className="preflight-run-icon" aria-hidden="true">
              🔄
            </span>
            <span>{t('preflight.runValidation')}</span>
          </button>

          <button
            type="button"
            className="preflight-close-btn"
            aria-label={t('preflight.closePanel')}
            title={t('preflight.closePanel')}
            data-testid="preflight-close-btn"
            onClick={onClose}
          >
            ✕
          </button>
        </div>
      </div>

      {/* Pre-flight Scrollable Body */}
      <div className="preflight-panel-body" role="region" aria-live="polite">
        {/* Readiness Hero Card */}
        <section
          className={`preflight-hero-card hero-status-${report.status.toLowerCase()}`}
          data-testid="preflight-hero-card"
        >
          <div className="preflight-hero-main">
            <div className="preflight-hero-status-row">
              <span className="preflight-hero-icon" aria-hidden="true">
                {report.status === 'PASS' ? '✓' : report.status === 'WARNINGS' ? '⚠' : '✕'}
              </span>
              <div className="preflight-hero-text">
                <h3 className="preflight-hero-title">
                  {report.status === 'PASS'
                    ? t('preflight.readyTitle')
                    : report.status === 'WARNINGS'
                    ? t('preflight.warningsTitle')
                    : t('preflight.failedTitle')}
                </h3>
                <p className="preflight-hero-desc">{getHeroDescription()}</p>
              </div>
            </div>

            <div className="preflight-hero-pills">
              <span className={`preflight-pill pill-error ${report.totalErrors > 0 ? 'has-count' : ''}`}>
                <strong className="pill-num">{report.totalErrors}</strong> {t('preflight.errors')}
              </span>
              <span className={`preflight-pill pill-warning ${report.totalWarnings > 0 ? 'has-count' : ''}`}>
                <strong className="pill-num">{report.totalWarnings}</strong> {t('preflight.warnings')}
              </span>
              <span className={`preflight-pill pill-info ${report.totalInfo > 0 ? 'has-count' : ''}`}>
                <strong className="pill-num">{report.totalInfo}</strong> {t('preflight.info')}
              </span>
              <span className="preflight-pill-separator">|</span>
              <span className="preflight-pill pill-scope">
                <strong>{report.affectedFilesCount}</strong> {t('preflight.filesAffected')}
              </span>
              <span className="preflight-pill pill-scope">
                <strong>{report.affectedLanguagesCount}</strong> {t('preflight.languagesAffected')}
              </span>
              <span className="preflight-pill pill-scope">
                <strong>{report.affectedKeysCount}</strong> {t('preflight.keysAffected')}
              </span>
            </div>
          </div>
        </section>

        {/* Overview Grid: Checks & Affected Scope */}
        <div className="preflight-overview-grid">
          {/* Checks Summary Card */}
          <section className="preflight-card preflight-checks-card" aria-labelledby="preflight-checks-heading">
            <div className="preflight-card-header">
              <h4 id="preflight-checks-heading" className="preflight-card-title">
                {t('preflight.checksTitle')}
              </h4>
              {selectedCategory !== 'all' && (
                <button
                  type="button"
                  className="preflight-card-reset-btn"
                  onClick={() => setSelectedCategory('all')}
                  data-testid="preflight-reset-category-filter"
                >
                  {t('preflight.showAllChecks')}
                </button>
              )}
            </div>

            <div className="preflight-checks-list" role="list">
              {report.checks.map((check) => {
                const isSelected = selectedCategory === check.category
                const statusIcon =
                  check.count === 0 ? '✓' : check.severity === 'error' ? '✕' : check.severity === 'warning' ? '⚠' : 'ⓘ'
                return (
                  <button
                    key={check.category}
                    type="button"
                    className={`preflight-check-row check-status-${check.status} ${
                      isSelected ? 'is-selected' : ''
                    }`}
                    data-testid={`preflight-check-${check.category}`}
                    onClick={() =>
                      setSelectedCategory(isSelected ? 'all' : check.category)
                    }
                    aria-pressed={isSelected}
                  >
                    <span className="preflight-check-icon" aria-hidden="true">
                      {statusIcon}
                    </span>
                    <span className="preflight-check-label">{t(check.labelKey)}</span>
                    <span className={`preflight-check-count badge-${check.severity}`}>
                      {check.count}
                    </span>
                  </button>
                )
              })}
            </div>
          </section>

          {/* Affected Files & Languages Card */}
          <section className="preflight-card preflight-scope-card" aria-labelledby="preflight-scope-heading">
            <div className="preflight-card-header">
              <h4 id="preflight-scope-heading" className="preflight-card-title">
                {t('preflight.affectedFilesTitle')}
              </h4>
              {selectedFile !== 'all' && (
                <button
                  type="button"
                  className="preflight-card-reset-btn"
                  onClick={() => setSelectedFile('all')}
                  data-testid="preflight-reset-file-filter"
                >
                  {t('preflight.showAllFiles')}
                </button>
              )}
            </div>

            <div className="preflight-files-list" role="list">
              {report.affectedFiles.length === 0 ? (
                <div className="preflight-empty-files">{t('preflight.noAffectedFiles')}</div>
              ) : (
                report.affectedFiles.map((file) => {
                  const isSelected = selectedFile === file.filename
                  return (
                    <button
                      key={file.filename}
                      type="button"
                      className={`preflight-file-row ${isSelected ? 'is-selected' : ''}`}
                      data-testid={`preflight-file-${file.filename}`}
                      onClick={() =>
                        setSelectedFile(isSelected ? 'all' : file.filename)
                      }
                      aria-pressed={isSelected}
                    >
                      <div className="preflight-file-info">
                        <span className="preflight-file-name">{file.filename}</span>
                        <span className="preflight-file-lang">{file.languageName}</span>
                      </div>
                      <div className="preflight-file-badges">
                        {file.errorCount > 0 && (
                          <span className="preflight-file-badge badge-error">
                            {file.errorCount}E
                          </span>
                        )}
                        {file.warningCount > 0 && (
                          <span className="preflight-file-badge badge-warning">
                            {file.warningCount}W
                          </span>
                        )}
                        {file.infoCount > 0 && (
                          <span className="preflight-file-badge badge-info">
                            {file.infoCount}I
                          </span>
                        )}
                      </div>
                    </button>
                  )
                })
              )}
            </div>
          </section>
        </div>

        {/* Actionable Issues Section */}
        <section className="preflight-issues-section" aria-labelledby="preflight-issues-heading">
          <div className="preflight-issues-header">
            <h4 id="preflight-issues-heading" className="preflight-issues-title">
              {t('preflight.issuesSectionTitle')} ({filteredIssues.length})
            </h4>

            {(selectedCategory !== 'all' || selectedFile !== 'all') && (
              <div className="preflight-active-filters">
                {selectedCategory !== 'all' && (
                  <span className="preflight-filter-pill">
                    {t(
                      report.checks.find((c) => c.category === selectedCategory)
                        ?.labelKey || 'preflight.filter'
                    )}
                    <button
                      type="button"
                      className="preflight-filter-remove"
                      onClick={() => setSelectedCategory('all')}
                      aria-label="Remove category filter"
                    >
                      ×
                    </button>
                  </span>
                )}
                {selectedFile !== 'all' && (
                  <span className="preflight-filter-pill">
                    {selectedFile}
                    <button
                      type="button"
                      className="preflight-filter-remove"
                      onClick={() => setSelectedFile('all')}
                      aria-label="Remove file filter"
                    >
                      ×
                    </button>
                  </span>
                )}
              </div>
            )}
          </div>

          <div className="preflight-issues-body">
            {filteredIssues.length === 0 ? (
              report.totalIssues === 0 ? (
                <div className="preflight-clean-state" data-testid="preflight-clean-state">
                  <span className="preflight-clean-icon" aria-hidden="true">
                    ✓
                  </span>
                  <span className="preflight-clean-title">{t('preflight.allCleanTitle')}</span>
                  <span className="preflight-clean-desc">{t('preflight.allCleanDesc')}</span>
                </div>
              ) : (
                <div className="preflight-clean-state" data-testid="preflight-no-filtered-issues">
                  <span className="preflight-clean-desc">{t('preflight.noFilteredIssues')}</span>
                </div>
              )
            ) : (
              <div className="preflight-issues-list" role="list">
                {filteredIssues.map((issue) => (
                  <div
                    key={issue.id}
                    className={`preflight-issue-row issue-severity-${issue.severity}`}
                    role="button"
                    tabIndex={0}
                    data-testid={`preflight-issue-${issue.id}`}
                    onClick={() => onNavigateQuality(issue)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault()
                        onNavigateQuality(issue)
                      }
                    }}
                    aria-label={`${issue.key}: ${issue.message} (${issue.languageName})`}
                  >
                    <span className={`preflight-issue-severity severity-${issue.severity}`}>
                      {getSeverityLabel(issue.severity)}
                    </span>
                    <span className="preflight-issue-type">{getTypeLabel(issue.type)}</span>
                    <span className="preflight-issue-key" title={issue.key}>
                      {issue.key}
                    </span>
                    <span className="preflight-issue-file">{issue.filename}</span>
                    <span className="preflight-issue-msg" title={issue.message}>
                      {issue.message}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>
      </div>
    </aside>
  )
}

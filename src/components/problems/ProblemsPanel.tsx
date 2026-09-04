import React, { useState, useMemo } from 'react'
import type {
  LocalizationProblem,
  WorkspaceProblemsSummary,
} from '../../types/localizationProblems'
import {
  filterProblems,
  groupProblemsByLanguage,
} from '../../services/localizationProblems'
import { useTranslation } from '../../i18n/useTranslation'
import { ResizeHandle, type ResizeHandleProps } from '../common/ResizeHandle'
import './ProblemsPanel.css'

export interface ProblemsPanelProps {
  isOpen: boolean
  onClose: () => void
  summary: WorkspaceProblemsSummary
  onNavigateProblem: (problem: LocalizationProblem) => void
  height?: number
  isResizing?: boolean
  resizeHandleProps?: Partial<ResizeHandleProps>
}

export const ProblemsPanel: React.FC<ProblemsPanelProps> = ({
  isOpen,
  onClose,
  summary,
  onNavigateProblem,
  height,
  isResizing = false,
  resizeHandleProps,
}) => {
  const { t } = useTranslation()
  const [languageFilter, setLanguageFilter] = useState<string>('all')
  const [typeFilter, setTypeFilter] = useState<string>('all')

  const filteredProblems = useMemo(() => {
    return filterProblems(summary.problems, languageFilter, typeFilter)
  }, [summary.problems, languageFilter, typeFilter])

  const filteredGroups = useMemo(() => {
    return groupProblemsByLanguage(filteredProblems)
  }, [filteredProblems])

  if (!isOpen) {
    return null
  }

  // Available languages for filter dropdown
  const availableLanguageOptions = summary.groups.filter((g) => g.totalCount > 0)

  return (
    <aside
      className={`problems-panel-container ${isResizing ? 'is-resizing' : ''}`}
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
      data-testid="problems-panel"
      aria-label={t('problems.ariaLabel')}
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

      {/* Problems Panel Header */}
      <div className="problems-panel-header">
        <div className="problems-header-left">
          <span className="problems-panel-title">{t('problems.title')}</span>
          <span
            className={`problems-header-badge ${
              summary.totalProblems > 0 ? 'badge-has-problems' : 'badge-no-problems'
            }`}
            data-testid="problems-total-badge"
          >
            {summary.totalProblems}
          </span>
        </div>

        {/* Filters */}
        <div className="problems-header-filters">
          <div className="problems-filter-group">
            <select
              className="problems-filter-select"
              aria-label={t('problems.allLanguages')}
              data-testid="problems-language-filter"
              value={languageFilter}
              onChange={(e) => setLanguageFilter(e.target.value)}
            >
              <option value="all">{t('problems.allLanguages')}</option>
              {availableLanguageOptions.map((g) => (
                <option key={g.filename} value={g.filename}>
                  {g.languageName} ({g.totalCount})
                </option>
              ))}
            </select>
          </div>

          <div className="problems-filter-group">
            <select
              className="problems-filter-select"
              aria-label={t('problems.allTypes')}
              data-testid="problems-type-filter"
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
            >
              <option value="all">
                {t('problems.allTypes')} ({summary.totalProblems})
              </option>
              <option value="missing">
                {t('problems.typeMissing')} ({summary.totalMissing})
              </option>
              <option value="empty">
                {t('problems.typeEmpty')} ({summary.totalEmpty})
              </option>
            </select>
          </div>
        </div>

        {/* Panel Actions */}
        <div className="problems-header-actions">
          <button
            type="button"
            className="problems-action-btn"
            aria-label={t('problems.closePanel')}
            title={t('problems.closePanel')}
            data-testid="problems-close-btn"
            onClick={onClose}
          >
            ✕
          </button>
        </div>
      </div>

      {/* Problems Panel Body */}
      <div className="problems-panel-body" role="region" aria-live="polite">
        {filteredProblems.length === 0 ? (
          summary.totalProblems === 0 ? (
            <div
              className="problems-empty-state"
              data-testid="problems-empty-all-complete"
            >
              <span className="problems-empty-icon" aria-hidden="true">
                ✓
              </span>
              <span className="problems-empty-title">
                {t('problems.noProblemsTitle')}
              </span>
              <span className="problems-empty-desc">
                {t('problems.noProblemsDesc')}
              </span>
            </div>
          ) : (
            <div
              className="problems-empty-state"
              data-testid="problems-empty-filtered"
            >
              <span className="problems-empty-desc">
                {t('problems.noFilteredProblems')}
              </span>
            </div>
          )
        ) : (
          <div className="problems-groups-list">
            {filteredGroups.map((group) => {
              const missingList = group.problems.filter((p) => p.type === 'missing')
              const emptyList = group.problems.filter((p) => p.type === 'empty')

              return (
                <div
                  key={group.filename}
                  className="problems-language-group"
                  data-testid={`problems-group-${group.filename}`}
                >
                  <div className="problems-group-header">
                    <span className="problems-group-name">
                      {group.languageName}
                    </span>
                    <span className="problems-group-file">
                      ({group.filename})
                    </span>
                    <span className="problems-group-badge">
                      {group.totalCount}
                    </span>
                  </div>

                  {/* Missing Problems Sub-list */}
                  {missingList.length > 0 && (
                    <div className="problems-subgroup">
                      <div className="problems-subgroup-header missing-subgroup-header">
                        <span className="type-dot dot-missing" aria-hidden="true">
                          ●
                        </span>
                        <span className="subgroup-title">
                          {t('problems.typeMissing')}
                        </span>
                        <span className="subgroup-count">
                          ({missingList.length})
                        </span>
                      </div>
                      <div className="problems-items-list" role="list">
                        {missingList.map((problem) => (
                          <div
                            key={problem.id}
                            className="problem-row-item missing-problem-row"
                            role="button"
                            tabIndex={0}
                            data-testid={`problem-item-${problem.id}`}
                            onClick={() => onNavigateProblem(problem)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' || e.key === ' ') {
                                e.preventDefault()
                                onNavigateProblem(problem)
                              }
                            }}
                            aria-label={t('problems.problemItemAria', {
                              key: problem.key,
                              type: t('problems.typeMissing'),
                              language: problem.languageName,
                            })}
                          >
                            <span className="problem-item-icon dot-missing" aria-hidden="true">
                              ●
                            </span>
                            <span className="problem-item-key">{problem.key}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Empty Problems Sub-list */}
                  {emptyList.length > 0 && (
                    <div className="problems-subgroup">
                      <div className="problems-subgroup-header empty-subgroup-header">
                        <span className="type-dot dot-empty" aria-hidden="true">
                          ●
                        </span>
                        <span className="subgroup-title">
                          {t('problems.typeEmpty')}
                        </span>
                        <span className="subgroup-count">
                          ({emptyList.length})
                        </span>
                      </div>
                      <div className="problems-items-list" role="list">
                        {emptyList.map((problem) => (
                          <div
                            key={problem.id}
                            className="problem-row-item empty-problem-row"
                            role="button"
                            tabIndex={0}
                            data-testid={`problem-item-${problem.id}`}
                            onClick={() => onNavigateProblem(problem)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' || e.key === ' ') {
                                e.preventDefault()
                                onNavigateProblem(problem)
                              }
                            }}
                            aria-label={t('problems.problemItemAria', {
                              key: problem.key,
                              type: t('problems.typeEmpty'),
                              language: problem.languageName,
                            })}
                          >
                            <span className="problem-item-icon dot-empty" aria-hidden="true">
                              ●
                            </span>
                            <span className="problem-item-key">{problem.key}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </aside>
  )
}

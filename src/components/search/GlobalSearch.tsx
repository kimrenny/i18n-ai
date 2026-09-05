import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import type { ParsedLocalizationFile } from '../../types/localization'
import type { LocalizationSearchResult } from '../../types/localizationSearch'
import {
  searchWorkspaceLocalization,
  splitMatchRanges,
} from '../../services/localizationSearch'
import { useTranslation } from '../../i18n/useTranslation'
import './GlobalSearch.css'

export interface GlobalSearchProps {
  isOpen: boolean
  onClose: () => void
  onSelectResult: (result: LocalizationSearchResult) => void
  files: readonly ParsedLocalizationFile[]
  isWorkspaceOpen: boolean
}

const HighlightedText: React.FC<{ text: string; query: string; className?: string }> = ({
  text,
  query,
  className = '',
}) => {
  const segments = useMemo(() => splitMatchRanges(text, query), [text, query])

  return (
    <span className={className}>
      {segments.map((seg, idx) =>
        seg.isMatch ? (
          <mark key={idx} className="search-highlight">
            {seg.text}
          </mark>
        ) : (
          <React.Fragment key={idx}>{seg.text}</React.Fragment>
        )
      )}
    </span>
  )
}

export const GlobalSearch: React.FC<GlobalSearchProps> = ({
  isOpen,
  onClose,
  onSelectResult,
  files,
  isWorkspaceOpen,
}) => {
  const { t } = useTranslation()
  const [query, setQuery] = useState('')
  const [selectedIndex, setSelectedIndex] = useState(0)
  const inputRef = useRef<HTMLInputElement | null>(null)
  const listRef = useRef<HTMLDivElement | null>(null)

  const searchResults = useMemo(() => {
    return searchWorkspaceLocalization(files, query)
  }, [files, query])

  // Focus input automatically when search opens
  useEffect(() => {
    if (isOpen) {
      setSelectedIndex(0)
      setTimeout(() => {
        inputRef.current?.focus()
        inputRef.current?.select()
      }, 30)
    }
  }, [isOpen])

  // Reset selected index when query changes
  useEffect(() => {
    setSelectedIndex(0)
  }, [query])

  // Auto-scroll selected result into view
  useEffect(() => {
    if (listRef.current) {
      const selectedEl = listRef.current.querySelector<HTMLElement>(
        `[data-index="${selectedIndex}"]`
      )
      if (selectedEl && typeof selectedEl.scrollIntoView === 'function') {
        selectedEl.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
      }
    }
  }, [selectedIndex])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        onClose()
        return
      }

      const total = searchResults.results.length
      if (total === 0) return

      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setSelectedIndex((prev) => (prev < total - 1 ? prev + 1 : 0))
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        setSelectedIndex((prev) => (prev > 0 ? prev - 1 : total - 1))
      } else if (e.key === 'Enter') {
        e.preventDefault()
        const target = searchResults.results[selectedIndex]
        if (target) {
          onSelectResult(target)
        }
      }
    },
    [onClose, onSelectResult, searchResults.results, selectedIndex]
  )

  if (!isOpen) return null

  // Map each result to its flat global index for keyboard selection
  let globalItemCounter = 0

  return (
    <div
      className="global-search-overlay"
      data-testid="global-search-overlay"
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          onClose()
        }
      }}
    >
      <div
        className="global-search-dialog"
        role="dialog"
        aria-modal="true"
        aria-label={t('search.title')}
        data-testid="global-search-dialog"
        onKeyDown={handleKeyDown}
      >
        {/* Search Header Bar */}
        <div className="global-search-header">
          <span className="search-icon" aria-hidden="true">
            🔍
          </span>
          <input
            ref={inputRef}
            type="search"
            className="global-search-input"
            data-testid="global-search-input"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t('search.placeholder')}
            aria-label={t('search.placeholder')}
            autoComplete="off"
            spellCheck={false}
          />
          {query && (
            <button
              type="button"
              className="search-clear-btn"
              data-testid="search-clear-btn"
              onClick={() => {
                setQuery('')
                inputRef.current?.focus()
              }}
              title={t('search.clearSearch')}
              aria-label={t('search.clearSearch')}
            >
              ✕
            </button>
          )}
          <button
            type="button"
            className="search-close-btn"
            data-testid="search-close-btn"
            onClick={onClose}
            title={t('search.closeSearch')}
            aria-label={t('search.closeSearch')}
          >
            Esc
          </button>
        </div>

        {/* Results summary bar when query is active */}
        {query.trim() && searchResults.totalMatches > 0 && (
          <div className="global-search-summary-bar" data-testid="search-summary-bar">
            <span className="search-summary-count">
              {searchResults.totalMatches === 1 && searchResults.groups.length === 1
                ? t('search.singleResult')
                : t('search.resultsCount', {
                    count: searchResults.totalMatches,
                    fileCount: searchResults.groups.length,
                  })}
            </span>
          </div>
        )}

        {/* Search Results Body */}
        <div className="global-search-body" ref={listRef} data-testid="global-search-body">
          {!isWorkspaceOpen ? (
            <div className="search-empty-state" data-testid="search-no-workspace">
              <span className="empty-state-icon">📁</span>
              <p className="empty-state-title">{t('search.noWorkspace')}</p>
            </div>
          ) : files.length === 0 ? (
            <div className="search-empty-state" data-testid="search-no-files">
              <span className="empty-state-icon">📄</span>
              <p className="empty-state-title">{t('search.noFiles')}</p>
            </div>
          ) : !query.trim() ? (
            <div className="search-empty-state" data-testid="search-empty-query">
              <span className="empty-state-icon">💡</span>
              <p className="empty-state-title">{t('search.emptyQueryHint')}</p>
              <p className="empty-state-hint">{t('search.navigateHint')}</p>
            </div>
          ) : searchResults.totalMatches === 0 ? (
            <div className="search-empty-state" data-testid="search-no-results">
              <span className="empty-state-icon">🔎</span>
              <p className="empty-state-title">{t('search.noResults')}</p>
              <p className="empty-state-hint">{t('search.noResultsHint')}</p>
            </div>
          ) : (
            <div className="search-groups-list" role="listbox" aria-label={t('search.title')}>
              {searchResults.groups.map((group) => (
                <div key={group.filename} className="search-group-section">
                  <div className="search-group-header">
                    <span className="group-file-icon" aria-hidden="true">
                      🌐
                    </span>
                    <span className="group-file-name">{group.filename}</span>
                    <span className="group-language-badge">{group.languageName}</span>
                    <span className="group-match-count">{group.results.length}</span>
                  </div>

                  <div className="search-group-items">
                    {group.results.map((item) => {
                      const itemIndex = globalItemCounter++
                      const isSelected = itemIndex === selectedIndex

                      return (
                        <div
                          key={item.id}
                          role="option"
                          aria-selected={isSelected}
                          data-index={itemIndex}
                          data-testid={`search-result-${item.filename}-${item.key}`}
                          className={`search-result-item ${isSelected ? 'is-selected' : ''}`}
                          onClick={() => onSelectResult(item)}
                          onMouseEnter={() => setSelectedIndex(itemIndex)}
                        >
                          <div className="result-item-main">
                            <div className="result-item-key">
                              <HighlightedText text={item.key} query={query} className="key-text" />
                            </div>

                            <div className="result-item-val">
                              {item.isEmpty ? (
                                <span className="search-empty-val-badge">
                                  {t('tree.emptyBadge')}
                                </span>
                              ) : (
                                <HighlightedText
                                  text={item.value}
                                  query={query}
                                  className="val-text"
                                />
                              )}
                            </div>
                          </div>

                          <div className="result-item-meta">
                            {item.matchType === 'both' ? (
                              <span className="match-tag match-tag-both" title={t('search.matchTypeBoth')}>
                                {t('search.matchTypeBoth')}
                              </span>
                            ) : item.matchType === 'value' ? (
                              <span className="match-tag match-tag-value" title={t('search.matchTypeValue')}>
                                {t('search.matchTypeValue')}
                              </span>
                            ) : (
                              <span className="match-tag match-tag-key" title={t('search.matchTypeKey')}>
                                {t('search.matchTypeKey')}
                              </span>
                            )}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Keyboard Navigation Footer */}
        <div className="global-search-footer">
          <div className="search-footer-shortcuts">
            <span className="shortcut-pill">
              <kbd>↑</kbd>
              <kbd>↓</kbd>
              <span>Navigate</span>
            </span>
            <span className="shortcut-pill">
              <kbd>↵</kbd>
              <span>Select</span>
            </span>
            <span className="shortcut-pill">
              <kbd>Esc</kbd>
              <span>Close</span>
            </span>
          </div>
        </div>
      </div>
    </div>
  )
}
